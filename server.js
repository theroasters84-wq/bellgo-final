const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require('firebase-admin');

// FIREBASE INIT
try {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log("✅ Firebase Connected");
} catch (error) { console.error("❌ Firebase Error:", error.message); }

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

let activeUsers = {}; 
const TIMEOUT_LIMIT = 180000; // 3 Λεπτά Timeout

io.on('connection', (socket) => {
    
    // 1. LOGIN
    socket.on('join-store', (data) => {
        const cleanStore = data.storeName.trim();
        const cleanUser = data.username.trim();
        const userKey = `${cleanStore}_${cleanUser}`;

        socket.join(cleanStore);

        // Αν έχουμε ήδη token από πριν, κράτα το
        const existingToken = activeUsers[userKey] ? activeUsers[userKey].fcmToken : null;

        activeUsers[userKey] = {
            socketId: socket.id,
            username: cleanUser,
            role: data.role,
            store: cleanStore,
            fcmToken: data.fcmToken || existingToken, // Κράτα το νέο ή το παλιό
            lastSeen: Date.now()
        };

        console.log(`👤 ${cleanUser} joined ${cleanStore}`);
        updateStore(cleanStore);
    });

    // 2. 🔥 UPDATE TOKEN (ΑΥΤΟ ΕΛΕΙΠΕ!) 🔥
    // Όταν το Firebase αργεί, το Token έρχεται εδώ λίγο μετά το Login
    socket.on('update-token', (data) => {
        const userKey = `${data.store}_${data.user}`;
        if (activeUsers[userKey]) {
            activeUsers[userKey].fcmToken = data.token;
            console.log(`🔑 Token saved for ${data.user}`);
        }
    });

    // 3. HEARTBEAT
    socket.on('heartbeat', () => {
        const userKey = Object.keys(activeUsers).find(key => activeUsers[key].socketId === socket.id);
        if (userKey) activeUsers[userKey].lastSeen = Date.now();
    });

    // 4. LOGOUT
    socket.on('logout-user', () => {
        const userKey = Object.keys(activeUsers).find(key => activeUsers[key].socketId === socket.id);
        if (userKey) {
            const user = activeUsers[userKey];
            delete activeUsers[userKey];
            updateStore(user.store);
        }
    });

    // 5. CHAT
    socket.on('send-chat', (msgData) => io.to(msgData.store).emit('new-chat', msgData));

    // 6. ALARM (ΕΔΩ ΣΤΕΛΝΟΥΜΕ ΤΗΝ ΕΙΔΟΠΟΙΗΣΗ)
    socket.on('trigger-alarm', (targetUsername) => {
        const sender = Object.values(activeUsers).find(u => u.socketId === socket.id);
        if (!sender) return;

        const targetKey = `${sender.store}_${targetUsername}`;
        const target = activeUsers[targetKey];

        if (target) {
            console.log(`🔔 Ringing ${target.username}...`);
            
            // Α. Στέλνουμε Socket (Για να ανοίξει η οθόνη αν είναι ανοιχτό το app)
            io.to(target.socketId).emit('ring-bell', { from: 'Admin' });

            // Β. Στέλνουμε Firebase Notification (Για όταν είναι κλειστό)
            if (target.fcmToken) {
                console.log(`📨 Sending Push to ${target.username}`);
                sendPushNotification(target.fcmToken);
            } else {
                console.log(`⚠️ No Token for ${target.username}`);
            }
        }
    });
});

// CLEANER (Διαγράφει ανενεργούς χρήστες)
setInterval(() => {
    const now = Date.now();
    let storesToUpdate = new Set();
    Object.keys(activeUsers).forEach(key => {
        if (now - activeUsers[key].lastSeen > TIMEOUT_LIMIT) {
            storesToUpdate.add(activeUsers[key].store);
            delete activeUsers[key];
        }
    });
    storesToUpdate.forEach(store => updateStore(store));
}, 30000);

function updateStore(storeName) {
    const staff = Object.values(activeUsers).filter(u => u.store === storeName);
    io.to(storeName).emit('update-staff-list', staff);
}

function sendPushNotification(token) {
    const message = {
        token: token,
        notification: { 
            title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ!", 
            body: "Πάτα ΕΔΩ τώρα!" 
        },
        android: { 
            priority: "high", 
            notification: { 
                sound: "default",
                clickAction: "FLUTTER_NOTIFICATION_CLICK", // Βοηθάει μερικές φορές στο άνοιγμα
            } 
        },
        data: { url: "/", action: "alarm" }
    };
    
    admin.messaging().send(message)
        .then(() => console.log("✅ Push Sent!"))
        .catch(e => console.error("❌ Push Failed:", e.message));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
