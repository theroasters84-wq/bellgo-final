const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require("firebase-admin");

// ✅ STRIPE SETUP (ΠΡΟΣΟΧΗ: Σε παραγωγή χρησιμοποιούμε .env)
const stripe = require('stripe')('sk_test_51SwnsPJcEtNSGviLf1RB1NTLaHJ3LTmqqy9LM52J3Qc7DpgbODtfhYK47nHAy1965eNxwVwh9gA4PTuizOxhMPil00dIoebxMx');
const STRIPE_CLIENT_ID = 'ca_TxCnGjK4GvUPXuJrE5CaUW9NeUdCeow6'; 
const YOUR_DOMAIN = 'https://bellgo-final.onrender.com'; 

// ✅ PRICE LIST
const PRICE_BASIC = 'price_1Sx9PFJcEtNSGviLteieJCwj';   // 4€
const PRICE_PREMIUM = 'price_1SzHTPJcEtNSGviLk7N84Irn'; // 10€

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
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); 
app.use('/manage', express.static(path.join(__dirname, 'public'))); // ✅ NEW: Εικονικός φάκελος για Admin PWA Isolation

const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*" },
    pingTimeout: 60000,
    pingInterval: 25000
});

/* ---------------- DATA STORE (MULTI-TENANT MEMORY) ---------------- */
let storesData = {};
let activeUsers = {}; 

const defaultSettings = { 
    name: "BellGo Delivery", 
    pin: null, 
    adminEmail: "", 
    statusCustomer: true, 
    statusStaff: true,
    resetTime: "04:00",
    stripeConnectId: "",
    coverPrice: 0, // ✅ Default τιμή κουβέρ
    googleMapsUrl: "" // ✅ Google Maps Link
}; 

/* ---------------- FIREBASE HELPERS ---------------- */
async function getStoreData(storeName) {
    if (storesData[storeName]) return storesData[storeName];
    console.log(`📥 Loading data for: ${storeName}`);
    let data = { settings: { ...defaultSettings }, menu: [], orders: [] };

    try {
        if (db) {
            const doc = await db.collection('stores').doc(storeName).get();
            if (doc.exists) {
                const firebaseData = doc.data();
                if (firebaseData.settings) data.settings = { ...defaultSettings, ...firebaseData.settings };
                if (firebaseData.menu) data.menu = firebaseData.menu;
                if (firebaseData.stats) data.stats = firebaseData.stats; // ✅ Φόρτωση Στατιστικών
                // ✅ Load Permanent Menu Backup (για επαναφορά)
                data.permanentMenu = firebaseData.permanentMenu || JSON.parse(JSON.stringify(data.menu || []));
                if (firebaseData.orders) {
                    const yesterday = Date.now() - (24 * 60 * 60 * 1000);
                    data.orders = (firebaseData.orders || []).filter(o => o.id > yesterday);
                }
            } else {
                await db.collection('stores').doc(storeName).set(data);
            }
        }
    } catch (e) {
        console.error(`❌ Error loading store ${storeName}:`, e.message);
    }
    storesData[storeName] = data;
    return data;
}

async function saveStoreToFirebase(storeName) {
    if (!storesData[storeName] || !db) return;
    try { 
        await db.collection('stores').doc(storeName).set(storesData[storeName], { merge: true }); 
    } catch(e){ console.error(`❌ Save Error (${storeName}):`, e.message); }
}

async function updateStoreClients(storeName) {
    if (!storeName || !storesData[storeName]) return;
    const store = storesData[storeName];
    const list = Object.values(activeUsers)
        .filter(u => u.store === storeName && u.role !== 'customer')
        .map(u => ({ 
            name: u.username, username: u.username, role: u.role, status: u.status, isRinging: u.isRinging 
        }));

    io.to(storeName).emit('staff-list-update', list);
    io.to(storeName).emit('orders-update', store.orders);
        io.to(storeName).emit('menu-update', store.menu || []); 
    io.to(storeName).emit('store-settings-update', store.settings);
    saveStoreToFirebase(storeName);
}

/* ---------------- STATISTICS HELPER ---------------- */
function updateStoreStats(store, order) {
    if (!store.stats) store.stats = {};
    
    // Υπολογισμός Τζίρου & Προϊόντων από το κείμενο της παραγγελίας
    let total = 0;
    let items = {};
    const lines = (order.text || "").split('\n');
    
    lines.forEach(line => {
        let cleanLine = line.replace('++ ', '').replace('✅ ', '').trim();
        if (cleanLine.startsWith('[')) return; // Αγνοούμε επικεφαλίδες (Τραπέζια κλπ)

        const match = cleanLine.match(/^(\d+)\s+(.*)/);
        if (match) {
            let qty = parseInt(match[1]);
            let rest = match[2];
            let price = 0;
            let name = rest;

            if (rest.includes(':')) {
                const parts = rest.split(':');
                const priceStr = parts[parts.length - 1];
                price = parseFloat(priceStr) || 0;
                name = parts.slice(0, -1).join(':').trim();
            }

            if (name) {
                if (!items[name]) items[name] = 0;
                items[name] += qty;
                total += qty * price;
            }
        }
    });

    // Ημερομηνία (Μήνας & Μέρα)
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' }); // YYYY-MM-DD
    const [year, month, day] = dateStr.split('-');
    const monthKey = `${year}-${month}`;

    if (!store.stats[monthKey]) store.stats[monthKey] = { orders: 0, turnover: 0, days: {}, products: {} };
    const mStats = store.stats[monthKey];

    // 1. Σύνολα Μήνα
    mStats.orders++;
    mStats.turnover += total;

    // 2. Σύνολα Ημέρας
    if (!mStats.days) mStats.days = {};
    if (!mStats.days[day]) mStats.days[day] = { orders: 0, turnover: 0, products: {}, staff: {} }; // ✅ Προσθήκη staff
    mStats.days[day].orders++;
    mStats.days[day].turnover += total;

    // ✅ 4. Στατιστικά Προσωπικού (Ανά Ημέρα)
    const staffName = (order.from && order.from.trim()) ? order.from : "Άγνωστος";
    if (!mStats.days[day].staff) mStats.days[day].staff = {};
    if (!mStats.days[day].staff[staffName]) mStats.days[day].staff[staffName] = { orders: 0, turnover: 0, products: {} };
    
    const sStats = mStats.days[day].staff[staffName];
    sStats.orders++;
    sStats.turnover += total;

    // 3. Τεμάχια Προϊόντων
    if (!mStats.products) mStats.products = {};
    for (const [prodName, qty] of Object.entries(items)) {
        // Αποθήκευση στο Σύνολο Μήνα
        if (!mStats.products[prodName]) mStats.products[prodName] = 0;
        mStats.products[prodName] += qty;
        
        // ✅ Αποθήκευση στο Σύνολο Ημέρας
        if (!mStats.days[day].products) mStats.days[day].products = {};
        if (!mStats.days[day].products[prodName]) mStats.days[day].products[prodName] = 0;
        mStats.days[day].products[prodName] += qty;
        
        // ✅ Αποθήκευση στο Προσωπικό
        if (!sStats.products[prodName]) sStats.products[prodName] = 0;
        sStats.products[prodName] += qty;
    }
}

function logTreatStats(store, staffName, items) {
    if (!store.stats) store.stats = {};
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });
    const [year, month, day] = dateStr.split('-');
    const monthKey = `${year}-${month}`;

    if (!store.stats[monthKey]) store.stats[monthKey] = { orders: 0, turnover: 0, days: {}, products: {}, treats: [] };
    if (!store.stats[monthKey].treats) store.stats[monthKey].treats = [];

    items.forEach(item => {
        store.stats[monthKey].treats.push({
            date: now.toISOString(),
            staff: staffName,
            item: item.name,
            price: item.price
        });
    });
}

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

// ✅ NEW: Virtual Route για το Staff App (για να έχει δικό του PWA Scope)
app.get('/staff/app', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'stafpremium.html')); });

app.get('/staff/login', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'login.html')); });
app.get('/admin', (req, res) => { res.redirect('/manage/login.html'); }); // ✅ Redirect στο νέο isolated path

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
        const data = await getStoreData(safeStoreId);
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
        scopeUrl = "/manage/";           // ✅ Αλλαγή Scope για να μην πιάνει το /shop/
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
            { "src": `/${iconFile}`, "sizes": "192x192", "type": "image/png" },
            { "src": `/${iconFile}`, "sizes": "512x512", "type": "image/png" }
        ]
    });
});

/* ---------------- STRIPE PAYMENTS ---------------- */
app.post('/check-subscription', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.json({ active: false });
    try {
        const customers = await stripe.customers.search({ query: `email:'${email}'` });
        if (customers.data.length === 0) return res.json({ active: false, msg: "User not found" });
        const subscriptions = await stripe.subscriptions.list({ customer: customers.data[0].id, status: 'active' });
        if (subscriptions.data.length > 0) {
            const planId = subscriptions.data[0].items.data[0].price.id;
            let planType = 'basic';
            if (planId === PRICE_PREMIUM) planType = 'premium';
            return res.json({ active: true, plan: planType });
        } else { return res.json({ active: false }); }
    } catch (e) { res.json({ active: false, error: e.message }); }
});

app.post('/create-checkout-session', async (req, res) => {
    const { email, plan } = req.body;
    let priceId = PRICE_BASIC; 
    if (plan === 'premium') priceId = PRICE_PREMIUM; 
    try {
        const session = await stripe.checkout.sessions.create({
            line_items: [{ price: priceId, quantity: 1 }],
            mode: 'subscription',
            customer_email: email,
            success_url: `${YOUR_DOMAIN}/login.html?session_id={CHECKOUT_SESSION_ID}&email=${encodeURIComponent(email)}`,
            cancel_url: `${YOUR_DOMAIN}/login.html`,
        });
        res.json({ url: session.url });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/create-order-payment', async (req, res) => {
    const { amount, storeName, items } = req.body; // ✅ Λήψη items
    const data = await getStoreData(storeName);
    const shopStripeId = data.settings.stripeConnectId;
    if (!shopStripeId) { return res.status(400).json({ error: "Το κατάστημα δεν έχει συνδέσει τραπεζικό λογαριασμό (Stripe ID)." }); }
    
    // ✅ FIX: Δυναμικό Domain για να επιστρέφει ακριβώς εκεί που ήταν ο πελάτης
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.get('host');
    const returnDomain = `${protocol}://${host}`;

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
    const { amount, storeName, orderId } = req.body;
    const data = await getStoreData(storeName);
    const shopStripeId = data.settings.stripeConnectId;
    if (!shopStripeId) { return res.status(400).json({ error: "Το κατάστημα δεν έχει συνδέσει Stripe." }); }
    
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.get('host');
    const returnDomain = `${protocol}://${host}`;

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
        const data = await getStoreData(store);
        const order = data.orders.find(o => o.id == orderId);
        if(order) {
             if(!order.text.includes('💳 PAID')) {
                 order.text += '\n💳 PAID (QR) ✅';
                 updateStoreClients(store);
                 notifyAdmin(store, "ΠΛΗΡΩΜΗ QR 💳", `Η παραγγελία εξοφλήθηκε!`);
             }
        }
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

/* ---------------- NOTIFICATION LOGIC ---------------- */
function sendPushNotification(target, title, body, dataPayload = { type: "alarm" }) {
    if (target && target.fcmToken) { 
        let targetUrl = "/stafpremium.html";
        if (target.role === 'admin') targetUrl = "/premium.html";

        const msg = {
            token: target.fcmToken,
            notification: { title: title, body: body },
            android: { priority: "high", notification: { sound: "default", tag: "bellgo-alarm", clickAction: `${YOUR_DOMAIN}${targetUrl}` } },
            webpush: { headers: { "Urgency": "high" }, fcm_options: { link: `${YOUR_DOMAIN}${targetUrl}` }, notification: { title: title, body: body, icon: '/admin.png', requireInteraction: true, tag: 'bellgo-alarm', renotify: true, vibrate: [500, 200, 500] } },
            data: { ...dataPayload, title: title, body: body, url: targetUrl }
        };
        admin.messaging().send(msg).catch(e => console.log("Push Error:", e.message));
    }
}

function notifyAdmin(storeName, title, body, excludeSocketId = null) {
    Object.values(activeUsers).filter(u => u.store === storeName && u.role === 'admin').forEach(adm => {
        if (excludeSocketId && adm.socketId === excludeSocketId) return; // ✅ Ο Admin που έβαλε την παραγγελία δεν ακούει alarm
        adm.isRinging = true;
        if (adm.socketId) io.to(adm.socketId).emit('ring-bell');
        sendPushNotification(adm, title, body);
    });
}

/* ---------------- SOCKET.IO ---------------- */
io.on('connection', (socket) => {
    const getMyStore = () => { if (!socket.store) return null; return storesData[socket.store]; };

    socket.on('join-store', async (data) => {
        let rawStore = data.storeName || '';
        if ((!rawStore || rawStore === 'null') && data.role === 'customer') { console.log("⚠️ Customer tried to join without storeName"); return; }
        if (!rawStore) { return; } // Admin without store yet

        if (rawStore.endsWith('premium')) rawStore = rawStore.replace('premium', '');
        const storeName = rawStore.toLowerCase().trim();
        const username = (data.username || '').trim();
        if (!storeName || !username) return;

        await getStoreData(storeName);

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

        socket.emit('menu-update', storesData[storeName].menu || []); // ✅ FIX: Άμεση αποστολή εδώ που υπάρχει το socket
        updateStoreClients(storeName);
        if(wasRinging) { socket.emit('ring-bell'); }
    });

    socket.on('check-pin-status', async (data) => { const targetEmail = data.email; if (!targetEmail) return; const store = await getStoreData(targetEmail); socket.emit('pin-status', { hasPin: !!store.settings.pin }); });
    socket.on('verify-pin', async (data) => { const pin = data.pin || data; let email = data.email || socket.store; if (email) { email = email.toLowerCase().trim(); const store = await getStoreData(email); if (store.settings.pin === pin) { socket.emit('pin-verified', { success: true, storeId: email }); } else { socket.emit('pin-verified', { success: false }); } } });
    socket.on('set-new-pin', async (data) => { const email = data.email; if(email) { const store = await getStoreData(email); store.settings.pin = data.pin; store.settings.adminEmail = email; socket.emit('pin-success', { msg: "Ο κωδικός ορίστηκε!" }); updateStoreClients(email); } });
    socket.on('update-token', (data) => { const key = `${socket.store}_${data.username}`; if (activeUsers[key]) activeUsers[key].fcmToken = data.token; });
    socket.on('toggle-status', (data) => { const store = getMyStore(); if (store) { if (data.type === 'customer') store.settings.statusCustomer = data.isOpen; if (data.type === 'staff') store.settings.statusStaff = data.isOpen; updateStoreClients(socket.store); } });
    socket.on('save-store-name', (newName) => { const store = getMyStore(); if (store) { store.settings.name = newName; updateStoreClients(socket.store); } });
    socket.on('save-store-settings', (data) => { 
        const store = getMyStore(); 
        if (store) { 
            if(data.resetTime) store.settings.resetTime = data.resetTime; 
            if(data.stripeConnectId) store.settings.stripeConnectId = data.stripeConnectId; 
            if(data.schedule) store.settings.schedule = data.schedule; 
            if(data.hours) store.settings.hours = data.hours; 
            if(data.coverPrice !== undefined) store.settings.coverPrice = data.coverPrice; // ✅ Αποθήκευση Κουβέρ
            if(data.googleMapsUrl !== undefined) store.settings.googleMapsUrl = data.googleMapsUrl; // ✅ Αποθήκευση Google Maps
            updateStoreClients(socket.store); 
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
                
                updateStoreClients(socket.store); 
            } catch (e) { console.error(e); } 
        } 
    });
    socket.on('chat-message', (data) => { if(socket.store) { io.to(socket.store).emit('chat-message', { sender: socket.username, text: data.text }); } });

    socket.on('new-order', (data) => {
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
            notifyAdmin(socket.store, "ΤΡΟΠΟΠΟΙΗΣΗ 📝", `Αλλαγή στην παραγγελία: ${socket.username}`);
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
                        logTreatStats(store, `${socket.username} (LATHOS)`, treatedItems);
                    }
                    orderText = newLines.join('\n');
                }
            }

            // Νέα Παραγγελία
            const newOrder = { id: orderId, text: orderText, from: socket.username, status: 'pending', store: socket.store };
            store.orders.push(newOrder);
            console.log(`📦 New order in room ${socket.store} from ${socket.username} with ID: ${orderId}`);
            // Ειδοποίηση Admin για Νέα Παραγγελία
            notifyAdmin(socket.store, "ΝΕΑ ΠΑΡΑΓΓΕΛΙΑ 🍕", `Από: ${socket.username}`, socket.id);
        }
        
        updateStoreClients(socket.store);
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
            notifyAdmin(socket.store, "ΠΡΟΣΘΗΚΗ ΠΡΟΪΟΝΤΩΝ ➕", `Από: ${socket.username}`);
            
            updateStoreClients(socket.store);
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
                updateStoreClients(socket.store); 
                io.to(socket.store).emit('order-changed', { id: o.id, status: 'cooking', startTime: o.startTime }); 
            } 
        } 
    });

    socket.on('ready-order', (id) => { 
        const store = getMyStore(); 
        if(store){ 
            const o = store.orders.find(x => x.id == id); 
            if(o){ 
                o.status = 'ready'; 
                o.readyTime = Date.now(); 
                updateStoreClients(socket.store); 
                io.to(socket.store).emit('order-changed', { id: o.id, status: 'ready', readyTime: o.readyTime }); 
                // Push Notification Logic
                const tKey = `${socket.store}_${o.from}`; 
                const tUser = activeUsers[tKey]; 
                if(tUser) sendPushNotification(tUser, "ΕΤΟΙΜΟ! 🛵", "Η παραγγελία έρχεται!"); 
            } 
        } 
    });

    socket.on('pay-order', (id) => { 
        const store = getMyStore(); 
        if(store) { 
            const o = store.orders.find(x => x.id == id);
            if (o) {
                updateStoreStats(store, o); // ✅ Καταγραφή στατιστικών πριν τη διαγραφή
                store.orders = store.orders.filter(x => x.id != id); 
                updateStoreClients(socket.store); 
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
                    logTreatStats(store, socket.username, treatedItems);
                }

                updateStoreClients(socket.store);
            }
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

    // ✅ PARTIAL PAY
    socket.on('pay-partial', (data) => { const store = getMyStore(); if(store){ const o = store.orders.find(x => x.id == data.id); if(o){ let lines = o.text.split('\n'); if(lines[data.index]) { if(lines[data.index].includes('✅')) { lines[data.index] = lines[data.index].replace(' ✅', ''); } else { lines[data.index] += ' ✅'; } o.text = lines.join('\n'); updateStoreClients(socket.store); } } } });
    
    socket.on('trigger-alarm', (data) => { 
        const tName = (typeof data === 'object') ? data.target : data;
        const source = (typeof data === 'object') ? data.source : "Admin";
        
        const key = `${socket.store}_${tName}`; 
        const t = activeUsers[key]; 
        if(t){ t.isRinging = true; updateStoreClients(socket.store); if(t.socketId) io.to(t.socketId).emit('ring-bell', { source }); sendPushNotification(t, "📞 ΣΕ ΚΑΛΟΥΝ!", `Ο ${source} σε ζητάει!`); } 
    });
    socket.on('alarm-accepted', (data) => { let userKey = null; if (data && data.store && data.username) { const directKey = `${data.store}_${data.username}`; if (activeUsers[directKey]) userKey = directKey; } if (!userKey) { for (const [key, user] of Object.entries(activeUsers)) { if (user.socketId === socket.id) { userKey = key; break; } } } if (userKey) { const user = activeUsers[userKey]; user.isRinging = false; io.to(user.store).emit('staff-accepted-alarm', { username: user.username }); updateStoreClients(user.store); } });
    socket.on('manual-logout', (data) => { const tUser = data && data.targetUser ? data.targetUser : socket.username; const tKey = `${socket.store}_${tUser}`; if (activeUsers[tKey]) { delete activeUsers[tKey]; updateStoreClients(socket.store); } });
    socket.on('disconnect', () => { const key = `${socket.store}_${socket.username}`; if (activeUsers[key] && activeUsers[key].socketId === socket.id) { activeUsers[key].status = 'away'; updateStoreClients(socket.store); } });
    socket.on('heartbeat', () => { const key = `${socket.store}_${socket.username}`; if (activeUsers[key]) { activeUsers[key].lastSeen = Date.now(); } });
});

setInterval(() => { 
    try { 
        const nowInGreece = new Date().toLocaleTimeString('el-GR', { timeZone: 'Europe/Athens', hour: '2-digit', minute: '2-digit', hour12: false }); 
        Object.keys(storesData).forEach(storeName => { 
            const store = storesData[storeName]; 
            if (store.settings.resetTime && nowInGreece === store.settings.resetTime) { 
                // ✅ ΑΥΤΟΜΑΤΗ ΕΠΑΝΑΦΟΡΑ ΜΕΝΟΥ (Reset)
                if (store.permanentMenu) {
                    store.menu = JSON.parse(JSON.stringify(store.permanentMenu));
                    io.to(storeName).emit('menu-update', store.menu); 
                    saveStoreToFirebase(storeName);
                    console.log(`🔄 Menu reset for ${storeName}`);
                }
            } 
        }); 
    } catch (e) {} 
}, 60000); 
setInterval(() => { const now = Date.now(); for (const key in activeUsers) { if (now - activeUsers[key].lastSeen > 3600000) { const store = activeUsers[key].store; delete activeUsers[key]; updateStoreClients(store); } } }, 60000);
setInterval(() => { 
    const now = Date.now(); 
    for (const key in activeUsers) { 
        const user = activeUsers[key]; 
        if (user.isRinging && user.fcmToken) { 
            // ✅ SMART NOTIFICATIONS: Στέλνει μόνο αν δεν έχει στείλει heartbeat τα τελευταία 10s
            const isActive = user.status === 'online' && (now - user.lastSeen < 10000);
            if (!isActive) {
                const msg = user.role === 'admin' ? "ΝΕΑ ΠΑΡΑΓΓΕΛΙΑ 🍕" : "📞 ΣΕ ΚΑΛΟΥΝ!"; 
                const body = user.role === 'admin' ? "Πατήστε για προβολή" : "ΑΠΑΝΤΗΣΕ ΤΩΡΑ!"; 
                sendPushNotification(user, msg, body); 
            }
        } 
    } 
}, 3000); 

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
