const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require("firebase-admin");
const fs = require('fs');

const YOUR_DOMAIN = 'https://bellgo-final.onrender.com';
const stripe = require('stripe')('sk_test_51SwnsPJcEtNSGviLf1RB1NTLaHJ3LTmqqy9LM52J3Qc7DpgbODtfhYK47nHAy1965eNxwVwh9gA4PTuizOxhMPil00dIoebxMx');

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

const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*" },
    pingTimeout: 60000,
    pingInterval: 25000
});

/* ---------------- DATA STORE ---------------- */
let activeUsers = {};
let activeOrders = [];

// --- FILE PERSISTENCE ---
const MENU_FILE = path.join(__dirname, 'saved_menu.json');
const SETTINGS_FILE = path.join(__dirname, 'store_settings.json');
const ORDERS_FILE = path.join(__dirname, 'active_orders.json');

let liveMenu = [];
// ✅ SPLIT STATUS: statusCustomer (shop), statusStaff (waiters)
let storeSettings = { 
    name: "BellGo Delivery", 
    pin: null, 
    adminEmail: "", 
    statusCustomer: true, 
    statusStaff: true 
}; 

// LOAD DATA ON STARTUP
try {
    if (fs.existsSync(MENU_FILE)) {
        const raw = fs.readFileSync(MENU_FILE, 'utf8');
        try { liveMenu = JSON.parse(raw); }
        catch { liveMenu = [{ id: 1, order: 1, name: "ΓΕΝΙΚΑ", items: raw.split('\n').filter(x => x) }]; }
    }
    if (fs.existsSync(SETTINGS_FILE)) {
        storeSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        // Ensure new fields exist if loading old file
        if (storeSettings.statusCustomer === undefined) storeSettings.statusCustomer = true;
        if (storeSettings.statusStaff === undefined) storeSettings.statusStaff = true;
    }
    if (fs.existsSync(ORDERS_FILE)) {
        activeOrders = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
    }
} catch (e) { console.log("Load Error", e); }

// SAVE HELPERS
function saveOrdersToDisk() { try { fs.writeFileSync(ORDERS_FILE, JSON.stringify(activeOrders, null, 2), 'utf8'); } catch (e) {} }
function saveSettingsToDisk() { try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(storeSettings, null, 2), 'utf8'); } catch (e) {} }

// --- STATIC FILES ---
app.use(express.static(path.join(__dirname, 'public')));


/* ---------------- NEW VIRTUAL ROUTES FOR PWA FIX ---------------- */
// 1. SHOP ROUTE: /shop/onoma_magaziou
app.get('/shop/:storeName', (req, res) => {
    // Στέλνουμε το order.html, αλλά ο browser βλέπει άλλο URL
    res.sendFile(path.join(__dirname, 'public', 'order.html'));
});

// 2. STAFF ROUTE: /staff/login
app.get('/staff/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// 3. ADMIN ROUTE (Παραμένει στο root ή /admin)
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html')); // Ή premium.html αν έχει session
});


/* ---------------- DYNAMIC MANIFEST (PATH BASED) ---------------- */
app.get('/manifest.json', (req, res) => {
    const appName = req.query.name || storeSettings.name || "BellGo App";
    const iconType = req.query.icon; 
    const storeParam = req.query.store || "general"; // Χρησιμοποιείται για το ID

    // ✅ UNIQUE ID GEN
    const safeStoreId = storeParam.replace(/[^a-zA-Z0-9]/g, '');
    let appId = `bellgo_${iconType}_${safeStoreId}`; 

    let iconFile = "admin.png"; 
    let startUrl = ".";         

    if (iconType === 'shop') {
        iconFile = "shop.png";
        // ✅ NEW PATH: /shop/onoma
        startUrl = `/shop/${safeStoreId}?name=${encodeURIComponent(appName)}`;
    } else {
        iconFile = "admin.png";
        // ✅ NEW PATH: /staff/login
        startUrl = `/staff/login`; 
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

/* ---------------- STRIPE ---------------- */
app.post('/check-subscription', async (req, res) => {
    let { email } = req.body;
    return res.json({ active: true, plan: 'premium' }); 
});

app.post('/create-checkout-session', async (req, res) => {
    res.json({ id: "mock_session", url: "#" });
});

/* ---------------- HELPER ---------------- */
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

function sendPushNotification(target, title, body, dataPayload = { type: "alarm" }) {
    if (target && target.fcmToken) {
        const msg = {
            token: target.fcmToken,
            data: dataPayload,
            android: { priority: "high", notification: { channelId: "fcm_default_channel", title: title, body: body } },
            webpush: { headers: { "Urgency": "high" } }
        };
        admin.messaging().send(msg).catch(e => {});
    }
}

/* ---------------- SOCKET.IO ---------------- */
io.on('connection', (socket) => {

    // --- PIN LOGIC ---
    socket.on('check-pin-status', () => {
        socket.emit('pin-status', { hasPin: !!storeSettings.pin });
    });

    socket.on('set-new-pin', (data) => {
        storeSettings.pin = data.pin;
        if(data.email) storeSettings.adminEmail = data.email; 
        saveSettingsToDisk();
        socket.emit('pin-success', { msg: "Ο κωδικός ορίστηκε!" });
    });

    socket.on('verify-pin', (pin) => {
        if (storeSettings.pin === pin) {
            socket.emit('pin-verified', { 
                success: true, 
                storeId: storeSettings.adminEmail || storeSettings.name 
            });
        } else {
            socket.emit('pin-verified', { success: false });
        }
    });

    // --- SEPARATE ON/OFF ---
    socket.on('toggle-status', (data) => {
        // data = { type: 'customer' | 'staff', isOpen: true/false }
        if (data.type === 'customer') storeSettings.statusCustomer = data.isOpen;
        if (data.type === 'staff') storeSettings.statusStaff = data.isOpen;
        saveSettingsToDisk();
        io.to(socket.store).emit('store-settings-update', storeSettings);
    });

    socket.on('join-store', (data) => {
        // ... (Join logic remains same mostly) ...
        // Handling Store Name from URL path if coming from /shop/NAME
        let rawStore = data.storeName || '';
        
        // Αν το storeName είναι κενό, προσπαθούμε να το βρούμε από το Settings (για πελάτες που μπαίνουν χύμα)
        if (!rawStore && data.role === 'customer') {
             rawStore = storeSettings.name; 
        }
        
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

    socket.on('save-menu', (jsonText) => {
        try {
            liveMenu = JSON.parse(jsonText);
            fs.writeFileSync(MENU_FILE, jsonText, 'utf8');
            io.to(socket.store).emit('menu-update', liveMenu);
        } catch (e) { }
    });

    socket.on('new-order', (orderText) => {
        if (!socket.store) return;
        
        // ✅ BLOCK CUSTOMER IF CUSTOMER STATUS IS OFF
        if (!storeSettings.statusCustomer && activeUsers[`${socket.store}_${socket.username}`]?.role === 'customer') {
            return; 
        }

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
            sendPushNotification(adm, "ΝΕΑ ΠΑΡΑΓΓΕΛΙΑ", `Από: ${socket.username}`);
        });
    });

    // ... (Remaining Socket events: update-order, accept, etc. remain the same) ...
    // Just copy-paste from previous version for brevity if needed, but logic is identical
    socket.on('update-order', (data) => {
        const o = activeOrders.find(x => x.id === Number(data.id));
        if (o) {
            o.text += `\n➕ ${data.addText}`; o.status = 'pending'; updateStore(socket.store);
            Object.values(activeUsers).filter(u => u.store === socket.store && u.role === 'admin').forEach(adm => {
                if (adm.socketId) io.to(adm.socketId).emit('ring-bell');
                sendPushNotification(adm, "ΠΡΟΣΘΗΚΗ", `Τραπέζι: ${o.from}`);
            });
        }
    });

    socket.on('accept-order', (id) => { const o = activeOrders.find(x => x.id === id); if(o){ o.status = 'cooking'; updateStore(socket.store); } });
    socket.on('ready-order', (id) => { const o = activeOrders.find(x => x.id === id); if(o){ o.status = 'ready'; updateStore(socket.store); const tKey=`${socket.store}_${o.from}`; const tUser=activeUsers[tKey]; if(tUser) sendPushNotification(tUser, "ΕΤΟΙΜΟ!", "Παραγγελία στο πάσο."); } });
    socket.on('pay-order', (id) => { activeOrders = activeOrders.filter(x => x.id !== Number(id)); updateStore(socket.store); });
    socket.on('trigger-alarm', (tName) => { const key=`${socket.store}_${tName}`; const t=activeUsers[key]; if(t){ t.isRinging=true; updateStore(socket.store); if(t.socketId) io.to(t.socketId).emit('ring-bell'); } });
    socket.on('alarm-accepted', (data) => { const key=`${data.store}_${data.username}`; if(activeUsers[key]){ activeUsers[key].isRinging=false; updateStore(data.store); } });
    socket.on('chat-message', (msg) => { if(socket.store) io.to(socket.store).emit('chat-message', { sender: socket.username, text: msg.text }); });
    socket.on('manual-logout', (data) => { const tUser = data && data.targetUser ? data.targetUser : socket.username; const tKey = `${socket.store}_${tUser}`; if (activeUsers[tKey]) { delete activeUsers[tKey]; updateStore(socket.store); } });
    socket.on('disconnect', () => { const key = `${socket.store}_${socket.username}`; if (activeUsers[key] && activeUsers[key].socketId === socket.id) { activeUsers[key].status = 'away'; updateStore(socket.store); } });
});

setInterval(() => { const now = Date.now(); for (const key in activeUsers) { if (now - activeUsers[key].lastSeen > 3600000) delete activeUsers[key]; } }, 60000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
