const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require('firebase-admin');

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
// Χρόνος Timeout: 3 Λεπτά (180.000 ms)
// Αν κάποιος δεν στείλει heartbeat για 3 λεπτά, θεωρείται offline.
const TIMEOUT_LIMIT = 180000; 

io.on('connection', (socket) => {
    // 1. LOGIN / RECONNECT
    socket.on('join-store', (data) => {
        const cleanStore = data.storeName.trim();
        const cleanUser = data.username.trim();
        const userKey = `${cleanStore}_${cleanUser}`;

        socket.join(cleanStore);

        activeUsers[userKey] = {
            socketId: socket.id,
            username: cleanUser,
            role: data.role,
            store: cleanStore,
            fcmToken: data.fcmToken || (activeUsers[userKey] ? activeUsers[userKey].fcmToken : null),
            lastSeen: Date.now() // <--- ΚΡΑΤΑΜΕ ΤΗΝ ΩΡΑ ΠΟΥ ΤΟΝ ΕΙΔΑΜΕ ΤΕΛΕΥΤΑΙΑ
        };

        console.log(`👤 ${cleanUser} connected/refreshed.`);
        updateStore(cleanStore);
    });

    // 2. HEARTBEAT (ΤΟ ΠΑΛΜΟΓΡΑΦΟ)
    // Το Watchdog στέλνει "im-alive" κάθε 10 δευτερόλεπτα.
    socket.on('heartbeat', () => {
        // Βρες ποιος χρήστης έχει αυτό το socket και ανανέωσε το χρόνο του
        const userKey = Object.keys(activeUsers).find(key => activeUsers[key].socketId === socket.id);
        if (userKey) {
            activeUsers[userKey].lastSeen = Date.now(); // Ανανέωση χρόνου
        }
    });

    // 3. LOGOUT (Χειροκίνητη Διαγραφή)
    socket.on('logout-user', () => {
        const userKey = Object.keys(activeUsers).find(key => activeUsers[key].socketId === socket.id);
        if (userKey) {
            const user = activeUsers[userKey];
            delete activeUsers[userKey];
            updateStore(user.store);
        }
    });

    socket.on('send-chat', (msgData) => io.to(msgData.store).emit('new-chat', msgData));

    socket.on('trigger-alarm', (targetUsername) => {
        const store = Object.values(activeUsers).find(u => u.socketId === socket.id)?.store;
        if (!store) return;
        const targetKey = `${store}_${targetUsername}`;
        const target = activeUsers[targetKey];
        if (target) {
            io.to(target.socketId).emit('ring-bell', { from: 'Admin' });
            if (target.fcmToken) sendPushNotification(target.fcmToken);
        }
    });

    // DISCONNECT: Δεν κάνουμε τίποτα εδώ. Ο Cleaner θα καθαρίσει.
});

// --- 🧹 THE CLEANER (Ο ΕΚΚΑΘΑΡΙΣΤΗΣ) ---
// Τρέχει κάθε 30 δευτερόλεπτα και ψάχνει για "νεκρούς" χρήστες
setInterval(() => {
    const now = Date.now();
    let storesToUpdate = new Set(); // Ποια μαγαζιά πρέπει να ενημερώσουμε

    Object.keys(activeUsers).forEach(key => {
        const user = activeUsers[key];
        // Αν έχουν περάσει 3 λεπτά από το τελευταίο σήμα
        if (now - user.lastSeen > TIMEOUT_LIMIT) {
            console.log(`💀 Removing inactive user: ${user.username}`);
            storesToUpdate.add(user.store);
            delete activeUsers[key]; // ΔΙΑΓΡΑΦΗ
        }
    });

    // Ενημέρωση μόνο των μαγαζιών που είχαν διαγραφές
    storesToUpdate.forEach(storeName => updateStore(storeName));

}, 30000); // Έλεγχος κάθε 30 δευτερόλεπτα

function updateStore(storeName) {
    const staff = Object.values(activeUsers).filter(u => u.store === storeName);
    io.to(storeName).emit('update-staff-list', staff);
}

function sendPushNotification(token) {
    const message = {
        token: token,
        notification: { title: "🚨 ΚΛΗΣΗ", body: "Έλα Κουζίνα!" },
        android: { priority: "high", notification: { sound: "default" } },
        data: { url: "/", action: "alarm" }
    };
    admin.messaging().send(message).catch(e => {});
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
