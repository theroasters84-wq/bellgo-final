const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log(`[SYSTEM] Νέα σύνδεση: ${socket.id}`);

    socket.on('join-setup', (data) => {
        socket.join(data.storeName);
        console.log(`[SETUP] Ο ${data.username} ξεκίνησε τη διαδικασία αδειών.`);
    });

    // Ο Server μπορεί να στείλει εντολή για επανέλεγχο αδειών
    socket.on('request-recheck', (room) => {
        io.to(room).emit('force-check-permissions');
    });

    socket.on('trigger-alarm', (data) => {
        socket.broadcast.emit('ring-bell');
    });
});

server.listen(3000, () => console.log("Server running on port 3000"));
