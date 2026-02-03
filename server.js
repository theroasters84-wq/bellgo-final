const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require("firebase-admin");

// --- FIREBASE INIT ---
try {
    const serviceAccount = require("./serviceAccountKey.json");
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("✅ Firebase Admin initialized successfully!");
} catch (error) {
    console.error("❌ ERROR: Could not load serviceAccountKey.json", error);
}

const app = express();
const server = http.createServer(app);

// Ρυθμίσεις για να μην κόβει τη σύνδεση εύκολα στα κινητά
const io = new Server(server, { 
    cors: { origin: "*" },
    pingTimeout: 60000, // Περιμένει 60 δευτερόλεπτα πριν θεωρήσει ότι χάθηκε η σύνδεση
    pingInterval: 25000 // Στέλνει ping κάθε 25 δευτερόλεπτα
});

app.use(express.static(path.join(__dirname, 'public')));

// Αποθήκευση χρηστών στη μνήμη
let activeUsers = {}; 

io.on('connection', (socket) => {
    
    // --- 1. ΕΙΣΟΔΟΣ ---
    socket.on('join-store', (data) => {
        const cleanUser = (data.username || data.name || "").trim();
        const cleanStore = (data.storeName || "").trim().toLowerCase();
        
        if (!cleanStore || !cleanUser) return;

        const userKey = `${cleanStore}_${cleanUser}`;
        
        socket.join(cleanStore);
        socket.username = cleanUser; 
        socket.store = cleanStore;
        socket.role = data.role;

        // Αποθήκευση ή Ενημέρωση χρήστη
        activeUsers[userKey] = {
            socketId: socket.id,
            username: cleanUser, 
            role: data.role,
            store: cleanStore,
            fcmToken: data.token, // Token για ειδοποιήσεις
            lastSeen: Date.now(),
            status: "online"
        };

        console.log(`👤 Joined: ${cleanUser} | Store: ${cleanStore}`);
        updateStore(cleanStore);
    });

    // --- 2. UPDATE TOKEN ---
    socket.on('update-token', (data) => {
        if (socket.store && socket.username) {
            const userKey = `${socket.store}_${socket.username}`;
            if (activeUsers[userKey]) {
                activeUsers[userKey].fcmToken = data.token;
                console.log(`🔑 Token updated for: ${socket.username}`);
            }
        }
    });

    // --- 3. HEARTBEAT ---
    socket.on('heartbeat', () => {
        if (socket.store && socket.username) {
            const userKey = `${socket.store}_${socket.username}`;
            if (activeUsers[userKey]) {
                activeUsers[userKey].lastSeen = Date.now();
                
                // Αν ήταν "away" (πορτοκαλί), τον κάνουμε ξανά "online" (άσπρο)
                if (activeUsers[userKey].status === 'away') {
                    activeUsers[userKey].status = 'online';
                    activeUsers[userKey].socketId = socket.id;
                    updateStore(socket.store);
                }
            }
        }
    });

    // --- 4. TRIGGER ALARM ---
    socket.on('trigger-alarm', (targetName) => {
        if (!socket.store || !targetName) return;

        const targetKey = `${socket.store}_${targetName}`;
        const targetUser = activeUsers[targetKey];

        if (targetUser) {
            console.log(`🔔 Alarm to: ${targetName} (Status: ${targetUser.status})`);

            // A. Socket (αν είναι online και έχουμε ενεργό socket)
            if (targetUser.socketId) {
                io.to(targetUser.socketId).emit('ring-bell', { from: socket.username });
            }

            // B. FCM (Στέλνουμε ΠΑΝΤΑ για σιγουριά, ειδικά αν είναι background)
            if (targetUser.fcmToken) {
                const message = {
                    token: targetUser.fcmToken,
                    data: {
                        type: "alarm", // Κλειδί για να ανοίξει κόκκινη οθόνη
                        sender: socket.username,
                        time: new Date().toISOString()
                    },
                    // Ρυθμίσεις για επιθετική ειδοποίηση (Android)
                    android: {
                        priority: "high",
                        notification: {
                            channelId: "fcm_default_channel", // Πρέπει να ταιριάζει με τον client
                            priority: "max",
                            visibility: "public",
                            sound: "default",
                            defaultSound: true,
                            defaultVibrateTimings: true,
                            title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ",
                            body: "ΠΑΤΑ ΕΔΩ ΓΙΑ ΑΠΑΝΤΗΣΗ"
                        }
                    },
                    // Ρυθμίσεις για iOS
                    apns: {
                        payload: {
                            aps: {
                                sound: "default",
                                badge: 1,
                                "content-available": 1
                            }
                        }
                    }
                };

                admin.messaging().send(message)
                    .then(() => console.log("✅ FCM sent"))
                    .catch((err) => console.error('❌ FCM Error:', err));
            }
        }
    });

    // --- 5. ACCEPT ALARM ---
    socket.on('alarm-accepted', () => {
        if (socket.store && socket.username) {
            console.log(`✅ Alarm Accepted: ${socket.username}`);
            io.to(socket.store).emit('staff-accepted-alarm', { username: socket.username });
        }
    });

    // --- 6. CHAT ---
    socket.on('chat-message', (msgData) => {
        if (socket.store && socket.username) {
            io.to(socket.store).emit('chat-message', {
                sender: socket.username,
                role: socket.role,
                text: msgData.text
            });
        }
    });

    // --- 7. MANUAL LOGOUT (ΕΝΗΜΕΡΩΜΕΝΟ ΓΙΑ ΤΟ "Χ") ---
    socket.on('manual-logout', (data) => {
        // Ελέγχουμε αν μας έστειλαν δεδομένα ΚΑΙ αν υπάρχει targetUser (Περίπτωση Admin 'X')
        if (data && data.targetUser) {
            // Πρέπει αυτός που στέλνει την εντολή να είναι συνδεδεμένος σε κατάστημα
            if (!socket.store) return;

            const cleanTarget = data.targetUser.trim();
            const targetKey = `${socket.store}_${cleanTarget}`;
            
            // Αν ο χρήστης υπάρχει στη μνήμη, τον διαγράφουμε
            if (activeUsers[targetKey]) {
                console.log(`👮 Admin removed user: ${cleanTarget}`);
                delete activeUsers[targetKey];
                updateStore(socket.store); // Ενημερώνουμε τη λίστα για να φύγει το όνομα
            }
            return; // Σταματάμε εδώ
        }

        // Αλλιώς, αν δεν έχει targetUser, είναι απλό Logout του εαυτού μας
        if (socket.store && socket.username) {
            const userKey = `${socket.store}_${socket.username}`;
            console.log(`🚪 Logout: ${socket.username}`);
            delete activeUsers[userKey];
            updateStore(socket.store);
        }
    });

    // --- 8. DISCONNECT (BACKGROUND) ---
    socket.on('disconnect', () => {
        if (socket.store && socket.username) {
            const userKey = `${socket.store}_${socket.username}`;
            const user = activeUsers[userKey];
            
            if (user && user.socketId === socket.id) {
                console.log(`zzz Background: ${socket.username}`);
                user.socketId = null;
                user.status = "away"; // Τον βάζουμε σε Background (Πορτοκαλί/Γκρι)
                updateStore(socket.store);
            }
        }
    });
});

// --- ΕΞΥΠΝΟΣ ΚΑΘΑΡΙΣΜΟΣ (CLEANUP) ---
// Τρέχει κάθε 30 δευτερόλεπτα
setInterval(() => {
    const now = Date.now();
    for (const key in activeUsers) {
        const user = activeUsers[key];
        const isOnline = user.status === 'online';
        const isAway = user.status === 'away';

        // 1. Αν είναι "Online" αλλά δεν μίλησε για 2 λεπτά -> Γίνεται "Away" (όχι delete)
        if (isOnline && (now - user.lastSeen > 2 * 60 * 1000)) {
            console.log(`⚠️ User ${user.username} timed out -> Setting to Away`);
            user.status = 'away';
            user.socketId = null;
            updateStore(user.store);
        }
        
        // 2. Αν είναι "Away" (Background), τον κρατάμε για 12 ΩΡΕΣ!
        // Διαγράφεται μόνο αν περάσουν 12 ώρες χωρίς σημείο ζωής.
        else if (isAway && (now - user.lastSeen > 12 * 60 * 60 * 1000)) {
            console.log(`🗑️ Deleting inactive user: ${user.username}`);
            const storeToUpdate = user.store;
            delete activeUsers[key];
            updateStore(storeToUpdate);
        }
    }
}, 30000); 

function updateStore(storeName) {
    if(!storeName) return;
    const staff = Object.values(activeUsers).filter(u => u.store === storeName);
    const formattedStaff = staff.map(u => ({
        name: u.username,        
        username: u.username,  
        role: u.role,
        status: u.status 
    }));
    io.to(storeName).emit('staff-list-update', formattedStaff);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
