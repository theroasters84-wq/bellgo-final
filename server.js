const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require("firebase-admin");
const fs = require('fs');

// --- TO DOMAIN ΣΟΥ ---
const YOUR_DOMAIN = 'https://bellgo-final.onrender.com';

// --- STRIPE SETUP ---
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
// ✅ Προσθήκη PIN στο αντικείμενο ρυθμίσεων
let storeSettings = { name: "BellGo Delivery", pin: null }; 

// LOAD DATA ON STARTUP
try {
    if (fs.existsSync(MENU_FILE)) {
        const raw = fs.readFileSync(MENU_FILE, 'utf8');
        try { liveMenu = JSON.parse(raw); }
        catch { liveMenu = [{ id: 1, order: 1, name: "ΓΕΝΙΚΑ", items: raw.split('\n').filter(x => x) }]; }
    }
    if (fs.existsSync(SETTINGS_FILE)) {
        storeSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    }
    if (fs.existsSync(ORDERS_FILE)) {
        activeOrders = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
        console.log(`♻️ Loaded ${activeOrders.length} active orders.`);
    }
} catch (e) { console.log("Load Error", e); }

// SAVE HELPERS
function saveOrdersToDisk() {
    try { fs.writeFileSync(ORDERS_FILE, JSON.stringify(activeOrders, null, 2), 'utf8'); } catch (e) {}
}
function saveSettingsToDisk() {
    try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(storeSettings, null, 2), 'utf8'); } catch (e) {}
}


/* ---------------- DYNAMIC MANIFEST (FIXED ID) ---------------- */
app.get('/manifest.json', (req, res) => {
    const appName = req.query.name || storeSettings.name || "BellGo App";
    const iconType = req.query.icon; 
    const storeParam = req.query.store || "general";

    let iconFile = "admin.png"; 
    let startUrl = ".";         
    
    // ✅ UNIQUE ID: Λύνει το πρόβλημα σύγκρουσης PWA
    // Ο Browser βλέπει διαφορετικό ID για πελάτη (shop) και προσωπικό (admin/staff)
    let appId = `bellgo_${iconType}_${storeParam}`; 

    if (iconType === 'shop') {
        iconFile = "shop.png";
        // Ο πελάτης πάει στο order.html
        startUrl = `./order.html?store=${req.query.store || ''}&name=${encodeURIComponent(appName)}`;
    } else {
        iconFile = "admin.png";
        // Το προσωπικό πάει πάντα Login
        startUrl = `./login.html`; 
    }

    res.set('Content-Type', 'application/manifest+json');
    res.json({
        "id": appId, // <-- ΤΟ ΚΛΕΙΔΙ ΓΙΑ ΤΟ PWA CONFLICT
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

app.use(express.static(path.join(__dirname, 'public')));

/* ---------------- STRIPE ---------------- */
app.post('/check-subscription', async (req, res) => {
    let { email } = req.body;
    let requestPlan = 'basic';
    try {
        if (!email) return res.json({ active: false });
        if (email.endsWith('premium')) { requestPlan = 'premium'; email = email.replace('premium', ''); }
        const customers = await stripe.customers.list({ email: email.toLowerCase().trim(), limit: 1 });
        if (customers.data.length === 0) return res.json({ active: false });
        const subscriptions = await stripe.subscriptions.list({ customer: customers.data[0].id, status: 'active' });
        res.json({ active: subscriptions.data.length > 0, plan: subscriptions.data.length > 0 ? requestPlan : null });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/create-checkout-session', async (req, res) => {
    let { email } = req.body;
    if (email && email.endsWith('premium')) email = email.replace('premium', '');
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'], customer_email: email,
            line_items: [{ price: 'price_1Sx9PFJcEtNSGviLteieJCwj', quantity: 1 }],
            mode: 'subscription',
            success_url: `${YOUR_DOMAIN}/login.html?payment=success&email=${email}`,
            cancel_url: `${YOUR_DOMAIN}/login.html?payment=cancel`,
        });
        res.json({ id: session.id, url: session.url });
    } catch (e) { res.status(500).json({ error: e.message }); }
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
        admin.messaging().send(msg).catch(e => console.log("FCM Error:", e.message));
    }
}


/* ---------------- SOCKET.IO ---------------- */
io.on('connection', (socket) => {

    // --- AUTH & PIN LOGIC ---
    socket.on('check-pin-status', () => {
        // Επιστρέφει αν έχει οριστεί PIN ή όχι (για τον Admin)
        socket.emit('pin-status', { hasPin: !!storeSettings.pin });
    });

    socket.on('set-new-pin', (newPin) => {
        // Ο Admin ορίζει νέο PIN
        storeSettings.pin = newPin;
        saveSettingsToDisk(); // Αποθήκευση
        socket.emit('pin-success', { msg: "Ο κωδικός ορίστηκε!" });
    });

    socket.on('verify-pin', (pin) => {
        // Έλεγχος PIN για είσοδο (Admin ή Staff)
        // Σημείωση: Εδώ υποθέτουμε single-tenant (ένα κατάστημα ανά server)
        // Αν είχες πολλούς, θα έπρεπε να ψάχνεις το PIN βάσει του storeName.
        if (storeSettings.pin === pin) {
            socket.emit('pin-verified', { success: true });
        } else {
            socket.emit('pin-verified', { success: false });
        }
    });

    socket.on('join-store', (data) => {
        let rawStore = data.storeName || '';
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

        console.log(`👤 JOIN: ${username} @ ${store} (${socket.role})`);
        updateStore(store);
        socket.emit('menu-update', liveMenu);
        socket.emit('store-settings-update', storeSettings);
    });

    socket.on('save-store-name', (newName) => {
        storeSettings.name = newName;
        saveSettingsToDisk(); // Save settings
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
        const newOrder = {
            id: Date.now(),
            text: orderText,
            from: socket.username,
            status: 'pending',
            store: socket.store
        };
        activeOrders.push(newOrder);
        updateStore(socket.store);

        Object.values(activeUsers)
            .filter(u => u.store === socket.store && u.role === 'admin')
            .forEach(adm => {
                if (adm.socketId) io.to(adm.socketId).emit('ring-bell');
                sendPushNotification(adm, "ΝΕΑ ΠΑΡΑΓΓΕΛΙΑ", `Από: ${socket.username}`);
            });
    });

    socket.on('update-order', (data) => {
        const o = activeOrders.find(x => x.id === Number(data.id));
        if (o) {
            o.text += `\n➕ ${data.addText}`; 
            o.status = 'pending'; 
            updateStore(socket.store);
            
            Object.values(activeUsers)
            .filter(u => u.store === socket.store && u.role === 'admin')
            .forEach(adm => {
                if (adm.socketId) io.to(adm.socketId).emit('ring-bell');
                sendPushNotification(adm, "ΠΡΟΣΘΗΚΗ ΠΑΡΑΓΓΕΛΙΑΣ", `Σε τραπέζι του: ${o.from}`);
            });
        }
    });

    socket.on('accept-order', (id) => {
        const o = activeOrders.find(x => x.id === id);
        if (o) { o.status = 'cooking'; updateStore(socket.store); }
    });

    socket.on('ready-order', (id) => {
        const o = activeOrders.find(x => x.id === id);
        if (o) {
            o.status = 'ready';
            updateStore(socket.store);
            
            const targetKey = `${socket.store}_${o.from}`;
            const targetUser = activeUsers[targetKey];
            if (targetUser) {
                sendPushNotification(targetUser, "ΕΤΟΙΜΟ!", "Η παραγγελία είναι στο πάσο.");
            }
        }
    });

    socket.on('pay-order', (id) => {
        activeOrders = activeOrders.filter(x => x.id !== Number(id));
        updateStore(socket.store);
    });

    socket.on('close-order', (id) => {
        activeOrders = activeOrders.filter(x => x.id !== id);
        updateStore(socket.store);
    });

    socket.on('trigger-alarm', (targetName) => {
        const key = `${socket.store}_${targetName}`;
        const target = activeUsers[key];
        if (target) {
            target.isRinging = true;
            updateStore(socket.store);
            if (target.socketId) io.to(target.socketId).emit('ring-bell');
        }
    });

    socket.on('alarm-accepted', (data) => {
        const key = `${data.store}_${data.username}`;
        if (activeUsers[key]) {
            activeUsers[key].isRinging = false;
            updateStore(data.store);
        }
    });

    socket.on('chat-message', (msg) => {
        if (socket.store) io.to(socket.store).emit('chat-message', { sender: socket.username, text: msg.text });
    });

    socket.on('manual-logout', (data) => {
        const tUser = data && data.targetUser ? data.targetUser : socket.username;
        const tKey = `${socket.store}_${tUser}`;
        if (activeUsers[tKey]) { delete activeUsers[tKey]; updateStore(socket.store); }
    });

    socket.on('disconnect', () => {
        const key = `${socket.store}_${socket.username}`;
        if (activeUsers[key] && activeUsers[key].socketId === socket.id) {
            activeUsers[key].status = 'away';
            updateStore(socket.store);
        }
    });
});

setInterval(() => {
    const now = Date.now();
    for (const key in activeUsers) {
        if (now - activeUsers[key].lastSeen > 3600000) {
            delete activeUsers[key];
        }
    }
}, 60000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
