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

// Βάση δεδομένων στη μνήμη RAM
let users = {}; 

io.on('connection', (socket) => {
    console.log(`[CONNECT] New Socket: ${socket.id}`);

    // 1. ΕΙΣΟΔΟΣ
    socket.on('join-store', (data) => {
        const { storeName, username, role } = data;
        
        // Αποθήκευση χρήστη με το ΤΡΕΧΟΝ socket.id
        users[socket.id] = { 
            id: socket.id, // Κρατάμε το ID για σιγουριά
            name: username, 
            role: role, 
            room: storeName 
        };
        
        socket.join(storeName);
        console.log(`[LOGIN] ${username} (${role}) -> ${storeName}`);

        // Ενημερώνουμε ΑΜΕΣΩΣ τον Admin του δωματίου
        broadcastUserList(storeName);
        
        // Μήνυμα στο Chat
        io.to(storeName).emit('chat-message', { sender: 'System', text: `${username} συνδέθηκε.` });
    });

    // 2. ΚΛΗΣΗ (ALARM)
    socket.on('trigger-alarm', (data) => {
        const sender = users[socket.id];
        if (!sender) return;

        const targetId = data.targetId;

        if (targetId) {
            // ΑΤΟΜΙΚΗ ΚΛΗΣΗ
            console.log(`[ALARM] ${sender.name} calls -> ${targetId}`);
            // Στέλνουμε MONO στον συγκεκριμένο
            io.to(targetId).emit('ring-bell', { sender: sender.name });
        } else {
            // ΟΜΑΔΙΚΗ ΚΛΗΣΗ
            console.log(`[ALARM] ${sender.name} calls ALL in ${sender.room}`);
            socket.to(sender.room).emit('ring-bell', { sender: sender.name });
        }
    });

    // 3. CHAT
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
            console.log(`[DISCONNECT] ${user.name}`);
            const room = user.room;
            delete users[socket.id]; // Διαγραφή από τη μνήμη
            
            // Ενημέρωση της λίστας για να φύγει το κουμπί
            broadcastUserList(room);
            io.to(room).emit('chat-message', { sender: 'System', text: `${user.name} αποσυνδέθηκε.` });
        }
    });
});

// Συνάρτηση που στέλνει τη λίστα σε όλους στο δωμάτιο
function broadcastUserList(room) {
    const userList = [];
    for (const [key, value] of Object.entries(users)) {
        if (value.room === room && value.role === 'staff') {
            userList.push({ id: value.id, name: value.name });
        }
    }
    // Στέλνουμε τη λίστα σε όλους (ο Admin θα τη χρησιμοποιήσει)
    io.to(room).emit('update-user-list', userList);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
