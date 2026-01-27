const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require('firebase-admin');

// FIREBASE INIT
try {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log("✅ Firebase Connected");
} catch (error) { console.error("❌ Firebase Error:", error.message); }

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

let activeUsers = {}; 
const TIMEOUT_LIMIT = 180000; 
const ESCALATION_DELAY = 60000; 

const SHOP_PASSWORDS = {
    'CoffeeRoom1': '1234',
    'TestShop': '0000',
    'the roasters': '1234'
};

io.on('connection', (socket) => {
    
    // 1. LOGIN
    socket.on('join-store', (data) => {
        const cleanStore = data.storeName ? data.storeName.trim() : "";
        const cleanUser = data.username ? data.username.trim() : "";
        const correctPass = SHOP_PASSWORDS[cleanStore];
        
        if (correctPass && data.pass !== correctPass) {
            console.log(`❌ Λάθος Κωδικός από ${cleanUser}`);
            return; 
        }

        const userKey = `${cleanStore}_${cleanUser}`;
        socket.join(cleanStore);

        if (activeUsers[userKey] && activeUsers[userKey].alarmTimeout) {
            clearTimeout(activeUsers[userKey].alarmTimeout);
        }

        const existingToken = activeUsers[userKey] ? activeUsers[userKey].fcmToken : null;

        activeUsers[userKey] = {
            socketId: socket.id,
            username: cleanUser,
            role: data.role,
            store: cleanStore,
            fcmToken: data.fcmToken || existingToken, 
            deviceType: data.deviceType || 'Unknown', // 🔥 Κρατάμε τι συσκευή είναι
            lastSeen: Date.now(),
            alarmTimeout: null 
        };

        console.log(`👤 ${cleanUser} (${data.deviceType}) joined ${cleanStore}`);
        updateStore(cleanStore);
    });

    // 2. HEARTBEAT
    socket.on('heartbeat', () => {
        const userKey = Object.keys(activeUsers).find(key => activeUsers[key].socketId === socket.id);
        if (userKey) activeUsers[userKey].lastSeen = Date.now();
    });

    // 3. LOGOUT
    socket.on('logout-user', () => {
        const userKey = Object.keys(activeUsers).find(key => activeUsers[key].socketId === socket.id);
        if (userKey) {
            if (activeUsers[userKey].alarmTimeout) clearTimeout(activeUsers[userKey].alarmTimeout);
            const user = activeUsers[userKey];
            delete activeUsers[userKey];
            updateStore(user.store);
        }
    });

    // 4. CHAT
    socket.on('chat-message', (data) => {
        const userKey = Object.keys(activeUsers).find(key => activeUsers[key].socketId === socket.id);
        if (userKey) {
            const user = activeUsers[userKey];
            io.to(user.store).emit('chat-message', {
                sender: user.username,
                role: user.role,
                text: data.text,
                isSelf: false 
            });
        }
    });

    // 5. ALARM (Γενικό)
    socket.on('kitchen-alarm', () => {
        const senderKey = Object.keys(activeUsers).find(key => activeUsers[key].socketId === socket.id);
        if(senderKey) io.to(activeUsers[senderKey].store).emit('kitchen-alarm');
    });

    // 🔥 6. TRIGGER ALARM (ΜΕ ΕΛΕΓΧΟ IOS) 🔥
    socket.on('trigger-alarm', (targetUsername) => {
        const sender = Object.values(activeUsers).find(u => u.socketId === socket.id);
        if (!sender) return;

        const targetKey = `${sender.store}_${targetUsername}`;
        const target = activeUsers[targetKey];

        if (target) {
            console.log(`🔔 Κλήση προς ${target.username}...`);
            
            // A. Στέλνουμε Socket (Ήχος άμεσος αν είναι ανοιχτό)
            io.to(target.socketId).emit('kitchen-alarm'); 

            // B. 🔥 ΕΛΕΓΧΟΣ IOS: Στέλνουμε Notification ΑΜΕΣΩΣ 🔥
            // Αν είναι iOS και έχει Token, στείλε ΤΩΡΑ για να ξυπνήσει
            if (target.deviceType === 'iOS' && target.fcmToken && target.fcmToken.length > 20) {
                console.log(`🍏 iOS Detected: Sending WAKE-UP Notification NOW.`);
                sendPushNotification(target.fcmToken);
            }

            // Γ. Καθαρίζουμε παλιό χρονόμετρο
            if (target.alarmTimeout) clearTimeout(target.alarmTimeout);

            // Δ. Ξεκινάμε χρονόμετρο 1 λεπτού (Για υπενθύμιση ή για Android)
            target.alarmTimeout = setTimeout(() => {
                console.log(`⚠️ Πέρασε 1 λεπτό. Στέλνω (Backup) Notification...`);
                // Αν δεν είναι iOS (ή αν είναι iOS και δεν το είδε), ξαναστείλε
                if (target.fcmToken) sendPushNotification(target.fcmToken);
                target.alarmTimeout = null; 
            }, ESCALATION_DELAY); 
        }
    });

    // 7. ALARM ACK
    socket.on('alarm-ack', () => {
        const senderKey = Object.keys(activeUsers).find(key => activeUsers[key].socketId === socket.id);
        if(senderKey) {
            const user = activeUsers[senderKey];
            console.log(`✅ ${user.username} το είδε! Ακυρώνω το χρονόμετρο.`);
            
            if (user.alarmTimeout) {
                clearTimeout(user.alarmTimeout);
                user.alarmTimeout = null;
            }

            io.to(user.store).emit('alarm-receipt', { name: user.username });
        }
    });
});

// CLEANUP
setInterval(() => {
    const now = Date.now();
    let storesToUpdate = new Set();
    Object.keys(activeUsers).forEach(key => {
        if (now - activeUsers[key].lastSeen > TIMEOUT_LIMIT) {
            if (activeUsers[key].alarmTimeout) clearTimeout(activeUsers[key].alarmTimeout);
            storesToUpdate.add(activeUsers[key].store);
            delete activeUsers[key];
        }
    });
    storesToUpdate.forEach(store => updateStore(store));
}, 30000);

function updateStore(storeName) {
    const staff = Object.values(activeUsers).filter(u => u.store === storeName);
    const formattedStaff = staff.map(u => ({ name: u.username, role: u.role }));
    io.to(storeName).emit('staff-list-update', formattedStaff);
}

function sendPushNotification(token) {
    if(!token || token.length < 20) return; 
    const message = {
        token: token,
        notification: { title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ!", body: "Τρέξε!" },
        android: { priority: "high", notification: { sound: "default", clickAction: "FLUTTER_NOTIFICATION_CLICK" } },
        apns: { payload: { aps: { sound: "default", "content-available": 1 } } },
        data: { url: "/", action: "alarm" }
    };
    admin.messaging().send(message).catch(e => console.error("Firebase Error:", e.message));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
