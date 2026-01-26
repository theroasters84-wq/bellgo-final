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
const ESCALATION_DELAY = 60000; // 🔥 1 ΛΕΠΤΟ ΚΑΘΥΣΤΕΡΗΣΗ ΓΙΑ FIREBASE

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

        // Καθαρισμός παλιού χρονομέτρου αν υπάρχει
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
            lastSeen: Date.now(),
            alarmTimeout: null // 🔥 Εδώ αποθηκεύουμε το χρονόμετρο
        };

        console.log(`👤 ${cleanUser} joined ${cleanStore}`);
        updateStore(cleanStore);
    });

    // 2. UPDATE TOKEN
    socket.on('update-token', (data) => {
        const userKey = `${data.store}_${data.user}`;
        if (activeUsers[userKey]) activeUsers[userKey].fcmToken = data.token;
    });

    // 3. HEARTBEAT
    socket.on('heartbeat', () => {
        const userKey = Object.keys(activeUsers).find(key => activeUsers[key].socketId === socket.id);
        if (userKey) activeUsers[userKey].lastSeen = Date.now();
    });

    // 4. LOGOUT
    socket.on('logout-user', () => {
        const userKey = Object.keys(activeUsers).find(key => activeUsers[key].socketId === socket.id);
        if (userKey) {
            // Καθαρισμός χρονομέτρου πριν τη διαγραφή
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
                text: data.text,
                isSelf: false 
            });
        }
    });

    // 6. ALARM (Γενικό)
    socket.on('kitchen-alarm', () => {
        const senderKey = Object.keys(activeUsers).find(key => activeUsers[key].socketId === socket.id);
        if(senderKey) io.to(activeUsers[senderKey].store).emit('kitchen-alarm');
    });

    // 🔥 7. TRIGGER ALARM (ME ΤΟ ΚΟΛΠΟ) 🔥
    socket.on('trigger-alarm', (targetUsername) => {
        const sender = Object.values(activeUsers).find(u => u.socketId === socket.id);
        if (!sender) return;

        const targetKey = `${sender.store}_${targetUsername}`;
        const target = activeUsers[targetKey];

        if (target) {
            console.log(`🔔 Ringing ${target.username} (Socket only)...`);
            
            // Α. Στέλνουμε ΑΜΕΣΩΣ το Socket (Τζάμπα & Γρήγορο)
            io.to(target.socketId).emit('kitchen-alarm'); 

            // Β. Ακυρώνουμε τυχόν προηγούμενο χρονόμετρο
            if (target.alarmTimeout) clearTimeout(target.alarmTimeout);

            // Γ. Ξεκινάμε αντίστροφη μέτρηση 1 λεπτού
            target.alarmTimeout = setTimeout(() => {
                console.log(`⚠️ Escalating to Firebase for ${target.username}...`);
                if (target.fcmToken) sendPushNotification(target.fcmToken);
                target.alarmTimeout = null; 
            }, ESCALATION_DELAY); // 60 δευτερόλεπτα
        }
    });

    // 🔥 8. ALARM ACK (STOP & CANCEL TIMER) 🔥
    socket.on('alarm-ack', () => {
        const senderKey = Object.keys(activeUsers).find(key => activeUsers[key].socketId === socket.id);
        if(senderKey) {
            const user = activeUsers[senderKey];
            console.log(`✅ ${user.username} acknowledged! Canceling Firebase.`);
            
            // ΑΚΥΡΩΣΗ ΤΟΥ ΧΡΟΝΟΜΕΤΡΟΥ
            if (user.alarmTimeout) {
                clearTimeout(user.alarmTimeout);
                user.alarmTimeout = null;
            }

            io.to(user.store).emit('alarm-receipt', { name: user.username });
        }
    });
});

// CLEANUP LOOP
setInterval(() => {
    const now = Date.now();
    let storesToUpdate = new Set();
    Object.keys(activeUsers).forEach(key => {
        if (now - activeUsers[key].lastSeen > TIMEOUT_LIMIT) {
            // Καθαρισμός χρονομέτρου αν υπάρχει
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
    if(!token || token === 'WEB') return; 
    const message = {
        token: token,
        notification: { title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ!", body: "Δεν απάντησες! Τρέξε!" },
        android: { priority: "high", notification: { sound: "default", clickAction: "FLUTTER_NOTIFICATION_CLICK" } },
        data: { url: "/", action: "alarm" }
    };
    admin.messaging().send(message).catch(e => console.error(e));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
