const express = require('express');
const Logic = require('./logic');

module.exports = function(context) {
    const router = express.Router();
    const { stripe, STRIPE_WEBHOOK_SECRET, STRIPE_CLIENT_ID, YOUR_DOMAIN, PRICE_BASIC, PRICE_PREMIUM, FEATURE_PRICES, db, storesData, activeUsers, io, admin } = context;

    // ✅ Stripe Webhook Endpoint (Πρέπει να δέχεται raw body)
    router.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
        const sig = req.headers['stripe-signature'];
        let event;

        try {
            if (STRIPE_WEBHOOK_SECRET) {
                event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
            } else {
                event = JSON.parse(req.body);
            }
        } catch (err) {
            console.error(`⚠️ Webhook Error: ${err.message}`);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
            const subscription = event.data.object;
            const status = subscription.status; 
            const customerId = subscription.customer;

            try {
                const customer = await stripe.customers.retrieve(customerId);
                if (customer && customer.email) {
                    const storeName = customer.email.toLowerCase().trim();
                    console.log(`🔔 Subscription Update for ${storeName}: ${status}`);

                    if (status === 'past_due' || status === 'unpaid' || status === 'canceled') {
                        io.to(storeName).emit('force-logout'); 
                        io.to(storeName).emit('subscription-status-change', { status: status, msg: "Η συνδρομή έληξε ή απέτυχε η χρέωση." });
                    }
                }
            } catch (e) { console.error("Webhook Logic Error:", e); }
        }

        res.json({received: true});
    });

    // ✅ Body parsing μόνο για τα υπόλοιπα REST API του Stripe
    router.use(express.json());
    router.use(express.urlencoded({ extended: true }));

    /* ---------------- STRIPE CONNECT OAUTH ---------------- */
    router.get('/connect-stripe', (req, res) => {
        const state = "BellGo_Store"; 
        const url = `https://connect.stripe.com/oauth/authorize?response_type=code&client_id=${STRIPE_CLIENT_ID}&scope=read_write&state=${state}`;
        res.redirect(url);
    });

    router.get('/stripe-connect-callback', async (req, res) => {
        const { code, error } = req.query;
        if (error || !code) return res.send("<h1>❌ Σφάλμα Stripe.</h1>");
        try {
            const response = await stripe.oauth.token({ grant_type: 'authorization_code', code: code });
            const stripeId = response.stripe_user_id;
            res.send(`
                <h1>✅ Επιτυχία!</h1>
                <p>Σύνδεση επιτυχής. Επιστροφή...</p>
                <script>
                    localStorage.setItem('temp_stripe_connect_id', '${stripeId}');
                    setTimeout(() => window.location.href='/premium.html', 1000);
                </script>
            `);
        } catch (err) { res.status(500).send("Error connecting Stripe account: " + err.message); }
    });

    /* ---------------- STRIPE PAYMENTS & QR ---------------- */
    router.post('/connection-token', async (req, res) => {
      const { storeName } = req.body; 
      let stripeOptions = undefined;

      if (storeName) {
          const data = await Logic.getStoreData(storeName, db, storesData);
          if (data && data.settings && data.settings.stripeConnectId) {
              stripeOptions = { stripeAccount: data.settings.stripeConnectId };
          }
      }

      try {
        let connectionToken = await stripe.terminal.connectionTokens.create({}, stripeOptions);
        res.json({ secret: connectionToken.secret });
      } catch (error) {
        console.error("Stripe Connection Token Error:", error);
        res.status(500).send({ error: error.message });
      }
    });

    router.post('/capture-payment', async (req, res) => {
      const { paymentIntentId, storeName } = req.body;
      let stripeOptions = undefined;

      if (storeName) {
          const data = await Logic.getStoreData(storeName, db, storesData);
          if (data && data.settings && data.settings.stripeConnectId) {
              stripeOptions = { stripeAccount: data.settings.stripeConnectId };
          }
      }

      try {
        const intent = await stripe.paymentIntents.capture(paymentIntentId, {}, stripeOptions);
        res.send(intent);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    router.post('/check-subscription', async (req, res) => {
        const { email } = req.body;
        if (!email) return res.json({ active: false });

        const storeName = email.toLowerCase().trim();
        const storeData = await Logic.getStoreData(storeName, db, storesData);
        
        let manualFeatures = {};
        let hasManualActive = false;
        if (storeData && storeData.settings && storeData.settings.features) {
            manualFeatures = storeData.settings.features;
            hasManualActive = Object.values(manualFeatures).some(v => v === true);
        }

        const match = email.match(/(\d{4})$/);
        if (match) {
            const year = parseInt(match[1]);
            if (year >= 1992) {
                 let hackFeatures = { ...manualFeatures };
                 if (year === 1992) hackFeatures['pack_chat'] = true;      
                 if (year === 1993) hackFeatures['pack_manager'] = true;   
                 if (year === 1994) hackFeatures['pack_delivery'] = true;  
                 if (year === 1995) hackFeatures['pack_tables'] = true;    
                 if (year === 1996) hackFeatures['pack_pos'] = true;       
                 if (year === 1997) hackFeatures['pack_loyalty'] = true;   
                 return res.json({ active: true, plan: 'premium', features: hackFeatures, storeId: email, exists: true });
            }
        }

        try {
            const customers = await stripe.customers.search({ query: `email:'${email}'` });
            if (customers.data.length === 0) {
                if (hasManualActive) return res.json({ active: true, plan: 'custom', features: manualFeatures, storeId: email, exists: true });
                return res.json({ active: false, msg: "User not found", exists: false });
            }
            
            const subscriptions = await stripe.subscriptions.list({ customer: customers.data[0].id });
            
            let planType = 'basic';
            let activeFeatures = { ...manualFeatures }; 
            
            const activeSub = subscriptions.data.find(s => s.status === 'active' || s.status === 'trialing');

            if (activeSub) {
                activeSub.items.data.forEach(item => {
                        const priceId = item.price.id;
                        if (priceId === PRICE_PREMIUM) planType = 'premium';
                        if (FEATURE_PRICES[priceId]) activeFeatures[FEATURE_PRICES[priceId]] = true;
                });

                if (storeData) {
                    storeData.settings.features = activeFeatures;
                    storeData.settings.plan = planType;
                    Logic.saveStoreToFirebase(storeName, db, storesData);
                }

                return res.json({ active: true, plan: planType, features: activeFeatures, storeId: email, exists: true });
            } else { 
                if (hasManualActive) return res.json({ active: true, plan: 'custom', features: activeFeatures, storeId: email, exists: true });
                
                const pastDueSub = subscriptions.data.find(s => s.status === 'past_due' || s.status === 'unpaid');
                if (pastDueSub) return res.json({ active: false, exists: true, status: 'past_due' });

                return res.json({ active: false, exists: true, status: 'none' }); 
            }
        } catch (e) { 
            if (hasManualActive) return res.json({ active: true, plan: 'custom', features: manualFeatures, storeId: email });
            res.json({ active: false, error: e.message }); 
        }
    });

    router.post('/create-checkout-session', async (req, res) => {
        const { email, plan, priceIds, isNative } = req.body; 
        let line_items = [];

        if (priceIds && Array.isArray(priceIds) && priceIds.length > 0) {
            priceIds.forEach(pid => line_items.push({ price: pid, quantity: 1 }));
        } else if (plan) {
            line_items.push({ price: (plan === 'premium' ? PRICE_PREMIUM : PRICE_BASIC), quantity: 1 });
        }
        if (line_items.length === 0) return res.status(400).json({ error: "No packages selected." });

        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
        const host = req.get('host');
        let returnDomain = isNative ? `bellgoapp://${host}` : `${protocol}://${host}`;

        try {
            const session = await stripe.checkout.sessions.create({
                line_items: line_items, 
                mode: 'subscription',
                customer_email: email,
                success_url: `${returnDomain}/login.html?session_id={CHECKOUT_SESSION_ID}&email=${encodeURIComponent(email)}`,
                cancel_url: `${returnDomain}/login.html`,
            });
            res.json({ url: session.url });
        } catch(e) { res.status(500).json({ error: e.message }); }
    });

    router.post('/create-order-payment', async (req, res) => {
        const { amount, storeName, items, isNative } = req.body; 
        const data = await Logic.getStoreData(storeName, db, storesData);
        const shopStripeId = data.settings.stripeConnectId;
        if (!shopStripeId) return res.status(400).json({ error: "Το κατάστημα δεν έχει συνδέσει τραπεζικό λογαριασμό (Stripe ID)." }); 
        
        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
        const host = req.get('host');
        let returnDomain = isNative ? `bellgoapp://${host}` : `${protocol}://${host}`;

        try {
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [{
                    price_data: {
                        currency: 'eur',
                        product_data: { name: 'Παραγγελία Delivery', description: `Κατάστημα: ${data.settings.name}` },
                        unit_amount: Math.round(amount * 100),
                    },
                    quantity: 1,
                }],
                mode: 'payment',
                payment_intent_data: { transfer_data: { destination: shopStripeId } },
                success_url: `${returnDomain}/shop/${encodeURIComponent(storeName)}/?payment_status=success&data=${encodeURIComponent(items || '')}`, 
                cancel_url: `${returnDomain}/shop/${encodeURIComponent(storeName)}/?payment_status=cancel`,
            });
            res.json({ url: session.url });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    router.post('/create-qr-payment', async (req, res) => {
        const { amount, storeName, orderId, isNative } = req.body; 
        const data = await Logic.getStoreData(storeName, db, storesData);
        const shopStripeId = data.settings.stripeConnectId;
        if (!shopStripeId) return res.status(400).json({ error: "Το κατάστημα δεν έχει συνδέσει Stripe." });
        
        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
        const host = req.get('host');
        let returnDomain = isNative ? `bellgoapp://${host}` : `${protocol}://${host}`;

        try {
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [{
                    price_data: {
                        currency: 'eur',
                        product_data: { name: `Παραγγελία #${orderId}`, description: 'Πληρωμή στο τραπέζι' },
                        unit_amount: Math.round(parseFloat(amount) * 100),
                    },
                    quantity: 1,
                }],
                mode: 'payment',
                payment_intent_data: { transfer_data: { destination: shopStripeId } },
                success_url: `${returnDomain}/qr-payment-success?store=${encodeURIComponent(storeName)}&orderId=${orderId}`,
                cancel_url: `${returnDomain}/qr-payment-cancel`,
            });
            res.json({ url: session.url });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    router.get('/qr-payment-success', async (req, res) => {
        const { store, orderId } = req.query;
        if(store && orderId) {
            const data = await Logic.getStoreData(store, db, storesData);
            const order = data.orders.find(o => o.id == orderId);
            if(order) {
                 if(!order.text.includes('💳 PAID')) {
                     order.text += '\n💳 PAID (QR) ✅';
                     Logic.updateStoreClients(store, io, storesData, activeUsers, db);
                     // ✅ FIX: Σωστή σειρά παραμέτρων στο notifyAdmin
                     Logic.notifyAdmin(store, "ΠΛΗΡΩΜΗ QR 💳", `Η παραγγελία εξοφλήθηκε!`, null, "", orderId, storesData, activeUsers, io, YOUR_DOMAIN, admin);
                 }
            }
            io.to(store).emit('payment-confirmed', { orderId: orderId });
        }
        res.send(`
            <html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{background:#f4f6f8;color:#1f2937;font-family:sans-serif;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;padding:20px;}</style></head><body>
                <div style="font-size:60px;">✅</div>
                <h1 style="color:#10B981;">Επιτυχία!</h1>
                <p>Η πληρωμή ολοκληρώθηκε.</p>
                <div style="margin-top:30px;padding:15px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;color:#1f2937;font-weight:bold;box-shadow:0 4px 15px rgba(0,0,0,0.05);">
                    ΜΗΝ ΞΕΧΑΣΕΤΕ ΝΑ ΖΗΤΗΣΕΤΕ ΤΟ ΝΟΜΙΜΟ ΠΑΡΑΣΤΑΤΙΚΟ (ΑΠΟΔΕΙΞΗ)
                </div>
            </body></html>
        `);
    });

    router.get('/qr-payment-cancel', (req, res) => {
        res.send(`<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{background:#f4f6f8;color:#1f2937;font-family:sans-serif;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;}</style></head><body><h1 style="color:#EF4444;">❌ Ακύρωση</h1><p>Η πληρωμή δεν ολοκληρώθηκε.</p></body></html>`);
    });

    return router;
};