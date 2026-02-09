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

// ✅ NEW: Διαχωρισμός Master (Μόνιμο) και Live (Τρέχον) Menu
let masterMenu = []; // Αυτό που είναι σωσμένο στον δίσκο
let liveMenu = [];   // Αυτό που βλέπουν οι πελάτες (μπορεί να έχει προσωρινές ελλείψεις)

let storeSettings = { 
    name: "BellGo Delivery", 
    pin: null, 
    adminEmail: "", 
    statusCustomer: true, 
    statusStaff: true,
    resetTime: "04:00" // ✅ NEW: Default ώρα reset
}; 

// LOAD DATA ON STARTUP
try {
    if (fs.existsSync(MENU_FILE)) {
        const raw = fs.readFileSync(MENU_FILE, 'utf8');
        try { 
            masterMenu = JSON.parse(raw); 
            // Στην αρχή, το live είναι ίδιο με το master
            liveMenu = JSON.parse(JSON.stringify(masterMenu));
        }
        catch { 
            // Fallback αν χαλάσει το JSON
            masterMenu = [{ id: 1, order: 1, name: "ΓΕΝΙΚΑ", items: raw.split('\n').filter(x => x) }];
            liveMenu = [...masterMenu];
        }
    }

    if (fs.existsSync(SETTINGS_FILE)) {
        const loadedSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        // Merge settings to keep defaults if new fields are missing
        storeSettings = { ...storeSettings, ...loadedSettings };
    }

    if (fs.existsSync(ORDERS_FILE)) {
        activeOrders = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
    }
} catch (e) { console.log("Load Error", e); }

// SAVE HELPERS
function saveOrdersToDisk() { try { fs.writeFileSync(ORDERS_FILE, JSON.stringify(activeOrders, null, 2), 'utf8'); } catch (e) {} }
function saveSettingsToDisk() { try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(storeSettings, null, 2), 'utf8'); } catch (e) {} }
// ✅ UPDATED: Αποθηκεύουμε μόνο το MASTER menu στον δίσκο
function saveMenuToDisk() { try { fs.writeFileSync(MENU_FILE, JSON.stringify(masterMenu, null, 2), 'utf8'); } catch (e) {} }

// --- STATIC FILES ---
app.use(express.static(path.join(__dirname, 'public')));


/* ---------------- NEW VIRTUAL ROUTES FOR PWA FIX ---------------- */
app.get('/shop/:storeName', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'order.html')); });
app.get('/staff/login', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'login.html')); });
app.get('/admin', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'login.html')); });


/* ---------------- DYNAMIC MANIFEST (PATH BASED) ---------------- */
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
    // ✅ Στέλνουμε πάντα το liveMenu στους χρήστες
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
        if (data.type === 'customer') storeSettings.statusCustomer = data.isOpen;
        if (data.type === 'staff') storeSettings.statusStaff = data.isOpen;
        saveSettingsToDisk();
        io.to(socket.store).emit('store-settings-update', storeSettings);
    });

    socket.on('join-store', (data) => {
        let rawStore = data.storeName || '';
        
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
        // Στέλνουμε το LIVE menu μόλις μπει κάποιος
        socket.emit('menu-update', liveMenu);
        socket.emit('store-settings-update', storeSettings);
    });

    socket.on('save-store-name', (newName) => {
        storeSettings.name = newName;
        saveSettingsToDisk();
        io.to(socket.store).emit('store-settings-update', storeSettings);
    });

    // ✅ NEW: Αποθήκευση Ρυθμίσεων (Reset Time)
    socket.on('save-store-settings', (data) => {
        if(data.resetTime) storeSettings.resetTime = data.resetTime;
        saveSettingsToDisk();
        io.to(socket.store).emit('store-settings-update', storeSettings);
    });

    // ✅ UPDATED: Save Menu με υποστήριξη Temporary/Permanent Mode
    socket.on('save-menu', (data) => {
        try {
            // Το data μπορεί να είναι array (παλιό) ή object {menu, mode} (νέο)
            let newMenuData = [];
            let mode = 'permanent';

            if (Array.isArray(data)) {
                newMenuData = data;
            } else if (data.menu) {
                newMenuData = data.menu;
                mode = data.mode || 'permanent';
            }

            if (mode === 'permanent') {
                // Ενημερώνουμε και τα δύο και σώζουμε
                masterMenu = JSON.parse(JSON.stringify(newMenuData));
                liveMenu = JSON.parse(JSON.stringify(newMenuData));
                saveMenuToDisk();
            } else {
                // Ενημερώνουμε μόνο το live (για σήμερα)
                liveMenu = newMenuData;
                // ΔΕΝ σώζουμε στο αρχείο saved_menu.json
            }

            io.to(socket.store).emit('menu-update', liveMenu);
        } catch (e) { console.log("Save Menu Error", e); }
    });

    socket.on('new-order', (orderText) => {
        if (!socket.store) return;
        
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

// ✅ NEW: CRON JOB ΓΙΑ RESET ΜΕΝΟΥ (Έλεγχος κάθε λεπτό)
// Επειδή ο Render server μπορεί να είναι σε UTC, χρησιμοποιούμε ώρα Ελλάδας
setInterval(() => {
    try {
        if (!storeSettings.resetTime) return;

        // Παίρνουμε την ώρα Ελλάδας (HH:MM)
        const nowInGreece = new Date().toLocaleTimeString('el-GR', { 
            timeZone: 'Europe/Athens', 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
        });

        // Αν η ώρα ταιριάζει με τη ρύθμιση
        if (nowInGreece === storeSettings.resetTime) {
            // Έλεγχος για να μην το κάνουμε πολλές φορές στο ίδιο λεπτό (κρατάμε απλά state)
            // Σημείωση: Αν το interval είναι 60000ms ακριβώς, ίσως το πετύχει 2 φορές ή καμία.
            // Γι' αυτό το βάζω 59000 ή ελέγχω απλά αν διαφέρουν τα μενού.
            
            const liveStr = JSON.stringify(liveMenu);
            const masterStr = JSON.stringify(masterMenu);

            if (liveStr !== masterStr) {
                console.log(`↻ Auto-Reset Menu at ${nowInGreece} GR time`);
                liveMenu = JSON.parse(masterStr); // Επαναφορά στο master
                io.emit('menu-update', liveMenu); // Ενημέρωση όλων
            }
        }
    } catch (e) {
        console.error("Reset check error:", e);
    }
}, 60000); // Check every 60 seconds

setInterval(() => { const now = Date.now(); for (const key in activeUsers) { if (now - activeUsers[key].lastSeen > 3600000) delete activeUsers[key]; } }, 60000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
