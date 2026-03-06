const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require("firebase-admin");
const nodemailer = require('nodemailer'); // ✅ NEW: Email Module
const Logic = require('./logic'); // ✅ Import Logic Module

// ✅ EMAIL CONFIGURATION (Ρυθμίστε το εδώ)
const transporter = nodemailer.createTransport({
    service: 'gmail', 
    auth: {
        user: 'theroasters84@gmail.com',
        pass: 'goit nsbk wsae awwc'
    }
});

// ✅ STRIPE SETUP (ΠΡΟΣΟΧΗ: Σε παραγωγή χρησιμοποιούμε .env)
const stripe = require('stripe')('sk_test_51SwnsPJcEtNSGviLf1RB1NTLaHJ3LTmqqy9LM52J3Qc7DpgbODtfhYK47nHAy1965eNxwVwh9gA4PTuizOxhMPil00dIoebxMx');
const STRIPE_CLIENT_ID = 'ca_TxCnGjK4GvUPXuJrE5CaUW9NeUdCeow6'; 
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || ''; // ✅ Add your Webhook Secret here
const YOUR_DOMAIN = 'https://bellgo-final.onrender.com'; 

// ✅ PRICE LIST
const PRICE_BASIC = 'price_1Sx9PFJcEtNSGviLteieJCwj';   // 4€
const PRICE_PREMIUM = 'price_1SzHTPJcEtNSGviLk7N84Irn'; // 10€

// ✅ NEW: Αντιστοίχιση Stripe Price IDs με Features
// ⚠️ ΠΡΟΣΟΧΗ: Αντικατέστησε τα 'price_xxx' με τα πραγματικά ID από το Stripe Dashboard
const FEATURE_PRICES = {
    'price_1Sx9PFJcEtNSGviLteieJCwj': 'pack_chat', // ✅ BellGo Basic (4€) -> Pack 1
    'price_1SzHTPJcEtNSGviLk7N84Irn': 'pack_manager', // ✅ Premium (10€) -> Pack 2
    'price_1T5RpbJcEtNSGviLy5zj4t2F': 'pack_delivery',
    'price_1T5RtQJcEtNSGviLGHRhyDx9': 'pack_tables',
    'price_1T5RvLJcEtNSGviLrYYs72aH': 'pack_pos',
    'price_1T5RwBJcEtNSGviLq7VJ1KLi': 'pack_loyalty'
};

/* ---------------- FIREBASE ADMIN SETUP ---------------- */
let db;
try {
    const serviceAccount = require("./serviceAccountKey.json");
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
    console.log("✅ Firebase Admin & Firestore Initialized");
} catch (e) {
    console.log("⚠️ Firebase Warning: serviceAccountKey.json not found.");
}

/* ---------------- SERVER SETUP ---------------- */
const app = express();

// ✅ NEW: Stripe Webhook Endpoint (Must be before express.json)
app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        // If secret is set, verify signature. Otherwise, trust (Dev mode)
        if (STRIPE_WEBHOOK_SECRET) {
            event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
        } else {
            event = JSON.parse(req.body);
        }
    } catch (err) {
        console.error(`⚠️ Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle Subscription Changes
    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object;
        const status = subscription.status; // active, past_due, unpaid, canceled
        const customerId = subscription.customer;

        // Find store by Stripe Customer ID
        try {
            const customer = await stripe.customers.retrieve(customerId);
            if (customer && customer.email) {
                const storeName = customer.email.toLowerCase().trim();
                console.log(`🔔 Subscription Update for ${storeName}: ${status}`);

                // If status is bad, lock access immediately
                if (status === 'past_due' || status === 'unpaid' || status === 'canceled') {
                    io.to(storeName).emit('force-logout'); // Kick user out
                    io.to(storeName).emit('subscription-status-change', { status: status, msg: "Η συνδρομή έληξε ή απέτυχε η χρέωση." });
                }
            }
        } catch (e) { console.error("Webhook Logic Error:", e); }
    }

    res.json({received: true});
});

app.use(express.json());
app.use(express.urlencoded({ extended: true })); // ✅ FIX: Υποστήριξη δεδομένων φόρμας (για το Reset PIN)

// ✅ NEW: Redirect Root to Login (Admin PWA)
app.get('/', (req, res) => {
    res.redirect('/manage/login.html');
});

// ✅ FIX: Redirect Root Admin pages to /manage/ to isolate PWA Scope
// Αυτό διασφαλίζει ότι το Admin PWA έχει scope /manage/ και ΔΕΝ πιάνει τα QR παραγγελιών (/shop/...)
app.get(['/login.html', '/index.html', '/premium.html'], (req, res) => {
    const q = new URLSearchParams(req.query).toString();
    res.redirect(`/manage${req.path}${q ? '?' + q : ''}`);
});

// ✅ FIX: Redirect direct Staff access to /staff/ scope
app.get('/stafpremium.html', (req, res) => {
    const q = new URLSearchParams(req.query).toString();
    res.redirect(`/staff/app${q ? '?' + q : ''}`);
});

app.use(express.static(path.join(__dirname, 'public'))); 
app.use('/manage', express.static(path.join(__dirname, 'public'))); // ✅ NEW: Εικονικός φάκελος για Admin PWA Isolation
app.use('/mini', express.static(path.join(__dirname, 'mini_app'))); // ✅ NEW: Εντελώς ξεχωριστός φάκελος (Isolated App)
app.use('/staff', express.static(path.join(__dirname, 'public'))); // ✅ NEW: Static files for Staff App

const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*" },
    pingTimeout: 60000,
    pingInterval: 25000
});

/* ---------------- DATA STORE (MULTI-TENANT MEMORY) ---------------- */
let storesData = {};
let activeUsers = {}; 

// ✅ NEW: Προσωρινή Blacklist για να μην ξαναμπαίνουν αμέσως οι διαγραμμένοι χρήστες
const tempBlacklist = new Set();

/* ---------------- VIRTUAL ROUTES (PWA ISOLATION) ---------------- */
// 🔥 NEW: Αυτό το route επιτρέπει URLs τύπου /shop/roasters/ που σερβίρουν το order.html
// αλλά ο browser τα βλέπει σαν ξεχωριστούς φακέλους για το PWA Scope.
app.get('/shop/:storeName/*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'order.html'));
});

// Επίσης κρατάμε και το παλιό για backward compatibility
app.get('/shop/:storeName', (req, res) => { 
    res.sendFile(path.join(__dirname, 'public', 'order.html')); 
});

// ✅ NEW: Dine-In Route (Pure Web - No PWA Scope)
app.get('/dinein/:storeName', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'order.html'));
});

// ✅ NEW: Fallback για το Mini App (για να ανοίγει σωστά πάντα)
app.get('/mini*', (req, res) => {
    res.sendFile(path.join(__dirname, 'mini_app', 'index.html'));
});

// ✅ NEW: Virtual Route για το Staff App (για να έχει δικό του PWA Scope)
app.get('/manage/kitchen.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'kitchen.html'));
});

app.get('/staff/app', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'stafpremium.html')); });
app.get('/staff/driver', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'dianomeas.html')); });

// ✅ NEW: Explicit Route για το Trapaizei (Table Ordering)
app.get('/trapaizei.html', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'trapaizei.html')); });

app.get('/staff/login', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'login.html')); });
app.get('/admin', (req, res) => { res.redirect('/manage/login.html'); }); // ✅ Redirect στο νέο isolated path

/* ---------------- PIN RESET ROUTES ---------------- */
app.get('/reset-pin', (req, res) => {
    const { email } = req.query;
    res.send(`
        <!DOCTYPE html>
        <html lang="el">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Επαναφορά PIN</title>
            <style>
                body { background-color: #121212; color: #ffffff; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { background: #1e1e1e; padding: 40px; border-radius: 20px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 1px solid #333; max-width: 90%; width: 320px; }
                h2 { color: #FFD700; margin: 0 0 20px 0; font-size: 24px; }
                p { color: #aaa; font-size: 14px; margin-bottom: 30px; line-height: 1.5; }
                input { padding: 12px; border-radius: 10px; border: 1px solid #444; background: #2a2a2a; color: white; width: 100%; max-width: 200px; text-align: center; font-size: 24px; letter-spacing: 5px; margin-bottom: 20px; outline: none; transition: border 0.3s; font-weight: bold; }
                input:focus { border-color: #00E676; }
                button { padding: 12px 30px; background: #00E676; color: black; border: none; border-radius: 30px; font-weight: bold; cursor: pointer; font-size: 16px; transition: transform 0.1s, background 0.3s; width: 100%; max-width: 220px; }
                button:active { transform: scale(0.95); }
                button:hover { background: #00c853; }
                .email-tag { background: #333; padding: 5px 10px; border-radius: 5px; color: #fff; font-weight: bold; font-size: 12px; display: inline-block; margin-top: 5px; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>🔑 Επαναφορά PIN</h2>
                <p>Ορίστε το νέο 4-ψήφιο PIN για:<br><span class="email-tag">${email}</span></p>
                <form action="/set-new-pin" method="POST">
                    <input type="hidden" name="email" value="${email}">
                    <input type="number" name="pin" placeholder="____" required pattern="[0-9]{4}" maxlength="4" oninput="if(this.value.length>4) this.value=this.value.slice(0,4)">
                    <br>
                    <button type="submit">ΑΠΟΘΗΚΕΥΣΗ</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

app.post('/set-new-pin', async (req, res) => {
    const { email, pin } = req.body;
    if (email && pin) {
        const store = await Logic.getStoreData(email, db, storesData);
        store.settings.pin = pin;
        Logic.saveStoreToFirebase(email, db, storesData);
        res.send(`
            <!DOCTYPE html>
            <html lang="el">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Επιτυχία</title>
                <style>
                    body { background-color: #121212; color: #ffffff; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                    .card { background: #1e1e1e; padding: 40px; border-radius: 20px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 1px solid #333; max-width: 90%; width: 320px; }
                    .icon { font-size: 60px; margin-bottom: 20px; display: block; animation: pop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
                    h1 { color: #00E676; margin: 0 0 10px 0; font-size: 24px; }
                    p { color: #aaa; font-size: 16px; margin-bottom: 30px; line-height: 1.5; }
                    .btn { background: #00E676; color: black; text-decoration: none; padding: 12px 30px; border-radius: 30px; font-weight: bold; display: inline-block; transition: transform 0.1s; }
                    .btn:active { transform: scale(0.95); }
                    @keyframes pop { 0% { transform: scale(0); } 100% { transform: scale(1); } }
                </style>
            </head>
            <body>
                <div class="card">
                    <span class="icon">✅</span>
                    <h1>Επιτυχία!</h1>
                    <p>Το PIN ενημερώθηκε.<br>Μπορείτε να κλείσετε αυτή τη σελίδα.</p>
                    <a href="/manage/login.html" class="btn">Επιστροφή</a>
                </div>
            </body>
            </html>
        `);
    } else {
        res.send("Σφάλμα.");
    }
});

/* ---------------- ADMIN PIN RESET ROUTES ---------------- */
app.get('/reset-admin-pin', (req, res) => {
    const { email } = req.query;
    res.send(`
        <!DOCTYPE html>
        <html lang="el">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Επαναφορά Admin PIN</title>
            <style>
                body { background-color: #121212; color: #ffffff; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { background: #1e1e1e; padding: 40px; border-radius: 20px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 1px solid #FFD700; max-width: 90%; width: 320px; }
                h2 { color: #FFD700; margin: 0 0 20px 0; font-size: 24px; }
                p { color: #aaa; font-size: 14px; margin-bottom: 30px; line-height: 1.5; }
                input { padding: 12px; border-radius: 10px; border: 1px solid #444; background: #2a2a2a; color: white; width: 100%; max-width: 200px; text-align: center; font-size: 24px; letter-spacing: 2px; margin-bottom: 20px; outline: none; transition: border 0.3s; font-weight: bold; }
                input:focus { border-color: #FFD700; }
                button { padding: 12px 30px; background: #FFD700; color: black; border: none; border-radius: 30px; font-weight: bold; cursor: pointer; font-size: 16px; transition: transform 0.1s; width: 100%; max-width: 220px; }
                button:active { transform: scale(0.95); }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>🛡️ Reset Admin PIN</h2>
                <p>Ορίστε νέο Κωδικό Διαχειριστή για:<br><span style="color:white;">${email}</span></p>
                <form action="/set-new-admin-pin" method="POST">
                    <input type="hidden" name="email" value="${email}">
                    <input type="text" name="pin" placeholder="Νέος Κωδικός" required>
                    <br>
                    <button type="submit">ΑΠΟΘΗΚΕΥΣΗ</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

app.post('/set-new-admin-pin', async (req, res) => {
    const { email, pin } = req.body;
    if (email && pin) {
        const store = await Logic.getStoreData(email, db, storesData);
        store.settings.adminPin = pin;
        Logic.saveStoreToFirebase(email, db, storesData);
        res.send(`
            <!DOCTYPE html>
            <html lang="el">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Επιτυχία</title>
                <style>
                    body { background-color: #121212; color: #ffffff; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                    .card { background: #1e1e1e; padding: 40px; border-radius: 20px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 1px solid #FFD700; max-width: 90%; width: 320px; }
                    .icon { font-size: 60px; margin-bottom: 20px; display: block; }
                    h1 { color: #FFD700; margin: 0 0 10px 0; font-size: 24px; }
                    .btn { background: #FFD700; color: black; text-decoration: none; padding: 12px 30px; border-radius: 30px; font-weight: bold; display: inline-block; margin-top: 20px; }
                </style>
            </head>
            <body>
                <div class="card">
                    <span class="icon">✅</span>
                    <h1>Επιτυχία!</h1>
                    <p>Ο Κωδικός Διαχειριστή άλλαξε.</p>
                    <a href="/manage/login.html" class="btn">Επιστροφή</a>
                </div>
            </body>
            </html>
        `);
    } else {
        res.send("Σφάλμα.");
    }
});

/* ---------------- STRIPE CONNECT OAUTH ---------------- */
app.get('/connect-stripe', (req, res) => {
    const state = "BellGo_Store"; 
    const url = `https://connect.stripe.com/oauth/authorize?response_type=code&client_id=${STRIPE_CLIENT_ID}&scope=read_write&state=${state}`;
    res.redirect(url);
});

app.get('/stripe-connect-callback', async (req, res) => {
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

/* ---------------- DYNAMIC MANIFEST ---------------- */
app.get('/manifest.json', async (req, res) => {
    const iconType = req.query.icon || 'admin'; 
    const storeParam = req.query.store || "general";
    const safeStoreId = storeParam.replace(/[^a-zA-Z0-9@._-]/g, ''); // Allow emails
    
    let storeName = "BellGo App";
    if (safeStoreId !== "general") {
        const data = await Logic.getStoreData(safeStoreId, db, storesData);
        storeName = data.settings.name || `Shop ${safeStoreId}`;
    }
    if (req.query.name) storeName = req.query.name;

    let appId = `bellgo_${iconType}_${safeStoreId}`; 
    let iconFile = "admin.png"; 
    let startUrl = ".";  
    let scopeUrl = "/";        

    if (iconType === 'shop') {
        iconFile = "shop.png"; 
        // 🔥 PWA ISOLATION: Start URL & Scope are specific to this shop folder
        // This tricks the browser into thinking it's a separate app/folder
        startUrl = `/shop/${safeStoreId}/?name=${encodeURIComponent(storeName)}`;
        scopeUrl = `/shop/${safeStoreId}/`; 
    } else if (req.query.id === 'staff_app') {
        // ✅ FIX: Staff App Isolation
        iconFile = "admin.png";
        startUrl = `/staff/app?store=${encodeURIComponent(storeParam)}`;
        scopeUrl = "/staff/";
    } else {
        iconFile = "admin.png";
        startUrl = `/manage/login.html`; // ✅ Αλλαγή Start URL
        scopeUrl = "/manage/";           // ✅ FIX: Scope στο /manage/ για να ΜΗΝ πιάνει τα QR πελατών
    }

    res.set('Content-Type', 'application/manifest+json');
    res.json({
        "id": appId,              
        "name": storeName,            
        "short_name": storeName,
        "start_url": startUrl,   
        "scope": scopeUrl,        
        "display": "standalone",
        "background_color": "#121212",
        "theme_color": "#121212",
        "orientation": "portrait",
        "icons": [
            { "src": `/${iconFile}`, "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
            { "src": `/${iconFile}`, "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
        ]
    });
});

/* ---------------- STRIPE PAYMENTS ---------------- */
// ✅ NEW: Stripe Terminal Connection Token (Tap to Pay)
app.post('/connection-token', async (req, res) => {
  const { storeName } = req.body; // ✅ Support Multi-Tenant (Stripe Connect)
  let stripeOptions = undefined;

  if (storeName) {
      const data = await Logic.getStoreData(storeName, db, storesData);
      if (data && data.settings && data.settings.stripeConnectId) {
          stripeOptions = { stripeAccount: data.settings.stripeConnectId };
      }
  }

  try {
    // ✅ FIX: Ensure only one declaration
    let connectionToken = await stripe.terminal.connectionTokens.create({}, stripeOptions);
    res.json({ secret: connectionToken.secret });
  } catch (error) {
    console.error("Stripe Connection Token Error:", error);
    res.status(500).send({ error: error.message });
  }
});

// ✅ NEW: Capture Payment (Tap to Pay)
app.post('/capture-payment', async (req, res) => {
  const { paymentIntentId, storeName } = req.body;
  let stripeOptions = undefined;

  if (storeName) {
      const data = await Logic.getStoreData(storeName, db, storesData);
      if (data && data.settings && data.settings.stripeConnectId) {
          stripeOptions = { stripeAccount: data.settings.stripeConnectId };
      }
  }

  try {
    // ✅ FIX: Ensure only one declaration
    const intent = await stripe.paymentIntents.capture(paymentIntentId, {}, stripeOptions);
    res.send(intent);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.post('/check-subscription', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.json({ active: false });

    // ✅ NEW: Check Manual Features (Diamond Menu) from Memory/DB
    const storeName = email.toLowerCase().trim();
    const storeData = await Logic.getStoreData(storeName, db, storesData);
    
    let manualFeatures = {};
    let hasManualActive = false;
    if (storeData && storeData.settings && storeData.settings.features) {
        manualFeatures = storeData.settings.features;
        hasManualActive = Object.values(manualFeatures).some(v => v === true);
    }

    // ✅ NEW: Check Hack (1992+) for Demo Accounts
    const match = email.match(/(\d{4})$/);
    if (match) {
        const year = parseInt(match[1]);
        if (year >= 1992) {
             // ✅ HACK: Ενεργοποίηση πακέτων βάσει έτους (Demo Mode)
             let hackFeatures = { ...manualFeatures }; // Αντιγραφή για να μην πειράξουμε τη βάση

             if (year === 1992) hackFeatures['pack_chat'] = true;      // Συνδρομή 1
             if (year === 1993) hackFeatures['pack_manager'] = true;   // Συνδρομή 2
             if (year === 1994) hackFeatures['pack_delivery'] = true;  // Συνδρομή 3
             if (year === 1995) hackFeatures['pack_tables'] = true;    // Συνδρομή 4
             if (year === 1996) hackFeatures['pack_pos'] = true;       // Συνδρομή 5
             if (year === 1997) hackFeatures['pack_loyalty'] = true;   // Συνδρομή 6

             return res.json({ active: true, plan: 'premium', features: hackFeatures, storeId: email, exists: true });
        }
    }

    try {
        const customers = await stripe.customers.search({ query: `email:'${email}'` });
        if (customers.data.length === 0) {
            // User not in Stripe. If they have manual features enabled, let them in.
            if (hasManualActive) {
                return res.json({ active: true, plan: 'custom', features: manualFeatures, storeId: email, exists: true });
            }
            return res.json({ active: false, msg: "User not found", exists: false });
        }
        
        // ✅ FIX: Fetch ALL subscriptions to detect 'past_due'
        const subscriptions = await stripe.subscriptions.list({ customer: customers.data[0].id });
        
        let planType = 'basic';
        let activeFeatures = { ...manualFeatures }; // Start with manual features
        
        const activeSub = subscriptions.data.find(s => s.status === 'active' || s.status === 'trialing');

        if (activeSub) {
            activeSub.items.data.forEach(item => {
                    const priceId = item.price.id;
                    if (priceId === PRICE_PREMIUM) planType = 'premium';
                    // Έλεγχος για modular features
                    if (FEATURE_PRICES[priceId]) activeFeatures[FEATURE_PRICES[priceId]] = true;
            });

            // ✅ FIX: Συγχρονισμός Features από Stripe στη Βάση (για να μην χάνονται στο Socket Update)
            if (storeData) {
                storeData.settings.features = activeFeatures;
                storeData.settings.plan = planType;
                Logic.saveStoreToFirebase(storeName, db, storesData);
            }

            return res.json({ active: true, plan: planType, features: activeFeatures, storeId: email, exists: true });
        } else { 
            // No Stripe subscription.
            if (hasManualActive) {
                return res.json({ active: true, plan: 'custom', features: activeFeatures, storeId: email, exists: true });
            }
            
            // ✅ NEW: Check for Past Due
            const pastDueSub = subscriptions.data.find(s => s.status === 'past_due' || s.status === 'unpaid');
            if (pastDueSub) {
                return res.json({ active: false, exists: true, status: 'past_due' });
            }

            return res.json({ active: false, exists: true, status: 'none' }); 
        }
    } catch (e) { 
        // Error checking Stripe. Fallback to manual.
        if (hasManualActive) {
            return res.json({ active: true, plan: 'custom', features: manualFeatures, storeId: email });
        }
        res.json({ active: false, error: e.message }); 
    }
});

app.post('/create-checkout-session', async (req, res) => {
    const { email, plan, priceIds, isNative } = req.body; // ✅ Changed features to priceIds
    
    let line_items = [];

    if (priceIds && Array.isArray(priceIds) && priceIds.length > 0) {
        priceIds.forEach(pid => line_items.push({ price: pid, quantity: 1 }));
    } else if (plan) {
        line_items.push({ price: (plan === 'premium' ? PRICE_PREMIUM : PRICE_BASIC), quantity: 1 });
    }

    if (line_items.length === 0) return res.status(400).json({ error: "No packages selected." });

    // ✅ FIX: Δυναμικό Domain για επιστροφή στο App
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.get('host');
    let returnDomain = `${protocol}://${host}`;

    if (isNative) {
        returnDomain = `bellgoapp://${host}`;
    }

    try {
        const session = await stripe.checkout.sessions.create({
            line_items: line_items, // ✅ Use dynamic line items
            mode: 'subscription',
            customer_email: email,
            success_url: `${returnDomain}/login.html?session_id={CHECKOUT_SESSION_ID}&email=${encodeURIComponent(email)}`,
            cancel_url: `${returnDomain}/login.html`,
        });
        res.json({ url: session.url });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/create-order-payment', async (req, res) => {
    const { amount, storeName, items, isNative } = req.body; // ✅ Λήψη items & isNative
    const data = await Logic.getStoreData(storeName, db, storesData);
    const shopStripeId = data.settings.stripeConnectId;
    if (!shopStripeId) { return res.status(400).json({ error: "Το κατάστημα δεν έχει συνδέσει τραπεζικό λογαριασμό (Stripe ID)." }); }
    
    // ✅ FIX: Δυναμικό Domain για να επιστρέφει ακριβώς εκεί που ήταν ο πελάτης
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.get('host');
    let returnDomain = `${protocol}://${host}`;

    // ✅ FIX: Αν είναι Native App, επιστρέφουμε με Custom Scheme για να ανοίξει η εφαρμογή
    if (isNative) {
        returnDomain = `bellgoapp://${host}`;
    }

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
            success_url: `${returnDomain}/shop/${encodeURIComponent(storeName)}/?payment_status=success&data=${encodeURIComponent(items || '')}`, // ✅ Dynamic Domain
            cancel_url: `${returnDomain}/shop/${encodeURIComponent(storeName)}/?payment_status=cancel`,
        });
        res.json({ url: session.url });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ✅ NEW: QR PAYMENT GENERATION (Admin/Staff initiates)
app.post('/create-qr-payment', async (req, res) => {
    const { amount, storeName, orderId, isNative } = req.body; // ✅ isNative
    const data = await Logic.getStoreData(storeName, db, storesData);
    const shopStripeId = data.settings.stripeConnectId;
    if (!shopStripeId) { return res.status(400).json({ error: "Το κατάστημα δεν έχει συνδέσει Stripe." }); }
    
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.get('host');
    let returnDomain = `${protocol}://${host}`;

    // ✅ FIX: Αν είναι Native App, επιστρέφουμε με Custom Scheme
    if (isNative) {
        returnDomain = `bellgoapp://${host}`;
    }

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

// ✅ NEW: QR PAYMENT SUCCESS CALLBACK
app.get('/qr-payment-success', async (req, res) => {
    const { store, orderId } = req.query;
    if(store && orderId) {
        const data = await Logic.getStoreData(store, db, storesData);
        const order = data.orders.find(o => o.id == orderId);
        if(order) {
             if(!order.text.includes('💳 PAID')) {
                 order.text += '\n💳 PAID (QR) ✅';
                 Logic.updateStoreClients(store, io, storesData, activeUsers, db);
                 Logic.notifyAdmin(store, "ΠΛΗΡΩΜΗ QR 💳", `Η παραγγελία εξοφλήθηκε!`, null, "", storesData, activeUsers, io, YOUR_DOMAIN, admin);
             }
        }
        
        // ✅ NEW: Ειδοποίηση για αυτόματο κλείσιμο του QR Modal (Admin/Driver)
        io.to(store).emit('payment-confirmed', { orderId: orderId });
    }
    res.send(`
        <html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{background:#121212;color:white;font-family:sans-serif;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;padding:20px;}</style></head><body>
            <div style="font-size:60px;">✅</div>
            <h1 style="color:#00E676;">Επιτυχία!</h1>
            <p>Η πληρωμή ολοκληρώθηκε.</p>
            <div style="margin-top:30px;padding:15px;border:2px solid #FFD700;border-radius:10px;color:#FFD700;font-weight:bold;">
                ΜΗΝ ΞΕΧΑΣΕΤΕ ΝΑ ΖΗΤΗΣΕΤΕ ΤΟ ΝΟΜΙΜΟ ΠΑΡΑΣΤΑΤΙΚΟ (ΑΠΟΔΕΙΞΗ)
            </div>
        </body></html>
    `);
});

app.get('/qr-payment-cancel', (req, res) => {
    res.send(`<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{background:#121212;color:white;font-family:sans-serif;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;}</style></head><body><h1>❌ Ακύρωση</h1><p>Η πληρωμή δεν ολοκληρώθηκε.</p></body></html>`);
});

/* ---------------- SOCKET.IO ---------------- */
io.on('connection', (socket) => {
    const getMyStore = () => { if (!socket.store) return null; return storesData[socket.store]; };

    socket.on('join-store', async (data) => {
      try {
        let rawStore = data.storeName || '';
        if ((!rawStore || rawStore === 'null') && data.role === 'customer') { console.log("⚠️ Customer tried to join without storeName"); return; }
        if (!rawStore) { return; } // Admin without store yet

        if (rawStore.endsWith('premium')) rawStore = rawStore.replace('premium', '');
        const storeName = rawStore.toLowerCase().trim();
        const username = (data.username || '').trim();
        if (!storeName || !username) return;

        // ✅ NEW: Έλεγχος Blacklist (Αν τον διέγραψε ο Admin πριν λίγο, μην τον αφήσεις να μπει)
        if (tempBlacklist.has(`${storeName}_${username}`)) {
            socket.emit('force-logout');
            socket.disconnect(true);
            return;
        }

        await Logic.getStoreData(storeName, db, storesData);

        socket.store = storeName;
        socket.username = username;
        socket.role = data.role || 'waiter'; 
        if (data.role === 'customer') socket.role = 'customer';

        socket.join(storeName); 
        console.log(`📡 User ${username} joined room: ${storeName}`); 

        const key = `${storeName}_${username}`;
        const wasRinging = activeUsers[key]?.isRinging || false;
        const existingToken = activeUsers[key]?.fcmToken;

        activeUsers[key] = {
            store: storeName, username, role: socket.role, socketId: socket.id,
            fcmToken: data.token || existingToken, 
            status: "online", lastSeen: Date.now(),
            isRinging: wasRinging, isNative: data.isNative 
        };

        // ✅ FIX: Save Staff to Permanent Storage (So they appear in background list)
        if (storesData[storeName]) {
            if (!storesData[storeName].staffTokens) storesData[storeName].staffTokens = {};
            
            // Save if token exists OR if user is new (even without token)
            const existing = storesData[storeName].staffTokens[username];
            if (data.token || !existing) {
                storesData[storeName].staffTokens[username] = { 
                    token: data.token || (existing ? existing.token : null), 
                    role: socket.role 
                };
                Logic.saveStoreToFirebase(storeName, db, storesData);
            }
        }

        socket.emit('menu-update', storesData[storeName].menu || []); // ✅ FIX: Άμεση αποστολή εδώ που υπάρχει το socket
        Logic.updateStoreClients(storeName, io, storesData, activeUsers, db);
        if(wasRinging) { socket.emit('ring-bell'); }
      } catch (e) {
          console.error("❌ Join Store Error:", e);
      }
    });

    // ✅ NEW: Έλεγχος αν το τραπέζι έχει ενεργή παραγγελία
    socket.on('check-table-status', (data) => {
        const store = getMyStore();
        if (!store || !data.table) return;
        
        // Ψάχνουμε παραγγελία που να περιέχει [ΤΡ: table] και να μην είναι πληρωμένη
        // Regex: Ταιριάζει ακριβώς τον αριθμό (π.χ. το 1 να μην πιάσει το 10)
        const tableRegex = new RegExp(`\\[ΤΡ:\\s*${data.table}(?:\\s+|\\]|\\|)`);
        
        const activeOrder = store.orders.find(o => {
            // Θεωρούμε ενεργή μια παραγγελία αν δεν έχει σβηστεί (το pay-order τη διαγράφει)
            // και αν δεν έχει ήδη το tag PAID (αν κρατάτε ιστορικό)
            return tableRegex.test(o.text) && !o.text.includes('💳 PAID');
        });

        if (activeOrder) {
            socket.emit('table-status', { active: true, orderId: activeOrder.id, text: activeOrder.text });
        } else {
            socket.emit('table-status', { active: false });
        }
    });

    // 1. ΠΡΟΣΘΗΚΗ: Απάντηση στο αίτημα για ρυθμίσεις
    socket.on('get-store-settings', async () => {
        if (!socket.store) return;
        const store = await Logic.getStoreData(socket.store, db, storesData);
        if (store) {
            socket.emit('store-settings-update', store.settings);
        }
    });

    // 2. ΕΝΗΜΕΡΩΣΗ: Έλεγχος PIN (Ελέγχει και τα δύο πεδία)
    socket.on('verify-pin', async (data) => { 
        const pin = data.pin || data; 
        let email = data.email || socket.store; 
        if (email) { 
            email = email.toLowerCase().trim(); 
            const store = await Logic.getStoreData(email, db, storesData); 
            // Έλεγχος αν ταιριάζει με το Staff PIN ή το Admin PIN
            if (store.settings.pin === pin || store.settings.adminPin === pin) { 
                socket.emit('pin-verified', { success: true, storeId: email }); 
            } else { 
                socket.emit('pin-verified', { success: false }); 
            } 
        } 
    });

    // 3. ΕΝΗΜΕΡΩΣΗ: Έλεγχος αν υπάρχει οποιοδήποτε PIN
    socket.on('check-pin-status', async (data) => { 
        const targetEmail = data.email; 
        if (!targetEmail) return; 
        const store = await Logic.getStoreData(targetEmail, db, storesData); 
        const hasPin = !!(store.settings.pin || store.settings.adminPin);
        socket.emit('pin-status', { hasPin: hasPin }); 
    });

    socket.on('set-new-pin', async (data) => { const email = data.email; if(email) { const store = await Logic.getStoreData(email, db, storesData); store.settings.pin = data.pin; store.settings.adminEmail = email; socket.emit('pin-success', { msg: "Ο κωδικός ορίστηκε!" }); Logic.updateStoreClients(email, io, storesData, activeUsers, db); } });
    
    // ✅ NEW: Forgot PIN
    socket.on('forgot-pin', async (data) => {
        const email = data.email || socket.store;
        
        // Έλεγχος αν έχει ρυθμιστεί το email (Αν λείπει ο κωδικός)
        if (!transporter.options.auth.pass || transporter.options.auth.pass.includes('xxxx')) {
            console.log("⚠️ EMAIL ERROR: Ο κωδικός email δεν έχει ρυθμιστεί σωστά στο server.js!");
            socket.emit('forgot-pin-response', { success: false, message: "Σφάλμα συστήματος (Email Config)." });
            return;
        }

        if (email) {
            // ✅ NEW: Έλεγχος Συνδρομής πριν την αποστολή
            const store = await Logic.getStoreData(email, db, storesData);
            const hasSub = store.settings.plan === 'premium' || store.settings.plan === 'custom';

            if (!hasSub) {
                socket.emit('forgot-pin-response', { success: false, message: "Δεν βρέθηκε ενεργή συνδρομή για αυτό το email." });
                return;
            }

            const link = `${YOUR_DOMAIN}/reset-pin?email=${encodeURIComponent(email)}`;
            const mailOptions = { from: 'BellGo System', to: email, subject: '🔑 Επαναφορά PIN', text: `Πατήστε εδώ για να ορίσετε νέο PIN: ${link}` };
            transporter.sendMail(mailOptions, (err, info) => {
                if (err) { console.log(err); socket.emit('forgot-pin-response', { success: false, message: "Απέτυχε η αποστολή email." }); }
                else { console.log('Email sent: ' + info.response); socket.emit('forgot-pin-response', { success: true, message: "Το email εστάλη! Ελέγξτε τα εισερχόμενά σας." }); }
            });
        }
    });
    
    // ✅ NEW: Forgot Admin PIN
    socket.on('forgot-admin-pin', async (data) => {
        const email = data.email || socket.store;
        if (!transporter.options.auth.pass || transporter.options.auth.pass.includes('xxxx')) {
            socket.emit('forgot-pin-response', { success: false, message: "Σφάλμα συστήματος (Email Config)." });
            return;
        }
        if (email) {
            const link = `${YOUR_DOMAIN}/reset-admin-pin?email=${encodeURIComponent(email)}`;
            const mailOptions = { from: 'BellGo System', to: email, subject: '🛡️ Επαναφορά Admin PIN', text: `Πατήστε εδώ για να ορίσετε νέο Κωδικό Διαχειριστή: ${link}` };
            transporter.sendMail(mailOptions, (err, info) => {
                if (err) { console.log(err); socket.emit('forgot-pin-response', { success: false, message: "Απέτυχε η αποστολή email." }); }
                else { socket.emit('forgot-pin-response', { success: true, message: "Το email εστάλη! Ελέγξτε τα εισερχόμενά σας." }); }
            });
        }
    });

    socket.on('update-token', (data) => { 
        const key = `${socket.store}_${data.username}`; 
        if (activeUsers[key]) activeUsers[key].fcmToken = data.token; 
        // ✅ Save Permanent
        if (storesData[socket.store]) { if(!storesData[socket.store].staffTokens) storesData[socket.store].staffTokens={}; storesData[socket.store].staffTokens[data.username] = { token: data.token, role: activeUsers[key].role }; Logic.saveStoreToFirebase(socket.store, db, storesData); }
    });

    socket.on('toggle-status', (data) => { const store = getMyStore(); if (store) { if (data.type === 'customer') store.settings.statusCustomer = data.isOpen; if (data.type === 'staff') store.settings.statusStaff = data.isOpen; Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db); } });
    socket.on('save-store-name', (newName) => { const store = getMyStore(); if (store) { store.settings.name = newName; Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db); } });
    socket.on('save-store-settings', (data) => { 
        const store = getMyStore(); 
        if (store) { 
            if(data.resetTime) store.settings.resetTime = data.resetTime; 
            if(data.stripeConnectId) store.settings.stripeConnectId = data.stripeConnectId; 
            if(data.schedule) store.settings.schedule = data.schedule; 
            if(data.hours) store.settings.hours = data.hours; 
            if(data.coverPrice !== undefined) store.settings.coverPrice = data.coverPrice; // ✅ Αποθήκευση Κουβέρ
            if(data.googleMapsUrl !== undefined) store.settings.googleMapsUrl = data.googleMapsUrl; // ✅ Αποθήκευση Google Maps
            if(data.autoPrint !== undefined) store.settings.autoPrint = data.autoPrint; // ✅ Αποθήκευση Auto Print
            if(data.printerEnabled !== undefined) store.settings.printerEnabled = data.printerEnabled; // ✅ NEW
            if(data.autoClosePrint !== undefined) store.settings.autoClosePrint = data.autoClosePrint; // ✅ Αποθήκευση Auto Close Print
            if(data.expensePresets) store.settings.expensePresets = data.expensePresets; // ✅ Αποθήκευση Presets Εξόδων
            if(data.fixedExpenses) store.settings.fixedExpenses = data.fixedExpenses; // ✅ NEW: Αποθήκευση Πάγιων Εξόδων
            if(data.visibility) store.settings.visibility = data.visibility; // ✅ NEW: Αποθήκευση Ρύθμισης Ορατότητας (Mini App)
            if(data.staffCharge !== undefined) store.settings.staffCharge = data.staffCharge; // ✅ NEW: Staff Charge Setting
            if(data.reservationsEnabled !== undefined) store.settings.reservationsEnabled = data.reservationsEnabled; // ✅ NEW
            if(data.totalTables !== undefined) store.settings.totalTables = data.totalTables; // ✅ NEW
            if(data.einvoicing) store.settings.einvoicing = data.einvoicing; // ✅ NEW: Save E-Invoicing
            if(data.pos) store.settings.pos = data.pos; // ✅ NEW: Save POS Settings
            if(data.cashRegButtons) store.settings.cashRegButtons = data.cashRegButtons; // ✅ NEW: Save Cash Reg Buttons
            if(data.reward) store.settings.reward = data.reward; // ✅ NEW: Save Reward Settings
            // ✅ FIX: Merge features instead of replacing (prevents data loss)
            if(data.features) store.settings.features = { ...store.settings.features, ...data.features };
            
            // ✅ NEW: Admin PIN & PIN (Native App Support)
            if(data.adminPin) store.settings.adminPin = data.adminPin;
            if(data.pin) store.settings.pin = data.pin;

            Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db); 
        } 
    });
    socket.on('save-menu', (data) => { 
        const store = getMyStore(); 
        if (store) { 
            try { 
                let newMenuData = []; 
                let mode = 'permanent'; 
                if (Array.isArray(data)) newMenuData = data; 
                else if (data.menu) { newMenuData = data.menu; mode = data.mode || 'permanent'; } 
                
                // ✅ Ενημερώνουμε ΠΑΝΤΑ το ενεργό μενού για να το βλέπουν οι πελάτες
                store.menu = JSON.parse(JSON.stringify(newMenuData));
                
                // ✅ Ενημερώνουμε το Backup ΜΟΝΟ αν είναι μόνιμη αποθήκευση
                if (mode === 'permanent') { 
                    store.permanentMenu = JSON.parse(JSON.stringify(newMenuData)); 
                } 
                
                Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db); 
            } catch (e) { console.error(e); } 
        } 
    });
    socket.on('chat-message', (data) => { if(socket.store) { io.to(socket.store).emit('chat-message', { sender: socket.username, text: data.text }); } });

    socket.on('new-order', (data) => {
      try {
        const store = getMyStore();
        if (!store) return;
        if (!data) return; // ✅ Safety check
        if (!store.settings.statusCustomer && activeUsers[`${socket.store}_${socket.username}`]?.role === 'customer') return;
        let orderText = data.text || data; 
        const orderId = data.id || Date.now(); 
        
        // ✅ ΕΛΕΓΧΟΣ: Αν υπάρχει ήδη η παραγγελία (Update/Προσθήκη προϊόντων)
        const existingOrder = store.orders.find(o => o.id == orderId);
        
        if (existingOrder) {
            existingOrder.text = orderText; // Ενημέρωση κειμένου
            existingOrder.status = 'pending'; // Προαιρετικά: επαναφορά σε pending αν θέλουμε να ξαναγίνει αποδοχή
            console.log(`📝 Order Updated: ${orderId}`);
            // Ειδοποίηση Admin για Τροποποίηση
            Logic.notifyAdmin(socket.store, "ΤΡΟΠΟΠΟΙΗΣΗ 📝", `Αλλαγή στην παραγγελία: ${socket.username}`, null, "", storesData, activeUsers, io, YOUR_DOMAIN, admin);
        } else {
            // ✅ NEW: Έλεγχος για ΛΑΘΟΣ (Table: la / λα)
            const tableMatch = orderText.match(/\[ΤΡ:\s*([^|\]]+)/);
            if (tableMatch) {
                const tVal = tableMatch[1].trim().toLowerCase();
                if (tVal === 'la' || tVal === 'λα') {
                    const lines = orderText.split('\n');
                    let treatedItems = [];
                    
                    const newLines = lines.map(line => {
                        if (line.trim().startsWith('[')) return line; // Header
                        const lastColon = line.lastIndexOf(':');
                        if (lastColon !== -1) {
                            const priceStr = line.substring(lastColon + 1);
                            const price = parseFloat(priceStr);
                            if (!isNaN(price) && price > 0) {
                                const name = line.substring(0, lastColon).trim();
                                treatedItems.push({ name: name, price: price });
                                return `${name}:0 (LATHOS)`; // Μηδενισμός τιμής
                            }
                        }
                        return line;
                    });
                    
                    if (treatedItems.length > 0) {
                        Logic.logTreatStats(store, `${socket.username} (LATHOS)`, treatedItems);
                    }
                    orderText = newLines.join('\n');
                }
            }

            // Νέα Παραγγελία
            const newOrder = { id: orderId, text: orderText, from: socket.username, status: 'pending', store: socket.store };
            store.orders.push(newOrder);
            console.log(`📦 New order in room ${socket.store} from ${socket.username} with ID: ${orderId}`);
            
            // ✅ EXTRACT LOCATION (Address or Table) for GPS
            let locationInfo = "";
            const addrMatch = orderText.match(/📍\s*(.+)/);
            if (addrMatch) locationInfo = addrMatch[1].trim();

            // ✅ NEW: Προσαρμογή Τίτλου για Pickup
            let notifTitle = "ΝΕΑ ΠΑΡΑΓΓΕΛΙΑ 🍕";
            if (orderText.includes('[PICKUP')) notifTitle = "NEO PICKUP 🛍️";

            // Ειδοποίηση Admin για Νέα Παραγγελία
            Logic.notifyAdmin(socket.store, notifTitle, `Από: ${socket.username}`, socket.id, locationInfo, storesData, activeUsers, io, YOUR_DOMAIN, admin);
        }
        
        Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
      } catch (e) {
          console.error("❌ New Order Error:", e);
      }
    });

    // ✅ ΝΕΟ: Ειδική εντολή για ΠΡΟΣΘΗΚΗ προϊόντων (από Staff Premium)
    socket.on('add-items', (data) => {
        const store = getMyStore();
        if (!store) return;
        const { id, items } = data; // items = κείμενο με τα νέα προϊόντα
        const existingOrder = store.orders.find(o => o.id == id);
        
        if (existingOrder) {
            // Προσθήκη με το διακριτικό ++
            const lines = (items || "").split('\n').filter(l => l.trim());
            const markedLines = lines.map(l => `++ ${l}`).join('\n');
            existingOrder.text += `\n${markedLines}`;
            
            // ✅ FIX: Επαναφορά σε 'pending' για να χτυπήσει (Alarm) και να κουνηθεί (Shake)
            existingOrder.status = 'pending';
            
            console.log(`➕ Items added to order ${id} by ${socket.username}`);
            
            // Ειδοποίηση Admin (Συναγερμός)
            Logic.notifyAdmin(socket.store, "ΠΡΟΣΘΗΚΗ ΠΡΟΪΟΝΤΩΝ ➕", `Από: ${socket.username}`, null, "", storesData, activeUsers, io, YOUR_DOMAIN, admin);
            
            Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
        }
    });

    // ✅ FIX: Robust Status Updates (Accept / Ready / Pay)
    socket.on('accept-order', (id) => { 
        const store = getMyStore(); 
        if(store){ 
            const o = store.orders.find(x => x.id == id); // Loose equality for String/Number match
            if(o){ 
                o.status = 'cooking'; 
                o.startTime = Date.now(); 
                // ✅ FIX: Emit change FIRST to avoid race condition (Sound Fix)
                io.to(socket.store).emit('order-changed', { id: o.id, status: 'cooking', startTime: o.startTime }); 
                Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db); 
            } 
        } 
    });

    // ✅ NEW: POS PAYMENT REQUEST (Server-Side Bridge)
    socket.on('pos-pay', async (data) => {
        const store = getMyStore();
        if (!store) return;
        const { amount } = data;
        const pos = store.settings.pos || {};

        if (!pos.provider || !pos.id) {
            socket.emit('pos-result', { success: false, error: "Δεν έχουν οριστεί ρυθμίσεις POS." });
            return;
        }

        console.log(`📡 Sending ${amount}€ to ${pos.provider} POS (ID: ${pos.id})...`);

        try {
            // 🔌 ΕΔΩ ΘΑ ΜΠΕΙ Η ΠΡΑΓΜΑΤΙΚΗ ΚΛΗΣΗ API (VIVA / CARDLINK)
            // Π.χ. await axios.post('https://api.vivapayments.com/...', { amount: amount, terminalId: pos.id ... })
            
            // Προσομοίωση καθυστέρησης δικτύου (3 δευτερόλεπτα)
            await new Promise(r => setTimeout(r, 3000));

            // Επιστροφή επιτυχίας
            socket.emit('pos-result', { success: true });

        } catch (e) {
            socket.emit('pos-result', { success: false, error: e.message || "Σφάλμα επικοινωνίας" });
        }
    });

    // ✅ NEW: QUICK ORDER (PASO) - Records stats but doesn't save to active orders
    socket.on('quick-order', async (data) => {
        const store = getMyStore();
        if (!store) return;
        
        // ✅ NEW: Stripe Terminal Verification (Tap to Pay)
        if (data.method === 'card' && data.stripeId) {
            console.log(`💳 Η παραγγελία ${data.stripeId} εξοφλήθηκε με κάρτα: ${data.total}€`); // ✅ Log requested
            try {
                const paymentIntent = await stripe.paymentIntents.retrieve(data.stripeId, stripeOptions);
                if (paymentIntent.status !== 'succeeded') {
                    console.log("⚠️ Warning: Payment not succeeded yet:", paymentIntent.status);
                }
            } catch (e) {
                console.error("❌ Stripe verification failed:", e.message);
            }
        }

        // 1. Create a temporary order object for stats
        const tempOrder = {
            id: data.id || Date.now(),
            text: data.text,
            from: data.source || 'Admin (Paso)',
            status: 'completed'
        };
        
        // 2. Add Payment Tag
        if (data.method === 'card') tempOrder.text += '\n💳 PAID';
        else tempOrder.text += '\n💵 PAID';
        
        // 3. E-Invoicing (Placeholder)
        let signature = null;
        if (data.issueReceipt) {
            tempOrder.text += '\n[🧾 ΑΠΟΔΕΙΞΗ]';
            
            // 🔌 MOCK AADE QR (Προσομοίωση για δοκιμή εκτύπωσης)
            // Στο μέλλον αυτό θα έρχεται από την Epsilon Net
            tempOrder.aadeQr = "https://www1.aade.gr/tarl/myDATA/timologio/qrcode?mark=1234567890&uid=EXAMPLE_UID";
        }
        
        // 4. Update Stats & Save
        Logic.updateStoreStats(store, tempOrder);
        Logic.saveStoreToFirebase(socket.store, db, storesData);
        
        // 5. Send back to client for printing
        socket.emit('print-quick-order', { text: tempOrder.text, id: tempOrder.id, signature: signature });
    });

    // ✅ NEW: ISSUE RECEIPT (E-INVOICING)
    socket.on('issue-receipt', (id) => {
        const store = getMyStore();
        if(store) {
            const o = store.orders.find(x => x.id == id);
            if(o && !o.text.includes('[🧾 ΑΠΟΔΕΙΞΗ]')) {
                const einv = store.settings.einvoicing || {};
                
                o.text += '\n[🧾 ΑΠΟΔΕΙΞΗ]'; // Tag που δείχνει ότι εκδόθηκε
                
                // ✅ ΕΛΕΓΧΟΣ: Αν είναι ενεργοποιημένο, προετοιμασία για σύνδεση
                if (einv.enabled) {
                    console.log(`📡 Σύνδεση με ${einv.provider || 'Πάροχο'}... (Mock Mode)`);
                    // 🔌 ΕΔΩ ΘΑ ΜΠΕΙ Η ΠΡΑΓΜΑΤΙΚΗ ΚΛΗΣΗ API ΣΤΟ ΜΕΛΛΟΝ
                    // Προς το παρόν βάζουμε το Mock για να δεις ότι δουλεύει η εκτύπωση
                    o.aadeQr = "https://www1.aade.gr/tarl/myDATA/timologio/qrcode?mark=1234567890&uid=EXAMPLE_UID";
                }

                Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
            }
        }
    });

    // ✅ NEW: WALLET & CHARGE LOGIC
    socket.on('charge-order-to-staff', (data) => {
        const store = getMyStore();
        if (!store) return;
        const { orderId, staffName, amount, method } = data; // method: 'cash' (staff debt) or 'card' (bank)

        if (!store.wallets) store.wallets = {};
        
        // Αν είναι μετρητά, χρεώνεται στον υπάλληλο. Αν είναι κάρτα, πάει στο "Card" wallet.
        const targetWallet = method === 'card' ? 'BANK_CARD' : (staffName || 'Admin');
        
        if (!store.wallets[targetWallet]) store.wallets[targetWallet] = 0;
        store.wallets[targetWallet] += parseFloat(amount);

        // ✅ NEW: Ειδοποίηση του συγκεκριμένου υπαλλήλου/διανομέα ότι χρεώθηκε/πήρε την παραγγελία
        if (staffName) {
            const key = `${socket.store}_${staffName}`;
            const staffUser = activeUsers[key];
            if (staffUser && staffUser.socketId) {
                io.to(staffUser.socketId).emit('ring-bell', { source: "ΤΑΜΕΙΟ 💸", location: "ΝΕΑ ΑΝΑΘΕΣΗ" });
            }
        }

        // Κλείσιμο παραγγελίας
        const o = store.orders.find(x => x.id == orderId);
        if (o) {
            o.text += `\n✅ PAID (${method === 'card' ? '💳' : '💵'} ${staffName})`;
            Logic.updateStoreStats(store, o);
            store.orders = store.orders.filter(x => x.id != orderId);
        }
        
        Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
    });

    socket.on('reset-wallet', (targetName) => {
        const store = getMyStore();
        if (store && store.wallets) {
            if (targetName === 'ALL') {
                store.wallets = {}; // Reset All
            } else if (store.wallets[targetName] !== undefined) {
                delete store.wallets[targetName]; // ✅ DELETE: Διαγραφή για να φύγει από το panel
            }
            Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
        }
    });

    socket.on('get-wallet-data', () => {
        const store = getMyStore();
        if(store) socket.emit('wallet-update', store.wallets || {});
    });

    socket.on('ready-order', (id, silent = false) => { 
        const store = getMyStore(); 
        if(store){ 
            const o = store.orders.find(x => x.id == id); 
            if(o){ 
                o.status = 'ready'; 
                o.readyTime = Date.now(); 
                // ✅ FIX: Emit change FIRST to avoid race condition (Sound Fix)
                io.to(socket.store).emit('order-changed', { id: o.id, status: 'ready', readyTime: o.readyTime }); 
                Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db); 

                if (!silent) { // ✅ Check silent flag
                    // Push Notification Logic
                    const tKey = `${socket.store}_${o.from}`; 
                    const tUser = activeUsers[tKey]; 
                    
                    // ✅ NEW: Προσαρμογή Μηνύματος για Pickup
                    let notifTitle = "ΕΤΟΙΜΟ! 🛵";
                    let notifBody = "Η παραγγελία έρχεται!";
                    
                    if (o.text.includes('[PICKUP')) {
                        notifTitle = "ΕΤΟΙΜΟ ΓΙΑ ΠΑΡΑΛΑΒΗ! 🛍️";
                        notifBody = "Μπορείτε να περάσετε από το κατάστημα.";
                    }

                    if(tUser) Logic.sendPushNotification(tUser, notifTitle, notifBody, { type: "alarm" }, YOUR_DOMAIN, admin, 3600); // TTL 1h για Ετοιμότητα

                    // ✅ NEW: Ειδοποίηση ΟΛΩΝ των Διανομέων ότι υπάρχει έτοιμη παραγγελία
                    Object.values(activeUsers).filter(u => u.store === socket.store && u.role === 'driver').forEach(u => {
                        u.isRinging = true;
                        if (u.socketId) io.to(u.socketId).emit('ring-bell', { source: "ΚΟΥΖΙΝΑ 🍳", location: "ΕΤΟΙΜΗ ΠΑΡΑΓΓΕΛΙΑ" });
                    });
                }
            } 
        } 
    });

    // ✅ NEW: DELIVERY ASSIGNMENT (BROADCAST OR SPECIFIC)
    socket.on('assign-delivery', (data) => {
        const store = getMyStore();
        if(!store) return;
        const { orderId, targetDriver } = data; // targetDriver: username or 'ALL'
        
        const order = store.orders.find(o => o.id == orderId);
        if(order) {
            if (targetDriver === 'ALL') {
                // Broadcast σε όλους τους οδηγούς
                io.to(socket.store).emit('delivery-offer', { orderId: orderId });
            } else {
                // ✅ FIX: Ανάθεση σε συγκεκριμένο (Update Order Text)
                if (!order.text.includes(`[DRIVER: ${targetDriver}]`)) {
                     order.text += `\n[DRIVER: ${targetDriver}]`;
                }
                
                // ✅ NEW: Socket Ring for Specific Driver (Immediate Alert)
                const key = `${socket.store}_${targetDriver}`;
                const t = activeUsers[key];
                if (t && t.socketId) {
                    io.to(t.socketId).emit('ring-bell', { source: "ΑΝΑΘΕΣΗ 🛵", location: "ΝΕΑ ΠΑΡΑΓΓΕΛΙΑ" });
                }
                
                // Ειδοποίηση στον συγκεκριμένο οδηγό (Push Notification)
                if (store.staffTokens && store.staffTokens[targetDriver]) {
                    const tokenData = store.staffTokens[targetDriver];
                    Logic.sendPushNotification({ fcmToken: tokenData.token, role: 'driver' }, "ΝΕΑ ΔΙΑΝΟΜΗ 🛵", "Σου ανατέθηκε μια παραγγελία!", { type: "alarm" }, YOUR_DOMAIN, admin);
                }

                Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
            } 
        } 
    });

    // ✅ NEW: Driver Takes Order (Self-Assign)
    socket.on('driver-take-order', (data) => {
        const store = getMyStore();
        if(!store) return;
        const { orderId } = data;
        
        const order = store.orders.find(o => o.id == orderId);
        if(order) {
             // Check if already assigned
             if (order.text.includes('[DRIVER:')) return;

             order.text += `\n[DRIVER: ${socket.username}]`;
             Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
        }
    });

    socket.on('pay-order', async (data) => { 
        const store = getMyStore(); 
        if(store) { 
            // data μπορεί να είναι ID (παλιό) ή Object { id, method, stripeId, issueReceipt }
            const orderId = typeof data === 'object' ? data.id : data;
            const method = data.method || 'cash';
            const stripeId = data.stripeId || null;
            let issueReceipt = data.issueReceipt || false;

            const o = store.orders.find(x => x.id == orderId);
            if (o) {
                // ΑΥΤΟΜΑΤΗ ΑΠΟΔΕΙΞΗ: Αν το e-invoicing είναι ενεργό και πατηθεί πληρωμή
                if (store.settings.einvoicing && store.settings.einvoicing.enabled) {
                    issueReceipt = true; 
                }

                // Προσθήκη πληροφοριών στο κείμενο για την εκτύπωση/στατιστικά
                if (method === 'card') o.text += `\n💳 PAID (CARD${stripeId ? ': ' + stripeId : ''})`;
                else o.text += '\n💵 PAID (CASH)';

                if (issueReceipt) {
                    o.text += '\n[🧾 ΑΠΟΔΕΙΞΗ]';
                    o.aadeQr = "https://www1.aade.gr/tarl/myDATA/timologio/qrcode?mark=1234567890&uid=MOCK"; // Mock QR
                }

                Logic.updateStoreStats(store, o); // ✅ Καταγραφή στατιστικών πριν τη διαγραφή
                store.orders = store.orders.filter(x => x.id != orderId); 
                Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db); 
                
                // Ενημέρωση για το Web App αν χρειάζεται να τυπώσει
                socket.emit('print-order', { text: o.text, aadeQr: o.aadeQr });
            }
        } 
    });

    // ✅ NEW: TREAT ORDER (ΚΕΡΑΣΜΑ)
    socket.on('treat-order', (data) => {
        const store = getMyStore();
        if (store) {
            const o = store.orders.find(x => x.id == data.id);
            if (o) {
                const lines = o.text.split('\n');
                let treatedItems = []; // ✅ Track items for stats
                
                const treatLine = (line) => {
                    if (line.includes('(KERASMA)')) return line; // Already treated
                    // Find last colon which usually separates price
                    const lastColonIndex = line.lastIndexOf(':');
                    if (lastColonIndex !== -1) {
                        const before = line.substring(0, lastColonIndex);
                        const after = line.substring(lastColonIndex + 1); // Price and potential flags
                        // Check if 'after' starts with a number
                        if (/^\d/.test(after.trim())) {
                             // ✅ Capture item details
                             const price = parseFloat(after) || 0;
                             if (price > 0) treatedItems.push({ name: before.trim(), price: price });

                             // Replace price with 0 and add tag, keeping existing flags like ✅ if needed, though usually treat implies paid/free
                             return `${before}:0 (KERASMA)`;
                        }
                    }
                    return line;
                };

                if (data.type === 'full') {
                    o.text = lines.map(treatLine).join('\n');
                } else if (data.type === 'partial' && typeof data.index === 'number') {
                    if (lines[data.index]) {
                        lines[data.index] = treatLine(lines[data.index]);
                        o.text = lines.join('\n');
                    }
                }
                
                // ✅ Log Stats
                if (treatedItems.length > 0) {
                    Logic.logTreatStats(store, socket.username, treatedItems);
                }

                Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
            }
        }
    });

    // ✅ NEW: SAVE EXPENSES
    socket.on('save-expenses', (data) => {
        const store = getMyStore();
        if (store) {
            const now = new Date();
            const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });
            const [year, month, day] = dateStr.split('-');
            const monthKey = `${year}-${month}`;

            if (!store.stats) store.stats = {};
            if (!store.stats[monthKey]) store.stats[monthKey] = { orders: 0, turnover: 0, days: {} };
            if (!store.stats[monthKey].days[day]) store.stats[monthKey].days[day] = { orders: 0, turnover: 0 };

            store.stats[monthKey].days[day].expenses = {
                text: data.text,
                total: data.total
            };
            
            // Presets are now saved via save-store-settings, but keeping this for backward compatibility if needed
            Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
        }
    });

    // ✅ NEW: Αποστολή Στατιστικών στον Admin
    socket.on('get-stats', () => {
        const store = getMyStore();
        if (store && store.stats && socket.role === 'admin') {
            socket.emit('stats-data', store.stats);
        } else {
            socket.emit('stats-data', {}); // Κενά αν δεν υπάρχουν
        }
    });
    
    // ✅✅✅ NEW: RESERVATION LOGIC ✅✅✅
    socket.on('create-reservation', (data) => {
        const store = getMyStore();
        if (!store) return;
        
        const { name, phone, date, time, pax, customerToken } = data; // ✅ Add customerToken
        const totalTables = parseInt(store.settings.totalTables) || 0;
        
        if (!store.settings.reservationsEnabled || totalTables === 0) {
             socket.emit('reservation-result', { success: false, error: "Οι κρατήσεις είναι κλειστές." });
             return;
        }

        // 1. Υπολογισμός Κρατήσεων που πέφτουν πάνω στην ώρα (±2 ώρες)
        const reqDate = new Date(`${date}T${time}`);
        const reqTime = reqDate.getTime();
        
        const conflicting = (store.reservations || []).filter(r => {
            const rTime = new Date(`${r.date}T${r.time}`).getTime();
            return Math.abs(rTime - reqTime) < 7200000; // 2 hours overlap
        });
        
        // 2. Υπολογισμός Ενεργών Τραπεζιών (ΜΟΝΟ αν η κράτηση είναι για ΤΩΡΑ)
        let occupied = 0;
        const now = Date.now();
        // Αν η κράτηση είναι μέσα στο επόμενο 2ωρο, μετράμε και τα τραπέζια που τρώνε τώρα
        if (reqTime > now && reqTime - now < 7200000) {
             const activeTables = new Set();
             store.orders.forEach(o => {
                 if (o.status !== 'completed' && !o.text.includes('PAID')) {
                     const m = o.text.match(/\[ΤΡ:\s*([^|\]]+)/);
                     if (m) activeTables.add(m[1]);
                 }
             });
             occupied = activeTables.size;
        }

        if (conflicting.length + occupied >= totalTables) {
             socket.emit('reservation-result', { success: false, error: "Δεν υπάρχει διαθεσιμότητα για αυτή την ώρα." });
             return;
        }

        const newRes = {
            id: Date.now(),
            name, phone, date, time, pax,
            status: 'pending', // ✅ Changed to pending
            notified: false,
            customerToken: customerToken || null, // ✅ Store Token
            notifiedCustomer3h: false // ✅ Flag for 3h reminder
        };
        
        if (!store.reservations) store.reservations = [];
        store.reservations.push(newRes);
        Logic.saveStoreToFirebase(socket.store, db, storesData);
        
        socket.emit('reservation-result', { success: true, reservationId: newRes.id }); // ✅ Send ID back
        Logic.notifyAdmin(socket.store, "ΝΕΑ ΚΡΑΤΗΣΗ (ΑΝΑΜΟΝΗ) 📅", `${name} (${pax} άτ.)\n${date} ${time}`, null, "", storesData, activeUsers, io, YOUR_DOMAIN, admin);
        io.to(socket.store).emit('reservations-update', store.reservations);
    });

    // ✅ NEW: Accept Reservation
    socket.on('accept-reservation', (id) => {
        const store = getMyStore();
        if(store && store.reservations) {
            const r = store.reservations.find(x => x.id === id);
            if(r) {
                r.status = 'confirmed';
                Logic.saveStoreToFirebase(socket.store, db, storesData);
                io.to(socket.store).emit('reservations-update', store.reservations);
                io.to(socket.store).emit('reservation-confirmed', { id: id }); // ✅ Notify Customer
            }
        }
    });

    // ✅ NEW: Complete Reservation (Processed)
    socket.on('complete-reservation', (id) => {
        const store = getMyStore();
        if(store && store.reservations) {
            const r = store.reservations.find(x => x.id === id);
            if(r) {
                r.status = 'completed'; // ✅ Mark as completed
                Logic.saveStoreToFirebase(socket.store, db, storesData);
                io.to(socket.store).emit('reservations-update', store.reservations);
            }
        }
    });

    // ✅ NEW: Complete Reservation (Processed)
    socket.on('complete-reservation', (id) => {
        const store = getMyStore();
        if(store && store.reservations) {
            const r = store.reservations.find(x => x.id === id);
            if(r) {
                r.status = 'completed'; // ✅ Mark as completed
                Logic.saveStoreToFirebase(socket.store, db, storesData);
                io.to(socket.store).emit('reservations-update', store.reservations);
            }
        }
    });

    socket.on('get-reservations', () => {
        const store = getMyStore();
        if(store) socket.emit('reservations-update', store.reservations || []);
    });

    // ✅ NEW: Get Customer Reservations (by IDs)
    socket.on('get-customer-reservations', (ids) => {
        const store = getMyStore();
        if(store && store.reservations && Array.isArray(ids)) {
            const myRes = store.reservations.filter(r => ids.includes(r.id));
            socket.emit('my-reservations-data', myRes);
        } else {
            socket.emit('my-reservations-data', []);
        }
    });

    // ✅ NEW: Cancel Reservation by Customer
    socket.on('cancel-reservation-customer', (id) => {
        const store = getMyStore();
        if(store && store.reservations) {
            const r = store.reservations.find(x => x.id === id);
            if(r) {
                Logic.notifyAdmin(socket.store, "ΑΚΥΡΩΣΗ ΚΡΑΤΗΣΗΣ ❌", `Ο πελάτης ${r.name} ακύρωσε την κράτηση (${r.date} ${r.time}).`, null, "", storesData, activeUsers, io, YOUR_DOMAIN, admin);
                store.reservations = store.reservations.filter(x => x.id !== id);
                Logic.saveStoreToFirebase(socket.store, db, storesData);
                io.to(socket.store).emit('reservations-update', store.reservations);
                socket.emit('reservation-cancelled-success', id);
            }
        }
    });
    
    socket.on('delete-reservation', (id) => {
        const store = getMyStore();
        if(store && store.reservations) {
            const rIndex = store.reservations.findIndex(r => r.id === id);
            if (rIndex > -1) {
                const r = store.reservations[rIndex];
                // ✅ NEW: Notify Customer if Admin cancels
                if (r.customerToken) {
                    Logic.sendPushNotification({ fcmToken: r.customerToken, role: 'customer' }, "ΑΚΥΡΩΣΗ ΚΡΑΤΗΣΗΣ ❌", `Η κράτησή σας για ${r.date} ${r.time} ακυρώθηκε από το κατάστημα.`, { type: "info" }, YOUR_DOMAIN, admin);
                    Logic.sendPushNotification({ fcmToken: r.customerToken, role: 'customer', store: socket.store }, "ΑΚΥΡΩΣΗ ΚΡΑΤΗΣΗΣ ❌", `Η κράτησή σας για ${r.date} ${r.time} ακυρώθηκε από το κατάστημα.`, { type: "info" }, YOUR_DOMAIN, admin);
                }
                store.reservations.splice(rIndex, 1);
                Logic.saveStoreToFirebase(socket.store, db, storesData);
                io.to(socket.store).emit('reservations-update', store.reservations);
            }
        }
    });

    // ✅ NEW: DEVELOPER ANALYTICS (Πελάτες, Κέρδη, Emails)
    socket.on('get-dev-analytics', async () => {
        // 1. Ανάκτηση από Μνήμη (Active)
        let allStores = Object.values(storesData).map(s => ({
            name: s.settings.name,
            email: s.settings.adminEmail,
            plan: s.settings.plan || 'basic'
        }));

        // 2. Ανάκτηση από Firestore (Όλο το ιστορικό)
        if (db) {
            try {
                const snapshot = await db.collection('stores').get();
                const dbStores = [];
                snapshot.forEach(doc => {
                    const d = doc.data();
                    dbStores.push({
                        name: d.settings?.name || doc.id,
                        email: d.settings?.adminEmail || doc.id,
                        plan: d.settings?.plan || 'basic'
                    });
                });
                if (dbStores.length > 0) allStores = dbStores;
            } catch(e) { console.log("Analytics DB Error", e.message); }
        }

        // 3. Υπολογισμοί
        const uniqueEmails = [...new Set(allStores.map(s => s.email).filter(e => e && e.includes('@')))];
        // Υπολογισμός εσόδων (Basic: 4€, Premium: 10€)
        const revenue = allStores.reduce((sum, s) => sum + (s.plan === 'premium' ? 10 : 4), 0);

        socket.emit('dev-analytics-data', { stores: allStores, emails: uniqueEmails, revenue: revenue });
    });

    // ✅ PARTIAL PAY
    socket.on('pay-partial', (data) => { 
        const store = getMyStore(); 
        if(store){ 
            const o = store.orders.find(x => x.id == data.id); 
            if(o){ 
                let lines = o.text.split('\n'); 
                if(lines[data.index]) { 
                    let line = lines[data.index];
                    const clean = line.replace(/ ✅ 💶| ✅ 💳| ✅/g, '');
                    let newTag = '';

                    if (data.method === 'cash') {
                        if (!line.includes('✅ 💶')) newTag = ' ✅ 💶';
                    } else if (data.method === 'card') {
                        if (!line.includes('✅ 💳')) newTag = ' ✅ 💳';
                    } else {
                        if (!line.includes('✅')) newTag = ' ✅';
                    }
                    
                    lines[data.index] = clean + newTag;
                    o.text = lines.join('\n'); 
                    Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db); 
                } 
            } 
        } 
    });
    
    socket.on('trigger-alarm', (data) => { 
        const tName = (typeof data === 'object') ? data.target : data;
        const source = (typeof data === 'object') ? data.source : "Admin";
        
        console.log(`🔔 Trigger Alarm for: ${tName} from ${source}`);

        // 1. Socket Ring
        const key = `${socket.store}_${tName}`; 
        const t = activeUsers[key]; // ✅ Pass source as location for staff calls
        if(t){ 
            t.isRinging = true; Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db); 
            if(t.socketId) io.to(t.socketId).emit('ring-bell', { source: source, location: source }); 
        } 

        // 2. Push Notification (Persistent)
        const store = getMyStore();
        if (store && store.staffTokens && store.staffTokens[tName]) {
            const tokenData = store.staffTokens[tName];
            // ✅ FIX: Στέλνουμε ΠΑΝΤΑ Push για να είμαστε σίγουροι ότι θα χτυπήσει
            Logic.sendPushNotification({ fcmToken: tokenData.token, role: tokenData.role }, "📞 ΣΕ ΚΑΛΟΥΝ!", `Ο ${source} σε ζητάει!`, { type: "alarm", location: source }, YOUR_DOMAIN, admin, 10);
        } 
    });
    
    // ✅ NEW: STOP RINGING FOR EVERYONE (Admin & Kitchen)
    socket.on('admin-stop-ringing', () => { 
        const store = getMyStore(); 
        if(store) {
             Object.values(activeUsers).filter(u => u.store === socket.store && (u.role === 'admin' || u.role === 'kitchen')).forEach(u => {
                 u.isRinging = false;
                 if(u.socketId) io.to(u.socketId).emit('stop-bell');
             });
             Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
        }
    });

    socket.on('alarm-accepted', (data) => { let userKey = null; if (data && data.store && data.username) { const directKey = `${data.store}_${data.username}`; if (activeUsers[directKey]) userKey = directKey; } if (!userKey) { for (const [key, user] of Object.entries(activeUsers)) { if (user.socketId === socket.id) { userKey = key; break; } } } if (userKey) { const user = activeUsers[userKey]; user.isRinging = false; io.to(user.store).emit('staff-accepted-alarm', { username: user.username }); Logic.updateStoreClients(user.store, io, storesData, activeUsers, db); } });
    
    socket.on('manual-logout', (data) => { 
        const tUser = data && data.targetUser ? data.targetUser : socket.username; 
        const tKey = `${socket.store}_${tUser}`; 

        // ✅ NEW: Προσθήκη σε Blacklist για 15 δευτερόλεπτα (για να μην κάνει auto-reconnect)
        const banKey = `${socket.store}_${tUser}`;
        tempBlacklist.add(banKey);
        setTimeout(() => tempBlacklist.delete(banKey), 15000);
        
        // ✅ FIX: Force Logout Client-Side if connected (Kick User)
        if (activeUsers[tKey]) { 
            if (activeUsers[tKey].socketId) {
                io.to(activeUsers[tKey].socketId).emit('force-logout');
                
                // ✅ FIX: Καθυστέρηση αποσύνδεσης (1 sec)
                // Δίνουμε χρόνο στο App να λάβει την εντολή, να σβήσει το session και να βγει.
                // Αν το κόψουμε ακαριαία, το socket.io client κάνει auto-reconnect και ξαναμπαίνει στη λίστα!
                const targetSocket = io.sockets.sockets.get(activeUsers[tKey].socketId);
                if (targetSocket) {
                    setTimeout(() => targetSocket.disconnect(true), 1000);
                }
            }
            delete activeUsers[tKey]; 
        }
        // ✅ Remove from Permanent Storage & Send Push Logout (Background Users)
        if (storesData[socket.store] && storesData[socket.store].staffTokens) { 
            const tokenData = storesData[socket.store].staffTokens[tUser];
            if (tokenData && tokenData.token) {
                 Logic.sendPushNotification(
                     { fcmToken: tokenData.token, role: tokenData.role }, 
                     "LOGOUT", 
                     "Αποσύνδεση από διαχειριστή", 
                     { type: "logout" },
                     YOUR_DOMAIN,
                     admin
                 );
            }
            delete storesData[socket.store].staffTokens[tUser]; 
            
            // ✅ NEW: Ρητή διαγραφή από τη βάση (γιατί το merge μερικές φορές κρατάει τα παλιά)
            if (db) {
                db.collection('stores').doc(socket.store).update({
                    [`staffTokens.${tUser}`]: admin.firestore.FieldValue.delete()
                }).catch(e => console.log("Firestore delete error (ignored):", e.message));
            }
            
            Logic.saveStoreToFirebase(socket.store, db, storesData); 
        }
        Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
    });
    
    // ✅ FIX: Robust Disconnect Handler (Για να πιάνει σίγουρα το κλείσιμο καρτέλας)
    socket.on('disconnect', () => { 
        let user = null;
        // 1. Δοκιμή με τον κλασικό τρόπο
        const key = `${socket.store}_${socket.username}`;
        if (activeUsers[key] && activeUsers[key].socketId === socket.id) {
            user = activeUsers[key];
        } else {
            // 2. Fallback: Ψάξιμο με βάση το Socket ID (Αν χάθηκαν τα data)
            for (const k in activeUsers) {
                if (activeUsers[k].socketId === socket.id) {
                    user = activeUsers[k];
                    break;
                }
            }
        }

        if (user) { 
            user.status = 'offline'; // ✅ FIX: Set to offline on disconnect (Gray)
            Logic.updateStoreClients(user.store, io, storesData, activeUsers, db); 
        } 
    });

    socket.on('heartbeat', () => { 
        const key = `${socket.store}_${socket.username}`; 
        if (activeUsers[key]) { 
            activeUsers[key].lastSeen = Date.now(); 
            // ✅ FIX: Recover 'online' status if falsely away (Ghosting fix)
            if (activeUsers[key].status === 'away' || activeUsers[key].status === 'offline') { // ✅ FIX: Recover from offline too
                activeUsers[key].status = 'online';
                Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
            }
        } 
    });
    
    // ✅ NEW: Handle Visibility Status (Online vs Background)
    socket.on('set-user-status', (status) => {
        const key = `${socket.store}_${socket.username}`;
        if (activeUsers[key]) {
            // ✅ FIX: Ενημέρωση status (Online/Background) για σωστή διαχείριση ειδοποιήσεων
            activeUsers[key].status = status;
            Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
        }
    });
});

setInterval(() => { 
    try { 
        const nowInGreece = new Date().toLocaleTimeString('el-GR', { timeZone: 'Europe/Athens', hour: '2-digit', minute: '2-digit', hour12: false }); 
        Object.keys(storesData).forEach(storeName => { 
            const store = storesData[storeName]; 
            if (store.settings.resetTime && nowInGreece === store.settings.resetTime) { 
                    // ✅ FIX: Έλεγχος για να τρέξει ΜΙΑ φορά την ημέρα
                    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });
                    if (store.lastResetDate !== today) {
                        store.lastResetDate = today;

                        // ✅ ΑΥΤΟΜΑΤΗ ΕΠΑΝΑΦΟΡΑ ΜΕΝΟΥ (Reset)
                        if (store.permanentMenu) {
                            store.menu = JSON.parse(JSON.stringify(store.permanentMenu));
                            io.to(storeName).emit('menu-update', store.menu); 
                            console.log(`🔄 Menu reset for ${storeName}`);
                        }
                        // ✅ NEW: Αποστολή Email με Στατιστικά (Cron Job)
                        Logic.sendDailyReport(store, transporter);
                        
                        Logic.saveStoreToFirebase(storeName, db, storesData);
                }
            } 
        }); 
    } catch (e) {} 
    
    // ✅ NEW: RESERVATION NOTIFICATIONS (1 HOUR BEFORE)
    Object.keys(storesData).forEach(storeName => {
        const store = storesData[storeName];
        if (store.reservations) {
            const now = Date.now();
            store.reservations.forEach(r => {
                const rTime = new Date(`${r.date}T${r.time}`).getTime();
                
                // ✅ NEW: 3-HOUR REMINDER FOR CUSTOMER
                // (10800000 ms = 3 hours)
                if (rTime > now && rTime - now <= 10800000 && !r.notifiedCustomer3h && r.customerToken) {
                    r.notifiedCustomer3h = true;
                    Logic.sendPushNotification({ fcmToken: r.customerToken, role: 'customer' }, "ΥΠΕΝΘΥΜΙΣΗ ΚΡΑΤΗΣΗΣ 📅", `Έχετε κράτηση σε 3 ώρες (${r.time})!`, { type: "info" }, YOUR_DOMAIN, admin);
                    Logic.sendPushNotification({ fcmToken: r.customerToken, role: 'customer', store: storeName }, "ΥΠΕΝΘΥΜΙΣΗ ΚΡΑΤΗΣΗΣ 📅", `Έχετε κράτηση σε 3 ώρες (${r.time})!`, { type: "info" }, YOUR_DOMAIN, admin);
                    Logic.saveStoreToFirebase(storeName, db, storesData);
                }

                // Ειδοποίηση αν είναι σε λιγότερο από 1 ώρα (και δεν έχει ειδοποιηθεί)
                // ✅ FIX: Μην ειδοποιείς αν έχει ολοκληρωθεί (completed)
                if (r.status !== 'completed' && rTime > now && rTime - now <= 3600000 && !r.notified) {
                    r.notified = true;
                    // ❌ REMOVED notifyAdmin to exclude Kitchen
                    const title = "ΥΠΕΝΘΥΜΙΣΗ ΚΡΑΤΗΣΗΣ ⏰";
                    const body = `Σε 1 ώρα:\n${r.name} (${r.pax} άτ.)`;

                    // 1. ✅ FIX: Ειδοποίηση Admin ONLY (Όχι Kitchen)
                    Object.values(activeUsers).filter(u => u.store === storeName && u.role === 'admin').forEach(u => {
                        u.isRinging = true;
                        if (u.socketId) io.to(u.socketId).emit('ring-bell', { source: "ΚΡΑΤΗΣΗ", location: "Σε 1 ώρα" });
                    });

                    if (store.staffTokens) {
                        Object.entries(store.staffTokens).forEach(([username, data]) => {
                            if (data.role === 'admin') {
                                Logic.sendPushNotification({ fcmToken: data.token, role: data.role }, title, body, { type: "alarm", location: "Σε 1 ώρα" }, YOUR_DOMAIN, admin, 3600);
                            }
                        });
                    }

                    // 2. ✅ NEW: Ειδοποίηση ΚΑΙ στους Σερβιτόρους
                    // ✅ FIX: Μόνο αν είναι επιβεβαιωμένη (confirmed)
                    if (r.status === 'confirmed') {
                        Object.values(activeUsers).filter(u => u.store === storeName && u.role === 'waiter').forEach(u => {
                            u.isRinging = true;
                            if (u.socketId) io.to(u.socketId).emit('ring-bell', { source: "ΚΡΑΤΗΣΗ", location: "Σε 1 ώρα" });
                        });
                        
                        if (store.staffTokens) {
                            Object.entries(store.staffTokens).forEach(([username, data]) => {
                                if (data.role === 'waiter') {
                                    Logic.sendPushNotification({ fcmToken: data.token, role: data.role }, title, body, { type: "alarm", location: "Σε 1 ώρα" }, YOUR_DOMAIN, admin, 3600);
                                }
                            });
                        }
                    }

                    Logic.saveStoreToFirebase(storeName, db, storesData);
                }
            });
        }
    });
}, 60000); 
setInterval(() => { const now = Date.now(); for (const key in activeUsers) { if (now - activeUsers[key].lastSeen > 3600000) { const store = activeUsers[key].store; delete activeUsers[key]; Logic.updateStoreClients(store, io, storesData, activeUsers, db); } } }, 60000);

setInterval(() => { 
    const now = Date.now(); 
    
    for (const key in activeUsers) { 
        const user = activeUsers[key]; 
        
        if (user.isRinging && user.fcmToken) { 
            // ✅ FIX: Αν είναι Online (ανοιχτή οθόνη), μην στέλνεις Push (ενοχλεί)
            if (user.status === 'online') continue;

            // ✅ LOGIC: 3s for Background/Away (Urgent)
            const interval = 3000;
            
            if (!user.lastPushTime || (now - user.lastPushTime >= interval)) {
                user.lastPushTime = now;

                // ✅ ANTI-SPAM: Unique Message Every Time
                const uniqueId = Math.floor(Math.random() * 10000);
                const bells = "🔔".repeat((Math.floor(now / 1000) % 3) + 1);
                
                const title = user.role === 'admin' ? `ΝΕΑ ΠΑΡΑΓΓΕΛΙΑ 🍕 #${uniqueId}` : `📞 ΣΕ ΚΑΛΟΥΝ! #${uniqueId}`;
                const baseBody = user.role === 'admin' ? "Πατήστε για προβολή" : "ΑΠΑΝΤΗΣΕ ΤΩΡΑ!"; 
                const body = `${baseBody} ${bells} [${uniqueId}]`;

                Logic.sendPushNotification(user, title, body, { type: "alarm" }, YOUR_DOMAIN, admin); 
            }
        } 
    } 
}, 1000); // ✅ SERVER LOOP: Check every second

// ✅ NEW: HEARTBEAT CHECK LOOP (Detect Lost Connection)
setInterval(() => {
    const now = Date.now();
    for (const key in activeUsers) {
        const user = activeUsers[key];
        // Αν δεν έχει δώσει στίγμα για 60 δευτερόλεπτα -> Offline (Gray)
        if (user.status !== 'offline' && (now - user.lastSeen > 60000)) {
            user.status = 'offline';
            Logic.updateStoreClients(user.store, io, storesData, activeUsers, db);
        }
    }
}, 10000);

// ✅ NEW: REWARD CLAIM ENDPOINT
app.post('/claim-reward', async (req, res) => {
    const { storeName, orderId, phone } = req.body;
    
    if (!storeName || !orderId || !phone) return res.json({ success: false, error: "Λείπουν στοιχεία." });
    
    const store = await Logic.getStoreData(storeName, db, storesData);
    if (!store) return res.json({ success: false, error: "Το κατάστημα δεν βρέθηκε." });
    
    // 1. Έλεγχος αν είναι ενεργή η επιβράβευση
    if (!store.settings.reward || !store.settings.reward.enabled) {
        return res.json({ success: false, error: "Το πρόγραμμα επιβράβευσης είναι ανενεργό." });
    }

    // 2. Εύρεση Παραγγελίας
    const order = store.orders.find(o => o.id == orderId);
    // Σημείωση: Αν η παραγγελία έχει διαγραφεί (π.χ. κλείσιμο ημέρας), δεν μπορεί να πάρει πόντο.
    // Αν θέλουμε να δουλεύει και σε παλιές, πρέπει να ψάξουμε στα stats ή να εμπιστευτούμε το ID αν είναι valid timestamp.
    // Εδώ αυστηρά: Πρέπει να υπάρχει στα active orders ή να έχουμε ιστορικό. 
    // Για απλότητα, αν δεν βρεθεί στα active, ελέγχουμε αν το ID είναι έγκυρο timestamp του τελευταίου 24ωρου.
    const isValidId = (Date.now() - orderId) < 86400000; // 24 ώρες
    
    if (!order && !isValidId) return res.json({ success: false, error: "Η παραγγελία έληξε ή δεν βρέθηκε." });

    // 3. Έλεγχος Μοναδικότητας (One-Time Scan)
    // Χρησιμοποιούμε ένα Set ή Map στο store data για τα claimed IDs
    if (!store.claimedRewards) store.claimedRewards = {};
    if (store.claimedRewards[orderId]) {
        return res.json({ success: false, error: "Το QR έχει ήδη χρησιμοποιηθεί!" });
    }

    // 4. Καταγραφή Πόντου
    store.claimedRewards[orderId] = { phone, date: Date.now() };
    
    if (!store.rewards) store.rewards = {};
    if (!store.rewards[phone]) store.rewards[phone] = 0;
    store.rewards[phone]++;

    // ✅ NEW: Καταγραφή Στατιστικών αν κέρδισε δώρο
    const target = parseInt(store.settings.reward.target) || 5;
    if (store.rewards[phone] % target === 0) {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' }); // YYYY-MM-DD
        const [year, month, day] = dateStr.split('-');
        const monthKey = `${year}-${month}`;

        if (!store.stats) store.stats = {};
        if (!store.stats[monthKey]) store.stats[monthKey] = { orders: 0, turnover: 0, days: {} };
        
        // Καταγραφή στο Μήνα
        if (!store.stats[monthKey].rewardsGiven) store.stats[monthKey].rewardsGiven = 0;
        store.stats[monthKey].rewardsGiven++;

        // Καταγραφή στην Ημέρα
        if (!store.stats[monthKey].days[day]) store.stats[monthKey].days[day] = { orders: 0, turnover: 0 };
        if (!store.stats[monthKey].days[day].rewardsGiven) store.stats[monthKey].days[day].rewardsGiven = 0;
        store.stats[monthKey].days[day].rewardsGiven++;
    }
    
    Logic.saveStoreToFirebase(storeName, db, storesData);

    res.json({ success: true, count: store.rewards[phone], target: parseInt(store.settings.reward.target), gift: store.settings.reward.gift });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
