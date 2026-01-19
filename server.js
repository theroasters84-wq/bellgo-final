const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const admin = require('firebase-admin');

// FIREBASE (Προαιρετικό - αν δεν έχεις αρχείο δεν πειράζει)
try {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
} catch (e) { console.log("⚠️ Firebase Skipped"); }

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

let connectedUsers = {};

io.on('connection', (socket) => {
    
    // 1. LOGIN
    socket.on('login', (user) => {
        connectedUsers[socket.id] = user;
        socket.join(user.shop); // Μπαίνουν στο δωμάτιο του μαγαζιού
        updateShopAdmins(user.shop);
    });

    // 2. ΣΤΟΧΕΥΜΕΝΗ ΚΛΗΣΗ
    socket.on('call-driver', (targetSocketId) => {
        io.to(targetSocketId).emit('order-notification');
    });

    // 3. CHAT (Μόνο στο ίδιο μαγαζί)
    socket.on('chat-message', (data) => {
        io.to(data.shop).emit('chat-message', data);
    });

    // 4. HEARTBEAT
    socket.on('heartbeat', () => { });

    // 5. DISCONNECT
    socket.on('disconnect', () => {
        const user = connectedUsers[socket.id];
        if (user) {
            delete connectedUsers[socket.id];
            updateShopAdmins(user.shop);
        }
    });
});

function updateShopAdmins(shopName) {
    const drivers = [];
    for (let id in connectedUsers) {
        if (connectedUsers[id].shop === shopName && connectedUsers[id].role === 'driver') {
            drivers.push({ id: id, name: connectedUsers[id].name });
        }
    }
    io.to(shopName).emit('update-drivers-list', drivers);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server Ready on ${PORT}`));
