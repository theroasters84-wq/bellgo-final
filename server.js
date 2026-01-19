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

// Λίστα για να ξέρουμε ποιοι οδηγοί είναι σε ποιο μαγαζί
// Μορφή: { "socketID": { name: "Nikos", shop: "Roasters", role: "driver" } }
let connectedUsers = {};

io.on('connection', (socket) => {
    
    // 1. LOGIN & ROOMS
    socket.on('login', (user) => {
        // Αποθήκευση χρήστη
        connectedUsers[socket.id] = user;
        
        // Βάζουμε τον χρήστη στο "Δωμάτιο" του μαγαζιού του
        socket.join(user.shop); 
        console.log(`👤 ${user.name} joined room: ${user.shop}`);

        // Αν μπήκε Driver ή Admin, ενημερώνουμε τον Admin του μαγαζιού για τη λίστα
        updateShopAdmins(user.shop);
    });

    // 2. CHAT (Μόνο στο συγκεκριμένο μαγαζί)
    socket.on('chat-message', (data) => {
        // Στέλνουμε το μήνυμα ΜΟΝΟ σε όσους είναι στο ίδιο μαγαζί (room)
        // data πρέπει να έχει { shop, user, text }
        io.to(data.shop).emit('chat-message', data);
    });

    // 3. ΣΤΟΧΕΥΜΕΝΗ ΚΛΗΣΗ (Admin -> Specific Driver)
    socket.on('call-driver', (targetSocketId) => {
        // Στέλνουμε ειδοποίηση ΜΟΝΟ στον συγκεκριμένο οδηγό
        io.to(targetSocketId).emit('order-notification');
        
        // Στέλνουμε Push αν χρειαστεί (εδώ απλοϊκά σε όλους του topic, 
        // για πιο σωστά θέλει tokens, αλλά ας το αφήσουμε απλό για αρχή)
        sendPush();
    });

    // 4. ΑΠΟΣΥΝΔΕΣΗ
    socket.on('disconnect', () => {
        const user = connectedUsers[socket.id];
        if (user) {
            const shopName = user.shop;
            delete connectedUsers[socket.id];
            // Ενημερώνουμε τον Admin ότι έφυγε κάποιος
            updateShopAdmins(shopName);
        }
    });
});

// Συνάρτηση που στέλνει τη λίστα των οδηγών στους Admins του συγκεκριμένου Shop
function updateShopAdmins(shopName) {
    // Βρες όλους τους οδηγούς αυτού του μαγαζιού
    const driversList = [];
    for (let id in connectedUsers) {
        if (connectedUsers[id].shop === shopName && connectedUsers[id].role === 'driver') {
            driversList.push({ id: id, name: connectedUsers[id].name });
        }
    }
    // Στείλε τη λίστα στο δωμάτιο του μαγαζιού (θα το ακούσει το shop.html)
    io.to(shopName).emit('update-drivers', driversList);
}

function sendPush() {
    try {
        const msg = { notification: { title: 'ΚΛΗΣΗ!', body: 'Πάτα το κουμπί!' }, topic: 'orders' };
        admin.messaging().send(msg).catch(e=>{});
    } catch (e) {}
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));
