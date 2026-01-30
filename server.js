const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require('firebase-admin');

// --- 1. FIREBASE INIT ---
try {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log("✅ Firebase Connected");
} catch (error) { console.error("❌ Firebase Error:", error.message); }

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

// --- 2. CONFIGURATION & STATE ---
let activeUsers = {}; 
let pendingAlarms = {}; 
const TIMEOUT_LIMIT = 180000; 

const SHOP_PASSWORDS = {
    'CoffeeRoom1': '1234',
    'TestShop': '0000',
    'the roasters': '1234'
};

io.on('connection', (socket) => {
    
    socket.on('join-store', (data) => {
        const cleanStore = data.storeName ? data.storeName.trim() : "";
        const cleanUser = data.username ? data.username.trim() : "";
        const correctPass = SHOP_PASSWORDS[cleanStore];
        
        if (correctPass && data.pass !== correctPass) return; 

        const userKey = `${cleanStore}_${cleanUser}`;
        socket.join(cleanStore);
        socket.username = cleanUser; 
        socket.store = cleanStore;

        activeUsers[userKey] = {
            socketId: socket.id,
            username: cleanUser,
            role: data.role,
            store: cleanStore,
            lastSeen: Date.now(),
            deviceType: data.deviceType || 'iOS'
        };

        console.log(`👤 ${cleanUser} joined ${cleanStore}`);

        // Persistent Alarm: Αν υπάρχει κλήση, στείλε την αμέσως
        if (pendingAlarms[userKey]) {
            socket.emit('kitchen-alarm');
        }

        updateStore(cleanStore);
    });

    socket.on('heartbeat', () => {
        const userKey = `${socket.store}_${socket.username}`;
        if (activeUsers[userKey]) activeUsers[userKey].lastSeen = Date.now();
    });

    socket.on('chat-message', (data) => {
        if (socket.store) {
            io.to(socket.store).emit('chat-message', {
                sender: socket.username,
                role: activeUsers[`${socket.store}_${socket.username}`]?.role || 'user',
                text: data.text
            });
        }
    });

    socket.on('trigger-alarm', (targetUsername) => {
        const targetKey = `${socket.store}_${targetUsername}`;
        pendingAlarms[targetKey] = true;
        
        const target = activeUsers[targetKey];
        if (target) {
            io.to(target.socketId).emit('kitchen-alarm');
        }
        updateStore(socket.store);
    });

    socket.on('alarm-ack', () => {
        const userKey = `${socket.store}_${socket.username}`;
        
        if (pendingAlarms[userKey]) {
            delete pendingAlarms[userKey];
            // Ενημέρωση όλων στο μαγαζί ότι η κλήση απαντήθηκε
            io.to(socket.store).emit('alarm-receipt', { name: socket.username });
            updateStore(socket.store);
        }
    });

    socket.on('disconnect', () => {
        // Δεν διαγράφουμε αμέσως για να αντέχει σε μικρο-διακοπές WiFi
        setTimeout(() => {
            const userKey = `${socket.store}_${socket.username}`;
            if (activeUsers[userKey] && Date.now() - activeUsers[userKey].lastSeen > 15000) {
                delete activeUsers[userKey];
                updateStore(socket.store);
            }
        }, 10000);
    });
}); 

function updateStore(storeName) {
    const staff = Object.values(activeUsers).filter(u => u.store === storeName);
    const formattedStaff = staff.map(u => ({
        name: u.username, 
        role: u.role,
        isRinging: !!pendingAlarms[`${storeName}_${u.username}`]
    }));
    io.to(storeName).emit('staff-list-update', formattedStaff);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
