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

// ΛΙΣΤΑ ΧΡΗΣΤΩΝ: Χρησιμοποιούμε το Username ως κλειδί για να μην έχουμε διπλότυπα
let activeUsers = {}; // Structure: { "StoreName_Username": { socketId, name, role, store, token } }

io.on('connection', (socket) => {
    console.log(`[+] New Connection: ${socket.id}`);

    // 1. ΕΙΣΟΔΟΣ (Login / Reconnect)
    socket.on('join-store', (data) => {
        const cleanStore = data.storeName.trim();
        const cleanUser = data.username.trim();
        const userKey = `${cleanStore}_${cleanUser}`; // Μοναδικό κλειδί (π.χ. Coffee_Marios)

        socket.join(cleanStore);

        // Αν υπάρχει ήδη, απλά ανανεώνουμε το Socket ID και το Token
        activeUsers[userKey] = {
            socketId: socket.id, // Ενημερώνουμε το νέο ID
            username: cleanUser,
            role: data.role,
            store: cleanStore,
            fcmToken: data.fcmToken || (activeUsers[userKey] ? activeUsers[userKey].fcmToken : null)
        };

        console.log(`👤 ${cleanUser} joined/reconnected to ${cleanStore}`);
        updateStore(cleanStore);
    });

    // 2. ΕΞΟΔΟΣ (Logout - ΜΟΝΟ ΕΔΩ ΔΙΑΓΡΑΦΟΥΜΕ)
    socket.on('logout-user', () => {
        // Βρες ποιος είναι βάσει του Socket ID
        const userKey = Object.keys(activeUsers).find(key => activeUsers[key].socketId === socket.id);
        if (userKey) {
            const user = activeUsers[userKey];
            console.log(`🚪 ${user.username} logged out manually.`);
            delete activeUsers[userKey]; // Τον σβήνουμε οριστικά
            updateStore(user.store);
        }
    });

    // 3. CHAT MESSAGE
    socket.on('send-chat', (msgData) => {
        // msgData: { store, user, role, text }
        io.to(msgData.store).emit('new-chat', msgData);
    });

    // 4. ALARM
    socket.on('trigger-alarm', (targetUsername) => {
        // Ψάχνουμε τον χρήστη με βάση το όνομα και το μαγαζί (όχι το socket id γιατί μπορεί να άλλαξε)
        // Στέλνουμε σε όλα τα sockets που ταιριάζουν (αν υπάρχουν)
        const store = Object.values(activeUsers).find(u => u.socketId === socket.id)?.store;
        if (!store) return;

        const targetKey = `${store}_${targetUsername}`;
        const target = activeUsers[targetKey];

        if (target) {
            console.log(`🔔 Alarm for ${target.username}`);
            io.to(target.socketId).emit('ring-bell', { from: 'Admin' });
            if (target.fcmToken) sendPushNotification(target.fcmToken);
        }
    });

    // 5. DISCONNECT (Απλά καταγράφουμε, ΔΕΝ σβήνουμε)
    socket.on('disconnect', () => {
        console.log(`[-] Connection lost: ${socket.id}`);
        // Δεν κάνουμε delete activeUsers[...] εδώ!
        // Έτσι αποφεύγουμε τα "φαντάσματα" αν απλά έπεσε το WiFi.
    });

    function updateStore(storeName) {
        // Στέλνουμε τη λίστα σε όλους στο μαγαζί
        const staff = Object.values(activeUsers).filter(u => u.store === storeName);
        io.to(storeName).emit('update-staff-list', staff);
    }
});

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
