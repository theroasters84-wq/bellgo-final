const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require('firebase-admin');

// 1. ΦΟΡΤΩΣΗ ΚΛΕΙΔΙΟΥ FIREBASE
const serviceAccount = require('./serviceAccountKey.json');

// 2. ΕΚΚΙΝΗΣΗ ADMIN SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
    pingInterval: 5000, // Κρατάει τη σύνδεση ζωντανή
    pingTimeout: 4000
});

app.use(express.static(path.join(__dirname, 'public')));

let users = {};
let fcmTokens = {}; // Αποθήκη για τα tokens των κινητών

io.on('connection', (socket) => {
    
    // LOGIN & SETUP
    socket.on('join-store', (data) => {
        users[socket.id] = { room: data.storeName, name: data.username, role: data.role };
        socket.join(data.storeName);

        // Αν το κινητό έστειλε Token, το αποθηκεύουμε
        if (data.fcmToken) {
            fcmTokens[socket.id] = data.fcmToken;
            console.log(`[FCM] Νέο Token από: ${data.username}`);
        }
        console.log(`[LOGIN] ${data.username} (${data.role}) -> ${data.storeName}`);
    });

    // HEARTBEAT (Για να μην κλείνει το Socket)
    socket.on('im-alive', (data) => {
        // Απλά επιβεβαίωση ότι ζει
    });

    // 🚨 TRIGGER ALARM (ΔΙΠΛΗ ΕΠΙΘΕΣΗ) 🚨
    socket.on('trigger-alarm', () => {
        const sender = users[socket.id];
        if (!sender) return;

        console.log(`[ATTACK] Ο ${sender.name} πατάει το κουμπί!`);

        // 1. SOCKET ATTACK (Άμεσο)
        socket.to(sender.room).emit('ring-bell', { sender: sender.name });

        // 2. FIREBASE ATTACK (Ασφάλεια)
        // Βρες όλους τους άλλους στο δωμάτιο
        const socketsInRoom = io.sockets.adapter.rooms.get(sender.room);
        if (socketsInRoom) {
            for (const targetId of socketsInRoom) {
                const token = fcmTokens[targetId];
                // Στείλε μόνο αν είναι staff και έχουμε token
                if (token && users[targetId] && users[targetId].role === 'staff') {
                    sendFirebaseAttack(token);
                }
            }
        }
    });

    socket.on('disconnect', () => {
        delete users[socket.id];
        delete fcmTokens[socket.id];
    });
});

// ΣΥΝΑΡΤΗΣΗ ΠΟΥ ΣΤΕΛΝΕΙ ΤΗΝ ΕΝΤΟΛΗ ΣΤΟ ANDROID SYSTEM
function sendFirebaseAttack(token) {
    const message = {
        token: token,
        data: {
            title: '🚨 ΚΛΗΣΗ ΑΠΟ ΚΟΥΖΙΝΑ!',
            body: 'ΑΝΟΙΞΕ ΤΩΡΑ',
            priority: 'high',
            sound: 'default'
        },
        android: {
            priority: 'high',
            ttl: 0 // Παράδοση ΤΩΡΑ
        }
    };

    admin.messaging().send(message)
        .then((response) => console.log('[FCM SENT] Επιτυχία:', response))
        .catch((error) => console.log('[FCM ERROR]', error));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
