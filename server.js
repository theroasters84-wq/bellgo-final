const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require("firebase-admin");
const fs = require('fs');

// ✅ STRIPE SETUP
const stripe = require('stripe')('sk_test_51SwnsPJcEtNSGviLf1RB1NTLaHJ3LTmqqy9LM52J3Qc7DpgbODtfhYK47nHAy1965eNxwVwh9gA4PTuizOxhMPil00dIoebxMx');
const STRIPE_CLIENT_ID = 'ca_TxCnGjK4GvUPXuJrE5CaUW9NeUdCeow6'; // ✅ ΤΟ ΚΛΕΙΔΙ ΣΟΥ
const YOUR_DOMAIN = 'https://bellgo-final.onrender.com'; 

// ✅ ΤΙΜΟΚΑΤΑΛΟΓΟΣ ΣΥΝΔΡΟΜΩΝ (Price IDs)
const PRICE_BASIC = 'price_1Sx9PFJcEtNSGviLteieJCwj';   // 4€
const PRICE_PREMIUM = 'price_1SzHTPJcEtNSGviLk7N84Irn'; // 10€

/* ---------------- FIREBASE ADMIN SETUP ---------------- */
try {
    const serviceAccount = require("./serviceAccountKey.json");
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("✅ Firebase Admin Initialized");
} catch (e) {
    console.log("⚠️ Firebase Warning: serviceAccountKey.json not found.");
}

/* ---------------- SERVER SETUP ---------------- */
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); 

const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*" },
    pingTimeout: 60000,
    pingInterval: 25000
});

/* ---------------- DATA STORE ---------------- */
let activeUsers = {};
let activeOrders = [];

// Files
const MENU_FILE = path.join(__dirname, 'saved_menu.json');
const SETTINGS_FILE = path.join(__dirname, 'store_settings.json');
const ORDERS_FILE = path.join(__dirname, 'active_orders.json');

// Menu Memory
let masterMenu = []; 
let liveMenu = [];   

let storeSettings = { 
    name: "BellGo Delivery", 
    pin: null, 
    adminEmail: "", 
    statusCustomer: true, 
    statusStaff: true,
    resetTime: "04:00",
    stripeConnectId: "" 
}; 

// LOAD DATA
try {
    if (fs.existsSync(MENU_FILE)) {
        const raw = fs.readFileSync(MENU_FILE, 'utf8');
        try { 
            masterMenu = JSON.parse(raw); 
            liveMenu = JSON.parse(JSON.stringify(masterMenu));
        } catch { masterMenu = []; liveMenu = []; }
    }
    if (fs.existsSync(SETTINGS_FILE)) {
        const loaded = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        storeSettings = { ...storeSettings, ...loaded };
    }
    if (fs.existsSync(ORDERS_FILE)) {
        activeOrders = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
    }
} catch (e) { console.log("Load Error", e); }

// SAVE HELPERS
function saveOrdersToDisk() { try { fs.writeFileSync(ORDERS_FILE, JSON.stringify(activeOrders, null, 2), 'utf8'); } catch (e) {} }
function saveSettingsToDisk() { try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(storeSettings, null, 2), 'utf8'); } catch (e) {} }
function saveMenuToDisk() { try { fs.writeFileSync(MENU_FILE, JSON.stringify(masterMenu, null, 2), 'utf8'); } catch (e) {} }

/* ---------------- VIRTUAL ROUTES ---------------- */
app.get('/shop/:storeName', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'order.html')); });
app.get('/staff/login', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'login.html')); });
app.get('/admin', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'login.html')); });

/* ---------------- STRIPE CONNECT OAUTH (TO KOYMPI) ---------------- */
// 1. Έναρξη σύνδεσης
app.get('/connect-stripe', (req, res) => {
    const state = "BellGo_Store"; 
    const url = `https://connect.stripe.com/oauth/authorize?response_type=code&client_id=${STRIPE_CLIENT_ID}&scope=read_write&state=${state}`;
    res.redirect(url);
});

// 2. Callback από το Stripe
app.get('/stripe-connect-callback', async (req, res) => {
    const { code, error } = req.query;
    if (error || !code) {
        return res.send("<h1>❌ Σφάλμα σύνδεσης με Stripe.</h1><a href='/premium.html'>Επιστροφή</a>");
    }
    try {
        const response = await stripe.oauth.token({
            grant_type: 'authorization_code',
            code: code,
        });
        storeSettings.stripeConnectId = response.stripe_user_id;
        saveSettingsToDisk();
        io.emit('store-settings-update', storeSettings);
        res.send("<h1>✅ Επιτυχία!</h1><p>Ο λογαριασμός συνδέθηκε.</p><script>setTimeout(() => window.location.href='/premium.html', 2000);</script>");
    } catch (err) {
        console.error("Stripe Connect Error:", err);
        res.status(500).send("Error connecting Stripe account: " + err.message);
    }
});

/* ---------------- DYNAMIC MANIFEST (✅ PWA SEPARATION FIX) ---------------- */
app.get('/manifest.json', (req, res) => {
    // 1. Παίρνουμε παραμέτρους από το URL
    const iconType = req.query.icon || 'admin'; 
    const storeParam = req.query.store || "general";
    
    // 2. Καθαρίζουμε το όνομα του καταστήματος για χρήση σε ID
    const safeStoreId = storeParam.replace(/[^a-zA-Z0-9]/g, '');
    
    // 3. Καθορισμός Ονόματος App
    // Αν είναι shop, προσπαθούμε να πάρουμε το όνομα από το query, αλλιώς από τα settings, αλλιώς default
    let appName = "BellGo App";
    if (iconType === 'shop') {
        appName = req.query.name || storeSettings.name || `Shop ${safeStoreId}`;
    } else {
        appName = storeSettings.name || "BellGo Admin";
    }

    // 4. Καθορισμός ID για να είναι ΞΕΧΩΡΙΣΤΟ App
    // Προσθέτουμε το safeStoreId στο ID για να μην μπερδεύονται τα μαγαζιά μεταξύ τους
    let appId = `bellgo_${iconType}_${safeStoreId}`; 

    let iconFile = "admin.png"; 
    let startUrl = ".";  
    let scopeUrl = "/";        

    if (iconType === 'shop') {
        iconFile = "shop.png"; // ✅ Το εικονίδιο του καταστήματος
        // ✅ To start_url πρέπει να κρατάει το όνομα για να ανοίγει σωστά την επόμενη φορά
        startUrl = `/shop/${safeStoreId}?name=${encodeURIComponent(appName)}`;
        // ✅ Το scope περιορίζει το PWA μόνο σε αυτό το μαγαζί (βοηθάει στο διαχωρισμό)
        scopeUrl = `/shop/${safeStoreId}`; 
    } else {
        iconFile = "admin.png";
        startUrl = `/login.html`; 
        scopeUrl = "/";
    }

    res.set('Content-Type', 'application/manifest+json');
    res.json({
        "id": appId,             // ✅ Κλειδί για το ξεχωριστό Install
        "name": appName,         // ✅ Ο τίτλος που θα φαίνεται κάτω από το εικονίδιο
        "short_name": appName,
        "start_url": startUrl,   // ✅ Πού ανοίγει όταν πατάς το εικονίδιο
        "scope": scopeUrl,       // ✅ Περιοχή λειτουργίας
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

/* ---------------- STRIPE PAYMENTS (SUBSCRIPTIONS & ORDERS) ---------------- */

// 1. Έλεγχος Συνδρομής (Active Check)
app.post('/check-subscription', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.json({ active: false });

    try {
        const customers = await stripe.customers.search({ query: `email:'${email}'` });
        if (customers.data.length === 0) return res.json({ active: false, msg: "User not found" });

        const subscriptions = await stripe.subscriptions.list({
            customer: customers.data[0].id,
            status: 'active',
        });

        if (subscriptions.data.length > 0) {
            const planId = subscriptions.data[0].items.data[0].price.id;
            let planType = 'basic';
            if (planId === PRICE_PREMIUM) planType = 'premium';
            return res.json({ active: true, plan: planType });
        } else {
            return res.json({ active: false });
        }
    } catch (e) {
        console.error("Stripe Check Error:", e);
        res.json({ active: false, error: e.message });
    }
});

// 2. Αγορά Συνδρομής (Checkout)
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

// 3. Πληρωμή Παραγγελίας (Customer -> Store)
app.post('/create-order-payment', async (req, res) => {
    const { amount, storeName } = req.body; 
    const shopStripeId = storeSettings.stripeConnectId; 

    if (!shopStripeId) {
        return res.status(400).json({ error: "Το κατάστημα δεν έχει συνδέσει τραπεζικό λογαριασμό (Stripe ID)." });
    }

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'eur',
                    product_data: { name: 'Παραγγελία Delivery', description: `Κατάστημα: ${storeName}` },
                    unit_amount: Math.round(amount * 100),
                },
                quantity: 1,
            }],
            mode: 'payment',
            payment_intent_data: { transfer_data: { destination: shopStripeId } },
            success_url: `${YOUR_DOMAIN}/shop/${storeName}?payment_status=success`,
            cancel_url: `${YOUR_DOMAIN}/shop/${storeName}?payment_status=cancel`,
        });
        res.json({ url: session.url });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------------- NOTIFICATION LOGIC ---------------- */
function sendPushNotification(target, title, body, dataPayload = { type: "alarm" }) {
    if (target && target.fcmToken) {
        const msg = {
            token: target.fcmToken,
            data: { ...dataPayload, title: title, body: body, url: "/premium.html" },
            android: { priority: "high" },
            webpush: { headers: { "Urgency": "high" } }
        };
        admin.messaging().send(msg).catch(e => console.log("Push Error:", e.message));
    }
}

function updateStore(store) {
    if (!store) return;
    const list = Object.values(activeUsers)
        .filter(u => u.store === store && u.role !== 'customer')
        .map(u => ({ name: u.username, username: u.username, role: u.role, status: u.status, isRinging: u.isRinging }));

    io.to(store).emit('staff-list-update', list);
    io.to(store).emit('orders-update', activeOrders.filter(o => o.store === store));
    io.to(store).emit('menu-update', liveMenu);
    io.to(store).emit('store-settings-update', storeSettings);
    saveOrdersToDisk();
}

/* ---------------- SOCKET.IO ---------------- */
io.on('connection', (socket) => {

    socket.on('check-pin-status', () => { socket.emit('pin-status', { hasPin: !!storeSettings.pin }); });
    socket.on('set-new-pin', (data) => {
        storeSettings.pin = data.pin;
        if(data.email) storeSettings.adminEmail = data.email; 
        saveSettingsToDisk();
        socket.emit('pin-success', { msg: "Ο κωδικός ορίστηκε!" });
    });
    socket.on('verify-pin', (pin) => {
        if (storeSettings.pin === pin) {
            socket.emit('pin-verified', { success: true, storeId: storeSettings.adminEmail || storeSettings.name });
        } else {
            socket.emit('pin-verified', { success: false });
        }
    });

    socket.on('update-token', (data) => {
        const key = `${socket.store}_${data.username}`;
        if (activeUsers[key]) activeUsers[key].fcmToken = data.token;
    });

    socket.on('toggle-status', (data) => {
        if (data.type === 'customer') storeSettings.statusCustomer = data.isOpen;
        if (data.type === 'staff') storeSettings.statusStaff = data.isOpen;
        saveSettingsToDisk();
        io.to(socket.store).emit('store-settings-update', storeSettings);
    });

    socket.on('join-store', (data) => {
        let rawStore = data.storeName || '';
        if (!rawStore && data.role === 'customer') rawStore = storeSettings.name;
        if (rawStore.endsWith('premium')) rawStore = rawStore.replace('premium', '');
        
        const store = rawStore.toLowerCase().trim();
        const username = (data.username || '').trim();
        if (!store || !username) return;

        socket.store = store;
        socket.username = username;
        socket.role = data.role || 'waiter'; 
        if (data.role === 'customer') socket.role = 'customer';

        socket.join(store);

        const key = `${store}_${username}`;
        activeUsers[key] = {
            store, username, role: socket.role, socketId: socket.id,
            fcmToken: data.token, status: "online", lastSeen: Date.now(),
            isRinging: activeUsers[key]?.isRinging || false, isNative: data.isNative
        };

        updateStore(store);
        socket.emit('menu-update', liveMenu);
        socket.emit('store-settings-update', storeSettings);
    });

    socket.on('save-store-name', (newName) => { storeSettings.name = newName; saveSettingsToDisk(); io.to(socket.store).emit('store-settings-update', storeSettings); });
    socket.on('save-store-settings', (data) => {
        if(data.resetTime) storeSettings.resetTime = data.resetTime;
        if(data.stripeConnectId) storeSettings.stripeConnectId = data.stripeConnectId;
        saveSettingsToDisk();
        io.to(socket.store).emit('store-settings-update', storeSettings);
    });

    socket.on('save-menu', (data) => {
        try {
            let newMenuData = [];
            let mode = 'permanent';
            if (Array.isArray(data)) newMenuData = data;
            else if (data.menu) { newMenuData = data.menu; mode = data.mode || 'permanent'; }

            if (mode === 'permanent') {
                masterMenu = JSON.parse(JSON.stringify(newMenuData));
                liveMenu = JSON.parse(JSON.stringify(newMenuData));
                saveMenuToDisk();
            } else { liveMenu = newMenuData; }
            io.to(socket.store).emit('menu-update', liveMenu);
        } catch (e) { }
    });

    // ✅ CHAT MESSAGE (Προστέθηκε)
    socket.on('chat-message', (data) => {
        if(socket.store) {
            io.to(socket.store).emit('chat-message', { sender: socket.username, text: data.text });
        }
    });

    socket.on('new-order', (orderText) => {
        if (!socket.store) return;
        if (!storeSettings.statusCustomer && activeUsers[`${socket.store}_${socket.username}`]?.role === 'customer') return;

        const newOrder = {
            id: Date.now(),
            text: orderText,
            from: socket.username,
            status: 'pending',
            store: socket.store
        };
        activeOrders.push(newOrder);
        updateStore(socket.store);

        Object.values(activeUsers).filter(u => u.store === socket.store && u.role === 'admin').forEach(adm => {
            if (adm.socketId) io.to(adm.socketId).emit('ring-bell');
            sendPushNotification(adm, "ΝΕΑ ΠΑΡΑΓΓΕΛΙΑ 🍕", `Από: ${socket.username}`);
        });
    });

    socket.on('accept-order', (id) => { const o = activeOrders.find(x => x.id === id); if(o){ o.status = 'cooking'; updateStore(socket.store); } });
    socket.on('ready-order', (id) => { 
        const o = activeOrders.find(x => x.id === id); 
        if(o){ 
            o.status = 'ready'; updateStore(socket.store); 
            const tKey = `${socket.store}_${o.from}`; const tUser = activeUsers[tKey]; 
            if(tUser) sendPushNotification(tUser, "ΕΤΟΙΜΟ! 🛵", "Η παραγγελία έρχεται!"); 
        } 
    });
    socket.on('pay-order', (id) => { activeOrders = activeOrders.filter(x => x.id !== Number(id)); updateStore(socket.store); });
    
    // 🔔 STAFF ALARM
    socket.on('trigger-alarm', (tName) => { 
        const key = `${socket.store}_${tName}`; const t = activeUsers[key]; 
        if(t){ 
            t.isRinging = true; updateStore(socket.store); 
            if(t.socketId) io.to(t.socketId).emit('ring-bell'); 
            sendPushNotification(t, "📞 ΣΕ ΚΑΛΟΥΝ!", "Ο Admin σε ζητάει!");
        } 
    });

    // ✅✅✅ SMART ALARM ACCEPTED (ANDROID FIX) ✅✅✅
    socket.on('alarm-accepted', (data) => {
        let userKey = null;
        
        // 1. Try explicit data (Web)
        if (data && data.store && data.username) {
            const directKey = `${data.store}_${data.username}`;
            if (activeUsers[directKey]) userKey = directKey;
        }
        
        // 2. Fallback: Search by Socket ID (Native App)
        if (!userKey) {
            for (const [key, user] of Object.entries(activeUsers)) {
                if (user.socketId === socket.id) { userKey = key; break; }
            }
        }

        if (userKey) {
            const user = activeUsers[userKey];
            user.isRinging = false; 
            console.log(`✅ Alarm Accepted by ${user.username}`);
            
            updateStore(user.store); 
            // 🔴 ΕΙΔΙΚΟ ΜΗΝΥΜΑ ΓΙΑ ANDROID
            io.to(user.store).emit('staff-accepted-alarm', { username: user.username });
        }
    });

    socket.on('manual-logout', (data) => { const tUser = data && data.targetUser ? data.targetUser : socket.username; const tKey = `${socket.store}_${tUser}`; if (activeUsers[tKey]) { delete activeUsers[tKey]; updateStore(socket.store); } });
    socket.on('disconnect', () => { const key = `${socket.store}_${socket.username}`; if (activeUsers[key] && activeUsers[key].socketId === socket.id) { activeUsers[key].status = 'away'; updateStore(socket.store); } });
});

// CRON JOBS
setInterval(() => {
    try {
        if (!storeSettings.resetTime) return;
        const nowInGreece = new Date().toLocaleTimeString('el-GR', { timeZone: 'Europe/Athens', hour: '2-digit', minute: '2-digit', hour12: false });
        if (nowInGreece === storeSettings.resetTime) {
            const liveStr = JSON.stringify(liveMenu);
            const masterStr = JSON.stringify(masterMenu);
            if (liveStr !== masterStr) { liveMenu = JSON.parse(masterStr); io.emit('menu-update', liveMenu); }
        }
    } catch (e) {}
}, 60000); 

setInterval(() => { const now = Date.now(); for (const key in activeUsers) { if (now - activeUsers[key].lastSeen > 3600000) delete activeUsers[key]; } }, 60000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
