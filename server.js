const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const admin = require('firebase-admin');

// FIREBASE (Προαιρετικό)
try {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
} catch (e) { console.log("⚠️ Firebase Skipped"); }

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Εδώ αποθηκεύουμε ποιος είναι ποιος: { socketId: { name, shop, role } }
let connectedUsers = {};

io.on('connection', (socket) => {
    
    // 1. LOGIN
    socket.on('login', (user) => {
        // user = { shop: "Roasters", name: "Nikos", role: "driver" ή "admin" }
        connectedUsers[socket.id] = user;
        socket.join(user.shop); // Μπαίνουν στο δωμάτιο του μαγαζιού
        
        console.log(`👤 Login: ${user.name} (${user.role}) at ${user.shop}`);
        
        // Αν συνδέθηκε/αποσυνδέθηκε κάποιος, ενημερώνουμε τους Admins του μαγαζιού
        updateShopAdmins(user.shop);
    });

    // 2. ΣΤΟΧΕΥΜΕΝΗ ΚΛΗΣΗ (Admin -> Specific Driver)
    socket.on('call-driver', (targetSocketId) => {
        console.log(`🔔 Calling specific driver: ${targetSocketId}`);
        // Στέλνουμε ΜΟΝΟ σε αυτόν τον διανομέα
        io.to(targetSocketId).emit('order-notification');
    });

    // 3. CHAT (Μόνο στο ίδιο μαγαζί)
    socket.on('chat-message', (data) => {
        io.to(data.shop).emit('chat-message', data);
    });

    // 4. HEARTBEAT
    socket.on('heartbeat', () => { /* Κρατάει τη σύνδεση */ });

    // 5. DISCONNECT
    socket.on('disconnect', () => {
        const user = connectedUsers[socket.id];
        if (user) {
            const shop = user.shop;
            delete connectedUsers[socket.id];
            updateShopAdmins(shop); // Ενημέρωσε τη λίστα ότι έφυγε
        }
    });
});

// Στέλνει τη λίστα των Online Διανομέων στους Admins του ίδιου μαγαζιού
function updateShopAdmins(shopName) {
    // Βρες όλους τους drivers αυτού του shop
    const drivers = [];
    for (let id in connectedUsers) {
        if (connectedUsers[id].shop === shopName && connectedUsers[id].role === 'driver') {
            drivers.push({ id: id, name: connectedUsers[id].name });
        }
    }
    // Στείλε τη λίστα στο room του shop (θα το φιλτράρει το front-end να το δουν μόνο οι admins)
    io.to(shopName).emit('update-drivers-list', drivers);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server Ready on ${PORT}`));
