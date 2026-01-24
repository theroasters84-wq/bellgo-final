const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Σερβίρουμε τον φάκελο public (εκεί πρέπει να έχεις το alert.mp3)
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Όταν ο Πομπός καλεί
    socket.on('call-receiver', () => {
        console.log("Call initiated!");
        // Στέλνει σήμα σε ΟΛΟΥΣ τους άλλους (δηλαδή στον Δέκτη)
        socket.broadcast.emit('incoming-call');
    });

    // Όταν ο Δέκτης το αποδέχεται
    socket.on('call-accepted', () => {
        console.log("Call accepted/stopped");
        // Προαιρετικά ενημερώνει πίσω τον πομπό (αν θες)
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
