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
    
    // --- 1. JOIN STORE ---
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

        // Αν υπάρχει εκκρεμής κλήση γι' αυτόν που μόλις μπήκε, χτύπα
        if (pendingAlarms[userKey]) socket.emit('kitchen-alarm');
        
        updateStore(cleanStore);
        console.log(`👤 Joined: ${cleanUser} @ ${cleanStore}`);
    });

    // --- 2. HEARTBEAT ---
    socket.on('heartbeat', () => {
        if (socket.store && socket.username) {
            const userKey = `${socket.store}_${socket.username}`;
            if (activeUsers[userKey]) activeUsers[userKey].lastSeen = Date.now();
        }
    });

    // --- 3. TRIGGER ALARM (Από Admin) ---
    socket.on('trigger-alarm', (targetUsername) => {
        // Αν χάθηκε η σύνδεση του Admin, δεν κάνουμε τίποτα
        if (!socket.store) return;

        const targetKey = `${socket.store}_${targetUsername}`;
        pendingAlarms[targetKey] = true;
        
        const target = activeUsers[targetKey];
        if (target) io.to(target.socketId).emit('kitchen-alarm');
        
        updateStore(socket.store);
    });

    // --- 4. ALARM ACK (ΑΠΟΔΟΧΗ - Η ΜΕΓΑΛΗ ΔΙΟΡΘΩΣΗ) ---
    socket.on('alarm-ack', (data) => {
        // Προσπαθούμε να βρούμε τα στοιχεία είτε από το μήνυμα (data) είτε από τη μνήμη (socket)
        // Αυτό λύνει το πρόβλημα όταν το Android χάνει τη σύνδεση στο background
        const username = data?.name || socket.username;
        const store = data?.store || socket.store;

        // Αν δεν ξέρουμε ποιος είναι και από πού, δεν μπορούμε να κάνουμε τίποτα
        if (!username || !store) {
            console.log("⚠️ ACK received but user unknown. Ignoring.");
            return;
        }

        const userKey = `${store}_${username}`;
        console.log(`✅ ACK processing for: ${username} in ${store}`);

        // A. Σβήνουμε την κλήση από τη μνήμη
        if (pendingAlarms[userKey]) delete pendingAlarms[userKey];

        // B. Στέλνουμε ΤΟ ΣΗΜΑ ΣΕ ΟΛΟΥΣ (Broadcast) στο συγκεκριμένο μαγαζί
        // Έτσι το βλέπει ο Admin ακόμα κι αν το socket του Driver είχε αλλάξει ID
        io.to(store).emit('alarm-receipt', { name: username });
        
        // C. Ανανεώνουμε τη λίστα για να φύγει το κίτρινο χρώμα
        updateStore(store);
    });

    // --- 5. CHAT ---
    socket.on('chat-message', (data) => {
        if (socket.store) {
            io.to(socket.store).emit('chat-message', {
                sender: socket.username,
                role: activeUsers[`${socket.store}_${socket.username}`]?.role || 'user',
                text: data.text
            });
        }
    });

    // --- 6. DISCONNECT ---
    socket.on('disconnect', () => {
        const userKey = `${socket.store}_${socket.username}`;
        // Δίνουμε λίγο χρόνο πριν τον διαγράψουμε, μήπως είναι απλά refresh ή μικρο-διακοπή
        setTimeout(() => {
            if (activeUsers[userKey] && (Date.now() - activeUsers[userKey].lastSeen > 10000)) {
                delete activeUsers[userKey];
                if(socket.store) updateStore(socket.store);
            }
        }, 5000);
    });
}); 

// Helper function για ενημέρωση λίστας
function updateStore(storeName) {
    if(!storeName) return;
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
