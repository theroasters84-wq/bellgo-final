const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require("firebase-admin");

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
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

let activeUsers = {}; 

io.on('connection', (socket) => {
    
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
            status: "online" // Νέο status
        };

        console.log(`👤 Joined: ${cleanUser} | Status: Online`);
        updateStore(cleanStore);
    });

    socket.on('trigger-alarm', (targetName) => {
        if (!socket.store || !targetName) return;

        const targetKey = `${socket.store}_${targetName}`;
        const targetUser = activeUsers[targetKey];

        if (targetUser) {
            // 1. Προσπάθεια μέσω Socket (αν είναι online)
            if (targetUser.socketId) {
                io.to(targetUser.socketId).emit('ring-bell', { from: socket.username });
            }

            // 2. Πάντα στέλνουμε FCM αν υπάρχει Token (για το YouTube/Background)
            if (targetUser.fcmToken) {
                const message = {
                    token: targetUser.fcmToken,
                    // Προσθήκη notification για να "ξυπνήσει" το iOS/Android
                    notification: {
                        title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ",
                        body: "Σε χρειάζονται αμέσως! Πάτα για άνοιγμα."
                    },
                    data: {
                        url: "/",
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

    // Χειροκίνητο Logout (Όταν πατάει το κουμπί EXIT)
    socket.on('manual-logout', () => {
        if (socket.store && socket.username) {
            const userKey = `${socket.store}_${socket.username}`;
            console.log(`🚪 Manual Logout: ${socket.username}`);
            delete activeUsers[userKey];
            updateStore(socket.store);
        }
    });

    socket.on('disconnect', () => {
        if (socket.store && socket.username) {
            const userKey = `${socket.store}_${socket.username}`;
            const user = activeUsers[userKey];
            
            if (user && user.socketId === socket.id) {
                console.log(`📡 Background: ${socket.username} (Socket Closed)`);
                // ΔΕΝ τον διαγράφουμε, απλά του αφαιρούμε το socketId
                user.socketId = null;
                user.status = "away"; 
                updateStore(socket.store);
            }
        }
    });

    // ... υπόλοιπα events (heartbeat, chat, alarm-accepted)
}); 

function updateStore(storeName) {
    if(!storeName) return;
    const staff = Object.values(activeUsers).filter(u => u.store === storeName);
    const formattedStaff = staff.map(u => ({
        name: u.username,      
        username: u.username,  
        role: u.role,
        status: u.status // Στέλνουμε το status για να ξέρει ο Admin
    }));
    io.to(storeName).emit('staff-list-update', formattedStaff);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
