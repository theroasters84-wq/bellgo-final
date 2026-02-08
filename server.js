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

let liveMenu = [];
let storeSettings = { name: "BellGo Delivery" }; // Default Name

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
} catch (e) { console.log("Load Error", e); }


/* ---------------- DYNAMIC MANIFEST (PRIORITY & FIXED FOR MULTIPLE APPS) ---------------- */
app.get('/manifest.json', (req, res) => {
    // 1. Όνομα Εφαρμογής (Από τα settings ή default)
    const appName = req.query.name || storeSettings.name || "BellGo App";
    
    // 2. Επιλογή Εικονιδίου
    // Αν το query parameter 'icon' είναι 'shop', τότε βάλε 'shop.png'.
    // Σε ΟΛΕΣ τις άλλες περιπτώσεις (admin, staff, login, χωρίς παράμετρο), βάλε 'admin.png'.
    const iconType = req.query.icon;
    let iconFile = "admin.png"; // Default εικονίδιο

    if (iconType === 'shop') {
        iconFile = "shop.png"; // Ειδικό εικονίδιο για πελάτες
    }

    // 3. Start URL & ID
    // Καθορίζουμε πού θα ανοίγει η εφαρμογή όταν πατηθεί το εικονίδιο
    let startUrl = "."; // Default: πηγαίνει στο root (login.html)
    
    // Αν έχουμε store parameter, το προσθέτουμε στο URL
    if (req.query.store) {
        // Αν είναι πελάτης (icon=shop), πήγαινε στο order.html
        if (iconType === 'shop') {
             startUrl = `./order.html?store=${req.query.store}&name=${encodeURIComponent(appName)}`;
        } 
        // Αν είναι admin (ή οτιδήποτε άλλο), πήγαινε στο premium.html (ή login)
        else {
             // Μπορείς να το στείλεις στο premium.html ή στο login.html ανάλογα με το flow σου.
             // Εδώ το στέλνω στο premium.html για να ταιριάζει με το προηγούμενο παράδειγμα admin.
             startUrl = `./premium.html?store=${req.query.store}`;
        }
    }

    res.set('Content-Type', 'application/manifest+json');
    res.json({
        "id": startUrl, // Μοναδικό ID για να ξεχωρίζουν τα Apps
        "name": appName,
        "short_name": appName,
        "start_url": startUrl,
        "display": "standalone",
        "background_color": "#121212",
        "theme_color": "#121212",
        "orientation": "portrait",
        "icons": [
            {
                "src": iconFile,
                "sizes": "192x192",
                "type": "image/png"
            },
            {
                "src": iconFile,
                "sizes": "512x512",
                "type": "image/png"
            }
        ]
    });
});

// --- STATIC FILES (Μετά το manifest) ---
app.use(express.static(path.join(__dirname, 'public')));


/* ---------------- STRIPE FUNCTIONS ---------------- */
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


/* ---------------- HELPER FUNCTIONS ---------------- */
function updateStore(store) {
    if (!store) return;

    // Send Staff List (ΦΙΛΤΡΑΡΙΣΜΑ ΠΕΛΑΤΩΝ)
    const list = Object.values(activeUsers)
        .filter(u => u.store === store && u.role !== 'customer')
        .map(u => ({
            name: u.username, username: u.username, role: u.role, status: u.status, isRinging: u.isRinging
        }));

    io.to(store).emit('staff-list-update', list);

    // Send Orders
    io.to(store).emit('orders-update', activeOrders.filter(o => o.store === store));

    // Send Menu & Settings
    io.to(store).emit('menu-update', liveMenu);
    io.to(store).emit('store-settings-update', storeSettings);
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


/* ---------------- SOCKET.IO LOGIC ---------------- */
io.on('connection', (socket) => {

    socket.on('join-store', (data) => {
        let rawStore = data.storeName || '';
        if (rawStore.endsWith('premium')) rawStore = rawStore.replace('premium', '');
        const store = rawStore.toLowerCase().trim();
        const username = (data.username || '').trim();

        if (!store || !username) return;

        socket.store = store;
        socket.username = username;
        // Αν δεν οριστεί ρόλος, default είναι 'waiter'. Αν έρθει 'customer', κρατάμε 'customer'.
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
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(storeSettings), 'utf8');
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
                if (targetUser.socketId) io.to(targetUser.socketId).emit('ring-bell');
                sendPushNotification(targetUser, "Η ΠΑΡΑΓΓΕΛΙΑ ΕΡΧΕΤΑΙ!", "🛵 Καλή όρεξη!");
            }
        }
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
