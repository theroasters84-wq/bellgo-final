const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const admin = require('firebase-admin');

// FIREBASE SETUP
try {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log("✅ Firebase Active");
} catch (e) { console.log("⚠️ Firebase Skipped (No serviceAccountKey.json)"); }

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Λίστα οδηγών (Δεν σβήνονται στο disconnect)
let activeDrivers = {}; 

io.on('connection', (socket) => {
    
    // 1. LOGIN
    socket.on('login', (user) => {
        socket.join(user.shop);
        
        if (user.role === 'driver') {
            // Αποθήκευση/Ενημέρωση του οδηγού
            activeDrivers[user.name] = { 
                socketId: socket.id, 
                shop: user.shop,
                fcmToken: user.fcmToken || null 
            };
            console.log(`✅ Driver ${user.name} checked in.`);
        }
        
        // Ενημερώνουμε αμέσως τους Admin
        updateShopAdmins(user.shop);
    });

    // 2. UPDATE FIREBASE TOKEN
    socket.on('update-token', (data) => {
        if (activeDrivers[data.name]) {
            activeDrivers[data.name].fcmToken = data.token;
        }
    });

    // 3. MANUAL LOGOUT (Μόνο τότε διαγράφεται)
    socket.on('force-logout', (user) => {
        if (activeDrivers[user.name]) {
            delete activeDrivers[user.name];
            updateShopAdmins(user.shop);
            console.log(`🚪 Driver ${user.name} logged out.`);
        }
    });

    // 4. ΚΛΗΣΗ (ADMIN -> DRIVER)
    socket.on('call-driver', (targetName) => {
        const driver = activeDrivers[targetName];
        if (driver) {
            console.log(`🔔 Calling ${targetName}...`);
            // Μέσω Socket (αν είναι ανοιχτό)
            io.to(driver.socketId).emit('order-notification');
            // Μέσω Firebase (αν κοιμάται)
            if (driver.fcmToken) sendPush(driver.fcmToken);
        }
    });

    // 5. ΑΠΟΔΟΧΗ (DRIVER -> ADMIN)
    socket.on('accept-order', (data) => {
        // Ειδοποιούμε το μαγαζί ότι ο τάδε το δέχτηκε (για να γίνει πράσινο το κουμπί)
        io.to(data.shop).emit('order-accepted', data.driverName);
    });

    // 6. CHAT
    socket.on('chat-message', (data) => {
        io.to(data.shop).emit('chat-message', data);
    });

    // 7. DISCONNECT (Απλά ενημερώνουμε το socketId αν ξαναμπεί, δεν τον σβήνουμε)
    socket.on('disconnect', () => {
        // Δεν κάνουμε delete εδώ!
    });
});

function updateShopAdmins(shopName) {
    const driversList = [];
    for (let name in activeDrivers) {
        if (activeDrivers[name].shop === shopName) {
            driversList.push({ name: name });
        }
    }
    io.to(shopName).emit('update-drivers-list', driversList);
}

function sendPush(token) {
    const message = {
        token: token,
        notification: { title: 'ΚΛΗΣΗ!', body: 'Πατήστε για αποδοχή' },
        android: { priority: 'high', notification: { sound: 'default' } },
        data: { type: 'call' }
    };
    admin.messaging().send(message).catch(e => console.log("Push Error:", e));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));
