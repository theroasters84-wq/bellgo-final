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
let storesData = {};
let activeUsers = {}; 

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
    io.to(storeName).emit('menu-update', store.menu);
    io.to(storeName).emit('store-settings-update', store.settings);
    saveStoreToFirebase(storeName);
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

app.get('/staff/login', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'login.html')); });
app.get('/admin', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'login.html')); });

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
            success_url: `${YOUR_DOMAIN}/shop/${encodeURIComponent(storeName)}/?payment_status=success`,
            cancel_url: `${YOUR_DOMAIN}/shop/${encodeURIComponent(storeName)}/?payment_status=cancel`,
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
            notification: { title: title, body: body },
            android: { priority: "high", notification: { sound: "default", tag: "bellgo-alarm", clickAction: `${YOUR_DOMAIN}${targetUrl}` } },
            webpush: { headers: { "Urgency": "high" }, fcm_options: { link: `${YOUR_DOMAIN}${targetUrl}` }, notification: { title: title, body: body, icon: '/admin.png', requireInteraction: true, tag: 'bellgo-alarm', renotify: true, vibrate: [500, 200, 500] } },
            data: { ...dataPayload, title: title, body: body, url: targetUrl }
        };
        admin.messaging().send(msg).catch(e => console.log("Push Error:", e.message));
    }
}

function notifyAdmin(storeName, title, body) {
    Object.values(activeUsers).filter(u => u.store === storeName && u.role === 'admin').forEach(adm => {
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
        if (!rawStore && data.role === 'customer') { console.log("⚠️ Customer tried to join without storeName"); return; }
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

        updateStoreClients(storeName);
        if(wasRinging) { socket.emit('ring-bell'); }
    });

    socket.on('check-pin-status', async (data) => { const targetEmail = data.email; if (!targetEmail) return; const store = await getStoreData(targetEmail); socket.emit('pin-status', { hasPin: !!store.settings.pin }); });
    socket.on('verify-pin', async (data) => { const pin = data.pin || data; let email = data.email || socket.store; if (email) { email = email.toLowerCase().trim(); const store = await getStoreData(email); if (store.settings.pin === pin) { socket.emit('pin-verified', { success: true, storeId: email }); } else { socket.emit('pin-verified', { success: false }); } } });
    socket.on('set-new-pin', async (data) => { const email = data.email; if(email) { const store = await getStoreData(email); store.settings.pin = data.pin; store.settings.adminEmail = email; socket.emit('pin-success', { msg: "Ο κωδικός ορίστηκε!" }); updateStoreClients(email); } });
    socket.on('update-token', (data) => { const key = `${socket.store}_${data.username}`; if (activeUsers[key]) activeUsers[key].fcmToken = data.token; });
    socket.on('toggle-status', (data) => { const store = getMyStore(); if (store) { if (data.type === 'customer') store.settings.statusCustomer = data.isOpen; if (data.type === 'staff') store.settings.statusStaff = data.isOpen; updateStoreClients(socket.store); } });
    socket.on('save-store-name', (newName) => { const store = getMyStore(); if (store) { store.settings.name = newName; updateStoreClients(socket.store); } });
    socket.on('save-store-settings', (data) => { const store = getMyStore(); if (store) { if(data.resetTime) store.settings.resetTime = data.resetTime; if(data.stripeConnectId) store.settings.stripeConnectId = data.stripeConnectId; if(data.schedule) store.settings.schedule = data.schedule; if(data.hours) store.settings.hours = data.hours; updateStoreClients(socket.store); } });
    socket.on('save-menu', (data) => { const store = getMyStore(); if (store) { try { let newMenuData = []; let mode = 'permanent'; if (Array.isArray(data)) newMenuData = data; else if (data.menu) { newMenuData = data.menu; mode = data.mode || 'permanent'; } if (mode === 'permanent') { store.menu = JSON.parse(JSON.stringify(newMenuData)); } updateStoreClients(socket.store); } catch (e) { console.error(e); } } });
    socket.on('chat-message', (data) => { if(socket.store) { io.to(socket.store).emit('chat-message', { sender: socket.username, text: data.text }); } });

    socket.on('new-order', (data) => {
        const store = getMyStore();
        if (!store) return;
        if (!store.settings.statusCustomer && activeUsers[`${socket.store}_${socket.username}`]?.role === 'customer') return;
        const orderText = data.text || data; 
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
            // Νέα Παραγγελία
            const newOrder = { id: orderId, text: orderText, from: socket.username, status: 'pending', store: socket.store };
            store.orders.push(newOrder);
            console.log(`📦 New order in room ${socket.store} from ${socket.username} with ID: ${orderId}`);
            // Ειδοποίηση Admin για Νέα Παραγγελία
            notifyAdmin(socket.store, "ΝΕΑ ΠΑΡΑΓΓΕΛΙΑ 🍕", `Από: ${socket.username}`);
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

    socket.on('accept-order', (id) => { const store = getMyStore(); if(store){ const o = store.orders.find(x => x.id == id); if(o){ o.status = 'cooking'; o.startTime = Date.now(); updateStoreClients(socket.store); io.to(socket.store).emit('order-changed', { id: o.id, status: 'cooking', startTime: o.startTime }); io.to(socket.store).emit('order-status-changed', { id: o.id, status: 'cooking' }); } } });
    socket.on('ready-order', (id) => { const store = getMyStore(); if(store){ const o = store.orders.find(x => x.id == id); if(o){ o.status = 'ready'; o.readyTime = Date.now(); updateStoreClients(socket.store); io.to(socket.store).emit('order-changed', { id: o.id, status: 'ready', readyTime: o.readyTime }); const tKey = `${socket.store}_${o.from}`; const tUser = activeUsers[tKey]; if(tUser) sendPushNotification(tUser, "ΕΤΟΙΜΟ! 🛵", "Η παραγγελία έρχεται!"); io.to(socket.store).emit('order-status-changed', { id: o.id, status: 'ready' }); } } });
    socket.on('pay-order', (id) => { const store = getMyStore(); if(store) { const order = store.orders.find(x => x.id == id); if (order) { io.to(socket.store).emit('order-status-changed', { id: order.id, status: 'paid' }); } store.orders = store.orders.filter(x => x.id != id); updateStoreClients(socket.store); } });
    
    // ✅ PARTIAL PAY
    socket.on('pay-partial', (data) => { const store = getMyStore(); if(store){ const o = store.orders.find(x => x.id == data.id); if(o){ let lines = o.text.split('\n'); if(lines[data.index]) { if(lines[data.index].includes('✅')) { lines[data.index] = lines[data.index].replace(' ✅', ''); } else { lines[data.index] += ' ✅'; } o.text = lines.join('\n'); updateStoreClients(socket.store); } } } });
    
    socket.on('trigger-alarm', (tName) => { const key = `${socket.store}_${tName}`; const t = activeUsers[key]; if(t){ t.isRinging = true; updateStoreClients(socket.store); if(t.socketId) io.to(t.socketId).emit('ring-bell'); sendPushNotification(t, "📞 ΣΕ ΚΑΛΟΥΝ!", "Ο Admin σε ζητάει!"); } });
    socket.on('alarm-accepted', (data) => { let userKey = null; if (data && data.store && data.username) { const directKey = `${data.store}_${data.username}`; if (activeUsers[directKey]) userKey = directKey; } if (!userKey) { for (const [key, user] of Object.entries(activeUsers)) { if (user.socketId === socket.id) { userKey = key; break; } } } if (userKey) { const user = activeUsers[userKey]; user.isRinging = false; io.to(user.store).emit('staff-accepted-alarm', { username: user.username }); updateStoreClients(user.store); } });
    socket.on('manual-logout', (data) => { const tUser = data && data.targetUser ? data.targetUser : socket.username; const tKey = `${socket.store}_${tUser}`; if (activeUsers[tKey]) { delete activeUsers[tKey]; updateStoreClients(socket.store); } });
    socket.on('disconnect', () => { const key = `${socket.store}_${socket.username}`; if (activeUsers[key] && activeUsers[key].socketId === socket.id) { activeUsers[key].status = 'away'; updateStoreClients(socket.store); } });
    socket.on('heartbeat', () => { const key = `${socket.store}_${socket.username}`; if (activeUsers[key]) { activeUsers[key].lastSeen = Date.now(); } });
});

setInterval(() => { try { const nowInGreece = new Date().toLocaleTimeString('el-GR', { timeZone: 'Europe/Athens', hour: '2-digit', minute: '2-digit', hour12: false }); Object.keys(storesData).forEach(storeName => { const store = storesData[storeName]; if (store.settings.resetTime && nowInGreece === store.settings.resetTime) { io.to(storeName).emit('menu-update', store.menu); } }); } catch (e) {} }, 60000); 
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
