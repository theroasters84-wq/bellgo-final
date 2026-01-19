const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const admin = require('firebase-admin');

// FIREBASE
try {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log("✅ Firebase Active");
} catch (e) { console.log("⚠️ Firebase Skipped"); }

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Εδώ κρατάμε τους χρήστες ΜΟΝΙΜΑ (μέχρι να κάνουν Logout)
// Μορφή: { "Nikos": { socketId: "...", shop: "Roasters", token: "..." } }
let activeDrivers = {}; 

io.on('connection', (socket) => {
    
    // 1. LOGIN (Ή ΕΠΑΝΑΣΥΝΔΕΣΗ)
    socket.on('login', (user) => {
        socket.join(user.shop);
        
        if (user.role === 'driver') {
            // Αποθηκεύουμε τον οδηγό με βάση το ΟΝΟΜΑ του (όχι το socket id που αλλάζει)
            activeDrivers[user.name] = { 
                socketId: socket.id, 
                shop: user.shop,
                // Αν στείλει token για Firebase, το κρατάμε
                fcmToken: user.fcmToken || null 
            };
            console.log(`✅ Driver ${user.name} is ONLINE`);
        }
        
        // Ενημερώνουμε τους Admins αμέσως
        updateShopAdmins(user.shop);
    });

    // 2. ΕΝΗΜΕΡΩΣΗ TOKEN (Για Firebase)
    socket.on('update-token', (data) => {
        if (activeDrivers[data.name]) {
            activeDrivers[data.name].fcmToken = data.token;
        }
    });

    // 3. LOGOUT (ΜΟΝΟ ΤΟΤΕ ΤΟΝ ΣΒΗΝΟΥΜΕ)
    socket.on('force-logout', (user) => {
        if (activeDrivers[user.name]) {
            delete activeDrivers[user.name];
            updateShopAdmins(user.shop);
            console.log(`cX Driver ${user.name} Logged Out manually`);
        }
    });

    // 4. ΚΛΗΣΗ (SOCKET + FIREBASE)
    socket.on('call-driver', (targetName) => {
        const driver = activeDrivers[targetName];
        
        if (driver) {
            console.log(`🔔 Calling ${targetName}...`);
            
            // Α. Προσπάθεια μέσω Socket (Αν είναι ανοιχτή η οθόνη)
            io.to(driver.socketId).emit('order-notification');

            // Β. Προσπάθεια μέσω Firebase (Αν κοιμάται)
            if (driver.fcmToken) {
                sendPush(driver.fcmToken);
            }
        }
    });

    socket.on('chat-message', (data) => {
        io.to(data.shop).emit('chat-message', data);
    });
});

function updateShopAdmins(shopName) {
    const driversList = [];
    // Ψάχνουμε στη μόνιμη λίστα activeDrivers
    for (let name in activeDrivers) {
        if (activeDrivers[name].shop === shopName) {
            driversList.push({ name: name }); // Στέλνουμε το όνομα ως ID
        }
    }
    io.to(shopName).emit('update-drivers-list', driversList);
}

function sendPush(token) {
    const message = {
        token: token,
        notification: { title: 'ΚΛΗΣΗ!', body: 'Πατήστε για αποδοχή' },
        android: { priority: 'high', notification: { sound: 'default' } },
        data: { type: 'call' }
    };
    admin.messaging().send(message).catch(e => console.log("Push Error:", e));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));
