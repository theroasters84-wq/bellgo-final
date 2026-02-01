const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require("firebase-admin");

// --- ΡΥΘΜΙΣΗ FIREBASE ADMIN ---
// Το Render θα βρει το αρχείο επειδή το ανέβασες στα Secret Files
try {
    const serviceAccount = require("./serviceAccountKey.json");
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("✅ Firebase Admin initialized successfully!");
} catch (error) {
    console.error("❌ ERROR: Could not load serviceAccountKey.json. Make sure it is in Secret Files!", error);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

let activeUsers = {}; 

io.on('connection', (socket) => {
    
    // 1. ΣΥΝΔΕΣΗ (JOIN)
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
            fcmToken: data.token, // ΑΠΟΘΗΚΕΥΣΗ TOKEN
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

    // 3. TRIGGER ALARM (ΗΧΟΣ + ΔΟΝΗΣΗ)
    socket.on('trigger-alarm', (targetName) => {
        if (!socket.store || !targetName) return;
        
        console.log(`🔔 Alarm -> ${targetName}`); 

        const targetKey = `${socket.store}_${targetName}`;
        const targetUser = activeUsers[targetKey];

        if (targetUser) {
            // A. Στέλνουμε SOCKET (Για ανοιχτή εφαρμογή -> Ήχος)
            io.to(targetUser.socketId).emit('ring-bell');

            // B. Στέλνουμε FIREBASE (Για κλειστή εφαρμογή -> Δόνηση)
            if (targetUser.fcmToken) {
                const message = {
                    token: targetUser.fcmToken,
                    data: {
                        title: "🚨 ΚΛΗΣΗ",
                        body: "Σε καλούν από την εφαρμογή!",
                        url: "/",
                        type: "alarm"
                    },
                    android: { priority: "high" }
                };

                admin.messaging().send(message)
                    .then((res) => console.log('✅ Notification Sent:', res))
                    .catch((err) => console.error('❌ Notification Error:', err));
            } else {
                console.log("⚠️ No FCM Token found for this user.");
            }
        }
    });

    // 4. UPDATE TOKEN (Αν αλλάξει)
    socket.on('update-token', (data) => {
        if (socket.store && data.username && data.token) {
             const userKey = `${socket.store}_${data.username}`;
             if (activeUsers[userKey]) {
                 activeUsers[userKey].fcmToken = data.token;
             }
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
