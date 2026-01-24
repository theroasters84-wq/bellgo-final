// --- logic.js ---
const socket = io();
let isFully = typeof fully !== 'undefined';
let messaging = null;
let myToken = null;
let currentUser = {}; // { name, role, store }

// FIREBASE INIT
if (!isFully) {
    try {
        const firebaseConfig = { 
            apiKey: "AIzaSyBDOAlwLn4P5PMlwkg_Hms6-4f9fEcBKn8",
            authDomain: "bellgo-5dbe5.firebaseapp.com",
            projectId: "bellgo-5dbe5",
            storageBucket: "bellgo-5dbe5.firebasestorage.app",
            messagingSenderId: "799314495253",
            appId: "1:799314495253:web:baf6852f2a065c3a2e8b1c",
            measurementId: "G-379ETZJP8H"
        };
        firebase.initializeApp(firebaseConfig);
        messaging = firebase.messaging();
        messaging.onMessage(() => {
            updateMediaSession('alarm'); // Ενημέρωσε το player ότι χτυπάμε
            Watchdog.triggerPanicMode();
        });
    } catch(e) {}
}

// LOGIN LOGIC
async function login(store, name, role, pass) {
    currentUser = { store, name, role };
    
    // 1. ΞΕΚΙΝΑ ΤΗ ΣΙΩΠΗ & ΤΟ MEDIA SESSION
    const silence = document.getElementById('silence');
    if (silence) {
        silence.volume = 0.1; 
        try {
            await silence.play();
            console.log("🤫 Silence Player Started");
            // Ενεργοποίηση Media Controls (Για το κουμπί Volume Up)
            setupMediaSession(); 
        } catch(e) { console.log("Silence blocked:", e); }
    }

    // 2. TOKEN & WATCHDOG
    if (role !== 'admin' && !isFully && messaging) {
        try { myToken = await messaging.getToken(); } catch(e){}
    }

    Watchdog.start(isFully);
    
    // 3. ΣΥΝΔΕΣΗ
    socket.emit('join-store', {
        storeName: store,
        username: name,
        role: role,
        fcmToken: myToken
    });

    document.getElementById('displayStore').innerText = store;
    document.getElementById('displayUser').innerText = name + (role === 'admin' ? ' (Admin)' : '');
}

// --- 🎵 MEDIA SESSION API (TO KOYMΠI VOLUME UP) ---
function setupMediaSession() {
    if ('mediaSession' in navigator) {
        // Ορίζουμε τι θα δείχνει η οθόνη κλειδώματος όταν είναι ήρεμο
        updateMediaSession('idle');

        // ΟΡΙΖΟΥΜΕ ΤΙ ΚΑΝΟΥΝ ΤΑ ΚΟΥΜΠΙΑ (Play/Pause/Stop)
        // Είτε πατήσεις Play, είτε Pause, εμείς θα κάνουμε STOP τον συναγερμό
        const stopHandler = function() {
            console.log("⏯️ Hardware Button Pressed: STOPPING ALARM");
            Watchdog.stopPanicMode();
            updateMediaSession('idle'); // Γυρνάμε σε κατάσταση ηρεμίας
        };

        navigator.mediaSession.setActionHandler('play', stopHandler);
        navigator.mediaSession.setActionHandler('pause', stopHandler);
        navigator.mediaSession.setActionHandler('stop', stopHandler);
        navigator.mediaSession.setActionHandler('previoustrack', stopHandler);
        navigator.mediaSession.setActionHandler('nexttrack', stopHandler);
    }
}

function updateMediaSession(state) {
    if (!('mediaSession' in navigator)) return;

    if (state === 'alarm') {
        // Τι δείχνει όταν ΧΤΥΠΑΕΙ
        navigator.mediaSession.metadata = new MediaMetadata({
            title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ! 🚨",
            artist: "BellGo Alert",
            album: "Πάτα το κουμπί για STOP",
            artwork: [{ src: 'https://via.placeholder.com/512/ff0000/ffffff?text=ALARM', sizes: '512x512', type: 'image/png' }]
        });
    } else {
        // Τι δείχνει όταν είναι σε ANAMONH
        navigator.mediaSession.metadata = new MediaMetadata({
            title: "🟢 BellGo Active",
            artist: "Αναμονή για κλήση...",
            album: currentUser.store || "BellGo",
            artwork: [{ src: 'https://via.placeholder.com/512/000000/ffffff?text=ON', sizes: '512x512', type: 'image/png' }]
        });
    }
}

// --- ADMIN LOGIC ---
socket.on('update-staff-list', (staffList) => {
    if (currentUser.role !== 'admin') return;
    const waiterContainer = document.getElementById('waiter-list');
    const driverContainer = document.getElementById('driver-list');
    waiterContainer.innerHTML = '<h3>🤵 ΣΕΡΒΙΤΟΡΟΙ</h3>';
    driverContainer.innerHTML = '<h3>🛵 ΔΙΑΝΟΜΕΙΣ</h3>';

    staffList.forEach(user => {
        const btn = document.createElement('button');
        btn.className = user.role === 'driver' ? 'btn-staff driver' : 'btn-staff waiter';
        btn.innerText = `🔔 ${user.username}`;
        btn.onclick = () => callStaff(user.id);
        if (user.role === 'driver') driverContainer.appendChild(btn);
        else waiterContainer.appendChild(btn);
    });
});

function callStaff(socketId) {
    socket.emit('trigger-alarm', socketId);
}

// --- ALARM TRIGGER ---
socket.on('ring-bell', () => {
    // 1. Ενημερώνουμε το Player ότι χτυπάμε (Άρα το κουμπί θα πιάσει)
    updateMediaSession('alarm');
    // 2. Ξεκινάμε τον πανικό
    Watchdog.triggerPanicMode();
});
