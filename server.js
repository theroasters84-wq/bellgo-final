const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require('firebase-admin');

// --- 1. ΦΟΡΤΩΣΗ ΚΛΕΙΔΙΟΥ ---
// Προσοχή: Στο Render αυτό το αρχείο δημιουργείται από τα "Secret Files"
// Στο PC σου πρέπει να το έχεις στον φάκελο (αλλά να είναι γκρι στο gitignore!)
try {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("✅ [SYSTEM] Firebase Admin συνδέθηκε επιτυχώς.");
} catch (error) {
    console.error("❌ [ERROR] Το serviceAccountKey.json λείπει ή είναι λάθος!", error.message);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

let fcmTokens = {}; // Εδώ αποθηκεύουμε τα Tokens των κινητών

io.on('connection', (socket) => {
    console.log(`[CONNECT] Νέα σύνδεση: ${socket.id}`);

    // --- ΒΗΜΑ 1: Ο ΔΕΚΤΗΣ ΣΤΕΛΝΕΙ ΤΟ TOKEN ΤΟΥ ---
    socket.on('join-store', (data) => {
        socket.join(data.storeName);
        
        // Καταγραφή στοιχείων
        console.log(`[LOGIN] User: ${data.username} | Role: ${data.role}`);

        // ΕΛΕΓΧΟΣ: Μας έστειλε Token για Firebase;
        if (data.fcmToken) {
            fcmTokens[socket.id] = data.fcmToken;
            console.log(`📲 [TOKEN] Λήφθηκε FCM Token από ${data.username}: ${data.fcmToken.substring(0, 15)}...`);
        } else {
            console.log(`⚠️ [TOKEN] Ο χρήστης ${data.username} ΔΕΝ έστειλε FCM Token (Ίσως είναι σε PC ή δεν δέχτηκε ειδοποιήσεις).`);
        }
    });

    // --- ΒΗΜΑ 2: Ο ΠΟΜΠΟΣ ΠΑΤΑΕΙ ΤΟ ΚΟΥΜΠΙ ---
    socket.on('trigger-alarm', () => {
        console.log(`🔴 [ALARM] Πατήθηκε το κουμπί από ${socket.id}`);
        
        // Στέλνουμε σε όλους τους άλλους (Εκτός από τον εαυτό μας)
        socket.broadcast.emit('ring-bell'); 

        // --- ΒΗΜΑ 3: ΣΤΕΛΝΟΥΜΕ FIREBASE TEST ---
        // Ψάχνουμε αν υπάρχουν αποθηκευμένα Tokens
        const allSocketIds = Object.keys(fcmTokens);
        
        if (allSocketIds.length === 0) {
            console.log("⚠️ [FIREBASE] Δεν βρέθηκαν συσκευές με Token για να στείλω ειδοποίηση.");
        }

        allSocketIds.forEach((targetSocketId) => {
            // Μην στείλεις στον εαυτό σου (αν είσαι και πομπός και δέκτης)
            if (targetSocketId !== socket.id) {
                const token = fcmTokens[targetSocketId];
                sendTestNotification(token);
            }
        });
    });
});

// --- Η ΣΥΝΑΡΤΗΣΗ ΤΗΣ GOOGLE ---
function sendTestNotification(token) {
    const message = {
        token: token,
        notification: {
            title: "🔥 FIREBASE TEST",
            body: "Αν το διαβάζεις αυτό, το σύστημα ΔΟΥΛΕΥΕΙ!"
        },
        android: {
            priority: "high",
            notification: {
                sound: "default",
                channelId: "alarm_channel" // Προαιρετικό
            }
        },
        data: {
            url: "/", // Για να ανοίγει το app όταν το πατάς
            action: "alarm"
        }
    };

    console.log(`🚀 [SENDING] Προσπάθεια αποστολής στο Token: ${token.substring(0, 10)}...`);

    admin.messaging().send(message)
        .then((response) => {
            console.log('✅ [SUCCESS] Η Google παρέλαβε το μήνυμα:', response);
        })
        .catch((error) => {
            console.log('❌ [FAIL] Η αποστολή απέτυχε:', error);
        });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
