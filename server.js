const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require('firebase-admin');

// --- FIREBASE SETUP ---
try {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log("✅ Firebase Connected");
} catch (error) { console.error("❌ Firebase Error:", error.message); }

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

// ΕΔΩ ΚΡΑΤΑΜΕ ΤΟΥΣ ΧΡΗΣΤΕΣ: { socketId: { name, role, store, token } }
let activeUsers = {}; 

io.on('connection', (socket) => {
    console.log(`[+] New Connection: ${socket.id}`);

    // 1. ΕΙΣΟΔΟΣ ΧΡΗΣΤΗ
    socket.on('join-store', (data) => {
        socket.join(data.storeName); // Μπαίνει στο "Δωμάτιο" του μαγαζιού
        
        // Αποθηκεύουμε τα στοιχεία του
        activeUsers[socket.id] = {
            id: socket.id,
            username: data.username,
            role: data.role,
            store: data.storeName,
            fcmToken: data.fcmToken
        };

        console.log(`👤 ${data.username} (${data.role}) joined ${data.storeName}`);

        // Ενημερώνουμε τους Admin του ΙΔΙΟΥ μαγαζιού να φτιάξουν κουμπάκια
        updateAdmins(data.storeName);
    });

    // 2. ΚΛΗΣΗ (ΣΤΟΧΕΥΜΕΝΗ)
    socket.on('trigger-alarm', (targetId) => {
        console.log(`🔔 Alarm trigged for: ${targetId}`);
        
        // Στέλνουμε εντολή ΜΟΝΟ στον συγκεκριμένο χρήστη
        io.to(targetId).emit('ring-bell', { from: 'Admin' });

        // Στέλνουμε και Firebase Notification (αν έχει Token)
        const user = activeUsers[targetId];
        if (user && user.fcmToken) {
            sendPushNotification(user.fcmToken);
        }
    });

    // 3. ΑΠΟΣΥΝΔΕΣΗ
    socket.on('disconnect', () => {
        const user = activeUsers[socket.id];
        if (user) {
            console.log(`[-] ${user.username} left.`);
            const storeName = user.store;
            delete activeUsers[socket.id]; // Τον σβήνουμε
            updateAdmins(storeName); // Ενημερώνουμε τους Admin ότι έφυγε
        }
    });

    // ΒΟΗΘΗΤΙΚΗ: Στέλνει τη λίστα προσωπικού στους Admins
    function updateAdmins(storeName) {
        // Βρες όλους τους χρήστες αυτού του μαγαζιού
        const storeStaff = Object.values(activeUsers).filter(u => u.store === storeName && u.role !== 'admin');
        // Στείλε τη λίστα σε όλους στο δωμάτιο (οι Admins θα την ακούσουν)
        io.to(storeName).emit('update-staff-list', storeStaff);
    }
});

// FIREBASE FUNCTION
function sendPushNotification(token) {
    const message = {
        token: token,
        notification: { title: "🚨 ΕΠΕΙΓΟΥΣΑ ΚΛΗΣΗ", body: "Σε καλούν από την κουζίνα!" },
        android: { priority: "high", notification: { sound: "default" } },
        data: { url: "/", action: "alarm" }
    };
    admin.messaging().send(message).catch(e => console.log("Push Failed:", e.message));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
