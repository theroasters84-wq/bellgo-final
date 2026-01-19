const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const admin = require('firebase-admin');

// Αρχικοποίηση Firebase (για ειδοποιήσεις)
// Προσοχή: Βεβαιώσου ότι το αρχείο serviceAccountKey.json υπάρχει στον ίδιο φάκελο
const serviceAccount = require('./serviceAccountKey.json');

try {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase initialized successfully");
} catch (error) {
    console.error("Firebase init error:", error);
}

const app = express();
const server = http.createServer(app);

// Ρυθμίσεις CORS για να δέχεται συνδέσεις από παντού (Render, Κινητό, Browser)
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Εξυπηρέτηση στατικών αρχείων (HTML, CSS, JS) από τον φάκελο 'public'
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Socket.io: Διαχείριση συνδέσεων
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // Όταν ο Admin στέλνει παραγγελία
    socket.on('new-order', (orderData) => {
        console.log('Order received:', orderData);
        
        // 1. Στείλε την παραγγελία σε όλους (Admin Panel, Κινητά)
        io.emit('order-notification', orderData);

        // 2. Στείλε Push Notification στα Android κινητά
        sendPushNotification(orderData);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Συνάρτηση αποστολής Push Notification (FCM)
function sendPushNotification(data) {
    const message = {
        notification: {
            title: 'Νέα Παραγγελία!',
            body: `Τραπέζι: ${data.table} - Σύνολο: ${data.total}€`
        },
        topic: 'orders' // Στέλνει σε όσους έχουν γραφτεί στο θέμα "orders"
    };

    admin.messaging().send(message)
        .then((response) => {
            console.log('Push sent successfully:', response);
        })
        .catch((error) => {
            console.log('Error sending push:', error);
        });
}

// Εκκίνηση Server (Σημαντικό για το Render: process.env.PORT)
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
