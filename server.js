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
    console.log("⚠️ FIREBASE ERROR: Δεν βρέθηκε το serviceAccountKey.json.");
}

const app = express();
const server = http.createServer(app);

// Ρύθμιση CORS (Ανοιχτό για όλα τα κινητά)
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    // Σημαντικό: Ping κάθε 2 δευτερόλεπτα για να μην κλείνει η γραμμή
    pingInterval: 2000, 
    pingTimeout: 5000 
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Η Λίστα των Οδηγών
let activeDrivers = {}; 

// ==========================================================
// 🚀 ΤΟ "ΜΠΟΤΑΚΙ" (KEEP-ALIVE SIGNAL)
// ==========================================================
// Στέλνει σήμα κάθε 3 δευτερόλεπτα σε ΟΛΟΥΣ για να μην κοιμάται η σύνδεση.
setInterval(() => {
    // Στέλνουμε ένα μικρό πακέτο 'ping'
    io.emit('server-keep-alive', { time: Date.now() });
    // console.log("💓 Server Pulse Sent"); // (Ξε-σχολίασέ το αν θες να το βλέπεις)
}, 3000);


// ==========================================================
// 👻 GHOST BUSTER (Ο ΕΞΟΛΟΘΡΕΥΤΗΣ)
// ==========================================================
// Τρέχει κάθε 10 δευτερόλεπτα (πιο συχνά τώρα). 
// Αν κάποιος δεν έδωσε σήμα για 60'', τον διαγράφει.
setInterval(() => {
    const now = Date.now();
    let updated = false;

    for (let name in activeDrivers) {
        const driver = activeDrivers[name];
        // Αν πέρασαν 60 δευτερόλεπτα χωρίς Heartbeat
        if (now - driver.lastBeat > 60000) {
            console.log(`💀 GHOST BUSTED: Ο ${name} διαγράφηκε (Dead Connection).`);
            delete activeDrivers[name];
            updateShopAdmins(driver.shop); 
            updated = true;
        }
    }
}, 10000);


io.on('connection', (socket) => {
    
    // --- 1. LOGIN (Η ΔΙΟΡΘΩΣΗ) ---
    socket.on('login', (user) => {
        socket.join(user.shop); 

        if (user.role === 'driver') {
            // ΕΔΩ ΕΙΝΑΙ Η ΜΑΓΕΙΑ:
            // Αν υπάρχει ήδη ο χρήστης (π.χ. reconnect), απλά του αλλάζουμε το ID.
            // Δεν φτιάχνουμε καινούργιο, ούτε έχουμε διπλότυπα.
            activeDrivers[user.name] = { 
                socketId: socket.id, // <--- Το ΝΕΟ ID
                shop: user.shop,
                fcmToken: user.fcmToken || (activeDrivers[user.name]?.fcmToken), // Κράτα το παλιό token αν δεν έστειλε νέο
                lastBeat: Date.now()
            };
            
            console.log(`✅ LOGIN / RECONNECT: ${user.name} (New ID: ${socket.id})`);
        } else {
            console.log(`💻 ADMIN Connected: ${user.shop}`);
        }
        
        // Ενημερώνουμε αμέσως το UI του Admin
        updateShopAdmins(user.shop);
    });

    // --- 2. HEARTBEAT (Καρδιακός Παλμός από το Android) ---
    socket.on('heartbeat', (data) => {
        if (activeDrivers[data.name]) {
            activeDrivers[data.name].lastBeat = Date.now();
            // Αν άλλαξε το ID εν κινήσει (π.χ. WiFi -> 4G), το ενημερώνουμε κι εδώ
            if (activeDrivers[data.name].socketId !== socket.id) {
                activeDrivers[data.name].socketId = socket.id;
                console.log(`🔄 IP CHANGED: ${data.name} updated socket ID.`);
            }
        }
    });

    // --- 3. LOGOUT (Καθαρή Έξοδος) ---
    socket.on('force-logout', (user) => {
        if (activeDrivers[user.name]) {
            console.log(`🚪 MANUAL LOGOUT: ${user.name}`);
            delete activeDrivers[user.name];
            updateShopAdmins(user.shop);
        }
    });

    // --- 4. DISCONNECT (Πτώση Δικτύου) ---
    socket.on('disconnect', () => {
        // ΠΡΟΣΟΧΗ: ΔΕΝ ΔΙΑΓΡΑΦΟΥΜΕ ΤΟΝ ΧΡΗΣΤΗ ΕΔΩ!
        // Αν πέσει το ίντερνετ για 2 δευτερόλεπτα, θέλουμε να μείνει στη λίστα.
        // Ο Ghost Buster θα τον διαγράψει αν περάσει 1 λεπτό.
        console.log(`⚠️ Socket Disconnected: ${socket.id}`);
    });

    // --- 5. CALL DRIVER (Κλήση) ---
    socket.on('call-driver', (targetName) => {
        const driver = activeDrivers[targetName];
        
        if (driver) {
            console.log(`🔔 CALLING: ${targetName} on Socket: ${driver.socketId}`);
            
            // Ανανέωση χρόνου (αφού μιλάμε, υπάρχει)
            driver.lastBeat = Date.now();

            // Στέλνουμε στο ΣΩΣΤΟ (τελευταίο) ID
            io.to(driver.socketId).emit('order-notification');

            // Στέλνουμε και Firebase για σιγουριά
            if (driver.fcmToken) {
                sendAggressivePush(driver.fcmToken);
            }
        } else {
            console.log(`❌ FAILED CALL: Ο ${targetName} δεν βρέθηκε στη λίστα.`);
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

// Βοηθητική για ενημέρωση Admin
function updateShopAdmins(shopName) {
    const driversList = [];
    for (let name in activeDrivers) {
        if (activeDrivers[name].shop === shopName) {
            driversList.push({ name: name });
        }
    }
    io.to(shopName).emit('update-drivers-list', driversList);
}

// FIREBASE PUSH FUNCTION
function sendAggressivePush(token) {
    if (!token) return;
    
    const message = {
        token: token,
        data: { type: 'call', force_wake: 'true' }, // Data-only για να το πιάσει το service
        android: { priority: 'high', ttl: 0 }
    };

    admin.messaging().send(message)
        .then(() => console.log("🚀 FCM Sent"))
        .catch(e => console.log("❌ FCM Error:", e.message));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));
