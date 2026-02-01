const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require("firebase-admin");

// --- ΡΥΘΜΙΣΗ FIREBASE ADMIN ---
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
    
    // 1. ΣΥΝΔΕΣΗ
    socket.on('join-store', (data) => {
        const cleanUser = (data.username || data.name || "").trim();
        const cleanStore = (data.storeName || "").trim().toLowerCase();
        
        if (!cleanStore || !cleanUser) return;

        const userKey = `${cleanStore}_${cleanUser}`;
        
        socket.join(cleanStore);
        // Αποθηκεύουμε τα στοιχεία στο socket για να τα βλέπει το Chat
        socket.username = cleanUser; 
        socket.store = cleanStore;
        socket.role = data.role;

        activeUsers[userKey] = {
            socketId: socket.id,
            username: cleanUser, 
            role: data.role,
            store: cleanStore,
            fcmToken: data.token, 
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

    // 3. TRIGGER ALARM (ΔΟΝΗΣΗ)
    socket.on('trigger-alarm', (targetName) => {
        if (!socket.store || !targetName) return;
        
        console.log(`🔔 Alarm -> ${targetName}`); 

        const targetKey = `${socket.store}_${targetName}`;
        const targetUser = activeUsers[targetKey];

        if (targetUser) {
            io.to(targetUser.socketId).emit('ring-bell'); // Ήχος (Ανοιχτό)

            // Firebase Data Message (Κλειστό -> Δόνηση)
            if (targetUser.fcmToken) {
                const message = {
                    token: targetUser.fcmToken,
                    data: {
                        title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ",
                        body: "Πάτα για αποδοχή!",
                        url: "/",
                        type: "alarm"
                    },
                    android: { priority: "high" }
                };

                admin.messaging().send(message)
                    .then((res) => console.log('✅ FCM Sent:', res))
                    .catch((err) => console.error('❌ FCM Error:', err));
            }
        }
    });

    // 4. UPDATE TOKEN
    socket.on('update-token', (data) => {
        if (socket.store && data.username && data.token) {
             const userKey = `${socket.store}_${data.username}`;
             if (activeUsers[userKey]) {
                 activeUsers[userKey].fcmToken = data.token;
                 console.log(`🔄 Token updated for ${data.username}`);
             }
        }
    });

    // 5. CHAT MESSAGE (ΑΥΤΟ ΕΛΕΙΠΕ!)
    socket.on('chat-message', (msgData) => {
        if (socket.store && socket.username) {
            // Στέλνουμε το μήνυμα σε ΟΛΟΥΣ στο δωμάτιο (store)
            io.to(socket.store).emit('chat-message', {
                sender: socket.username,
                role: socket.role,
                text: msgData.text
            });
        }
    });

    // 6. DISCONNECT
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
