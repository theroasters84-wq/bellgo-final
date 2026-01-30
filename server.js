const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require('firebase-admin');

// --- 1. FIREBASE INIT ---
try {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log("✅ Firebase Connected");
} catch (error) { console.error("❌ Firebase Error:", error.message); }

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*" },
    pingTimeout: 60000, 
    pingInterval: 25000 
});

app.use(express.static(path.join(__dirname, 'public')));

// --- 2. CONFIGURATION & STATE ---
let activeUsers = {}; 
let pendingAlarms = {}; // 🔥 Η "Μνήμη" για κλήσεις που δεν έχουν απαντηθεί (STOP)
const TIMEOUT_LIMIT = 180000; 
const ESCALATION_DELAY = 60000; 
const DISCONNECT_GRACE_PERIOD = 45000; 

const SHOP_PASSWORDS = {
    'CoffeeRoom1': '1234',
    'TestShop': '0000',
    'the roasters': '1234'
};

io.on('connection', (socket) => {
    
    // --- 3. LOGIN & RECONNECT ---
    socket.on('join-store', (data) => {
        const cleanStore = data.storeName ? data.storeName.trim() : "";
        const cleanUser = data.username ? data.username.trim() : "";
        const correctPass = SHOP_PASSWORDS[cleanStore];
        
        if (correctPass && data.pass !== correctPass) return; 

        const userKey = `${cleanStore}_${cleanUser}`;
        socket.join(cleanStore);
        socket.username = cleanUser; // Αποθήκευση στο socket για ευκολία
        socket.store = cleanStore;

        if (activeUsers[userKey] && activeUsers[userKey].disconnectTimeout) {
            clearTimeout(activeUsers[userKey].disconnectTimeout);
            activeUsers[userKey].disconnectTimeout = null;
            console.log(`♻️ ${cleanUser} reconnected just in time!`);
        }
        
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
            deviceType: data.deviceType || 'Unknown', 
            lastSeen: Date.now(),
            alarmTimeout: null,
            disconnectTimeout: null,
            isIntentionalExit: false 
        };

        console.log(`👤 ${cleanUser} joined ${cleanStore}`);

        // 🔥 ΕΛΕΓΧΟΣ ΓΙΑ ΕΚΚΡΕΜΕΙΣ ΚΛΗΣΕΙΣ (Persistent Alarm)
        // Αν ο χρήστης συνδέθηκε και το όνομά του είναι στη λίστα pending, του στέλνουμε κλήση αμέσως
        if (pendingAlarms[userKey]) {
            console.log(`🔔 Delivering missed alarm to ${cleanUser}`);
            socket.emit('kitchen-alarm');
        }

        updateStore(cleanStore);
    });

    // --- 4. UPDATE TOKEN ---
    socket.on('update-token', (data) => {
        const userKey = `${data.store}_${data.user}`;
        if (activeUsers[userKey]) {
            activeUsers[userKey].fcmToken = data.token;
        }
    });

    // --- 5. HEARTBEAT ---
    socket.on('heartbeat', () => {
        const userKey = `${socket.store}_${socket.username}`;
        if (activeUsers[userKey]) {
            activeUsers[userKey].lastSeen = Date.now();
            if (activeUsers[userKey].disconnectTimeout) {
                clearTimeout(activeUsers[userKey].disconnectTimeout);
                activeUsers[userKey].disconnectTimeout = null;
            }
        }
    });

    // --- 6. LOGOUT ---
    socket.on('logout-user', () => {
        const userKey = `${socket.store}_${socket.username}`;
        if (activeUsers[userKey]) {
            activeUsers[userKey].isIntentionalExit = true;
            if (activeUsers[userKey].alarmTimeout) clearTimeout(activeUsers[userKey].alarmTimeout);
            if (activeUsers[userKey].disconnectTimeout) clearTimeout(activeUsers[userKey].disconnectTimeout);
            
            delete activeUsers[userKey];
            updateStore(socket.store);
            console.log(`🚪 ${userKey} logged out manually.`);
        }
    });

    // --- 7. DISCONNECT ---
    socket.on('disconnect', () => {
        const userKey = `${socket.store}_${socket.username}`;
        if (activeUsers[userKey]) {
            const user = activeUsers[userKey];
            if (user.isIntentionalExit) return;

            user.disconnectTimeout = setTimeout(() => {
                if (user.fcmToken && user.fcmToken.length > 20 && user.fcmToken !== 'FULLY' && user.fcmToken !== 'WEB') {
                    sendRescueNotification(user.fcmToken);
                }
                const store = user.store;
                delete activeUsers[userKey];
                updateStore(store);
            }, DISCONNECT_GRACE_PERIOD);
        }
    });

    // --- 8. CHAT ---
    socket.on('chat-message', (data) => {
        if (socket.store) {
            io.to(socket.store).emit('chat-message', {
                sender: socket.username,
                role: activeUsers[`${socket.store}_${socket.username}`]?.role || 'user',
                text: data.text
            });
        }
    });

    // --- 9. TRIGGER ALARM (ΜΕ ΕΠΙΜΟΝΗ) ---
    socket.on('trigger-alarm', (targetUsername) => {
        const userKeyPrefix = socket.store;
        const targetKey = `${userKeyPrefix}_${targetUsername}`;
        const target = activeUsers[targetKey];

        // 🔥 Προσθήκη στη λίστα εκκρεμών κλήσεων
        pendingAlarms[targetKey] = true;

        if (target) {
            console.log(`🔔 Alarm to ${target.username}...`);
            io.to(target.socketId).emit('kitchen-alarm'); 

            if (target.deviceType === 'iOS' && target.fcmToken && target.fcmToken.length > 20) {
                sendPushNotification(target.fcmToken);
            } 

            if (target.alarmTimeout) clearTimeout(target.alarmTimeout);
            target.alarmTimeout = setTimeout(() => {
                if (target.fcmToken && target.fcmToken.length > 20 && target.fcmToken !== 'FULLY') {
                     sendPushNotification(target.fcmToken);
                }
                target.alarmTimeout = null; 
            }, ESCALATION_DELAY); 
        } else {
            // Αν ο στόχος είναι offline, στείλε Push αμέσως αν έχουμε token
            // (Το Socket θα του σκάσει μόλις κάνει reconnect λόγω του pendingAlarms)
            console.log(`📡 Target ${targetUsername} offline. Stored in pending.`);
        }
    });

    // --- 10. ALARM ACK (STOP) ---
    socket.on('alarm-ack', () => {
        const userKey = `${socket.store}_${socket.username}`;
        
        // 🔥 Η κλήση παραδόθηκε και ο χρήστης πάτησε STOP, άρα τη σβήνουμε από τη μνήμη
        delete pendingAlarms[userKey];

        if(activeUsers[userKey]) {
            const user = activeUsers[userKey];
            if (user.alarmTimeout) {
                clearTimeout(user.alarmTimeout);
                user.alarmTimeout = null;
            }
            io.to(user.store).emit('alarm-receipt', { name: user.username });
        }
    });

    socket.on('ios-login', () => {
        setTimeout(() => { socket.emit('test-alarm'); }, 2000);
    });

}); 

// --- CLEANUP & MAINTENANCE ---
setInterval(() => {
    const now = Date.now();
    let storesToUpdate = new Set();
    
    Object.keys(activeUsers).forEach(key => {
        const user = activeUsers[key];
        if (now - user.lastSeen > TIMEOUT_LIMIT) {
            if (user.fcmToken && user.fcmToken.length > 20 && user.fcmToken !== 'FULLY' && user.fcmToken !== 'WEB') {
                sendRescueNotification(user.fcmToken);
            }
            storesToUpdate.add(user.store);
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
    const message = {
        token: token,
        notification: { title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ!", body: "Σε περιμένουν!" },
        android: { priority: "high", notification: { sound: "default" } },
        apns: { payload: { aps: { sound: "default", "content-available": 1 } } },
        data: { action: "alarm" }
    };
    admin.messaging().send(message).catch(e => {});
}

function sendRescueNotification(token) {
    const message = {
        token: token,
        notification: { title: "⚠️ ΑΠΟΣΥΝΔΕΘΗΚΕΣ!", body: "Ξαναμπές στο BellGo για να λαμβάνεις κλήσεις." },
        data: { action: "reconnect" }
    };
    admin.messaging().send(message).catch(e => {});
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
