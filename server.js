const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require('firebase-admin');

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

io.on('connection', (socket) => {
    console.log(`[+] New Connection: ${socket.id}`);

    socket.on('join-store', (data) => {
        const cleanStoreName = data.storeName.trim();
        socket.join(cleanStoreName); 
        
        activeUsers[socket.id] = {
            id: socket.id,
            username: data.username,
            role: data.role,
            store: cleanStoreName,
            fcmToken: data.fcmToken
        };
        console.log(`👤 ${data.username} joined ${cleanStoreName}`);
        updateAdmins(cleanStoreName);
    });

    // ΝΕΑ ΕΝΤΟΛΗ: Ο ADMIN ΖΗΤΑΕΙ ΛΙΣΤΑ ΧΕΙΡΟΚΙΝΗΤΑ
    socket.on('get-staff-list', () => {
        const user = activeUsers[socket.id];
        if (user && user.role === 'admin') {
            updateAdmins(user.store);
        }
    });

    socket.on('trigger-alarm', (targetId) => {
        io.to(targetId).emit('ring-bell', { from: 'Admin' });
        const user = activeUsers[targetId];
        if (user && user.fcmToken) sendPushNotification(user.fcmToken);
    });

    socket.on('disconnect', () => {
        const user = activeUsers[socket.id];
        if (user) {
            const storeName = user.store;
            delete activeUsers[socket.id];
            updateAdmins(storeName);
        }
    });

    function updateAdmins(storeName) {
        const storeStaff = Object.values(activeUsers).filter(u => u.store === storeName && u.role !== 'admin');
        io.to(storeName).emit('update-staff-list', storeStaff);
    }
});

function sendPushNotification(token) {
    const message = {
        token: token,
        notification: { title: "🚨 ΚΛΗΣΗ", body: "Έλα Κουζίνα!" },
        android: { priority: "high", notification: { sound: "default" } },
        data: { url: "/", action: "alarm" }
    };
    admin.messaging().send(message).catch(e => {});
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
