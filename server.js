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

const MENU_FILE = path.join(__dirname, 'saved_menu.json');
const SETTINGS_FILE = path.join(__dirname, 'store_settings.json');
const ORDERS_FILE = path.join(__dirname, 'active_orders.json');

let liveMenu = [];
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
        liveMenu = JSON.parse(raw);
    }
    if (fs.existsSync(SETTINGS_FILE)) {
        storeSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
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
function saveMenuToDisk() { try { fs.writeFileSync(MENU_FILE, JSON.stringify(liveMenu, null, 2), 'utf8'); } catch (e) {} }

// --- STATIC FILES ---
app.use(express.static(path.join(__dirname, 'public')));

/* ---------------- VIRTUAL ROUTES FOR PWA ---------------- */
app.get('/shop/:storeName', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'order.html'));
});

app.get('/staff/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

/* ---------------- DYNAMIC MANIFEST (FIXED) ---------------- */
app.get('/manifest.json', (req, res) => {
    const appName = req.query.name || storeSettings.name || "BellGo App";
    const iconType = req.query.icon; 
    const storeParam = req.query.store || "general";

    const safeStoreId = storeParam.replace(/[^a-zA-Z0-9]/g, '');
    // ✅ Unique ID ανά μαγαζί για να επιτρέπονται πολλαπλά εικονίδια
    let appId = `bellgo_${safeStoreId}`; 

    let iconFile = (iconType === 'shop') ? "shop.png" : "admin.png";
    let startUrl = (iconType === 'shop') 
        ? `/shop/${safeStoreId}?name=${encodeURIComponent(appName)}&store=${storeParam}` 
        : `/staff/login`;

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
            { "src": `/${iconFile}`, "sizes": "192x192", "type": "image/png", "purpose": "any" },
            { "src": `/${iconFile}`, "sizes": "512x512", "type": "image/png", "purpose": "any" }
        ]
    });
});

/* ---------------- HELPERS ---------------- */
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

    socket.on('join-store', (data) => {
        let rawStore = data.storeName || '';
        if (!rawStore && data.role === 'customer') rawStore = storeSettings.name; 
        
        const store = rawStore.toLowerCase().trim();
        const username = (data.username || '').trim();
        if (!store || !username) return;

        socket.store = store;
        socket.username = username;
        socket.role = data.role || 'customer';

        socket.join(store);
        const key = `${store}_${username}`;
        activeUsers[key] = {
            store, username, role: socket.role, socketId: socket.id,
            fcmToken: data.token, status: "online", lastSeen: Date.now(),
            isRinging: activeUsers[key]?.isRinging || false, isNative: data.isNative
        };

        updateStore(store);
    });

    socket.on('save-menu', (menuData) => {
        try {
            // ✅ Δέχεται και JSON string και Object
            liveMenu = (typeof menuData === 'string') ? JSON.parse(menuData) : menuData;
            saveMenuToDisk();
            io.to(socket.store).emit('menu-update', liveMenu);
        } catch (e) { console.log("Menu Save Error", e); }
    });

    socket.on('toggle-status', (data) => {
        if (data.type === 'customer') storeSettings.statusCustomer = data.isOpen;
        if (data.type === 'staff') storeSettings.statusStaff = data.isOpen;
        saveSettingsToDisk();
        io.to(socket.store).emit('store-settings-update', storeSettings);
    });

    socket.on('new-order', (orderText) => {
        if (!socket.store) return;
        if (!storeSettings.statusCustomer && socket.role === 'customer') return;

        const newOrder = { id: Date.now(), text: orderText, from: socket.username, status: 'pending', store: socket.store };
        activeOrders.push(newOrder);
        updateStore(socket.store);
        io.to(socket.store).emit('ring-bell');
    });

    socket.on('accept-order', (id) => { 
        const o = activeOrders.find(x => x.id === id); 
        if(o){ o.status = 'cooking'; updateStore(socket.store); } 
    });

    socket.on('ready-order', (id) => { 
        const o = activeOrders.find(x => x.id === id); 
        if(o){ o.status = 'ready'; updateStore(socket.store); } 
    });

    socket.on('pay-order', (id) => { 
        activeOrders = activeOrders.filter(x => x.id !== Number(id)); 
        updateStore(socket.store); 
    });

    socket.on('heartbeat', () => {
        const key = `${socket.store}_${socket.username}`;
        if(activeUsers[key]) activeUsers[key].lastSeen = Date.now();
    });

    socket.on('disconnect', () => {
        const key = `${socket.store}_${socket.username}`;
        if (activeUsers[key] && activeUsers[key].socketId === socket.id) {
            activeUsers[key].status = 'away';
            updateStore(socket.store);
        }
    });
    
    // Λοιπά events (pin, chat, alarm κλπ)
    socket.on('set-new-pin', (data) => { storeSettings.pin = data.pin; saveSettingsToDisk(); socket.emit('pin-success'); });
    socket.on('chat-message', (msg) => { io.to(socket.store).emit('chat-message', { sender: socket.username, text: msg.text }); });
});

setInterval(() => {
    const now = Date.now();
    for (const key in activeUsers) {
        if (now - activeUsers[key].lastSeen > 3600000) delete activeUsers[key];
    }
}, 60000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
