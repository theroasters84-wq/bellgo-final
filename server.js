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
    pingTimeout: 60000, // Αυξημένο timeout για σταθερότητα
    pingInterval: 25000 
});

app.use(express.static(path.join(__dirname, 'public')));

// --- 2. CONFIGURATION ---
let activeUsers = {}; 
const TIMEOUT_LIMIT = 180000; // 3 Λεπτά (Όριο αδράνειας/βίντεο)
const ESCALATION_DELAY = 60000; // 1 Λεπτό (Καθυστέρηση ειδοποίησης Android)
const DISCONNECT_GRACE_PERIOD = 45000; // 45 Δευτ. (Περιθώριο Ναυαγοσώστη)

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

        // 🔥 SMART RECONNECT: Αν ο χρήστης ξαναμπήκε γρήγορα, ακυρώνουμε τον "Ναυαγοσώστη"
        if (activeUsers[userKey] && activeUsers[userKey].disconnectTimeout) {
            clearTimeout(activeUsers[userKey].disconnectTimeout);
            activeUsers[userKey].disconnectTimeout = null;
            console.log(`♻️ ${cleanUser} reconnected just in time! (Rescue cancelled)`);
        }
        
        // Καθαρισμός παλιού timeout alarm
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
            disconnectTimeout: null, // Timer για τον Ναυαγοσώστη
            isIntentionalExit: false // Σημαία: Βγήκε μόνος του;
        };

        console.log(`👤 ${cleanUser} (${activeUsers[userKey].deviceType}) joined ${cleanStore}`);
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
        const userKey = Object.keys(activeUsers).find(key => activeUsers[key].socketId === socket.id);
        if (userKey) {
            activeUsers[userKey].lastSeen = Date.now();
            // Αν στέλνει heartbeat, ζει. Ακυρώνουμε τον Ναυαγοσώστη αν τρέχει.
            if (activeUsers[userKey].disconnectTimeout) {
                clearTimeout(activeUsers[userKey].disconnectTimeout);
                activeUsers[userKey].disconnectTimeout = null;
            }
        }
    });

    // --- 6. LOGOUT (ΗΘΕΛΗΜΕΝΗ ΕΞΟΔΟΣ) ---
    socket.on('logout-user', () => {
        const userKey = Object.keys(activeUsers).find(key => activeUsers[key].socketId === socket.id);
        if (userKey) {
            activeUsers[userKey].isIntentionalExit = true; // ΣΗΜΑΔΙ ΟΤΙ ΒΓΗΚΕ ΜΟΝΟΣ ΤΟΥ
            
            if (activeUsers[userKey].alarmTimeout) clearTimeout(activeUsers[userKey].alarmTimeout);
            if (activeUsers[userKey].disconnectTimeout) clearTimeout(activeUsers[userKey].disconnectTimeout);
            
            const store = activeUsers[userKey].store;
            delete activeUsers[userKey];
            updateStore(store);
            console.log(`🚪 ${userKey} logged out manually.`);
        }
    });

    // --- 7. DISCONNECT (ΑΠΟΤΟΜΗ ΑΠΟΣΥΝΔΕΣΗ - ΝΑΥΑΓΟΣΩΣΤΗΣ) ---
    socket.on('disconnect', () => {
        const userKey = Object.keys(activeUsers).find(key => activeUsers[key].socketId === socket.id);
        
        if (userKey) {
            const user = activeUsers[userKey];

            // Αν βγήκε μόνος του (πάτησε Exit), δεν κάνουμε τίποτα.
            if (user.isIntentionalExit) return;

            console.log(`⚠️ ${user.username} disconnected unexpectedly (Video/Sleep). Starting Rescue Timer...`);

            // Ξεκινάμε χρονόμετρο "Ναυαγοσώστη" (45 δευτερόλεπτα)
            user.disconnectTimeout = setTimeout(() => {
                // Στέλνουμε ειδοποίηση "ΓΥΡΝΑ ΠΙΣΩ" (εκτός αν είναι Fully Kiosk)
                if (user.fcmToken && user.fcmToken.length > 20 && user.fcmToken !== 'FULLY' && user.fcmToken !== 'WEB') {
                    console.log(`🚑 Sending RESCUE Notification to ${user.username}`);
                    sendRescueNotification(user.fcmToken);
                }
                
                // Τον διαγράφουμε μετά την ειδοποίηση
                const store = user.store;
                delete activeUsers[userKey];
                updateStore(store);
            }, DISCONNECT_GRACE_PERIOD);
        }
    });

    // --- 8. CHAT ---
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

    // --- 9. TRIGGER ALARM ---
    socket.on('trigger-alarm', (targetUsername) => {
        const sender = Object.values(activeUsers).find(u => u.socketId === socket.id);
        if (!sender) return;

        const targetKey = `${sender.store}_${targetUsername}`;
        const target = activeUsers[targetKey];

        if (target) {
            console.log(`🔔 Alarm to ${target.username} (${target.deviceType})...`);
            
            // Α. Στέλνουμε ΠΑΝΤΑ το Socket (Ήχος άμεσος)
            io.to(target.socketId).emit('kitchen-alarm'); 

            // Β. iOS: Στέλνουμε ΑΜΕΣΩΣ Push
            if (target.deviceType === 'iOS' && target.fcmToken && target.fcmToken.length > 20) {
                console.log(`📲 iOS Push sent.`);
                sendPushNotification(target.fcmToken);
            } 

            // Γ. Android Backup Timer
            if (target.alarmTimeout) clearTimeout(target.alarmTimeout);

            target.alarmTimeout = setTimeout(() => {
                console.log(`⚠️ Backup Notification Timer fired for ${target.username}`);
                if (target.fcmToken && target.fcmToken.length > 20 && target.fcmToken !== 'FULLY') {
                     sendPushNotification(target.fcmToken);
                }
                target.alarmTimeout = null; 
            }, ESCALATION_DELAY); 
        }
    });

    // --- 10. ALARM ACK (STOP) ---
    socket.on('alarm-ack', () => {
        const senderKey = Object.keys(activeUsers).find(key => activeUsers[key].socketId === socket.id);
        if(senderKey) {
            const user = activeUsers[senderKey];
            // Ακυρώνουμε το χρονόμετρο backup
            if (user.alarmTimeout) {
                clearTimeout(user.alarmTimeout);
                user.alarmTimeout = null;
            }
            io.to(user.store).emit('alarm-receipt', { name: user.username });
        }
    });

    // --- 11. INITIAL FORCE WAKE UP (TEST ALARM) ---
    // Αυτό καλείται από iOS και πλέον από Android για να ξεκλειδώσει τον ήχο
    socket.on('ios-login', () => {
        console.log(`🔊 Login Detected. Sending Test Alarm in 2s...`);
        setTimeout(() => {
            socket.emit('test-alarm'); 
        }, 2000);
    });

}); 

// --- 12. KEEP ALIVE PULSE ---
setInterval(() => {
    // console.log("💓 Keep-Alive Pulse");
    io.emit('keep-alive-pulse'); 
}, 600000); // 10 λεπτά

// --- 13. CLEANUP LOOP (Ο ΝΑΥΑΓΟΣΩΣΤΗΣ ΑΔΡΑΝΕΙΑΣ) ---
setInterval(() => {
    const now = Date.now();
    let storesToUpdate = new Set();
    
    Object.keys(activeUsers).forEach(key => {
        const user = activeUsers[key];
        
        // Αν έχουν περάσει 3 λεπτά χωρίς Heartbeat (άρα βλέπει βίντεο/κοιμάται)
        if (now - user.lastSeen > TIMEOUT_LIMIT) {
            console.log(`💤 User ${user.username} inactive (>3min). Kicking & Rescuing.`);
            
            // Στέλνουμε ειδοποίηση "ΓΥΡΝΑ ΠΙΣΩ"
            if (user.fcmToken && user.fcmToken.length > 20 && user.fcmToken !== 'FULLY' && user.fcmToken !== 'WEB') {
                sendRescueNotification(user.fcmToken);
            }
            
            if (user.alarmTimeout) clearTimeout(user.alarmTimeout);
            if (user.disconnectTimeout) clearTimeout(user.disconnectTimeout);
            
            storesToUpdate.add(user.store);
            delete activeUsers[key];
        }
    });
    
    storesToUpdate.forEach(store => updateStore(store));
}, 30000); 

// HELPERS
function updateStore(storeName) {
    const staff = Object.values(activeUsers).filter(u => u.store === storeName);
    const formattedStaff = staff.map(u => ({ name: u.username, role: u.role }));
    io.to(storeName).emit('staff-list-update', formattedStaff);
}

function sendPushNotification(token) {
    const message = {
        token: token,
        notification: { title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ!", body: "Τρέξε!" },
        android: { priority: "high", notification: { sound: "default", clickAction: "FLUTTER_NOTIFICATION_CLICK" } },
        apns: { payload: { aps: { sound: "default", "content-available": 1 } } },
        data: { url: "/", action: "alarm" }
    };
    admin.messaging().send(message).catch(e => console.error("Push Error:", e.message));
}

// Ειδοποίηση Ναυαγοσώστη
function sendRescueNotification(token) {
    const message = {
        token: token,
        notification: { 
            title: "⚠️ ΑΠΟΣΥΝΔΕΘΗΚΕΣ!", 
            body: "Το BellGo έκλεισε λόγω αδράνειας. Πάτα εδώ!" 
        },
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default" } } },
        data: { url: "/", action: "reconnect" }
    };
    admin.messaging().send(message).catch(e => console.error("Rescue Push Failed:", e));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
