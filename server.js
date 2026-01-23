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

// Αποθήκευση χρηστών: { socketId: { name, role, room } }
let users = {};

io.on('connection', (socket) => {
    console.log(`[CONNECT] ${socket.id}`);

    // 1. ΕΙΣΟΔΟΣ ΣΤΟ ΔΩΜΑΤΙΟ (Login)
    socket.on('join-store', (data) => {
        const { storeName, username, role } = data;
        
        // Αποθήκευση στοιχείων χρήστη
        users[socket.id] = { name: username, role: role, room: storeName };
        
        // Ο χρήστης μπαίνει στο δωμάτιο του μαγαζιού
        socket.join(storeName);
        
        console.log(`[LOGIN] ${username} (${role}) joined ${storeName}`);

        // Ενημέρωση λίστας χρηστών (μόνο για το συγκεκριμένο δωμάτιο)
        updateUserList(storeName);
        
        // Καλωσόρισμα στο Chat
        io.to(storeName).emit('chat-message', {
            sender: 'System',
            text: `${username} συνδέθηκε!`
        });
    });

    // 2. ΚΛΗΣΗ (Alarm)
    socket.on('trigger-alarm', (data) => {
        const currentUser = users[socket.id];
        if (!currentUser) return;

        const targetId = data.targetId; // Αν υπάρχει ID, είναι για συγκεκριμένο άτομο

        if (targetId) {
            // Χτυπάει ΜΟΝΟ ο συγκεκριμένος
            console.log(`[ALARM] Direct to ${targetId}`);
            io.to(targetId).emit('ring-bell', { sender: currentUser.name });
        } else {
            // Χτυπάει ΟΛΟΙ στο δωμάτιο (εκτός από τον αποστολέα)
            console.log(`[ALARM] To ALL in ${currentUser.room}`);
            socket.to(currentUser.room).emit('ring-bell', { sender: currentUser.name });
        }
    });

    // 3. CHAT MESSAGE
    socket.on('send-chat', (message) => {
        const user = users[socket.id];
        if (user) {
            io.to(user.room).emit('chat-message', {
                sender: user.name,
                text: message
            });
        }
    });

    // 4. ΑΠΟΣΥΝΔΕΣΗ
    socket.on('disconnect', () => {
        const user = users[socket.id];
        if (user) {
            console.log(`[DISCONNECT] ${user.name}`);
            const room = user.room;
            delete users[socket.id];
            
            // Ενημέρωση των υπολοίπων
            updateUserList(room);
            io.to(room).emit('chat-message', { sender: 'System', text: `${user.name} αποσυνδέθηκε.` });
        }
    });
});

// Βοηθητική συνάρτηση για αποστολή λίστας
function updateUserList(room) {
    // Βρες όλους τους χρήστες σε αυτό το δωμάτιο
    const roomUsers = [];
    for (const [id, info] of Object.entries(users)) {
        if (info.room === room) {
            roomUsers.push({ id: id, name: info.name, role: info.role });
        }
    }
    // Στείλε τη λίστα σε όλους στο δωμάτιο (ο Admin θα τη διαβάσει)
    io.to(room).emit('update-user-list', roomUsers);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
