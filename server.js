const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

// --- 1. FIREBASE ADMIN SETUP (ΤΟ ΠΡΟΣΘΕΣΑΜΕ) ---
const admin = require("firebase-admin");

// Βεβαιώσου ότι το αρχείο αυτό υπάρχει δίπλα στο server.js
// Αν το λένε αλλιώς, άλλαξε το όνομα εδώ.
const serviceAccount = require("./serviceAccountKey.json"); 

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
// ----------------------------------------------

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

let activeUsers = {}; 

io.on('connection', (socket) => {
    
    // 1. ΣΥΝΔΕΣΗ ΧΡΗΣΤΗ
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
            // --- 2. ΑΠΟΘΗΚΕΥΣΗ TOKEN (ΤΟ ΠΡΟΣΘΕΣΑΜΕ) ---
            fcmToken: data.token, // Εδώ αποθηκεύουμε το διαβατήριο για το Firebase
            lastSeen: Date.now()
        };

        console.log(`👤 Joined: ${cleanUser} (${data.role}) @ ${cleanStore} [Token: ${data.token ? 'YES' : 'NO'}]`);
        updateStore(cleanStore);
    });

    // 2. HEARTBEAT
    socket.on('heartbeat', () => {
        if (socket.store && socket.username) {
            const userKey = `${socket.store}_${socket.username}`;
            if (activeUsers[userKey]) activeUsers[userKey].lastSeen = Date.now();
        }
    });

    // 3. TRIGGER ALARM (ΕΔΩ ΕΙΝΑΙ Η ΜΕΓΑΛΗ ΑΛΛΑΓΗ)
    socket.on('trigger-alarm', (targetName) => {
        if (!socket.store || !targetName) return;
        
        console.log(`🔔 Alarm triggered for: ${targetName}`); 

        const targetKey = `${socket.store}_${targetName}`;
        const targetUser = activeUsers[targetKey];

        if (targetUser) {
            // Α. Στέλνουμε Socket (Για ανοιχτή εφαρμογή - Ήχος)
            io.to(targetUser.socketId).emit('ring-bell');

            // Β. Στέλνουμε FIREBASE NOTIFICATION (Για κλειστή εφαρμογή - Δόνηση)
            if (targetUser.fcmToken) {
                const message = {
                    token: targetUser.fcmToken,
                    data: {
                        title: "🚨 ΚΛΗΣΗ ΑΠΟ ΚΟΥΖΙΝΑ",
                        body: "Έλα γρήγορα!",
                        url: "/",     // Για να ανοίξει το App
                        type: "alarm" // Για να ξέρει το Service Worker τι να κάνει
                    },
                    android: {
                        priority: "high" // Σημαντικό για να ξυπνήσει το κινητό
                    }
                };

                admin.messaging().send(message)
                    .then((response) => {
                        console.log('✅ FCM sent successfully:', response);
                    })
                    .catch((error) => {
                        console.log('❌ Error sending FCM:', error);
                    });
            } else {
                console.log("⚠️ User has no Token (App might be closed perfectly or denied permission)");
            }

        } else {
            console.log("❌ User not found");
        }
    });

    // 4. DISCONNECT
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
    
    // ΝΕΟ: Ενημέρωση Token (αν αλλάξει ενώ είναι συνδεδεμένος)
    socket.on('update-token', (data) => {
        if (socket.store && data.username && data.token) {
             const userKey = `${socket.store}_${data.username}`;
             if (activeUsers[userKey]) {
                 activeUsers[userKey].fcmToken = data.token;
                 console.log(`🔄 Token updated for ${data.username}`);
             }
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
