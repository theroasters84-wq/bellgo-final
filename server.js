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
const ESCALATION_DELAY = 60000; // 1 Λεπτό

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
        
        if (correctPass && data.pass !== correctPass) return; 

        const userKey = `${cleanStore}_${cleanUser}`;
        socket.join(cleanStore);

        // Καθαρισμός παλιού timeout αν υπάρχει
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
            deviceType: data.deviceType || 'Unknown', // iOS ή Android
            lastSeen: Date.now(),
            alarmTimeout: null 
        };

        console.log(`👤 ${cleanUser} (${activeUsers[userKey].deviceType}) joined ${cleanStore}`);
        updateStore(cleanStore);
    });

    // 2. UPDATE TOKEN
    socket.on('update-token', (data) => {
        const userKey = `${data.store}_${data.user}`;
        if (activeUsers[userKey]) {
            activeUsers[userKey].fcmToken = data.token;
        }
    });

    // 3. HEARTBEAT (Client -> Server)
    socket.on('heartbeat', () => {
        const userKey = Object.keys(activeUsers).find(key => activeUsers[key].socketId === socket.id);
        if (userKey) activeUsers[userKey].lastSeen = Date.now();
    });

    // 4. LOGOUT
    socket.on('logout-user', () => {
        const userKey = Object.keys(activeUsers).find(key => activeUsers[key].socketId === socket.id);
        if (userKey) {
            if (activeUsers[userKey].alarmTimeout) clearTimeout(activeUsers[userKey].alarmTimeout);
            const user = activeUsers[userKey];
            delete activeUsers[userKey];
            updateStore(user.store);
        }
    });

    // 5. CHAT
    socket.on('chat-message', (data) => {
        const userKey = Object.keys(activeUsers).find(key => activeUsers[key].socketId === socket.id);
        if (userKey) {
            const user = activeUsers[userKey];
            io.to(user.store).emit('chat-message', {
                sender: user.username,
                role: user.role,
                text: data.text
            });
        }
    });

    // 🔥 6. TRIGGER ALARM (Η ΛΟΓΙΚΗ ΠΟΥ ΖΗΤΗΣΕΣ) 🔥
    socket.on('trigger-alarm', (targetUsername) => {
        const sender = Object.values(activeUsers).find(u => u.socketId === socket.id);
        if (!sender) return;

        const targetKey = `${sender.store}_${targetUsername}`;
        const target = activeUsers[targetKey];

        if (target) {
            console.log(`🔔 Κλήση προς ${target.username} (${target.deviceType})...`);
            
            // Α. Στέλνουμε ΠΑΝΤΑ το Socket (Ήχος άμεσος για όποιον είναι ξύπνιος)
            io.to(target.socketId).emit('kitchen-alarm'); 

            // Β. ΛΟΓΙΚΗ NOTIFICATION
            if (target.deviceType === 'iOS') {
                // 👉 iOS: Στέλνουμε ΑΜΕΣΩΣ για να ξυπνήσει
                if (target.fcmToken && target.fcmToken.length > 20) {
                    console.log(`📲 iOS: Immediate Notification sent.`);
                    sendPushNotification(target.fcmToken);
                }
            } 
            // 👉 Android/Xiaomi: ΔΕΝ στέλνουμε ακόμα. Περιμένουμε το Timeout.

            // Γ. ΧΡΟΝΟΜΕΤΡΟ (BACKUP / ANDROID DELAY)
            if (target.alarmTimeout) clearTimeout(target.alarmTimeout);

            target.alarmTimeout = setTimeout(() => {
                console.log(`⚠️ 1 Minute Passed. Checking acknowledgement for ${target.username}...`);
                // Στέλνουμε τώρα notification αν δεν το έχει δει (Για Android είναι το πρώτο, για iOS είναι backup)
                if (target.fcmToken && target.fcmToken.length > 20) {
                     console.log(`📲 Sending Delayed Notification.`);
                     sendPushNotification(target.fcmToken);
                }
                target.alarmTimeout = null; 
            }, ESCALATION_DELAY); // 60000ms = 1 Λεπτό
        }
    });

    // 7. ALARM ACK (STOP)
    socket.on('alarm-ack', () => {
        const senderKey = Object.keys(activeUsers).find(key => activeUsers[key].socketId === socket.id);
        if(senderKey) {
            const user = activeUsers[senderKey];
            // Ακυρώνουμε το χρονόμετρο (άρα το Android δεν θα λάβει ποτέ Notification αν το δει γρήγορα)
            if (user.alarmTimeout) {
                clearTimeout(user.alarmTimeout);
                user.alarmTimeout = null;
            }
            io.to(user.store).emit('alarm-receipt', { name: user.username });
        }
    });

    // 🔥 8. IOS INITIAL FORCE WAKE UP 🔥
    socket.on('ios-login', () => {
        console.log(`🍏 iOS Login Detected. Sending Force-Unlock Alarm in 2s...`);
        setTimeout(() => {
            socket.emit('test-alarm'); // Ειδικό event για το αρχικό τεστ
        }, 2000);
    });

}); // End IO Connection

// 🔥 9. KEEP ALIVE PULSE (Κάθε 10 Λεπτά) 🔥
// Στέλνει "bim" σε όλους, χωρίς να ζητάει αποδοχή, για να μην κοιμηθεί ο Browser
setInterval(() => {
    console.log("💓 Sending 10-min Keep-Alive Pulse to all...");
    io.emit('keep-alive-pulse'); 
}, 600000); // 10 λεπτά

// CLEANUP LOOP
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
        notification: { title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ!", body: "Άνοιξε την εφαρμογή ΤΩΡΑ!" },
        android: { priority: "high", notification: { sound: "default", clickAction: "FLUTTER_NOTIFICATION_CLICK" } },
        apns: { payload: { aps: { sound: "default", "content-available": 1 } } },
        data: { url: "/", action: "alarm" }
    };
    admin.messaging().send(message).catch(e => console.error("Firebase Error:", e.message));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
