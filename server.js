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

const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*" },
    pingTimeout: 60000,
    pingInterval: 25000
});

/* ---------------- DATA STORE (MULTI-TENANT MEMORY) ---------------- */
// 🔥 ΚΡΙΣΙΜΗ ΑΛΛΑΓΗ: Αποθήκευση δεδομένων ΑΝΑ ΚΑΤΑΣΤΗΜΑ
// Δομή: storesData["storeName"] = { settings: {}, menu: [], orders: [] }
let storesData = {};
let activeUsers = {}; // Global users list linked to stores

// Default Settings Template
const defaultSettings = { 
    name: "BellGo Delivery", 
    pin: null, 
    adminEmail: "", 
    statusCustomer: true, 
    statusStaff: true,
    resetTime: "04:00",
    stripeConnectId: "" 
}; 

/* ---------------- FIREBASE HELPERS ---------------- */

// Φόρτωση δεδομένων συγκεκριμένου καταστήματος
async function getStoreData(storeName) {
    // 1. Αν υπάρχει στη μνήμη, το επιστρέφουμε
    if (storesData[storeName]) return storesData[storeName];

    // 2. Αν δεν υπάρχει, προσπαθούμε να το φορτώσουμε από Firebase
    console.log(`📥 Loading data for: ${storeName}`);
    let data = { settings: { ...defaultSettings }, menu: [], orders: [] };

    try {
        if (db) {
            const doc = await db.collection('stores').doc(storeName).get();
            if (doc.exists) {
                const firebaseData = doc.data();
                if (firebaseData.settings) data.settings = { ...defaultSettings, ...firebaseData.settings };
                if (firebaseData.menu) data.menu = firebaseData.menu;
                if (firebaseData.orders) {
                    // Filter old orders (>24h)
                    const yesterday = Date.now() - (24 * 60 * 60 * 1000);
                    data.orders = (firebaseData.orders || []).filter(o => o.id > yesterday);
                }
            } else {
                // Initialize new store in DB
                await db.collection('stores').doc(storeName).set(data);
            }
        }
    } catch (e) {
        console.error(`❌ Error loading store ${storeName}:`, e.message);
    }

    // Save to memory
    storesData[storeName] = data;
    return data;
}

// Αποθήκευση δεδομένων καταστήματος στο Firebase
async function saveStoreToFirebase(storeName) {
    if (!storesData[storeName] || !db) return;
    try { 
        await db.collection('stores').doc(storeName).set(storesData[storeName], { merge: true }); 
    } catch(e){ console.error(`❌ Save Error (${storeName}):`, e.message); }
}

/* ---------------- VIRTUAL ROUTES ---------------- */
app.get('/shop/:storeName', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'order.html')); });
app.get('/staff/login', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'login.html')); });
app.get('/admin', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'login.html')); });

/* ---------------- STRIPE CONNECT OAUTH ---------------- */
app.get('/connect-stripe', (req, res) => {
    // Πρέπει να ξέρουμε ποιο store κάνει connect. Εδώ το βάζουμε γενικά,
    // αλλά ιδανικά θα έπρεπε να περνάς το storeName στο state.
    // Προς το παρόν το αφήνουμε απλό, αλλά η callback δεν ξέρει ποιο store να ενημερώσει
    // αν δεν το αποθηκεύσεις σε cookie ή στο state.
    // 🔥 FIX: Χρησιμοποιούμε cookie ή υποθέτουμε ότι ο χρήστης θα κάνει login μετά.
    const state = "BellGo_Store"; 
    const url = `https://connect.stripe.com/oauth/authorize?response_type=code&client_id=${STRIPE_CLIENT_ID}&scope=read_write&state=${state}`;
    res.redirect(url);
});

// Σημείωση: Αυτό το callback έχει ένα θέμα λογικής: Δεν ξέρει σε ποιο storeData να γράψει το stripeId.
// Κανονικά θα έπρεπε να στέλνουμε το ID στο Front-end και να το στέλνει το Front-end μέσω Socket.
// Εδώ απλοποιούμε: Επιστρέφουμε το ID στον χρήστη και το JS του premium.html το στέλνει πίσω.
app.get('/stripe-connect-callback', async (req, res) => {
    const { code, error } = req.query;
    if (error || !code) return res.send("<h1>❌ Σφάλμα Stripe.</h1>");
    
    try {
        const response = await stripe.oauth.token({ grant_type: 'authorization_code', code: code });
        const stripeId = response.stripe_user_id;
        
        // Στέλνουμε το ID πίσω στο frontend για να το αποθηκεύσει μέσω socket
        res.send(`
            <h1>✅ Επιτυχία!</h1>
            <p>Σύνδεση επιτυχής. Επιστροφή...</p>
            <script>
                localStorage.setItem('temp_stripe_connect_id', '${stripeId}');
                setTimeout(() => window.location.href='/premium.html', 1000);
            </script>
        `);
    } catch (err) {
        res.status(500).send("Error connecting Stripe account: " + err.message);
    }
});

/* ---------------- DYNAMIC MANIFEST ---------------- */
app.get('/manifest.json', async (req, res) => {
    const iconType = req.query.icon || 'admin'; 
    const storeParam = req.query.store || "general";
    const safeStoreId = storeParam.replace(/[^a-zA-Z0-9]/g, '');
    
    // Φόρτωσε ρυθμίσεις για το συγκεκριμένο κατάστημα
    let storeName = "BellGo App";
    if (safeStoreId !== "general") {
        const data = await getStoreData(safeStoreId);
        storeName = data.settings.name || `Shop ${safeStoreId}`;
    }
    
    // Override if name provided in query
    if (req.query.name) storeName = req.query.name;

    let appId = `bellgo_${iconType}_${safeStoreId}`; 
    let iconFile = "admin.png"; 
    let startUrl = ".";  
    let scopeUrl = "/";        

    if (iconType === 'shop') {
        iconFile = "shop.png"; 
        startUrl = `/shop/${safeStoreId}?name=${encodeURIComponent(storeName)}`;
        scopeUrl = `/shop/${safeStoreId}`; 
    } else {
        iconFile = "admin.png";
        startUrl = `/login.html`; 
        scopeUrl = "/";
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
    const { amount, storeName } = req.body; 
    
    // Φόρτωση του συγκεκριμένου store για να πάρουμε το Stripe ID του
    const data = await getStoreData(storeName);
    const shopStripeId = data.settings.stripeConnectId;
    
    if (!shopStripeId) { return res.status(400).json({ error: "Το κατάστημα δεν έχει συνδέσει τραπεζικό λογαριασμό (Stripe ID)." }); }
    
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
            success_url: `${YOUR_DOMAIN}/shop/${storeName}?payment_status=success`,
            cancel_url: `${YOUR_DOMAIN}/shop/${storeName}?payment_status=cancel`,
        });
        res.json({ url: session.url });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------------- NOTIFICATION LOGIC ---------------- */
function sendPushNotification(target, title, body, dataPayload = { type: "alarm" }) {
    if (target && target.fcmToken) { 
        let targetUrl = "/stafpremium.html";
        if (target.role === 'admin') targetUrl = "/premium.html";

        const msg = {
            token: target.fcmToken,
            notification: {
                title: title,
                body: body,
            },
            android: { 
                priority: "high",
                notification: {
                    sound: "default",
                    tag: "bellgo-alarm", 
                    clickAction: `${YOUR_DOMAIN}${targetUrl}`
                }
            },
            webpush: { 
                headers: { "Urgency": "high" },
                fcm_options: { link: `${YOUR_DOMAIN}${targetUrl}` },
                notification: {
                    title: title,
                    body: body,
                    icon: '/admin.png',
                    requireInteraction: true, 
                    tag: 'bellgo-alarm',
                    renotify: true,
                    vibrate: [500, 200, 500]
                }
            },
            data: { 
                ...dataPayload, 
                title: title, 
                body: body, 
                url: targetUrl 
            }
        };
        admin.messaging().send(msg).catch(e => console.log("Push Error:", e.message));
    }
}

// Update clients in a specific store room
async function updateStoreClients(storeName) {
    if (!storeName || !storesData[storeName]) return;
    
    const store = storesData[storeName];

    // Filter staff list for this store
    const list = Object.values(activeUsers)
        .filter(u => u.store === storeName && u.role !== 'customer')
        .map(u => ({ 
            name: u.username, 
            username: u.username, 
            role: u.role, 
            status: u.status, 
            isRinging: u.isRinging 
        }));

    // Send updates strictly to this room
    io.to(storeName).emit('staff-list-update', list);
    io.to(storeName).emit('orders-update', store.orders);
    io.to(storeName).emit('menu-update', store.menu);
    io.to(storeName).emit('store-settings-update', store.settings);
    
    // Persist to Firebase
    saveStoreToFirebase(storeName);
}

/* ---------------- SOCKET.IO ---------------- */
io.on('connection', (socket) => {

    // Helper to get current store data easily
    const getMyStore = () => {
        if (!socket.store) return null;
        return storesData[socket.store];
    };

    socket.on('join-store', async (data) => {
        let rawStore = data.storeName || '';
        if (!rawStore && data.role === 'customer') {
            console.log("⚠️ Customer tried to join without storeName");
            return;
        }
        
        // Αν δεν έχει όνομα (π.χ. admin login χωρίς παράμετρο), προσπάθησε να βρεις default ή σφάλμα
        if (!rawStore) {
             // Εδώ υποθέτουμε ότι ο admin θα στείλει storeName αν το έχει αποθηκευμένο. 
             // Αν είναι κενό, δεν μπορεί να συνεχίσει σωστά σε multi-tenant.
             return;
        }

        if (rawStore.endsWith('premium')) rawStore = rawStore.replace('premium', '');
        
        // Normalize Store Name
        const storeName = rawStore.toLowerCase().trim();
        const username = (data.username || '').trim();
        if (!storeName || !username) return;

        // 🔥 Load data for this store specifically
        await getStoreData(storeName);

        socket.store = storeName;
        socket.username = username;
        socket.role = data.role || 'waiter'; 
        if (data.role === 'customer') socket.role = 'customer';

        socket.join(storeName); // Join Socket Room
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

        updateStoreClients(storeName);
        
        if(wasRinging) {
             socket.emit('ring-bell'); 
        }
    });

    socket.on('set-new-pin', (data) => {
        const store = getMyStore();
        if(store) {
            store.settings.pin = data.pin;
            if(data.email) store.settings.adminEmail = data.email; 
            socket.emit('pin-success', { msg: "Ο κωδικός ορίστηκε!" });
            updateStoreClients(socket.store);
        }
    });

    socket.on('verify-pin', (pin) => {
        const store = getMyStore();
        if (store) {
            if (store.settings.pin === pin) {
                socket.emit('pin-verified', { success: true, storeId: store.settings.adminEmail || store.settings.name });
            } else {
                socket.emit('pin-verified', { success: false });
            }
        }
    });

    socket.on('update-token', (data) => {
        const key = `${socket.store}_${data.username}`;
        if (activeUsers[key]) activeUsers[key].fcmToken = data.token;
    });

    socket.on('toggle-status', (data) => {
        const store = getMyStore();
        if (store) {
            if (data.type === 'customer') store.settings.statusCustomer = data.isOpen;
            if (data.type === 'staff') store.settings.statusStaff = data.isOpen;
            updateStoreClients(socket.store);
        }
    });

    socket.on('save-store-name', (newName) => { 
        const store = getMyStore();
        if (store) {
            store.settings.name = newName; 
            updateStoreClients(socket.store);
        }
    });
    
    socket.on('save-store-settings', (data) => {
        const store = getMyStore();
        if (store) {
            if(data.resetTime) store.settings.resetTime = data.resetTime;
            if(data.stripeConnectId) store.settings.stripeConnectId = data.stripeConnectId;
            if(data.schedule) store.settings.schedule = data.schedule; // Save schedule
            if(data.hours) store.settings.hours = data.hours; // Save legacy hours string
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

                if (mode === 'permanent') {
                    store.menu = JSON.parse(JSON.stringify(newMenuData));
                }
                // Αν είναι temporary, δεν το σώζουμε μόνιμα, απλά το στέλνουμε (δεν υποστηρίζεται πλήρως στο τωρινό logic)
                // Εδώ υποθέτουμε ότι το liveMenu == masterMenu για απλότητα
                updateStoreClients(socket.store);
            } catch (e) { console.error(e); }
        }
    });

    socket.on('chat-message', (data) => {
        if(socket.store) {
            io.to(socket.store).emit('chat-message', { sender: socket.username, text: data.text });
        }
    });

    socket.on('new-order', (data) => {
        const store = getMyStore();
        if (!store) return;
        
        // Check if store is open
        if (!store.settings.statusCustomer && activeUsers[`${socket.store}_${socket.username}`]?.role === 'customer') return;

        // 🔥 FIX: Διαβάζουμε το ID από τον πελάτη (data.id) αν υπάρχει, αλλιώς φτιάχνουμε νέο
        // Επίσης χειριζόμαστε την περίπτωση που το data είναι απλό string (παλιά έκδοση)
        const orderText = data.text || data; 
        const orderId = data.id || Date.now(); 

        const newOrder = {
            id: orderId, // ✅ Χρήση του κοινού ID
            text: orderText,
            from: socket.username,
            status: 'pending',
            store: socket.store 
        };
        
        store.orders.push(newOrder);
        console.log(`📦 New order in room ${socket.store} from ${socket.username} with ID: ${orderId}`);
        updateStoreClients(socket.store);

        // Notify Admins
        Object.values(activeUsers).filter(u => u.store === socket.store && u.role === 'admin').forEach(adm => {
            adm.isRinging = true; 
            if (adm.socketId) io.to(adm.socketId).emit('ring-bell');
            sendPushNotification(adm, "ΝΕΑ ΠΑΡΑΓΓΕΛΙΑ 🍕", `Από: ${socket.username}`);
        });
        // Update again to reflect admin ringing state
        updateStoreClients(socket.store);
    });

    socket.on('accept-order', (id) => { 
        const store = getMyStore();
        if(store){ 
            const o = store.orders.find(x => x.id == id); 
            if(o){ 
                o.status = 'cooking'; 
                o.startTime = Date.now();
                updateStoreClients(socket.store); 
                // Send explicit event for fast UI update
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
                updateStoreClients(socket.store); 
                io.to(socket.store).emit('order-changed', { id: o.id, status: 'ready' });

                const tKey = `${socket.store}_${o.from}`; 
                const tUser = activeUsers[tKey]; 
                if(tUser) sendPushNotification(tUser, "ΕΤΟΙΜΟ! 🛵", "Η παραγγελία έρχεται!"); 
            } 
        } 
    });
    
    socket.on('pay-order', (id) => { 
        const store = getMyStore();
        if(store) {
            store.orders = store.orders.filter(x => x.id != id); 
            updateStoreClients(socket.store); 
        }
    });
    
    // 🔔 STAFF ALARM
    socket.on('trigger-alarm', (tName) => { 
        const key = `${socket.store}_${tName}`; 
        const t = activeUsers[key]; 
        if(t){ 
            t.isRinging = true; 
            updateStoreClients(socket.store); 
            if(t.socketId) io.to(t.socketId).emit('ring-bell'); 
            sendPushNotification(t, "📞 ΣΕ ΚΑΛΟΥΝ!", "Ο Admin σε ζητάει!");
        } 
    });

    // ✅ SMART ALARM ACCEPTED
    socket.on('alarm-accepted', (data) => {
        let userKey = null;
        if (data && data.store && data.username) {
            const directKey = `${data.store}_${data.username}`;
            if (activeUsers[directKey]) userKey = directKey;
        }
        if (!userKey) {
            for (const [key, user] of Object.entries(activeUsers)) {
                if (user.socketId === socket.id) { userKey = key; break; }
            }
        }
        if (userKey) {
            const user = activeUsers[userKey];
            user.isRinging = false; 
            io.to(user.store).emit('staff-accepted-alarm', { username: user.username });
            updateStoreClients(user.store); 
        }
    });

    socket.on('manual-logout', (data) => { 
        const tUser = data && data.targetUser ? data.targetUser : socket.username; 
        const tKey = `${socket.store}_${tUser}`; 
        if (activeUsers[tKey]) { 
            delete activeUsers[tKey]; 
            updateStoreClients(socket.store); 
        } 
    });

    socket.on('disconnect', () => { 
        const key = `${socket.store}_${socket.username}`; 
        if (activeUsers[key] && activeUsers[key].socketId === socket.id) { 
            activeUsers[key].status = 'away'; 
            updateStoreClients(socket.store); 
        } 
    });
});

// CRON JOBS
// Auto-reset menu at specific time
setInterval(() => {
    try {
        const nowInGreece = new Date().toLocaleTimeString('el-GR', { timeZone: 'Europe/Athens', hour: '2-digit', minute: '2-digit', hour12: false });
        // Check for every store
        Object.keys(storesData).forEach(storeName => {
            const store = storesData[storeName];
            if (store.settings.resetTime && nowInGreece === store.settings.resetTime) {
                // Here we just broadcast menu again to ensure sync
                io.to(storeName).emit('menu-update', store.menu);
            }
        });
    } catch (e) {}
}, 60000); 

// Cleanup inactive users (1 hour)
setInterval(() => { 
    const now = Date.now(); 
    for (const key in activeUsers) { 
        if (now - activeUsers[key].lastSeen > 3600000) {
            const store = activeUsers[key].store;
            delete activeUsers[key]; 
            updateStoreClients(store);
        }
    } 
}, 60000);

// 🔥 LOOPING NOTIFICATIONS (3 SECONDS)
setInterval(() => {
    for (const key in activeUsers) {
        const user = activeUsers[key];
        if (user.isRinging && user.fcmToken) {
            const msg = user.role === 'admin' ? "ΝΕΑ ΠΑΡΑΓΓΕΛΙΑ 🍕" : "📞 ΣΕ ΚΑΛΟΥΝ!";
            const body = user.role === 'admin' ? "Πατήστε για προβολή" : "ΑΠΑΝΤΗΣΕ ΤΩΡΑ!";
            sendPushNotification(user, msg, body);
        }
    }
}, 3000); 

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
