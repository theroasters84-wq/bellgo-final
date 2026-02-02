const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require("firebase-admin");

// --- FIREBASE INIT ---
try {
    // Στο Render πρέπει να έχεις ανεβάσει αυτό το αρχείο στα Secret Files
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

// Εδώ αποθηκεύουμε τους χρήστες
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
            fcmToken: data.token, 
            lastSeen: Date.now(),
            status: "online" // Αρχικό status
        };

        console.log(`👤 Joined: ${cleanUser} | Status: Online`);
        updateStore(cleanStore);
    });

    // --- 2. ΕΝΗΜΕΡΩΣΗ TOKEN (Για Native Apps) ---
    socket.on('update-token', (data) => {
        if (socket.store && socket.username) {
            const userKey = `${socket.store}_${socket.username}`;
            if (activeUsers[userKey]) {
                activeUsers[userKey].fcmToken = data.token;
                console.log(`🔑 Token updated for: ${socket.username}`);
            }
        }
    });

    // --- 3. HEARTBEAT (Κρατάει τον χρήστη ζωντανό) ---
    socket.on('heartbeat', () => {
        if (socket.store && socket.username) {
            const userKey = `${socket.store}_${socket.username}`;
            if (activeUsers[userKey]) {
                activeUsers[userKey].lastSeen = Date.now();
                // Αν ήταν away, τον ξανακάνουμε online
                if (activeUsers[userKey].status === 'away') {
                    activeUsers[userKey].status = 'online';
                    // Επανασύνδεση socketId αν είχε χαθεί
                    activeUsers[userKey].socketId = socket.id;
                    updateStore(socket.store);
                }
            }
        }
    });

    // --- 4. ΚΛΗΣΗ (ALARM) ---
    socket.on('trigger-alarm', (targetName) => {
        if (!socket.store || !targetName) return;

        const targetKey = `${socket.store}_${targetName}`;
        const targetUser = activeUsers[targetKey];

        if (targetUser) {
            console.log(`🔔 Alarm sent to: ${targetName}`);

            // A. Προσπάθεια μέσω Socket (αν είναι online)
            if (targetUser.socketId) {
                io.to(targetUser.socketId).emit('ring-bell', { from: socket.username });
            }

            // B. Πάντα στέλνουμε FCM (Notification)
            if (targetUser.fcmToken) {
                const message = {
                    token: targetUser.fcmToken,
                    notification: {
                        title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ",
                        body: "Σε χρειάζονται αμέσως! Πάτα για άνοιγμα."
                    },
                    data: {
                        url: "/?type=alarm", // Παράμετρος για να ανοίγει κατευθείαν σειρήνα
                        type: "alarm"
                    },
                    android: { priority: "high" },
                    apns: {
                        payload: {
                            aps: { sound: "default", badge: 1 }
                        }
                    }
                };
                admin.messaging().send(message).catch((err) => console.error('❌ FCM Error:', err));
            }
        }
    });

    // --- 5. ΑΠΟΔΟΧΗ ΚΛΗΣΗΣ (ΕΡΧΕΤΑΙ) ---
    socket.on('alarm-accepted', () => {
        if (socket.store && socket.username) {
            console.log(`✅ Accepted by: ${socket.username}`);
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
            delete activeUsers[userKey]; // Εδώ διαγράφουμε τελείως
            updateStore(socket.store);
        }
    });

    // --- 8. ΑΠΟΣΥΝΔΕΣΗ (BACKGROUND MODE) ---
    socket.on('disconnect', () => {
        if (socket.store && socket.username) {
            const userKey = `${socket.store}_${socket.username}`;
            const user = activeUsers[userKey];
            
            if (user && user.socketId === socket.id) {
                console.log(`📡 Background: ${socket.username} (Socket Closed)`);
                user.socketId = null; // Χάσαμε τη σύνδεση
                user.status = "away"; // Τον βάζουμε σε "Background"
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
    const staff = Object.values(activeUsers).filter(u => u.store === storeName);
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
