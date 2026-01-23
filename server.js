const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000,
        skipMiddlewares: true,
    },
    pingInterval: 25000, 
    pingTimeout: 20000 
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

let users = {}; 

io.on('connection', (socket) => {
    console.log(`[CONNECT] ${socket.id}`);

    // 1. ΕΙΣΟΔΟΣ
    socket.on('join-store', (data) => {
        const { storeName, username, role } = data;
        users[socket.id] = { id: socket.id, name: username, role: role, room: storeName };
        socket.join(storeName);
        broadcastUserList(storeName);
    });

    // 2. ΚΛΗΣΗ
    socket.on('trigger-alarm', (data) => {
        const sender = users[socket.id];
        if (!sender) return;

        const targetId = data.targetId;
        if (targetId) {
            io.to(targetId).emit('ring-bell', { sender: sender.name });
        } else {
            socket.to(sender.room).emit('ring-bell', { sender: sender.name });
        }
    });

    // 3. CHAT (Μόνο μηνύματα χρηστών)
    socket.on('send-chat', (msg) => {
        const user = users[socket.id];
        if (user) {
            io.to(user.room).emit('chat-message', { sender: user.name, text: msg });
        }
    });

    // 4. ΑΠΟΣΥΝΔΕΣΗ
    socket.on('disconnect', () => {
        const user = users[socket.id];
        if (user) {
            const room = user.room;
            delete users[socket.id];
            broadcastUserList(room);
        }
    });
});

function broadcastUserList(room) {
    const userList = [];
    for (const [key, value] of Object.entries(users)) {
        if (value.room === room && value.role === 'staff') {
            userList.push({ id: value.id, name: value.name });
        }
    }
    io.to(room).emit('update-user-list', userList);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
