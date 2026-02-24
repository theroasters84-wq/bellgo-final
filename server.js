const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require("firebase-admin");
const nodemailer = require('nodemailer'); // ✅ NEW: Email Module

// ✅ EMAIL CONFIGURATION (Ρυθμίστε το εδώ)
const transporter = nodemailer.createTransport({
    service: 'gmail', 
    auth: {
        user: 'bellgo.system@gmail.com', // ⚠️ ΑΛΛΑΞΤΕ ΤΟ ΜΕ ΤΟ EMAIL ΣΑΣ
        pass: 'xxxx xxxx xxxx xxxx'      // ⚠️ ΑΛΛΑΞΤΕ ΤΟ ΜΕ APP PASSWORD (Όχι τον κωδικό του email)
    }
});

// ✅ STRIPE SETUP (ΠΡΟΣΟΧΗ: Σε παραγωγή χρησιμοποιούμε .env)
const stripe = require('stripe')('sk_test_51SwnsPJcEtNSGviLf1RB1NTLaHJ3LTmqqy9LM52J3Qc7DpgbODtfhYK47nHAy1965eNxwVwh9gA4PTuizOxhMPil00dIoebxMx');
const STRIPE_CLIENT_ID = 'ca_TxCnGjK4GvUPXuJrE5CaUW9NeUdCeow6'; 
const YOUR_DOMAIN = 'https://bellgo-final.onrender.com'; 

// ✅ PRICE LIST
const PRICE_BASIC = 'price_1Sx9PFJcEtNSGviLteieJCwj';   // 4€
const PRICE_PREMIUM = 'price_1SzHTPJcEtNSGviLk7N84Irn'; // 10€

// ✅ NEW: Αντιστοίχιση Stripe Price IDs με Features
// ⚠️ ΠΡΟΣΟΧΗ: Αντικατέστησε τα 'price_xxx' με τα πραγματικά ID από το Stripe Dashboard
const FEATURE_PRICES = {
    'price_chat_xxxxx': 'pack_chat',
    'price_manager_xxxxx': 'pack_manager',
    'price_delivery_xxxxx': 'pack_delivery',
    'price_tables_xxxxx': 'pack_tables',
    'price_pos_xxxxx': 'pack_pos',
    'price_loyalty_xxxxx': 'pack_loyalty'
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
app.use(express.json());

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

const defaultSettings = { 
    name: "BellGo Delivery", 
    pin: null, 
    adminEmail: "", 
    statusCustomer: true, 
    statusStaff: true,
    resetTime: "04:00",
    stripeConnectId: "",
    coverPrice: 0, // ✅ Default τιμή κουβέρ
    googleMapsUrl: "", // ✅ Google Maps Link
    autoPrint: false, // ✅ Ρύθμιση Αυτόματης Εκτύπωσης
    printerEnabled: true, // ✅ NEW: Master Printer Switch
    autoClosePrint: false, // ✅ Ρύθμιση Αυτόματου Κλεισίματος Παραθύρου
    plan: 'basic', // ✅ Καταγραφή Συνδρομής (basic/premium)
    visibility: 'public', // ✅ NEW: 'public' (Όλοι βλέπουν όλους) ή 'private' (Μόνο ο Admin βλέπει)
    staffCharge: false, // ✅ NEW: Λειτουργία Χρέωσης Προσωπικού
    reservationsEnabled: false, // ✅ NEW: Κρατήσεις
    totalTables: 0, // ✅ NEW: Σύνολο Τραπεζιών
    einvoicing: {}, // ✅ NEW: E-Invoicing Settings
    pos: { provider: '', id: '', key: '' }, // ✅ NEW: POS Settings
    cashRegButtons: [], // ✅ NEW: Custom Cash Register Buttons
    reward: { enabled: false, gift: "Δωρεάν Προϊόν", target: 5 }, // ✅ NEW: Reward Settings
    // ✅ NEW: Features Flags (Default όλα κλειστά, εκτός αν αγοραστούν)
    features: {
        pack_chat: false,
        pack_manager: false,
        pack_delivery: false,
        pack_tables: false,
        pack_pos: false,
        pack_loyalty: false
    }
}; 

// ✅ NEW: Προσωρινή Blacklist για να μην ξαναμπαίνουν αμέσως οι διαγραμμένοι χρήστες
const tempBlacklist = new Set();

/* ---------------- FIREBASE HELPERS ---------------- */
async function getStoreData(storeName) {
    if (storesData[storeName]) return storesData[storeName];
    console.log(`📥 Loading data for: ${storeName}`);
    let data = { settings: { ...defaultSettings }, menu: [], orders: [], staffTokens: {}, wallets: {}, reservations: [] }; // ✅ NEW: reservations init

    try {
        if (db) {
            const doc = await db.collection('stores').doc(storeName).get();
            if (doc.exists) {
                const firebaseData = doc.data();
                if (firebaseData.settings) data.settings = { ...defaultSettings, ...firebaseData.settings };
                if (firebaseData.menu) data.menu = firebaseData.menu;
                if (firebaseData.staffTokens) data.staffTokens = firebaseData.staffTokens; // ✅ Load Tokens
                if (firebaseData.stats) data.stats = firebaseData.stats; // ✅ Φόρτωση Στατιστικών
                if (firebaseData.wallets) data.wallets = firebaseData.wallets; // ✅ Φόρτωση Πορτοφολιών
                if (firebaseData.rewards) data.rewards = firebaseData.rewards; // ✅ Φόρτωση Πόντων Πελατών
                if (firebaseData.reservations) data.reservations = firebaseData.reservations; // ✅ Φόρτωση Κρατήσεων
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
    
    // 1. Active Users (Online/Away in memory)
    let activeList = Object.values(activeUsers)
        .filter(u => u.store === storeName && u.role !== 'customer');

    let list = [];
    const seenUsers = new Set();

    activeList.forEach(u => {
        const lower = u.username.toLowerCase();
        if (!seenUsers.has(lower)) {
            seenUsers.add(lower);
            list.push({ name: u.username, username: u.username, role: u.role, status: u.status, isRinging: u.isRinging });
        }
    });

    // 2. Persistent Users (Offline but registered)
    if (store.staffTokens) {
        Object.keys(store.staffTokens).forEach(username => {
            // ✅ FIX: Case-insensitive check to prevent ghosts
            if (!seenUsers.has(username.toLowerCase())) {
                const tokenData = store.staffTokens[username];
                if (tokenData.role !== 'admin' && tokenData.role !== 'customer') {
                    list.push({
                        name: username, username: username, 
                        role: tokenData.role || 'waiter', 
                        status: 'offline', isRinging: false 
                    });
                    seenUsers.add(username.toLowerCase());
                }
            }
        });
    }

    io.to(storeName).emit('staff-list-update', list);
    io.to(storeName).emit('orders-update', store.orders);
    io.to(storeName).emit('menu-update', store.menu || []); 
    io.to(storeName).emit('store-settings-update', store.settings);
    io.to(storeName).emit('wallet-update', store.wallets || {}); // ✅ Ενημέρωση Πορτοφολιών
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

    // ✅ NEW: Υπολογισμός Ώρας (για ώρες αιχμής)
    const hourStr = now.toLocaleTimeString('en-US', { timeZone: 'Europe/Athens', hour: '2-digit', hour12: false });
    const hour = hourStr.padStart(2, '0'); // π.χ. "14"

    if (!store.stats[monthKey]) store.stats[monthKey] = { orders: 0, turnover: 0, days: {}, products: {} };
    const mStats = store.stats[monthKey];

    // 1. Σύνολα Μήνα
    mStats.orders++;
    mStats.turnover += total;

    // ✅ NEW: Καταγραφή Ώρας στο Μήνα
    if (!mStats.hours) mStats.hours = {};
    if (!mStats.hours[hour]) mStats.hours[hour] = 0;
    mStats.hours[hour]++;

    // 2. Σύνολα Ημέρας
    if (!mStats.days) mStats.days = {};
    if (!mStats.days[day]) mStats.days[day] = { orders: 0, turnover: 0, products: {}, staff: {} }; // ✅ Προσθήκη staff
    mStats.days[day].orders++;
    mStats.days[day].turnover += total;

    // ✅ NEW: Καταγραφή Ώρας στην Ημέρα
    if (!mStats.days[day].hours) mStats.days[day].hours = {};
    if (!mStats.days[day].hours[hour]) mStats.days[day].hours[hour] = 0;
    mStats.days[day].hours[hour]++;

    // ✅ NEW: QR STATS LOGIC (Πελάτες QR)
    const isQr = (order.from && order.from.includes('(Πελάτης)'));
    if (isQr) {
        let qrType = null;
        if (order.text.includes('[ΤΡ:') || order.text.includes('[ΤΡ')) qrType = 'dineIn';
        else if (order.text.includes('[DELIVERY')) qrType = 'delivery';

        if (qrType) {
            // Month Totals
            if (!mStats.qrStats) mStats.qrStats = { dineIn: { turnover: 0, orders: 0 }, delivery: { turnover: 0, orders: 0 } };
            if (!mStats.qrStats[qrType]) mStats.qrStats[qrType] = { turnover: 0, orders: 0 };
            mStats.qrStats[qrType].turnover += total;
            mStats.qrStats[qrType].orders++;

            // Day Totals
            if (!mStats.days[day].qrStats) mStats.days[day].qrStats = { dineIn: { turnover: 0, orders: 0 }, delivery: { turnover: 0, orders: 0 } };
            if (!mStats.days[day].qrStats[qrType]) mStats.days[day].qrStats[qrType] = { turnover: 0, orders: 0 };
            mStats.days[day].qrStats[qrType].turnover += total;
            mStats.days[day].qrStats[qrType].orders++;
        }
    }

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
      const data = await getStoreData(storeName);
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
      const data = await getStoreData(storeName);
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
    try {
        const customers = await stripe.customers.search({ query: `email:'${email}'` });
        if (customers.data.length === 0) return res.json({ active: false, msg: "User not found" });
        
        const subscriptions = await stripe.subscriptions.list({ customer: customers.data[0].id, status: 'active' });
        
        if (subscriptions.data.length > 0) {
            let planType = 'basic';
            let activeFeatures = {};

            // Έλεγχος όλων των συνδρομών και των αντικειμένων τους
            subscriptions.data.forEach(sub => {
                sub.items.data.forEach(item => {
                    const priceId = item.price.id;
                    if (priceId === PRICE_PREMIUM) planType = 'premium';
                    // Έλεγχος για modular features
                    if (FEATURE_PRICES[priceId]) activeFeatures[FEATURE_PRICES[priceId]] = true;
                });
            });

            return res.json({ active: true, plan: planType, features: activeFeatures });
        } else { return res.json({ active: false }); }
    } catch (e) { res.json({ active: false, error: e.message }); }
});

app.post('/create-checkout-session', async (req, res) => {
    const { email, plan, isNative } = req.body; // ✅ Προσθήκη isNative
    let priceId = PRICE_BASIC; 
    if (plan === 'premium') priceId = PRICE_PREMIUM; 

    // ✅ FIX: Δυναμικό Domain για επιστροφή στο App
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.get('host');
    let returnDomain = `${protocol}://${host}`;

    if (isNative) {
        returnDomain = `bellgoapp://${host}`;
    }

    try {
        const session = await stripe.checkout.sessions.create({
            line_items: [{ price: priceId, quantity: 1 }],
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
    const data = await getStoreData(storeName);
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
    const data = await getStoreData(storeName);
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
        const data = await getStoreData(store);
        const order = data.orders.find(o => o.id == orderId);
        if(order) {
             if(!order.text.includes('💳 PAID')) {
                 order.text += '\n💳 PAID (QR) ✅';
                 updateStoreClients(store);
                 notifyAdmin(store, "ΠΛΗΡΩΜΗ QR 💳", `Η παραγγελία εξοφλήθηκε!`);
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

/* ---------------- NOTIFICATION LOGIC ---------------- */
function sendPushNotification(target, title, body, dataPayload = { type: "alarm" }) {
    if (target && target.fcmToken) { 
        let targetUrl = "/stafpremium.html";
        if (target.role === 'admin') targetUrl = "/premium.html";
        // ✅ FIX: Αν είναι πελάτης, άνοιξε το order.html (ή το shop link)
        if (target.role === 'customer') {
            targetUrl = target.store ? `/shop/${encodeURIComponent(target.store)}/` : "/order.html";
        }

        const msg = {
            token: target.fcmToken,
            notification: { title: title, body: body },
            
            android: { 
                priority: "high", 
                notification: { channelId: "bellgo_alarm_channel" } 
            },
            webpush: { 
                headers: { "Urgency": "high" }, 
                fcm_options: { link: `${YOUR_DOMAIN}${targetUrl}` },
            },
            apns: {
                headers: {
                    'apns-priority': '10',
                    'apns-push-type': 'alert', // ✅ Κρίσιμο για iOS 13+
                },
                payload: {
                    aps: {
                        'content-available': 1, // ✅ Ξυπνάει την εφαρμογή στο background
                        badge: 1,
                        sound: 'alert.mp3'
                    }
                }
            },
            data: { type: "alarm", ...dataPayload, title: title, body: body, url: targetUrl }
        };
        admin.messaging().send(msg).catch(e => console.log("Push Error:", e.message));
    }
}

function notifyAdmin(storeName, title, body, excludeSocketId = null, location = "") {
    const store = storesData[storeName];
    if (!store) return;

    // 1. Ειδοποίηση μέσω Socket (Για όσους είναι συνδεδεμένοι)
    Object.values(activeUsers).filter(u => u.store === storeName && (u.role === 'admin' || u.role === 'kitchen')).forEach(u => {
        if (excludeSocketId && u.socketId === excludeSocketId) return;
        u.isRinging = true;
        if (u.socketId) io.to(u.socketId).emit('ring-bell', { source: title, location: location });
    });

    // 2. Ειδοποίηση μέσω Push (Από μόνιμη μνήμη - για ΚΛΕΙΣΤΟΥΣ browsers)
    if (!store.staffTokens) store.staffTokens = {};
    Object.entries(store.staffTokens).forEach(([username, data]) => {
        if (data.role === 'admin' || data.role === 'kitchen') {
            // ✅ FIX: Στέλνουμε ΠΑΝΤΑ Push. 
            // Αν ο χρήστης είναι Online, το OS την κρύβει αυτόματα. Αν είναι Background, εμφανίζεται.
            sendPushNotification({ fcmToken: data.token, role: data.role }, title, body, { type: "alarm", location: location }, 86400);
        }
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

        // ✅ NEW: Έλεγχος Blacklist (Αν τον διέγραψε ο Admin πριν λίγο, μην τον αφήσεις να μπει)
        if (tempBlacklist.has(`${storeName}_${username}`)) {
            socket.emit('force-logout');
            socket.disconnect(true);
            return;
        }

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
                saveStoreToFirebase(storeName);
            }
        }

        socket.emit('menu-update', storesData[storeName].menu || []); // ✅ FIX: Άμεση αποστολή εδώ που υπάρχει το socket
        updateStoreClients(storeName);
        if(wasRinging) { socket.emit('ring-bell'); }
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

    socket.on('check-pin-status', async (data) => { const targetEmail = data.email; if (!targetEmail) return; const store = await getStoreData(targetEmail); socket.emit('pin-status', { hasPin: !!store.settings.pin }); });
    socket.on('verify-pin', async (data) => { const pin = data.pin || data; let email = data.email || socket.store; if (email) { email = email.toLowerCase().trim(); const store = await getStoreData(email); if (store.settings.pin === pin) { socket.emit('pin-verified', { success: true, storeId: email }); } else { socket.emit('pin-verified', { success: false }); } } });
    socket.on('set-new-pin', async (data) => { const email = data.email; if(email) { const store = await getStoreData(email); store.settings.pin = data.pin; store.settings.adminEmail = email; socket.emit('pin-success', { msg: "Ο κωδικός ορίστηκε!" }); updateStoreClients(email); } });
    
    socket.on('update-token', (data) => { 
        const key = `${socket.store}_${data.username}`; 
        if (activeUsers[key]) activeUsers[key].fcmToken = data.token; 
        // ✅ Save Permanent
        if (storesData[socket.store]) { if(!storesData[socket.store].staffTokens) storesData[socket.store].staffTokens={}; storesData[socket.store].staffTokens[data.username] = { token: data.token, role: activeUsers[key].role }; saveStoreToFirebase(socket.store); }
    });

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
            if(data.features) store.settings.features = data.features; // ✅ NEW: Save Features
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
            
            // ✅ EXTRACT LOCATION (Address or Table) for GPS
            let locationInfo = "";
            const addrMatch = orderText.match(/📍\s*(.+)/);
            if (addrMatch) locationInfo = addrMatch[1].trim();

            // Ειδοποίηση Admin για Νέα Παραγγελία
            notifyAdmin(socket.store, "ΝΕΑ ΠΑΡΑΓΓΕΛΙΑ 🍕", `Από: ${socket.username}`, socket.id, locationInfo);
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
        updateStoreStats(store, tempOrder);
        saveStoreToFirebase(socket.store);
        
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

                updateStoreClients(socket.store);
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
            updateStoreStats(store, o);
            store.orders = store.orders.filter(x => x.id != orderId);
        }
        
        updateStoreClients(socket.store);
    });

    socket.on('reset-wallet', (targetName) => {
        const store = getMyStore();
        if (store && store.wallets) {
            if (targetName === 'ALL') {
                store.wallets = {}; // Reset All
            } else if (store.wallets[targetName] !== undefined) {
                delete store.wallets[targetName]; // ✅ DELETE: Διαγραφή για να φύγει από το panel
            }
            updateStoreClients(socket.store);
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
                updateStoreClients(socket.store); 
                io.to(socket.store).emit('order-changed', { id: o.id, status: 'ready', readyTime: o.readyTime }); 

                if (!silent) { // ✅ Check silent flag
                    // Push Notification Logic
                    const tKey = `${socket.store}_${o.from}`; 
                    const tUser = activeUsers[tKey]; 
                    if(tUser) sendPushNotification(tUser, "ΕΤΟΙΜΟ! 🛵", "Η παραγγελία έρχεται!", { type: "alarm" }, 3600); // TTL 1h για Ετοιμότητα

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
                
                // Ειδοποίηση στον συγκεκριμένο οδηγό (Push Notification)
                if (store.staffTokens && store.staffTokens[targetDriver]) {
                    const tokenData = store.staffTokens[targetDriver];
                    sendPushNotification({ fcmToken: tokenData.token, role: 'driver' }, "ΝΕΑ ΔΙΑΝΟΜΗ 🛵", "Σου ανατέθηκε μια παραγγελία!", { type: "alarm" });
                }

                updateStoreClients(socket.store);
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
             updateStoreClients(socket.store);
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

                updateStoreStats(store, o); // ✅ Καταγραφή στατιστικών πριν τη διαγραφή
                store.orders = store.orders.filter(x => x.id != orderId); 
                updateStoreClients(socket.store); 
                
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
                    logTreatStats(store, socket.username, treatedItems);
                }

                updateStoreClients(socket.store);
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
            updateStoreClients(socket.store);
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
        saveStoreToFirebase(socket.store);
        
        socket.emit('reservation-result', { success: true, reservationId: newRes.id }); // ✅ Send ID back
        notifyAdmin(socket.store, "ΝΕΑ ΚΡΑΤΗΣΗ (ΑΝΑΜΟΝΗ) 📅", `${name} (${pax} άτ.)\n${date} ${time}`);
        io.to(socket.store).emit('reservations-update', store.reservations);
    });

    // ✅ NEW: Accept Reservation
    socket.on('accept-reservation', (id) => {
        const store = getMyStore();
        if(store && store.reservations) {
            const r = store.reservations.find(x => x.id === id);
            if(r) {
                r.status = 'confirmed';
                saveStoreToFirebase(socket.store);
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
                saveStoreToFirebase(socket.store);
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
                saveStoreToFirebase(socket.store);
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
                notifyAdmin(socket.store, "ΑΚΥΡΩΣΗ ΚΡΑΤΗΣΗΣ ❌", `Ο πελάτης ${r.name} ακύρωσε την κράτηση (${r.date} ${r.time}).`);
                store.reservations = store.reservations.filter(x => x.id !== id);
                saveStoreToFirebase(socket.store);
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
                    sendPushNotification({ fcmToken: r.customerToken, role: 'customer' }, "ΑΚΥΡΩΣΗ ΚΡΑΤΗΣΗΣ ❌", `Η κράτησή σας για ${r.date} ${r.time} ακυρώθηκε από το κατάστημα.`, { type: "info" });
                    sendPushNotification({ fcmToken: r.customerToken, role: 'customer', store: socket.store }, "ΑΚΥΡΩΣΗ ΚΡΑΤΗΣΗΣ ❌", `Η κράτησή σας για ${r.date} ${r.time} ακυρώθηκε από το κατάστημα.`, { type: "info" });
                }
                store.reservations.splice(rIndex, 1);
                saveStoreToFirebase(socket.store);
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
                    updateStoreClients(socket.store); 
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
            t.isRinging = true; updateStoreClients(socket.store); 
            if(t.socketId) io.to(t.socketId).emit('ring-bell', { source: source, location: source }); 
        } 

        // 2. Push Notification (Persistent)
        const store = getMyStore();
        if (store && store.staffTokens && store.staffTokens[tName]) {
            const tokenData = store.staffTokens[tName];
            // ✅ FIX: Στέλνουμε ΠΑΝΤΑ Push για να είμαστε σίγουροι ότι θα χτυπήσει
            sendPushNotification({ fcmToken: tokenData.token, role: tokenData.role }, "📞 ΣΕ ΚΑΛΟΥΝ!", `Ο ${source} σε ζητάει!`, { type: "alarm", location: source }, 10);
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
             updateStoreClients(socket.store);
        }
    });

    socket.on('alarm-accepted', (data) => { let userKey = null; if (data && data.store && data.username) { const directKey = `${data.store}_${data.username}`; if (activeUsers[directKey]) userKey = directKey; } if (!userKey) { for (const [key, user] of Object.entries(activeUsers)) { if (user.socketId === socket.id) { userKey = key; break; } } } if (userKey) { const user = activeUsers[userKey]; user.isRinging = false; io.to(user.store).emit('staff-accepted-alarm', { username: user.username }); updateStoreClients(user.store); } });
    
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
                 sendPushNotification(
                     { fcmToken: tokenData.token, role: tokenData.role }, 
                     "LOGOUT", 
                     "Αποσύνδεση από διαχειριστή", 
                     { type: "logout" }
                 );
            }
            delete storesData[socket.store].staffTokens[tUser]; 
            
            // ✅ NEW: Ρητή διαγραφή από τη βάση (γιατί το merge μερικές φορές κρατάει τα παλιά)
            if (db) {
                db.collection('stores').doc(socket.store).update({
                    [`staffTokens.${tUser}`]: admin.firestore.FieldValue.delete()
                }).catch(e => console.log("Firestore delete error (ignored):", e.message));
            }
            
            saveStoreToFirebase(socket.store); 
        }
        updateStoreClients(socket.store);
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
            user.status = 'background'; // ✅ FIX: Άμεση μετάβαση σε background αν κλείσει η σύνδεση
            updateStoreClients(user.store); 
        } 
    });

    socket.on('heartbeat', () => { 
        const key = `${socket.store}_${socket.username}`; 
        if (activeUsers[key]) { 
            activeUsers[key].lastSeen = Date.now(); 
            // ✅ FIX: Recover 'online' status if falsely away (Ghosting fix)
            if (activeUsers[key].status === 'away' || activeUsers[key].status === 'background') { // ✅ FIX: Επαναφορά και από background
                activeUsers[key].status = 'online';
                updateStoreClients(socket.store);
            }
        } 
    });
    
    // ✅ NEW: Handle Visibility Status (Online vs Background)
    socket.on('set-user-status', (status) => {
        const key = `${socket.store}_${socket.username}`;
        if (activeUsers[key]) {
            // ✅ FIX: Ο χρήστης ζήτησε να μπαίνει background ΜΟΝΟ αν χαθεί το socket (disconnect).
            // Αγνοούμε το 'background' όσο το socket είναι ενεργό.
            if (status === 'online') {
                activeUsers[key].status = status;
                updateStoreClients(socket.store); // ✅ FIX: Ενημέρωση του Admin αμέσως!
            }
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
                        sendDailyReport(store);
                        
                        saveStoreToFirebase(storeName);
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
                    sendPushNotification({ fcmToken: r.customerToken, role: 'customer' }, "ΥΠΕΝΘΥΜΙΣΗ ΚΡΑΤΗΣΗΣ 📅", `Έχετε κράτηση σε 3 ώρες (${r.time})!`, { type: "info" });
                    sendPushNotification({ fcmToken: r.customerToken, role: 'customer', store: storeName }, "ΥΠΕΝΘΥΜΙΣΗ ΚΡΑΤΗΣΗΣ 📅", `Έχετε κράτηση σε 3 ώρες (${r.time})!`, { type: "info" });
                    saveStoreToFirebase(storeName);
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
                                sendPushNotification({ fcmToken: data.token, role: data.role }, title, body, { type: "alarm", location: "Σε 1 ώρα" }, 3600);
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
                                    sendPushNotification({ fcmToken: data.token, role: data.role }, title, body, { type: "alarm", location: "Σε 1 ώρα" }, 3600);
                                }
                            });
                        }
                    }

                    saveStoreToFirebase(storeName);
                }
            });
        }
    });
}, 60000); 
setInterval(() => { const now = Date.now(); for (const key in activeUsers) { if (now - activeUsers[key].lastSeen > 3600000) { const store = activeUsers[key].store; delete activeUsers[key]; updateStoreClients(store); } } }, 60000);

setInterval(() => { 
    const now = Date.now(); 
    
    for (const key in activeUsers) { 
        const user = activeUsers[key]; 
        
        if (user.isRinging && user.fcmToken) { 
            // ✅ LOGIC: 3s for Background/Away (Urgent), 15s for Online (Backup)
            // iPhone often goes to 'away' (disconnects) or 'background'. Both need fast alerts.
            const interval = (user.status === 'online') ? 15000 : 3000;
            
            if (!user.lastPushTime || (now - user.lastPushTime >= interval)) {
                user.lastPushTime = now;

                // ✅ ANTI-SPAM: Unique Message Every Time
                const uniqueId = Math.floor(Math.random() * 10000);
                const bells = "🔔".repeat((Math.floor(now / 1000) % 3) + 1);
                
                const title = user.role === 'admin' ? `ΝΕΑ ΠΑΡΑΓΓΕΛΙΑ 🍕 #${uniqueId}` : `📞 ΣΕ ΚΑΛΟΥΝ! #${uniqueId}`;
                const baseBody = user.role === 'admin' ? "Πατήστε για προβολή" : "ΑΠΑΝΤΗΣΕ ΤΩΡΑ!"; 
                const body = `${baseBody} ${bells} [${uniqueId}]`;

                sendPushNotification(user, title, body, { type: "alarm" }); 
            }
        } 
    } 
}, 1000); // ✅ SERVER LOOP: Check every second

// ✅ NEW: FUNCTION TO SEND DAILY EMAIL
async function sendDailyReport(store) {
    const email = store.settings.adminEmail;
    if (!email) return;

    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });
    
    // Υπολογισμός Χθεσινής Ημέρας (Γιατί το reset γίνεται συνήθως 04:00 π.μ.)
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });

    const getStats = (d) => {
        const [y, m, day] = d.split('-');
        return store.stats?.[`${y}-${m}`]?.days?.[day];
    };

    const sToday = getStats(todayStr);
    const sYesterday = getStats(yesterdayStr);

    if (!sToday && !sYesterday) return;

    let html = `<h1>📊 BellGo Report: ${store.settings.name}</h1>`;
    
    if (sYesterday) {
        html += `<h3>📅 Χθες (${yesterdayStr})</h3><p>💰 Τζίρος: <b>${sYesterday.turnover.toFixed(2)}€</b></p><p>📦 Παραγγελίες: ${sYesterday.orders}</p><hr>`;
    }
    if (sToday) {
        html += `<h3>📅 Σήμερα (${todayStr}) - Έως τώρα</h3><p>💰 Τζίρος: <b>${sToday.turnover.toFixed(2)}€</b></p><p>📦 Παραγγελίες: ${sToday.orders}</p><hr>`;
    }

    try {
        await transporter.sendMail({
            from: '"BellGo Bot" <noreply@bellgo.com>',
            to: email,
            subject: `📊 Ημερήσια Αναφορά - ${store.settings.name}`,
            html: html
        });
        console.log(`📧 Report sent to ${email}`);
    } catch (e) { console.error("Email Error:", e.message); }
}

// ✅ NEW: REWARD CLAIM ENDPOINT
app.post('/claim-reward', async (req, res) => {
    const { storeName, orderId, phone } = req.body;
    
    if (!storeName || !orderId || !phone) return res.json({ success: false, error: "Λείπουν στοιχεία." });
    
    const store = await getStoreData(storeName);
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
    
    saveStoreToFirebase(storeName);

    res.json({ success: true, count: store.rewards[phone], target: parseInt(store.settings.reward.target), gift: store.settings.reward.gift });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
