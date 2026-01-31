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

io.on('connection', (socket) => {
    
    // --- 1. JOIN STORE ---
    socket.on('join-store', (data) => {
        const cleanStore = data.storeName ? data.storeName.trim().toLowerCase() : "";
        const cleanUser = data.username ? data.username.trim() : "";
        
        if (!cleanStore || !cleanUser) return;

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

        // Αν υπάρχει εκκρεμής κλήση, χτύπα
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

    // --- 3. TRIGGER ALARM ---
    socket.on('trigger-alarm', (targetUsername) => {
        if (!socket.store) return;

        const targetKey = `${socket.store}_${targetUsername}`;
        pendingAlarms[targetKey] = true;
        
        const target = activeUsers[targetKey];
        if (target) io.to(target.socketId).emit('kitchen-alarm');
        
        updateStore(socket.store);
    });

    // --- 4. ALARM ACK ---
    socket.on('alarm-ack', (data) => {
        const username = data?.name || socket.username;
        const store = data?.store || socket.store;

        if (!username || !store) return;

        const userKey = `${store}_${username}`;
        console.log(`✅ ACK: ${username} in ${store}`);

        if (pendingAlarms[userKey]) delete pendingAlarms[userKey];

        io.to(store).emit('alarm-receipt', { name: username });
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

    // --- 6. MANUAL LOGOUT (Η ΠΡΟΣΘΗΚΗ) ---
    socket.on('manual-logout', (data) => {
        const store = data.storeName;
        const user = data.name;

        if (store && user) {
            console.log(`👋 Manual Logout: ${user} from ${store}`);
            
            // Α. Ειδοποίησε τον Admin ότι αυτός έφυγε ΚΑΘΑΡΑ (Clean Exit)
            // Έτσι ο Admin θα τον σβήσει αμέσως και δεν θα τον ψάχνει (Ghost)
            io.to(store).emit('user-clean-exit', user);

            // Β. Σβήσε τον από τη μνήμη του server αμέσως
            const userKey = `${store}_${user}`;
            if (activeUsers[userKey]) {
                delete activeUsers[userKey];
            }

            // Γ. Ενημέρωσε τη λίστα προσωπικού
            updateStore(store);
        }
    });

    // --- 7. DISCONNECT (ΤΥΧΑΙΑ ΑΠΟΣΥΝΔΕΣΗ) ---
    socket.on('disconnect', () => {
        const userKey = `${socket.store}_${socket.username}`;
        
        // Αν ο χρήστης έκανε manual logout, έχει ήδη σβηστεί, οπότε δεν κάνουμε τίποτα.
        // Αν όμως υπάρχει ακόμα στη μνήμη, σημαίνει ότι έπεσε το ίντερνετ.
        
        setTimeout(() => {
            // Αν μετά από 10 δευτερόλεπτα ακόμα δεν έχει δώσει heartbeat, τον σβήνουμε
            if (activeUsers[userKey] && (Date.now() - activeUsers[userKey].lastSeen > 10000)) {
                console.log(`🔌 Timeout Disconnect: ${socket.username}`);
                delete activeUsers[userKey];
                if(socket.store) updateStore(socket.store);
            }
        }, 5000);
    });
}); 

// Helper function
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
