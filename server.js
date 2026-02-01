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
let pendingAlarms = {}; 

io.on('connection', (socket) => {
    
    // 1. ΣΥΝΔΕΣΗ ΧΡΗΣΤΗ
    socket.on('join-store', (data) => {
        const cleanStore = data.storeName ? data.storeName.trim().toLowerCase() : "";
        const cleanUser = data.username ? data.username.trim() : "";
        
        if (!cleanStore || !cleanUser) return;

        const userKey = `${cleanStore}_${cleanUser}`;
        
        socket.join(cleanStore);
        socket.username = cleanUser; 
        socket.store = cleanStore;
        socket.role = data.role;

        activeUsers[userKey] = {
            socketId: socket.id,
            username: cleanUser, // Εδώ αποθηκεύεται ως username
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

    // 3. O ADMIN KANEI ΚΛΗΣΗ
    socket.on('trigger-alarm', (targetUsername) => {
        if (!socket.store || !targetUsername) return;
        
        console.log(`🔔 Admin triggered alarm for: ${targetUsername}`); // Log για έλεγχο

        const targetKey = `${socket.store}_${targetUsername}`;
        const targetUser = activeUsers[targetKey];

        if (targetUser) {
            io.to(targetUser.socketId).emit('ring-bell');
            console.log(`✅ Signal sent to ${targetUsername}`);
        } else {
            console.log(`❌ User ${targetUsername} not found in ${socket.store}`);
        }
    });

    // 4. ΑΠΟΣΥΝΔΕΣΗ
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

// ΔΙΟΡΘΩΜΕΝΗ ΣΥΝΑΡΤΗΣΗ ΕΝΗΜΕΡΩΣΗΣ
function updateStore(storeName) {
    if(!storeName) return;
    
    const staff = Object.values(activeUsers).filter(u => u.store === storeName);
    
    // Στέλνουμε καθαρά το username
    const formattedStaff = staff.map(u => ({
        username: u.username,  // Στέλνουμε 'username' (όχι name)
        role: u.role
    }));

    io.to(storeName).emit('staff-list-update', formattedStaff);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
