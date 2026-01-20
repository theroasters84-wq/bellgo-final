const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const admin = require('firebase-admin');

// --- FIREBASE SETUP (TO BOT EIDOPOIHSEWN) ---
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

let activeDrivers = {}; 

io.on('connection', (socket) => {
    
    // 1. LOGIN
    socket.on('login', (user) => {
        socket.join(user.shop);
        if (user.role === 'driver') {
            activeDrivers[user.name] = { 
                socketId: socket.id, 
                shop: user.shop,
                fcmToken: user.fcmToken || null 
            };
            console.log(`✅ ${user.name} is ONLINE`);
        }
        updateShopAdmins(user.shop);
    });

    // 2. ΕΝΗΜΕΡΩΣΗ TOKEN (Για να ξέρει το Bot πού να στείλει)
    socket.on('update-token', (data) => {
        if (activeDrivers[data.name]) {
            activeDrivers[data.name].fcmToken = data.token;
            console.log(`📲 Token updated for ${data.name}`);
        }
    });

    // 3. LOGOUT (Μόνο τότε διαγράφεται)
    socket.on('force-logout', (user) => {
        if (activeDrivers[user.name]) {
            delete activeDrivers[user.name];
            updateShopAdmins(user.shop);
        }
    });

    // 4. ΚΛΗΣΗ (ΤΟ ΚΡΙΣΙΜΟ ΣΗΜΕΙΟ)
    socket.on('call-driver', (targetName) => {
        const driver = activeDrivers[targetName];
        if (driver) {
            console.log(`🔔 ΚΛΗΣΗ ΠΡΟΣ: ${targetName}`);
            
            // Τρόπος Α: Socket (Άμεσο, αν είναι ανοιχτή η οθόνη)
            io.to(driver.socketId).emit('order-notification');

            // Τρόπος Β: Firebase Bot (Αν είναι κλειστή/στο παρασκήνιο)
            if (driver.fcmToken) {
                sendPush(driver.fcmToken);
            } else {
                console.log("⚠️ Ο οδηγός δεν έχει Token για Push!");
            }
        }
    });

    // 5. ΑΠΟΔΟΧΗ
    socket.on('accept-order', (data) => {
        io.to(data.shop).emit('order-accepted', data.driverName);
    });

    socket.on('chat-message', (data) => {
        io.to(data.shop).emit('chat-message', data);
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

// Η ΣΥΝΑΡΤΗΣΗ ΤΟΥ BOT
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
    admin.messaging().send(message)
        .then(() => console.log("🚀 Push Notification Sent!"))
        .catch(e => console.log("❌ Push Error:", e));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));
