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
            username: cleanUser,
            role: data.role,
            store: cleanStore,
            lastSeen: Date.now()
        };

        console.log(`👤 Joined: ${cleanUser} (${data.role}) @ ${cleanStore}`);
        
        // Ενημερώνουμε αμέσως όλους στο μαγαζί για να φανεί ο νέος χρήστης
        updateStore(cleanStore);
    });

    // 2. HEARTBEAT (Για να μην φαίνεται offline)
    socket.on('heartbeat', () => {
        if (socket.store && socket.username) {
            const userKey = `${socket.store}_${socket.username}`;
            if (activeUsers[userKey]) activeUsers[userKey].lastSeen = Date.now();
        }
    });

    // 3. O ADMIN KANEI ΚΛΗΣΗ
    socket.on('trigger-alarm', (targetUsername) => {
        if (!socket.store) return;
        
        // Βρες τον συγκεκριμένο χρήστη
        const targetKey = `${socket.store}_${targetUsername}`;
        const targetUser = activeUsers[targetKey];

        if (targetUser) {
            // Στείλε σήμα ΜΟΝΟ σε αυτόν
            io.to(targetUser.socketId).emit('ring-bell');
            console.log(`🔔 Calling ${targetUsername}...`);
        }
    });

    // 4. ΑΠΟΣΥΝΔΕΣΗ
    socket.on('disconnect', () => {
        if (socket.store && socket.username) {
            const userKey = `${socket.store}_${socket.username}`;
            // Τον σβήνουμε μετά από λίγο για να μην αναβοσβήνει σε μικρο-διακοπές
            setTimeout(() => {
                // Έλεγχος αν όντως έφυγε ή ξαναμπήκε
                const user = activeUsers[userKey];
                if (user && user.socketId === socket.id) { 
                    delete activeUsers[userKey];
                    updateStore(socket.store);
                }
            }, 5000);
        }
    });
}); 

// Συνάρτηση που στέλνει τη λίστα προσωπικού στον Admin
function updateStore(storeName) {
    if(!storeName) return;
    
    // Παίρνουμε μόνο όσους είναι στο συγκεκριμένο μαγαζί
    const staff = Object.values(activeUsers).filter(u => u.store === storeName);
    
    // Στέλνουμε τη λίστα σε όλους στο δωμάτιο (το φιλτράρει το front-end ποιος θα τη δει)
    io.to(storeName).emit('staff-list-update', staff);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
