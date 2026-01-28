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
const ESCALATION_DELAY = 60000; // 1 Λεπτό (Για Android Notifications)
const DISCONNECT_GRACE_PERIOD = 45000; // 45 Δευτ. περιθώριο για "Ναυαγοσώστη"

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

        // --- SMART RECONNECT (Ο ΝΑΥΑΓΟΣΩΣΤΗΣ ΣΤΑΜΑΤΑΕΙ) ---
        // Αν ο χρήστης ξαναμπήκε γρήγορα, ακυρώνουμε την ειδοποίηση "Αποσυνδέθηκες"
        if (activeUsers[userKey] && activeUsers[userKey].disconnectTimeout) {
            clearTimeout(activeUsers[userKey].disconnectTimeout);
            activeUsers[userKey].disconnectTimeout = null;
            console.log(`♻️ ${cleanUser} reconnected just in time! (Rescue cancelled)`);
        }
        
        // Καθαρισμός παλιού timeout alarm αν υπάρχει
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

    // 2. UPDATE TOKEN
    socket.on('update-token', (data) => {
        const userKey = `${data.store}_${data.user}`;
        if (activeUsers[userKey]) {
            activeUsers[userKey].fcmToken = data.token;
        }
    });

    // 3. HEARTBEAT
    socket.on('heartbeat', () => {
        const userKey = Object.keys(activeUsers).find(key => activeUsers[key].socketId === socket.id);
        if (userKey) {
            activeUsers[userKey].lastSeen = Date.now();
            // Αν στέλνει heartbeat, ζει. Ακυρώνουμε τον Ναυαγοσώστη.
            if (activeUsers[userKey].disconnectTimeout) {
                clearTimeout(activeUsers[userKey].disconnectTimeout);
                activeUsers[userKey].disconnectTimeout = null;
            }
        }
    });

    // 4. LOGOUT (ΗΘΕΛΗΜΕΝΗ ΕΞΟΔΟΣ)
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

    // 5. DISCONNECT (ΑΠΟΤΟΜΗ ΑΠΟΣΥΝΔΕΣΗ - ΕΔΩ ΜΠΑΙΝΕΙ Ο ΝΑΥΑΓΟΣΩΣΤΗΣ)
    socket.on('disconnect', () => {
        const userKey = Object.keys(activeUsers).find(key => activeUsers[key].socketId === socket.id);
        
        if (userKey) {
            const user = activeUsers[userKey];

            // Αν βγήκε μόνος του (πάτησε Exit), δεν κάνουμε τίποτα.
            if (user.isIntentionalExit) return;

            console.log(`⚠️ ${user.username} disconnected unexpectedly (Video/Sleep/Signal loss)`);

            // Ξεκινάμε χρονόμετρο "Ναυαγοσώστη"
            user.disconnectTimeout = setTimeout(() => {
                console.log(`🚑 Sending RESCUE Notification to ${user.username}`);
                
                // Στέλνουμε ειδοποίηση "ΓΥΡΝΑ ΠΙΣΩ" (εκτός αν είναι Fully Kiosk που δεν έχει token)
                if (user.fcmToken && user.fcmToken.length > 20 && user.fcmToken !== 'FULLY' && user.fcmToken !== 'WEB') {
                    sendRescueNotification(user.fcmToken);
                }
                
                // Τον διαγράφουμε μετά την ειδοποίηση
                const store = user.store;
                delete activeUsers[userKey];
                updateStore(store);
            }, DISCONNECT_GRACE_PERIOD);
        }
    });

    // 6. CHAT
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

    // 7. TRIGGER ALARM (ΜΕ ΔΙΑΚΡΙΣΗ iOS/ANDROID)
    socket.on('trigger-alarm', (targetUsername) => {
        const sender = Object.values(activeUsers).find(u => u.socketId === socket.id);
        if (!sender) return;

        const targetKey = `${sender.store}_${targetUsername}`;
        const target = activeUsers[targetKey];

        if (target) {
            console.log(`🔔 Κλήση προς ${target.username} (${target.deviceType})...`);
            
            // Α. Στέλνουμε ΠΑΝΤΑ το Socket (Ήχος άμεσος)
            io.to(target.socketId).emit('kitchen-alarm'); 

            // Β. ΛΟΓΙΚΗ NOTIFICATION
            if (target.deviceType === 'iOS') {
                // 👉 iOS: Στέλνουμε ΑΜΕΣΩΣ για να ξυπνήσει
                if (target.fcmToken && target.fcmToken.length > 20 && target.fcmToken !== 'FULLY') {
                    console.log(`📲 iOS: Immediate Notification sent.`);
                    sendPushNotification(target.fcmToken);
                }
            } 
            // 👉 Android/Xiaomi: ΔΕΝ στέλνουμε ακόμα. Περιμένουμε το Timeout.

            // Γ. ΧΡΟΝΟΜΕΤΡΟ (BACKUP / ANDROID DELAY)
            if (target.alarmTimeout) clearTimeout(target.alarmTimeout);

            target.alarmTimeout = setTimeout(() => {
                console.log(`⚠️ 1 Minute Passed. Checking acknowledgement for ${target.username}...`);
                // Στέλνουμε τώρα notification αν δεν το έχει δει
                if (target.fcmToken && target.fcmToken.length > 20 && target.fcmToken !== 'FULLY') {
                     console.log(`📲 Sending Delayed Notification.`);
                     sendPushNotification(target.fcmToken);
                }
                target.alarmTimeout = null; 
            }, ESCALATION_DELAY); 
        }
    });

    // 8. ALARM ACK (STOP)
    socket.on('alarm-ack', () => {
        const senderKey = Object.keys(activeUsers).find(key => activeUsers[key].socketId === socket.id);
        if(senderKey) {
            const user = activeUsers[senderKey];
            // Ακυρώνουμε το χρονόμετρο (το Android δεν θα λάβει ποτέ Notification αν το δει γρήγορα)
            if (user.alarmTimeout) {
                clearTimeout(user.alarmTimeout);
                user.alarmTimeout = null;
            }
            io.to(user.store).emit('alarm-receipt', { name: user.username });
        }
    });

    // 9. IOS INITIAL FORCE WAKE UP
    socket.on('ios-login', () => {
        console.log(`🍏 iOS Login Detected. Sending Force-Unlock Alarm in 2s...`);
        setTimeout(() => {
            socket.emit('test-alarm'); 
        }, 2000);
    });

}); // End IO Connection

// 10. KEEP ALIVE PULSE (Κάθε 10 Λεπτά)
setInterval(() => {
    console.log("💓 Sending 10-min Keep-Alive Pulse to all...");
    io.emit('keep-alive-pulse'); 
}, 600000); 

// CLEANUP LOOP
setInterval(() => {
    const now = Date.now();
    let storesToUpdate = new Set();
    Object.keys(activeUsers).forEach(key => {
        if (now - activeUsers[key].lastSeen > TIMEOUT_LIMIT) {
            if (activeUsers[key].alarmTimeout) clearTimeout(activeUsers[key].alarmTimeout);
            if (activeUsers[key].disconnectTimeout) clearTimeout(activeUsers[key].disconnectTimeout);
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

// ΚΑΝΟΝΙΚΗ ΕΙΔΟΠΟΙΗΣΗ ΚΛΗΣΗΣ
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

// 🔥 ΝΕΑ ΕΙΔΟΠΟΙΗΣΗ "ΝΑΥΑΓΟΣΩΣΤΗΣ" 🔥
function sendRescueNotification(token) {
    const message = {
        token: token,
        notification: { 
            title: "⚠️ ΑΠΟΣΥΝΔΕΘΗΚΕΣ!", 
            body: "Το BellGo έκλεισε λόγω αδράνειας/βίντεο. Πάτα εδώ για επανασύνδεση!" 
        },
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default" } } }, // Standard notification, no content-available needed here
        data: { url: "/", action: "reconnect" }
    };
    admin.messaging().send(message).catch(e => console.error("Rescue Push Failed:", e));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
