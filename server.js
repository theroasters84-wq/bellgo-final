const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const admin = require('firebase-admin');

// --- FIREBASE SETUP ---
try {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log("✅ FIREBASE BOT: ΕΝΕΡΓΟΠΟΙΗΘΗΚΕ");
} catch (e) { 
    console.log("⚠️ FIREBASE ERROR: Λείπει το serviceAccountKey.json"); 
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Εδώ αποθηκεύουμε τους οδηγούς ΚΑΙ την ώρα που μίλησαν τελευταία φορά
let activeDrivers = {}; 

// --- HEARTBEAT CHECKER (Ο ΕΞΟΛΟΘΡΕΥΤΗΣ ΦΑΝΤΑΣΜΑΤΩΝ) ---
// Κάθε 30 δευτερόλεπτα ελέγχει ποιος δεν έχει μιλήσει τον τελευταίο 1 λεπτό
setInterval(() => {
    const now = Date.now();
    let updated = false;

    for (let name in activeDrivers) {
        const driver = activeDrivers[name];
        // Αν έχουν περάσει 60 δευτερόλεπτα χωρίς παλμό (Heartbeat)
        if (now - driver.lastBeat > 60000) {
            console.log(`💀 Ο οδηγός ${name} θεωρείται Ghost και διαγράφεται.`);
            delete activeDrivers[name];
            updated = true;
        }
    }

    if (updated) {
        // Ενημερώνουμε όλους τους Admin ότι διαγράφηκαν τα φαντάσματα
        io.emit('update-drivers-list', getDriversList()); // Στέλνουμε σε όλους για σιγουριά
    }
}, 30000);

io.on('connection', (socket) => {
    
    // 1. LOGIN
    socket.on('login', (user) => {
        socket.join(user.shop);
        if (user.role === 'driver') {
            activeDrivers[user.name] = { 
                socketId: socket.id, 
                shop: user.shop,
                fcmToken: user.fcmToken || null,
                lastBeat: Date.now() // Καταγράφουμε την ώρα εισόδου
            };
            console.log(`✅ ${user.name} is ONLINE`);
        }
        updateShopAdmins(user.shop);
    });

    // 2. HEARTBEAT (Ο ΠΑΛΜΟΣ ΤΟΥ ΟΔΗΓΟΥ)
    socket.on('heartbeat', (data) => {
        // data = { name: "Nikos" }
        if (activeDrivers[data.name]) {
            activeDrivers[data.name].lastBeat = Date.now(); // Ανανεώνουμε την ώρα
            activeDrivers[data.name].socketId = socket.id; // Ανανεώνουμε το Socket ID αν άλλαξε
        }
    });

    // 3. UPDATE TOKEN
    socket.on('update-token', (data) => {
        if (activeDrivers[data.name]) {
            activeDrivers[data.name].fcmToken = data.token;
            activeDrivers[data.name].lastBeat = Date.now();
        }
    });

    // 4. MANUAL LOGOUT
    socket.on('force-logout', (user) => {
        if (activeDrivers[user.name]) {
            delete activeDrivers[user.name];
            updateShopAdmins(user.shop);
            console.log(`🚪 ${user.name} έκανε Logout.`);
        }
    });

    // 5. CALL DRIVER
    socket.on('call-driver', (targetName) => {
        const driver = activeDrivers[targetName];
        if (driver) {
            console.log(`🔔 ΚΛΗΣΗ ΠΡΟΣ: ${targetName}`);
            
            // Ανανεώνουμε τον παλμό του αφού του μιλάμε
            driver.lastBeat = Date.now();

            // Στέλνουμε και στους 2 δρόμους
            io.to(driver.socketId).emit('order-notification');
            if (driver.fcmToken) sendPush(driver.fcmToken);
        }
    });

    // 6. ACCEPT ORDER
    socket.on('accept-order', (data) => {
        io.to(data.shop).emit('order-accepted', data.driverName);
        if (activeDrivers[data.driverName]) {
            activeDrivers[data.driverName].lastBeat = Date.now();
        }
    });

    socket.on('chat-message', (data) => {
        io.to(data.shop).emit('chat-message', data);
    });
});

function getDriversList(shopName) {
    const driversList = [];
    for (let name in activeDrivers) {
        // Αν δεν δώσουμε shopName, επιστρέφει τα πάντα (βοηθάει στο debugging)
        if (!shopName || activeDrivers[name].shop === shopName) {
            driversList.push({ name: name });
        }
    }
    return driversList;
}

function updateShopAdmins(shopName) {
    const list = getDriversList(shopName);
    io.to(shopName).emit('update-drivers-list', list);
}

function sendPush(token) {
    const message = {
        token: token,
        notification: { 
            title: '📣 ΚΛΗΣΗ!', 
            body: 'ΠΑΤΑ ΓΙΑ ΑΠΟΔΟΧΗ ΤΩΡΑ!' 
        },
        android: { 
            priority: 'high', 
            notification: { 
                sound: 'default',
                channelId: 'fcm_default_channel'
            } 
        },
        data: { type: 'call' }
    };
    admin.messaging().send(message).catch(e => console.log("Push Error:", e));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));
