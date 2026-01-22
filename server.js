const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const admin = require('firebase-admin');

// --- 1. FIREBASE SETUP ---
try {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("✅ FIREBASE: Ενεργοποιήθηκε επιτυχώς.");
} catch (e) {
    console.log("⚠️ FIREBASE ERROR: Δεν βρέθηκε το serviceAccountKey.json ή είναι λάθος.");
}

const app = express();
const server = http.createServer(app);

// Ρύθμιση CORS (Ανοιχτό για όλα τα κινητά)
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    // Ping κάθε 2 δευτερόλεπτα για να κρατάμε τη γραμμή ζωντανή
    pingInterval: 2000, 
    pingTimeout: 5000 
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Η Λίστα των Οδηγών { "Nikos": { socketId: "...", shop: "Roasters", fcmToken: "..." } }
let activeDrivers = {}; 

// ==========================================================
// 🚀 ΤΟ "ΜΠΟΤΑΚΙ" (KEEP-ALIVE SIGNAL)
// ==========================================================
setInterval(() => {
    io.emit('server-keep-alive', { time: Date.now() });
}, 3000);

// ==========================================================
// 👻 GHOST BUSTER (Ο ΕΞΟΛΟΘΡΕΥΤΗΣ)
// ==========================================================
setInterval(() => {
    const now = Date.now();
    let updated = false;

    for (let name in activeDrivers) {
        const driver = activeDrivers[name];
        // Αν πέρασαν 60 δευτερόλεπτα χωρίς Heartbeat -> DELETE
        if (now - driver.lastBeat > 60000) {
            console.log(`💀 GHOST BUSTED: Ο ${name} διαγράφηκε (Dead Connection).`);
            delete activeDrivers[name];
            updateShopAdmins(driver.shop); 
            updated = true;
        }
    }
}, 10000);


io.on('connection', (socket) => {
    
    // --- 1. LOGIN ---
    socket.on('login', (user) => {
        socket.join(user.shop); 

        if (user.role === 'driver') {
            // Αν υπάρχει ήδη, κρατάμε το παλιό FCM Token αν το καινούργιο είναι κενό
            const oldToken = activeDrivers[user.name]?.fcmToken;
            
            activeDrivers[user.name] = { 
                socketId: socket.id, 
                shop: user.shop,
                // Αποθηκεύουμε το Token για να στέλνουμε ειδοποιήσεις όταν είναι κλειστό
                fcmToken: user.fcmToken || oldToken, 
                lastBeat: Date.now()
            };
            
            console.log(`✅ LOGIN: ${user.name} (Socket: ${socket.id}) (FCM: ${user.fcmToken ? 'Yes' : 'No'})`);
        } else {
            console.log(`💻 ADMIN Connected: ${user.shop}`);
        }
        
        updateShopAdmins(user.shop);
    });

    // --- 2. HEARTBEAT ---
    socket.on('heartbeat', (data) => {
        if (activeDrivers[data.name]) {
            activeDrivers[data.name].lastBeat = Date.now();
            
            // Αν άλλαξε Socket ID (π.χ. αλλαγή δικτύου), το ενημερώνουμε
            if (activeDrivers[data.name].socketId !== socket.id) {
                activeDrivers[data.name].socketId = socket.id;
            }
        }
    });

    // --- 3. LOGOUT ---
    socket.on('force-logout', (user) => {
        if (activeDrivers[user.name]) {
            console.log(`🚪 LOGOUT: ${user.name}`);
            delete activeDrivers[user.name];
            updateShopAdmins(user.shop);
        }
    });

    // --- 4. DISCONNECT ---
    socket.on('disconnect', () => {
        // Δεν διαγράφουμε εδώ. Αφήνουμε τον Ghost Buster να κρίνει.
        // console.log(`⚠️ Socket Disconnected: ${socket.id}`);
    });

    // --- 5. CALL DRIVER (Η ΚΛΗΣΗ) ---
    socket.on('call-driver', (targetName) => {
        const driver = activeDrivers[targetName];
        
        if (driver) {
            console.log(`🔔 CALLING: ${targetName}`);
            
            driver.lastBeat = Date.now(); // Ανανέωση χρόνου

            // A. Στέλνουμε μέσω Socket (αν είναι ανοιχτή η εφαρμογή)
            io.to(driver.socketId).emit('order-notification');

            // B. Στέλνουμε ΚΑΙ μέσω Firebase (αν είναι κλειστή/background)
            if (driver.fcmToken) {
                sendAggressivePush(driver.fcmToken);
            } else {
                console.log("⚠️ No FCM Token for driver, notification might fail if app is closed.");
            }
        } else {
            console.log(`❌ FAILED CALL: Ο ${targetName} δεν είναι online.`);
        }
    });

    // --- 6. ACCEPT ORDER ---
    socket.on('accept-order', (data) => {
        io.to(data.shop).emit('order-accepted', data.driverName);
        console.log(`👍 ACCEPTED: ${data.driverName}`);
    });

    // --- 7. CHAT ---
    socket.on('chat-message', (data) => {
        io.to(data.shop).emit('chat-message', data);
    });
});

// Ενημέρωση λίστας οδηγών στον Admin
function updateShopAdmins(shopName) {
    const driversList = [];
    for (let name in activeDrivers) {
        if (activeDrivers[name].shop === shopName) {
            driversList.push({ name: name });
        }
    }
    io.to(shopName).emit('update-drivers-list', driversList);
}

// FIREBASE PUSH FUNCTION (ΔΙΟΡΘΩΜΕΝΗ)
function sendAggressivePush(token) {
    if (!token) return;
    
    // Έλεγχος αν το Firebase έχει αρχικοποιηθεί
    if (admin.apps.length === 0) return;

    const message = {
        token: token,
        // ΔΙΟΡΘΩΣΗ: Στέλνουμε action: 'ring' για να ταιριάζει με το Android Code
        data: { 
            action: 'ring', 
            priority: 'high' 
        }, 
        android: { 
            priority: 'high', 
            ttl: 0 // Άμεση παράδοση ή θάνατος (μην το κρατάς στην ουρά)
        }
    };

    admin.messaging().send(message)
        .then(() => console.log("🚀 FCM Sent (High Priority)"))
        .catch(e => console.log("❌ FCM Error:", e.message));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));
