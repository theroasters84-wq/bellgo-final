const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require("firebase-admin");
const fs = require('fs');

// ✅ STRIPE SETUP (Χρησιμοποίησε το Secret Key σου εδώ)
const stripe = require('stripe')('sk_test_51SwnsPJcEtNSGviLf1RB1NTLaHJ3LTmqqy9LM52J3Qc7DpgbODtfhYK47nHAy1965eNxwVwh9gA4PTuizOxhMPil00dIoebxMx');
const YOUR_DOMAIN = 'https://bellgo-final.onrender.com'; // Βάλε το σωστό Domain σου

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
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files

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
    resetTime: "04:00"
}; 

// LOAD DATA
try {
    if (fs.existsSync(MENU_FILE)) {
        const raw = fs.readFileSync(MENU_FILE, 'utf8');
        try { 
            masterMenu = JSON.parse(raw); 
            liveMenu = JSON.parse(JSON.stringify(masterMenu));
        } catch { 
            masterMenu = []; liveMenu = []; 
        }
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

/* ---------------- VIRTUAL ROUTES (PWA FIX) ---------------- */
app.get('/shop/:storeName', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'order.html')); });
app.get('/staff/login', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'login.html')); });
app.get('/admin', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'login.html')); });

/* ---------------- DYNAMIC MANIFEST ---------------- */
app.get('/manifest.json', (req, res) => {
    const appName = req.query.name || storeSettings.name || "BellGo App";
    const iconType = req.query.icon; 
    const storeParam = req.query.store || "general";
    const safeStoreId = storeParam.replace(/[^a-zA-Z0-9]/g, '');
    let appId = `bellgo_${iconType}_${safeStoreId}`; 

    let iconFile = "admin.png"; 
    let startUrl = ".";          

    if (iconType === 'shop') {
        iconFile = "shop.png";
        startUrl = `/shop/${safeStoreId}?name=${encodeURIComponent(appName)}`;
    } else {
        iconFile = "admin.png";
        startUrl = `/login.html`; // ✅ CORRECT PWA START URL
    }

    res.set('Content-Type', 'application/manifest+json');
    res.json({
        "id": appId,
        "name": appName,
        "short_name": appName,
        "start_url": startUrl,
        "display": "standalone",
        "background_color": "#121212",
        "theme_color": "#121212",
        "orientation": "portrait",
        "icons": [
            { "src": iconFile, "sizes": "192x192", "type": "image/png" },
            { "src": iconFile, "sizes": "512x512", "type": "image/png" }
        ]
    });
});

/* ---------------- STRIPE PAYMENTS ---------------- */
app.post('/check-subscription', async (req, res) => {
    // Mock check for now - In production check Stripe API
    res.json({ active: true, plan: 'premium' }); 
});

app.post('/create-checkout-session', async (req, res) => {
    const { email, plan } = req.body;
    let priceId = ''; 
    
    // ✅ ΟΡΙΣΕ ΤΑ PRICE IDs ΑΠΟ ΤΟ STRIPE DASHBOARD ΣΟΥ
    if (plan === 'basic') priceId = 'price_1Q...'; // 4€
    else if (plan === 'pro') priceId = 'price_1Q...'; // 10€

    try {
        const session = await stripe.checkout.sessions.create({
            line_items: [{ price: priceId, quantity: 1 }],
            mode: 'subscription',
            customer_email: email,
            success_url: `${YOUR_DOMAIN}/login.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${YOUR_DOMAIN}/login.html`,
        });
        res.json({ url: session.url });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

/* ---------------- NOTIFICATION LOGIC ---------------- */
// ✅ Sends payload compatible with your sw.js
function sendPushNotification(target, title, body) {
    if (target && target.fcmToken) {
        const msg = {
            token: target.fcmToken,
            // 🔴 DATA PAYLOAD: This triggers 'setBackgroundMessageHandler' in sw.js
            data: {
                title: title,
                body: body,
                type: "alarm",
                url: "/premium.html"
            },
            // Android specific high priority
            android: { 
                priority: "high" 
            },
            // WebPush headers for Chrome background wake-up
            webpush: { 
                headers: { "Urgency": "high" } 
            }
        };
        admin.messaging().send(msg)
            .then(() => console.log("📲 Notification sent to", target.username))
            .catch(e => console.log("❌ Push Error:", e.message));
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

    // --- PIN ---
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

    // --- TOKEN UPDATE ---
    socket.on('update-token', (data) => {
        const key = `${socket.store}_${data.username}`;
        if (activeUsers[key]) {
            activeUsers[key].fcmToken = data.token;
            console.log("🔔 Token updated for:", data.username);
        }
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

    socket.on('save-store-name', (newName) => {
        storeSettings.name = newName;
        saveSettingsToDisk();
        io.to(socket.store).emit('store-settings-update', storeSettings);
    });

    socket.on('save-store-settings', (data) => {
        if(data.resetTime) storeSettings.resetTime = data.resetTime;
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
            } else {
                liveMenu = newMenuData;
            }
            io.to(socket.store).emit('menu-update', liveMenu);
        } catch (e) { }
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

        // 🔔 NOTIFY ADMINS
        Object.values(activeUsers).filter(u => u.store === socket.store && u.role === 'admin').forEach(adm => {
            if (adm.socketId) io.to(adm.socketId).emit('ring-bell');
            sendPushNotification(adm, "ΝΕΑ ΠΑΡΑΓΓΕΛΙΑ 🍕", `Από: ${socket.username}`);
        });
    });

    socket.on('accept-order', (id) => { const o = activeOrders.find(x => x.id === id); if(o){ o.status = 'cooking'; updateStore(socket.store); } });
    
    socket.on('ready-order', (id) => { 
        const o = activeOrders.find(x => x.id === id); 
        if(o){ 
            o.status = 'ready'; 
            updateStore(socket.store); 
            // Notify Customer
            const tKey = `${socket.store}_${o.from}`; 
            const tUser = activeUsers[tKey]; 
            if(tUser) sendPushNotification(tUser, "ΕΤΟΙΜΟ! 🛵", "Η παραγγελία έρχεται!"); 
        } 
    });
    
    socket.on('pay-order', (id) => { activeOrders = activeOrders.filter(x => x.id !== Number(id)); updateStore(socket.store); });
    
    // 🔔 ALARM LOGIC (STAFF CALL)
    socket.on('trigger-alarm', (tName) => { 
        const key = `${socket.store}_${tName}`; 
        const t = activeUsers[key]; 
        if(t){ 
            t.isRinging = true; 
            updateStore(socket.store); 
            if(t.socketId) io.to(t.socketId).emit('ring-bell'); 
            sendPushNotification(t, "📞 ΣΕ ΚΑΛΟΥΝ!", "Ο Admin σε ζητάει!");
        } 
    });

    socket.on('manual-logout', (data) => { const tUser = data && data.targetUser ? data.targetUser : socket.username; const tKey = `${socket.store}_${tUser}`; if (activeUsers[tKey]) { delete activeUsers[tKey]; updateStore(socket.store); } });
    socket.on('disconnect', () => { const key = `${socket.store}_${socket.username}`; if (activeUsers[key] && activeUsers[key].socketId === socket.id) { activeUsers[key].status = 'away'; updateStore(socket.store); } });
});

// CRON JOB: RESET MENU
setInterval(() => {
    try {
        if (!storeSettings.resetTime) return;
        const nowInGreece = new Date().toLocaleTimeString('el-GR', { timeZone: 'Europe/Athens', hour: '2-digit', minute: '2-digit', hour12: false });
        if (nowInGreece === storeSettings.resetTime) {
            const liveStr = JSON.stringify(liveMenu);
            const masterStr = JSON.stringify(masterMenu);
            if (liveStr !== masterStr) {
                console.log(`↻ Auto-Reset Menu at ${nowInGreece}`);
                liveMenu = JSON.parse(masterStr); 
                io.emit('menu-update', liveMenu); 
            }
        }
    } catch (e) {}
}, 60000); 

setInterval(() => { const now = Date.now(); for (const key in activeUsers) { if (now - activeUsers[key].lastSeen > 3600000) delete activeUsers[key]; } }, 60000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
