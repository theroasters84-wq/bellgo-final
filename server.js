const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require("firebase-admin");

// --- ΡΥΘΜΙΣΗ FIREBASE ADMIN ---
try {
    // Βεβαιώσου ότι το serviceAccountKey.json είναι στα Secret Files του Render
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

let activeUsers = {}; 

io.on('connection', (socket) => {
    
    // 1. ΣΥΝΔΕΣΗ
    socket.on('join-store', (data) => {
        const rawName = data.username || data.name || "";
        const cleanUser = rawName.trim();
        const cleanStore = data.storeName ? data.storeName.trim().toLowerCase() : "";
        
        if (!cleanStore || !cleanUser) return;

        const userKey = `${cleanStore}_${cleanUser}`;
        
        socket.join(cleanStore);
        socket.username = cleanUser; 
        socket.store = cleanStore;
        socket.role = data.role;

        activeUsers[userKey] = {
            socketId: socket.id,
            username: cleanUser, 
            role: data.role,
            store: cleanStore,
            fcmToken: data.token, // Το διαβατήριο για ειδοποιήσεις
            lastSeen: Date.now()
        };

        console.log(`👤 Joined: ${cleanUser} | Token: ${data.token ? '✅' : '❌'}`);
        updateStore(cleanStore);
    });

    // 2. HEARTBEAT
    socket.on('heartbeat', () => {
        if (socket.store && socket.username) {
            const userKey = `${socket.store}_${socket.username}`;
            if (activeUsers[userKey]) activeUsers[userKey].lastSeen = Date.now();
        }
    });

    // 3. TRIGGER ALARM (Η ΚΡΙΣΙΜΗ ΑΛΛΑΓΗ ΓΙΑ ΤΗ ΔΟΝΗΣΗ)
    socket.on('trigger-alarm', (targetName) => {
        if (!socket.store || !targetName) return;
        
        console.log(`🔔 Alarm -> ${targetName}`); 

        const targetKey = `${socket.store}_${targetName}`;
        const targetUser = activeUsers[targetKey];

        if (targetUser) {
            // A. SOCKET (Αν η εφαρμογή είναι ανοιχτή -> Ήχος)
            io.to(targetUser.socketId).emit('ring-bell');

            // B. FIREBASE (Αν η εφαρμογή είναι κλειστή -> Δόνηση)
            if (targetUser.fcmToken) {
                const message = {
                    token: targetUser.fcmToken,
                    // ΣΗΜΑΝΤΙΚΟ: Στέλνουμε ΜΟΝΟ data (όχι notification object)
                    // Αυτό αναγκάζει το Service Worker να αναλάβει δράση και να δονηθεί.
                    data: {
                        title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ",
                        body: "Πάτα για αποδοχή!",
                        url: "/",
                        type: "alarm"
                    },
                    android: {
                        priority: "high" // Υψηλή προτεραιότητα για να ξυπνήσει το κινητό
                    }
                };

                admin.messaging().send(message)
                    .then((res) => console.log('✅ FCM (Data Only) Sent:', res))
                    .catch((err) => console.error('❌ FCM Error:', err));
            } else {
                console.log("⚠️ No FCM Token for this user.");
            }
        }
    });

    // 4. UPDATE TOKEN
    socket.on('update-token', (data) => {
        if (socket.store && data.username && data.token) {
             const userKey = `${socket.store}_${data.username}`;
             if (activeUsers[userKey]) activeUsers[userKey].fcmToken = data.token;
        }
    });

    // 5. DISCONNECT
    socket.on('disconnect', () => {
        if (socket.store && socket.username) {
            const userKey = `${socket.store}_${socket.username}`;
            setTimeout(() => {
                const user = activeUsers[userKey];
                if (user && user.socketId === socket.id) { 
                    delete activeUsers[userKey];
                    updateStore(socket.store);
                }
            }, 5000);
        }
    });
}); 

function updateStore(storeName) {
    if(!storeName) return;
    const staff = Object.values(activeUsers).filter(u => u.store === storeName);
    const formattedStaff = staff.map(u => ({
        name: u.username,      
        username: u.username,  
        role: u.role
    }));
    io.to(storeName).emit('staff-list-update', formattedStaff);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
