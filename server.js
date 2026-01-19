const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const admin = require('firebase-admin');

// --- FIREBASE (Αν υπάρχει, αλλιώς το προσπερνάει) ---
try {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log("✅ Firebase Active");
} catch (e) { console.log("⚠️ Firebase not active"); }

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// --- LOGIC ---
io.on('connection', (socket) => {
    console.log('Device Connected:', socket.id);

    // LOGIN
    socket.on('login', (auth) => {
        console.log(`👤 Login: ${auth.name} (${auth.role})`);
        io.emit('chat-message', { user: 'SYSTEM', text: `🟢 ${auth.name} συνδέθηκε!` });
    });

    // HEARTBEAT (Για να μην σε πετάει)
    socket.on('heartbeat', () => { /* Κρατάει τη σύνδεση ζωντανή */ });

    // CHAT (Στέλνει σε όλους)
    socket.on('chat-message', (data) => {
        io.emit('chat-message', data);
    });

    // ΠΑΡΑΓΓΕΛΙΑ (Κόκκινη Οθόνη)
    socket.on('new-order', (data) => {
        console.log('🔔 Κλήση εστάλη!');
        io.emit('order-notification', data);
        sendPush();
    });
});

function sendPush() {
    try {
        const msg = { notification: { title: 'ΚΛΗΣΗ!', body: 'Πάτα το κουμπί!' }, topic: 'orders' };
        admin.messaging().send(msg).catch(e=>{});
    } catch (e) {}
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));
