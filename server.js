const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const admin = require('firebase-admin');

// --- 1. FIREBASE SETUP (ΓΙΑ ΝΑ ΞΥΠΝΑΕΙ ΤΟ ΚΙΝΗΤΟ) ---
try {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("✅ FIREBASE: Ενεργοποιήθηκε επιτυχώς.");
} catch (e) {
    console.log("⚠️ FIREBASE ERROR: Δεν βρέθηκε το serviceAccountKey.json (Οι ειδοποιήσεις παρασκηνίου δεν θα δουλέψουν).");
}

const app = express();
const server = http.createServer(app);

// Ρύθμιση CORS για να επιτρέπει συνδέσεις από παντού (Android/Web)
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Εδώ κρατάμε τους οδηγούς: { "Nikos": { socketId: "...", shop: "...", fcmToken: "...", lastBeat: 123456 } }
let activeDrivers = {}; 

// --- 2. GHOST BUSTER (Ο ΕΞΟΛΟΘΡΕΥΤΗΣ ΦΑΝΤΑΣΜΑΤΩΝ) ---
// Τρέχει κάθε 30 δευτερόλεπτα. Αν κάποιος δεν έστειλε Heartbeat για 60'', διαγράφεται.
setInterval(() => {
    const now = Date.now();
    let updated = false;

    for (let name in activeDrivers) {
        const driver = activeDrivers[name];
        // 60000ms = 1 λεπτό
        if (now - driver.lastBeat > 60000) {
            console.log(`💀 GHOST BUSTED: Ο ${name} διαγράφηκε λόγω αδράνειας.`);
            // Ειδοποίηση στον Admin του μαγαζιού ότι ο οδηγός χάθηκε
            updateShopAdmins(driver.shop); 
            delete activeDrivers[name];
            updated = true;
        }
    }
    
    // Αν έγινε διαγραφή, ενημερώνουμε γενικά (προαιρετικό)
    if (updated) console.log("🧹 Καθαρισμός λίστας ολοκληρώθηκε.");
}, 30000);


io.on('connection', (socket) => {
    
    // --- LOGIN ---
    socket.on('login', (user) => {
        socket.join(user.shop); // Βάζουμε τον χρήστη στο "δωμάτιο" του μαγαζιού
        
        if (user.role === 'driver') {
            activeDrivers[user.name] = { 
                socketId: socket.id, 
                shop: user.shop,
                fcmToken: user.fcmToken || null,
                lastBeat: Date.now() // Καταγραφή ώρας εισόδου
            };
            console.log(`✅ LOGIN: ${user.name} (Shop: ${user.shop})`);
        } else {
            console.log(`💻 ADMIN LOGIN: ${user.shop}`);
        }
        
        // Ενημερώνουμε αμέσως τους Admin του μαγαζιού
        updateShopAdmins(user.shop);
    });

    // --- HEARTBEAT (ΚΑΡΔΙΑΚΟΣ ΠΑΛΜΟΣ) ---
    // Ο οδηγός στέλνει "ζω" κάθε 5 δευτερόλεπτα
    socket.on('heartbeat', (data) => {
        if (activeDrivers[data.name]) {
            activeDrivers[data.name].lastBeat = Date.now();
            activeDrivers[data.name].socketId = socket.id; // Ανανεώνουμε το ID μήπως άλλαξε (π.χ. από WiFi σε 4G)
        }
    });

    // --- UPDATE FCM TOKEN ---
    // Αποθήκευση του Token για ειδοποιήσεις
    socket.on('update-token', (data) => {
        if (activeDrivers[data.name]) {
            activeDrivers[data.name].fcmToken = data.token;
            console.log(`📲 TOKEN UPDATED: ${data.name}`);
        }
    });

    // --- LOGOUT ---
    socket.on('force-logout', (user) => {
        if (activeDrivers[user.name]) {
            delete activeDrivers[user.name];
            updateShopAdmins(user.shop);
            console.log(`🚪 LOGOUT: ${user.name}`);
        }
    });

    // --- CALL DRIVER (Η ΚΛΗΣΗ) ---
    socket.on('call-driver', (targetName) => {
        const driver = activeDrivers[targetName];
        if (driver) {
            console.log(`🔔 CALLING: ${targetName}`);
            
            // Ανανεώνουμε τον παλμό του (αφού τον καλούμε, υπάρχει)
            driver.lastBeat = Date.now();

            // 1. SOCKET (Γρήγορο - Αν είναι ανοιχτή η οθόνη)
            io.to(driver.socketId).emit('order-notification');

            // 2. FIREBASE PUSH (Ασφάλεια - Αν κοιμάται το κινητό)
            if (driver.fcmToken) {
                sendAggressivePush(driver.fcmToken);
            } else {
                console.log("⚠️ Ο οδηγός δεν έχει FCM Token!");
            }
        }
    });

    // --- ACCEPT ORDER ---
    socket.on('accept-order', (data) => {
        // Ενημερώνουμε ΟΛΟΥΣ στο μαγαζί (Admins)
        io.to(data.shop).emit('order-accepted', data.driverName);
        console.log(`✅ ACCEPTED: ${data.driverName}`);
        
        if (activeDrivers[data.driverName]) {
            activeDrivers[data.driverName].lastBeat = Date.now();
        }
    });

    // --- CHAT ---
    socket.on('chat-message', (data) => {
        io.to(data.shop).emit('chat-message', data);
    });
});

// Βοηθητική συνάρτηση για ενημέρωση λίστας
function updateShopAdmins(shopName) {
    const driversList = [];
    for (let name in activeDrivers) {
        if (activeDrivers[name].shop === shopName) {
            driversList.push({ name: name });
        }
    }
    // Στέλνουμε τη λίστα ΜΟΝΟ στο συγκεκριμένο μαγαζί
    io.to(shopName).emit('update-drivers-list', driversList);
}

// --- 3. AGGRESSIVE PUSH NOTIFICATION ---
function sendAggressivePush(token) {
    const message = {
        token: token,
        notification: { 
            title: '📣 ΚΛΗΣΗ ΠΑΡΑΓΓΕΛΙΑΣ!', 
            body: 'ΠΑΤΑ ΕΔΩ ΓΙΑ ΝΑ ΑΝΟΙΞΕΙΣ ΤΗΝ ΕΦΑΡΜΟΓΗ' 
        },
        android: { 
            priority: 'high', // Κρίσιμο για να ξυπνήσει από Doze mode
            ttl: 0, // Time To Live: 0 = Παράδοση τώρα ή ποτέ (δεν περιμένει)
            notification: { 
                sound: 'default',
                channelId: 'fcm_default_channel', // Πρέπει να ταιριάζει με το κανάλι στο App
                clickAction: 'FCM_PLUGIN_ACTIVITY', // Για Capacitor
                visibility: 'public', // Να φαίνεται στην κλειδωμένη οθόνη
                priority: 'max', 
                defaultSound: true,
                defaultVibrateTimings: true
            } 
        },
        data: { 
            type: 'call',
            force_wake: 'true' // Custom data για μελλοντική χρήση
        }
    };

    admin.messaging().send(message)
        .then(() => console.log("🚀 Firebase Push Sent Successfully!"))
        .catch(e => console.log("❌ Firebase Push Error:", e));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));
