const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

let activeUsers = {}; 
let pendingAlarms = {}; 

const SHOP_PASSWORDS = {
    'CoffeeRoom1': '1234',
    'TestShop': '0000',
    'the roasters': '1234'
};

io.on('connection', (socket) => {
    
    socket.on('join-store', (data) => {
        const cleanStore = data.storeName ? data.storeName.trim() : "";
        const cleanUser = data.username ? data.username.trim() : "";
        const userKey = `${cleanStore}_${cleanUser}`;
        
        socket.join(cleanStore);
        socket.username = cleanUser; 
        socket.store = cleanStore;

        activeUsers[userKey] = {
            socketId: socket.id,
            username: cleanUser,
            role: data.role,
            store: cleanStore,
            lastSeen: Date.now()
        };

        if (pendingAlarms[userKey]) socket.emit('kitchen-alarm');
        updateStore(cleanStore);
    });

    socket.on('heartbeat', () => {
        const userKey = `${socket.store}_${socket.username}`;
        if (activeUsers[userKey]) activeUsers[userKey].lastSeen = Date.now();
    });

    socket.on('trigger-alarm', (targetUsername) => {
        const targetKey = `${socket.store}_${targetUsername}`;
        pendingAlarms[targetKey] = true;
        
        const target = activeUsers[targetKey];
        if (target) io.to(target.socketId).emit('kitchen-alarm');
        
        updateStore(socket.store);
    });

    socket.on('alarm-ack', () => {
        const userKey = `${socket.store}_${socket.username}`;
        if (pendingAlarms[userKey]) {
            delete pendingAlarms[userKey];
            // Ενημερώνουμε την κουζίνα (Admin) ότι ο συγκεκριμένος χρήστης απάντησε
            io.to(socket.store).emit('alarm-receipt', { name: socket.username });
            updateStore(socket.store);
        }
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

    socket.on('disconnect', () => {
        const userKey = `${socket.store}_${socket.username}`;
        setTimeout(() => {
            if (activeUsers[userKey]) {
                delete activeUsers[userKey];
                updateStore(socket.store);
            }
        }, 5000);
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
