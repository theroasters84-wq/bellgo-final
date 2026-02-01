const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Σερβίρουμε τον φάκελο public
app.use(express.static(path.join(__dirname, 'public')));

let activeUsers = {}; 

io.on('connection', (socket) => {
    
    // 1. ΣΥΝΔΕΣΗ ΧΡΗΣΤΗ
    socket.on('join-store', (data) => {
        // Εδώ διαβάζουμε είτε 'username' είτε 'name' για να είμαστε σίγουροι
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
            lastSeen: Date.now()
        };

        console.log(`👤 Joined: ${cleanUser} (${data.role}) @ ${cleanStore}`);
        updateStore(cleanStore);
    });

    // 2. HEARTBEAT
    socket.on('heartbeat', () => {
        if (socket.store && socket.username) {
            const userKey = `${socket.store}_${socket.username}`;
            if (activeUsers[userKey]) activeUsers[userKey].lastSeen = Date.now();
        }
    });

    // 3. TRIGGER ALARM
    socket.on('trigger-alarm', (targetName) => {
        if (!socket.store || !targetName) return;
        
        console.log(`🔔 Alarm triggered for: ${targetName}`); 

        const targetKey = `${socket.store}_${targetName}`;
        const targetUser = activeUsers[targetKey];

        if (targetUser) {
            io.to(targetUser.socketId).emit('ring-bell');
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
}); 

// --- Η ΔΙΟΡΘΩΣΗ ΕΙΝΑΙ ΕΔΩ ---
function updateStore(storeName) {
    if(!storeName) return;
    
    const staff = Object.values(activeUsers).filter(u => u.store === storeName);
    
    // Στέλνουμε ΚΑΙ name ΚΑΙ username για να μην μπερδεύεται το HTML
    const formattedStaff = staff.map(u => ({
        name: u.username,      // Για συμβατότητα
        username: u.username,  // Για σιγουριά
        role: u.role
    }));

    io.to(storeName).emit('staff-list-update', formattedStaff);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
