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

io.on('connection', (socket) => {
    console.log(`[+] New Connection: ${socket.id}`);

    socket.on('join-store', (data) => {
        // Καθαρίζουμε το όνομα μαγαζιού (Trim) για να μην έχει κενά
        const cleanStoreName = data.storeName.trim();
        
        socket.join(cleanStoreName); 
        
        activeUsers[socket.id] = {
            id: socket.id,
            username: data.username,
            role: data.role, // 'admin', 'waiter', 'driver'
            store: cleanStoreName,
            fcmToken: data.fcmToken
        };

        console.log(`👤 ${data.username} (${data.role}) joined ${cleanStoreName}`);

        // ΕΝΗΜΕΡΩΣΗ: Στέλνουμε τη νέα λίστα σε ΟΛΟΥΣ τους Admin του μαγαζιού
        updateAdmins(cleanStoreName);
    });

    socket.on('trigger-alarm', (targetId) => {
        console.log(`🔔 Alarm for: ${targetId}`);
        io.to(targetId).emit('ring-bell', { from: 'Admin' });

        const user = activeUsers[targetId];
        if (user && user.fcmToken) sendPushNotification(user.fcmToken);
    });

    socket.on('disconnect', () => {
        const user = activeUsers[socket.id];
        if (user) {
            const storeName = user.store;
            delete activeUsers[socket.id];
            updateAdmins(storeName); // Ενημέρωση λίστας κατά την έξοδο
        }
    });

    function updateAdmins(storeName) {
        // Φιλτράρουμε ΟΛΟΥΣ εκτός από τους Admin
        const storeStaff = Object.values(activeUsers).filter(u => u.store === storeName && u.role !== 'admin');
        
        console.log(`📋 Sending List to ${storeName}:`, storeStaff.length, "staff members.");
        
        // Στέλνουμε τη λίστα στο δωμάτιο (οι clients θα αποφασίσουν αν θα τη δείξουν)
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
