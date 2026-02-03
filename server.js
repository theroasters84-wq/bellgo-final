const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require("firebase-admin");

// --- FIREBASE INIT ---
try {
    // ⚠️ Σιγουρέψου ότι το serviceAccountKey.json είναι στον ίδιο φάκελο
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
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

// Αποθήκευση χρηστών στη μνήμη
let activeUsers = {}; 

io.on('connection', (socket) => {
    
    // --- 1. ΕΙΣΟΔΟΣ ΧΡΗΣΤΗ ---
    socket.on('join-store', (data) => {
        const cleanUser = (data.username || data.name || "").trim();
        const cleanStore = (data.storeName || "").trim().toLowerCase();
        
        if (!cleanStore || !cleanUser) return;

        const userKey = `${cleanStore}_${cleanUser}`;
        
        socket.join(cleanStore);
        socket.username = cleanUser; 
        socket.store = cleanStore;
        socket.role = data.role;

        // Αποθήκευση/Ενημέρωση χρήστη
        activeUsers[userKey] = {
            socketId: socket.id,
            username: cleanUser, 
            role: data.role,
            store: cleanStore,
            fcmToken: data.token, // Αποθηκεύουμε το Token για τα Notifications
            lastSeen: Date.now(),
            status: "online"
        };

        console.log(`👤 Joined: ${cleanUser} | Role: ${data.role} | Store: ${cleanStore}`);
        updateStore(cleanStore);
    });

    // --- 2. ΕΝΗΜΕΡΩΣΗ TOKEN (Αν αλλάξει ή δοθεί αργότερα) ---
    socket.on('update-token', (data) => {
        if (socket.store && socket.username) {
            const userKey = `${socket.store}_${socket.username}`;
            if (activeUsers[userKey]) {
                activeUsers[userKey].fcmToken = data.token;
                console.log(`🔑 Token updated for: ${socket.username}`);
            }
        }
    });

    // --- 3. HEARTBEAT (Keep-Alive) ---
    socket.on('heartbeat', () => {
        if (socket.store && socket.username) {
            const userKey = `${socket.store}_${socket.username}`;
            if (activeUsers[userKey]) {
                activeUsers[userKey].lastSeen = Date.now();
                // Αν ήταν "away" (background), τον επαναφέρουμε σε "online"
                if (activeUsers[userKey].status === 'away') {
                    activeUsers[userKey].status = 'online';
                    activeUsers[userKey].socketId = socket.id; // Refresh socket ID
                    updateStore(socket.store);
                }
            }
        }
    });

    // --- 4. ΚΛΗΣΗ (ALARM) - ΤΟ ΣΗΜΑΝΤΙΚΟ ΚΟΜΜΑΤΙ ---
    socket.on('trigger-alarm', (targetName) => {
        if (!socket.store || !targetName) return;

        const targetKey = `${socket.store}_${targetName}`;
        const targetUser = activeUsers[targetKey];

        if (targetUser) {
            console.log(`🔔 Alarm triggered by ${socket.username} for: ${targetName}`);

            // A. Άμεση ειδοποίηση μέσω Socket (αν είναι ανοιχτή η εφαρμογή)
            if (targetUser.socketId) {
                io.to(targetUser.socketId).emit('ring-bell', { from: socket.username });
            }

            // B. Αποστολή "Επιθετικού" Notification (FCM)
            if (targetUser.fcmToken) {
                const message = {
                    token: targetUser.fcmToken,
                    notification: {
                        title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ",
                        body: "Σε χρειάζονται αμέσως! Πάτα ΕΔΩ."
                    },
                    data: {
                        type: "alarm", // Κλειδί για να ανοίξει η κόκκινη οθόνη στον Client v28
                        sender: socket.username
                    },
                    // Ρυθμίσεις για Android (Heads-up / High Priority)
                    android: {
                        priority: "high",
                        notification: {
                            channelId: "fcm_default_channel", // ΠΡΕΠΕΙ ΝΑ ΤΑΙΡΙΑΖΕΙ ΜΕ ΤΟΝ CLIENT
                            priority: "max",
                            visibility: "public",
                            sound: "default",
                            defaultSound: true,
                            defaultVibrateTimings: true
                        }
                    },
                    // Ρυθμίσεις για iOS
                    apns: {
                        payload: {
                            aps: {
                                sound: "default",
                                badge: 1,
                                "content-available": 1 // Background fetch
                            }
                        }
                    }
                };

                admin.messaging().send(message)
                    .then(() => console.log("✅ FCM sent successfully"))
                    .catch((err) => console.error('❌ FCM Error:', err));
            }
        }
    });

    // --- 5. ΑΠΟΔΟΧΗ ΚΛΗΣΗΣ (ΕΡΧΕΤΑΙ) ---
    socket.on('alarm-accepted', () => {
        if (socket.store && socket.username) {
            console.log(`✅ Alarm accepted by: ${socket.username}`);
            // Ενημερώνουμε το κατάστημα ότι ο διανομέας έρχεται
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

    // --- 7. ΧΕΙΡΟΚΙΝΗΤΟ LOGOUT (EXIT) ---
    socket.on('manual-logout', () => {
        if (socket.store && socket.username) {
            const userKey = `${socket.store}_${socket.username}`;
            console.log(`🚪 Manual Logout: ${socket.username}`);
            delete activeUsers[userKey]; // Διαγραφή από τη λίστα
            updateStore(socket.store);
        }
    });

    // --- 8. ΑΠΟΣΥΝΔΕΣΗ (BACKGROUND MODE) ---
    socket.on('disconnect', () => {
        if (socket.store && socket.username) {
            const userKey = `${socket.store}_${socket.username}`;
            const user = activeUsers[userKey];
            
            // Αν είναι ο ίδιος χρήστης (και όχι παλιό socket)
            if (user && user.socketId === socket.id) {
                console.log(`📡 Background (Disconnect): ${socket.username}`);
                user.socketId = null; // Το Socket έκλεισε
                user.status = "away"; // Ένδειξη ότι είναι στο παρασκήνιο
                updateStore(socket.store);
            }
        }
    });
});

// --- ΑΥΤΟΜΑΤΟΣ ΚΑΘΑΡΙΣΜΟΣ (CLEANUP) ---
// Τρέχει κάθε 60 δευτερόλεπτα
setInterval(() => {
    const now = Date.now();
    for (const key in activeUsers) {
        const user = activeUsers[key];
        // Αν έχουν περάσει 15 λεπτά (900000 ms) από το τελευταίο heartbeat
        if (now - user.lastSeen > 15 * 60 * 1000) { 
            console.log(`🧹 Cleanup: Removing inactive user ${user.username}`);
            const storeToUpdate = user.store;
            delete activeUsers[key];
            updateStore(storeToUpdate);
        }
    }
}, 60000);

// Συνάρτηση ενημέρωσης λίστας Admin
function updateStore(storeName) {
    if(!storeName) return;
    // Φιλτράρουμε τους χρήστες του συγκεκριμένου καταστήματος
    const staff = Object.values(activeUsers).filter(u => u.store === storeName);
    
    // Στέλνουμε μόνο τα απαραίτητα δεδομένα
    const formattedStaff = staff.map(u => ({
        name: u.username,       
        username: u.username,  
        role: u.role,
        status: u.status 
    }));
    
    io.to(storeName).emit('staff-list-update', formattedStaff);
}

// Εκκίνηση Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
