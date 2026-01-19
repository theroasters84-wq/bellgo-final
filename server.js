const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const admin = require('firebase-admin');

// --- ΡΥΘΜΙΣΕΙΣ FIREBASE ---
try {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase initialized successfully");
} catch (error) {
    console.error("Firebase init error (Push won't work):", error.message);
}

const app = express();
const server = http.createServer(app);

// --- ΡΥΘΜΙΣΕΙΣ SOCKET.IO (ΕΠΙΚΟΙΝΩΝΙΑ) ---
const io = socketIo(server, {
    cors: {
        origin: "*", // Επιτρέπει σύνδεση από παντού (Κινητό, Browser)
        methods: ["GET", "POST"]
    }
});

// Εξυπηρέτηση των αρχείων από τον φάκελο 'public'
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Λίστα συνδεδεμένων χρηστών (για να βλέπει ο Admin ποιος είναι online)
let connectedUsers = {};

io.on('connection', (socket) => {
    console.log('New connection:', socket.id);

    // 1. Δήλωση Ρόλου (Admin, Driver, Waiter)
    socket.on('login', (userData) => {
        // userData = { role: 'driver', name: 'Nikos' }
        connectedUsers[socket.id] = userData;
        console.log(`User logged in: ${userData.role} (${socket.id})`);
        
        // Ενημέρωσε όλους (π.χ. τον Admin) ότι μπήκε νέος χρήστης
        io.emit('users-update', connectedUsers);
    });

    // 2. CHAT: Όταν κάποιος στέλνει μήνυμα
    socket.on('chat-message', (msgData) => {
        console.log('Chat received:', msgData);
        // Το στέλνουμε πίσω σε ΟΛΟΥΣ για να εμφανιστεί στην οθόνη
        io.emit('chat-message', msgData);
    });

    // 3. ΠΑΡΑΓΓΕΛΙΕΣ: Όταν ο Admin στέλνει παραγγελία
    socket.on('new-order', (orderData) => {
        console.log('New Order:', orderData);
        io.emit('order-notification', orderData); // Ειδοποίηση στην εφαρμογή
        
        // Στείλε και Push Notification (αν υπάρχει το token)
        sendPushNotification(orderData);
    });

    // 4. Αποσύνδεση
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        delete connectedUsers[socket.id];
        io.emit('users-update', connectedUsers); // Ενημέρωσε τη λίστα
    });
});

// Συνάρτηση για Push Notifications (FCM)
function sendPushNotification(data) {
    const message = {
        notification: {
            title: 'Νέα Παραγγελία!',
            body: `Τραπέζι: ${data.table} - Σύνολο: ${data.total}€`
        },
        topic: 'orders' 
    };

    admin.messaging().send(message)
        .then((response) => console.log('Push sent:', response))
        .catch((error) => console.log('Push error:', error));
}

// Εκκίνηση Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server LIVE on port ${PORT}`);
});
