const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const admin = require('firebase-admin');

// --- FIREBASE INIT (Αν λείπει το αρχείο, δεν κρασάρει) ---
try {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("✅ Firebase connected");
} catch (error) {
    console.log("⚠️ Firebase not found (Push notifications won't work, but app will run)");
}

const app = express();
const server = http.createServer(app);

// --- SOCKET IO SETUP ---
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// --- LOGIC ---
io.on('connection', (socket) => {
    console.log('New connection:', socket.id);

    // 1. LOGIN (Για να ξέρουμε ποιος είναι ποιος)
    socket.on('login', (user) => {
        console.log(`👤 User Logged in: ${user.name} (${user.role})`);
        io.emit('chat-message', { user: 'SYSTEM', text: `Ο/Η ${user.name} συνδέθηκε!` });
    });

    // 2. CHAT (Αμφίδρομη επικοινωνία)
    socket.on('chat-message', (data) => {
        console.log(`💬 Chat from ${data.user}: ${data.text}`);
        io.emit('chat-message', data); // Στέλνει σε όλους
    });

    // 3. NEW ORDER (Από Admin -> Σε Drivers)
    socket.on('new-order', (orderData) => {
        console.log('🔔 New Order sent!');
        // Ειδοποίηση στην εφαρμογή (κόκκινη οθόνη)
        io.emit('order-notification', orderData);
        // Ειδοποίηση Push (αν υπάρχει Firebase)
        sendPush();
    });
});

function sendPush() {
    try {
        const message = {
            notification: { title: 'Νέα Παραγγελία!', body: 'Πάτα για αποδοχή' },
            topic: 'orders'
        };
        admin.messaging().send(message).catch(e => console.log(e));
    } catch (e) {}
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));
