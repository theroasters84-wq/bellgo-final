const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Επιτρέπει συνδέσεις από παντού
        methods: ["GET", "POST"]
    }
});

// Σερβίρουμε τα στατικά αρχεία από τον φάκελο public
app.use(express.static(path.join(__dirname, 'public')));

// Route για την κεντρική σελίδα
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- SOCKET.IO LOGIC ---
io.on('connection', (socket) => {
    console.log(`[CONNECT] User: ${socket.id}`);

    // 1. Λήψη Συναγερμού από Πομπό
    socket.on('trigger-alarm', () => {
        console.log(`[ALARM] Triggered by ${socket.id}`);
        // Στέλνει εντολή σε ΟΛΟΥΣ τους άλλους να χτυπήσουν
        socket.broadcast.emit('ring-bell');
    });

    // 2. Heartbeat (Ping/Pong) για να μην κλείνει η σύνδεση
    socket.on('keep-alive', () => {
        // Δεν κάνουμε log για να μην γεμίσει η κονσόλα, απλά κρατάμε το socket ενεργό
    });

    socket.on('disconnect', () => {
        console.log(`[DISCONNECT] User: ${socket.id}`);
    });
});

// Εκκίνηση Server (Το Render δίνει αυτόματα PORT)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
