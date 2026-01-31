const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

// --- ΜΝΗΜΗ SERVER ---
let activeUsers = {}; 
let pendingAlarms = {}; 

// --- ΨΕΥΤΙΚΗ ΒΑΣΗ ΣΥΝΔΡΟΜΩΝ (Mock DB) ---
// Εδώ θα ορίζεις ποια email έχουν λήξει.
// Στο μέλλον αυτό θα συνδεθεί με Firebase/Stripe.
const SUBSCRIPTION_DB = {
    'expired@test.com': { expires: 1700000000000 }, // Παράδειγμα ληγμένου
    // Όσα δεν είναι στη λίστα, θεωρούνται ενεργά (Free Tier)
};

io.on('connection', (socket) => {
    
    // --- 1. JOIN STORE (ΕΙΣΟΔΟΣ & ΕΛΕΓΧΟΙ) ---
    socket.on('join-store', (data) => {
        // Καθαρισμός: Όλα μικρά γράμματα, χωρίς κενά
        const cleanStore = data.storeName ? data.storeName.trim().toLowerCase() : "";
        const cleanUser = data.username ? data.username.trim() : "";
        
        if (!cleanStore || !cleanUser) return;

        // --- A. ΕΛΕΓΧΟΣ ΣΥΝΔΡΟΜΗΣ ---
        const now = Date.now();
        // Αν υπάρχει στη λίστα ΚΑΙ η ημερομηνία είναι παλιά -> BLOCK
        if (SUBSCRIPTION_DB[cleanStore] && SUBSCRIPTION_DB[cleanStore].expires < now) {
            console.log(`⛔ Blocked expired subscription: ${cleanStore}`);
            socket.emit('subscription-expired', { 
                link: 'https://buy.stripe.com/test_link_plhrwmis' // Βάλε το Link σου εδώ
            });
            return; // ΣΤΟΠ ΕΔΩ. Δεν μπαίνει στο δωμάτιο.
        }

        // --- B. ΕΠΙΤΥΧΗΣ ΣΥΝΔΕΣΗ ---
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

        // Αν εκκρεμεί καμπανάκι για αυτόν (π.χ. από refresh), χτύπα το ξανά
        if (pendingAlarms[userKey]) {
            socket.emit('kitchen-alarm');
        }
        
        updateStore(cleanStore);
        console.log(`👤 Joined: ${cleanUser} @ ${cleanStore} [Role: ${data.role}]`);
    });

    // --- 2. HEARTBEAT (Ο Φύλακας) ---
    socket.on('heartbeat', () => {
        if (socket.store && socket.username) {
            const userKey = `${socket.store}_${socket.username}`;
            if (activeUsers[userKey]) {
                activeUsers[userKey].lastSeen = Date.now();
            }
        }
    });

    // --- 3. TRIGGER ALARM (ΚΛΗΣΗ ΑΠΟ ΚΟΥΖΙΝΑ) ---
    socket.on('trigger-alarm', (targetUsername) => {
        if (!socket.store) return;

        const targetKey = `${socket.store}_${targetUsername}`;
        pendingAlarms[targetKey] = true; // Μαρκάρουμε ότι χτυπάει
        
        const target = activeUsers[targetKey];
        if (target) {
            io.to(target.socketId).emit('kitchen-alarm');
        }
        
        updateStore(socket.store); // Ενημέρωση για να φανεί κίτρινο το κουμπί
    });

    // --- 4. ALARM ACK (ΑΠΟΔΟΧΗ ΚΛΗΣΗΣ) ---
    socket.on('alarm-ack', (data) => {
        const username = data?.name || socket.username;
        const store = data?.store || socket.store;

        if (!username || !store) return;

        const userKey = `${store}_${username}`;
        console.log(`✅ ACK (Αποδοχή): ${username} in ${store}`);

        if (pendingAlarms[userKey]) delete pendingAlarms[userKey];

        // Ειδοποιούμε ΟΛΟΥΣ στο μαγαζί (Admins & Waiters) ότι το σήμα ελήφθη
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

    // --- 6. MANUAL LOGOUT (ΚΑΘΑΡΗ ΕΞΟΔΟΣ) ---
    socket.on('manual-logout', (data) => {
        const store = data.storeName;
        const user = data.name;

        if (store && user) {
            console.log(`👋 Manual Logout: ${user} from ${store}`);
            
            // 1. Ειδοποιούμε το Frontend να τον μαρκάρει ως "Clean Exit" (όχι Ghost)
            io.to(store).emit('user-clean-exit', user);

            // 2. Διαγραφή ΑΜΕΣΩΣ
            const userKey = `${store}_${user}`;
            if (activeUsers[userKey]) delete activeUsers[userKey];

            // 3. Ενημέρωση λίστας
            updateStore(store);
        }
    });

    // --- 7. DISCONNECT (ΠΤΩΣΗ ΣΥΝΔΕΣΗΣ / GHOST) ---
    socket.on('disconnect', () => {
        const userKey = `${socket.store}_${socket.username}`;
        
        // Περιμένουμε λίγο μήπως είναι απλά refresh ή μικρή διακοπή (Ghost Logic)
        setTimeout(() => {
            // Αν έχουν περάσει 10 δευτερόλεπτα και δεν γύρισε (lastSeen παλιό)
            if (activeUsers[userKey] && (Date.now() - activeUsers[userKey].lastSeen > 10000)) {
                console.log(`🔌 Timeout Disconnect (Ghost): ${socket.username}`);
                delete activeUsers[userKey];
                if(socket.store) updateStore(socket.store);
            }
        }, 5000);
    });
}); 

// Helper για μαζική ενημέρωση λίστας
function updateStore(storeName) {
    if(!storeName) return;
    const staff = Object.values(activeUsers).filter(u => u.store === storeName);
    
    const formattedStaff = staff.map(u => ({
        name: u.username, 
        role: u.role,
        isRinging: !!pendingAlarms[`${storeName}_${u.username}`] // Στέλνουμε αν χτυπάει
    }));
    
    io.to(storeName).emit('staff-list-update', formattedStaff);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
