const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require('firebase-admin');

// FIREBASE INIT
try {
    // Βεβαιώσου ότι το αρχείο υπάρχει στον φάκελο!
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log("✅ Firebase Connected");
} catch (error) { console.error("❌ Firebase Error:", error.message); }

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

let activeUsers = {}; 
const TIMEOUT_LIMIT = 180000; // 3 Λεπτά Timeout (Αν δεν στείλει heartbeat)

// 🔥 ΟΙ ΚΩΔΙΚΟΙ ΤΩΝ ΚΑΤΑΣΤΗΜΑΤΩΝ 🔥
const SHOP_PASSWORDS = {
    'CoffeeRoom1': '1234',
    'TestShop': '0000',
    'The Roasters': '1234', // Πρόσεχε τα κεφαλαία/μικρά να ταιριάζουν με το Tablet
    'the roasters': '1234'  // Καλό είναι να βάζεις και τις δύο εκδοχές
};

io.on('connection', (socket) => {
    
    // 1. LOGIN
    socket.on('join-store', (data) => {
        // 🔥 ΔΙΟΡΘΩΣΗ: Πρώτα καθαρίζουμε τα ονόματα (Trim)
        const cleanStore = data.storeName ? data.storeName.trim() : "";
        const cleanUser = data.username ? data.username.trim() : "";

        // 🔥 ΔΙΟΡΘΩΣΗ: Μετά ελέγχουμε τον κωδικό στο ΚΑΘΑΡΟ όνομα
        const correctPass = SHOP_PASSWORDS[cleanStore];
        
        // Αν υπάρχει κωδικός για το μαγαζί ΚΑΙ ο χρήστης έστειλε λάθος
        if (correctPass && data.pass !== correctPass) {
            console.log(`❌ Λάθος Κωδικός από ${cleanUser} για το ${cleanStore}`);
            return; // Stop here
        }

        const userKey = `${cleanStore}_${cleanUser}`;
        socket.join(cleanStore);

        // Αν υπάρχει παλιό token, κράτα το
        const existingToken = activeUsers[userKey] ? activeUsers[userKey].fcmToken : null;

        activeUsers[userKey] = {
            socketId: socket.id,
            username: cleanUser,
            role: data.role,
            store: cleanStore,
            fcmToken: data.fcmToken || existingToken, 
            lastSeen: Date.now()
        };

        console.log(`👤 ${cleanUser} joined ${cleanStore} (Pass OK)`);
        updateStore(cleanStore);
    });

    // 2. UPDATE TOKEN (Firebase)
    socket.on('update-token', (data) => {
        const userKey = `${data.store}_${data.user}`;
        if (activeUsers[userKey]) {
            activeUsers[userKey].fcmToken = data.token;
            console.log(`🔑 Token saved for ${data.user}`);
        }
    });

    // 3. HEARTBEAT (Κρατάει τη σύνδεση ζωντανή)
    socket.on('heartbeat', () => {
        const userKey = Object.keys(activeUsers).find(key => activeUsers[key].socketId === socket.id);
        if (userKey) activeUsers[userKey].lastSeen = Date.now();
    });

    // 4. LOGOUT
    socket.on('logout-user', () => {
        const userKey = Object.keys(activeUsers).find(key => activeUsers[key].socketId === socket.id);
        if (userKey) {
            const user = activeUsers[userKey];
            delete activeUsers[userKey];
            updateStore(user.store);
        }
    });

    // 5. CHAT (Διορθωμένο για να ταιριάζει με το logic.js)
    socket.on('chat-message', (data) => {
        const userKey = Object.keys(activeUsers).find(key => activeUsers[key].socketId === socket.id);
        if (userKey) {
            const user = activeUsers[userKey];
            io.to(user.store).emit('chat-message', {
                sender: user.username,
                role: user.role,
                text: data.text,
                isSelf: false 
            });
        }
    });

    // 6. ALARM (ΕΙΔΟΠΟΙΗΣΗ + SOCKET)
    
    // Περίπτωση Α: Κουμπί "ΚΟΥΔΟΥΝΙ" (Για όλους)
    socket.on('kitchen-alarm', () => {
        const senderKey = Object.keys(activeUsers).find(key => activeUsers[key].socketId === socket.id);
        if(senderKey) {
            const store = activeUsers[senderKey].store;
            io.to(store).emit('kitchen-alarm'); // Στέλνουμε την εντολή που ξέρει το Tablet
            console.log(`🔥 ALARM TRIGGERED in ${store}`);
        }
    });

    // Περίπτωση Β: Κλήση συγκεκριμένου σερβιτόρου
    socket.on('trigger-alarm', (targetUsername) => {
        const sender = Object.values(activeUsers).find(u => u.socketId === socket.id);
        if (!sender) return;

        const targetKey = `${sender.store}_${targetUsername}`;
        const target = activeUsers[targetKey];

        if (target) {
            console.log(`🔔 Ringing ${target.username}...`);
            io.to(target.socketId).emit('kitchen-alarm'); // Στέλνουμε την ίδια εντολή

            if (target.fcmToken) {
                console.log(`📨 Sending Push to ${target.username}`);
                sendPushNotification(target.fcmToken);
            }
        }
    });
});

// CLEANER (Διαγράφει ανενεργούς χρήστες μετά από 3 λεπτά)
setInterval(() => {
    const now = Date.now();
    let storesToUpdate = new Set();
    Object.keys(activeUsers).forEach(key => {
        if (now - activeUsers[key].lastSeen > TIMEOUT_LIMIT) {
            storesToUpdate.add(activeUsers[key].store);
            delete activeUsers[key];
        }
    });
    storesToUpdate.forEach(store => updateStore(store));
}, 30000);

function updateStore(storeName) {
    const staff = Object.values(activeUsers).filter(u => u.store === storeName);
    // Format για το index.html
    const formattedStaff = staff.map(u => ({ name: u.username, role: u.role }));
    io.to(storeName).emit('staff-list-update', formattedStaff);
}

function sendPushNotification(token) {
    if(!token || token === 'WEB') return; 

    const message = {
        token: token,
        notification: { 
            title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ!", 
            body: "Πάτα ΕΔΩ τώρα!" 
        },
        android: { 
            priority: "high", 
            notification: { 
                sound: "default",
                clickAction: "FLUTTER_NOTIFICATION_CLICK",
            } 
        },
        data: { url: "/", action: "alarm" }
    };
    
    admin.messaging().send(message)
        .then(() => console.log("✅ Push Sent!"))
        .catch(e => console.error("❌ Push Failed:", e.message));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
