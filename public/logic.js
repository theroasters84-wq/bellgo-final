// --- logic.js v4 (Aggressive Fix) ---
const socket = io();
let isFully = typeof fully !== 'undefined';
let messaging = null;
let myToken = null;
let currentUser = null; // Αρχικά NULL για να ξέρουμε αν έχει γίνει login

// 🛡️ SAFETY CHECK: ΜΟΛΙΣ ΑΝΟΙΞΕΙ, ΣΚΟΤΩΣΕ ΤΟΝ ΗΧΟ
window.onload = function() {
    const siren = document.getElementById('siren');
    if(siren) {
        siren.pause();
        siren.currentTime = 0;
    }
    console.log("🔒 System Loaded - Alarm Disarmed");
};

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
            if(currentUser) { // Μόνο αν έχει κάνει Login
                updateMediaSession('alarm'); 
                Watchdog.triggerPanicMode();
            }
        });
    } catch(e) {}
}

async function login(store, name, role, pass) {
    currentUser = { store, name, role }; // ΤΩΡΑ ΓΙΝΕΤΑΙ ΕΝΕΡΓΟΣ
    
    // Ξεκινάμε τον Σιωπηλό Παίκτη (Anti-Sleep)
    const silence = document.getElementById('silence');
    if (silence) {
        silence.volume = 1.0; 
        try {
            await silence.play();
            setupMediaSession(); 
        } catch(e) { console.error("Silence blocked:", e); }
    }

    if (isFully) {
        try { Watchdog.runSetup(); } catch(e) {}
    }

    if (role !== 'admin' && !isFully && messaging) {
        try { myToken = await messaging.getToken(); } catch(e){}
    }

    Watchdog.start(isFully);
    
    socket.emit('join-store', { storeName: store, username: name, role: role, fcmToken: myToken });

    document.getElementById('displayStore').innerText = store;
    document.getElementById('displayUser').innerText = name + (role === 'admin' ? ' (Admin)' : '');
}

// MEDIA SESSION
function setupMediaSession() {
    if ('mediaSession' in navigator) {
        updateMediaSession('idle');
        const stopHandler = function() {
            Watchdog.stopPanicMode();
            updateMediaSession('idle'); 
        };
        navigator.mediaSession.setActionHandler('play', stopHandler);
        navigator.mediaSession.setActionHandler('pause', stopHandler);
        navigator.mediaSession.setActionHandler('stop', stopHandler);
    }
}

function updateMediaSession(state) {
    if (!('mediaSession' in navigator)) return;
    if (state === 'alarm') {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ! 🚨",
            artist: "ΠΑΤΑ ΓΙΑ STOP",
            album: "BellGo Alert",
            artwork: [{ src: 'https://cdn-icons-png.flaticon.com/512/10337/10337229.png', sizes: '512x512', type: 'image/png' }]
        });
    } else {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: "🟢 BellGo Active",
            artist: "Αναμονή...",
            album: currentUser.store || "System",
            artwork: [{ src: 'https://cdn-icons-png.flaticon.com/512/190/190411.png', sizes: '512x512', type: 'image/png' }]
        });
    }
}

// ADMIN UPDATE
socket.on('update-staff-list', (staffList) => {
    if (!currentUser || currentUser.role !== 'admin') return;
    const waiterContainer = document.getElementById('waiter-list');
    const driverContainer = document.getElementById('driver-list');
    waiterContainer.innerHTML = '<h3>🤵 ΣΕΡΒΙΤΟΡΟΙ</h3>';
    driverContainer.innerHTML = '<h3>🛵 ΔΙΑΝΟΜΕΙΣ</h3>';

    staffList.forEach(user => {
        const btn = document.createElement('button');
        btn.className = user.role === 'driver' ? 'btn-staff driver' : 'btn-staff waiter';
        btn.innerText = `🔔 ${user.username}`;
        btn.onclick = () => socket.emit('trigger-alarm', user.id);
        if (user.role === 'driver') driverContainer.appendChild(btn);
        else waiterContainer.appendChild(btn);
    });
});

// ALARM LISTENER (SAFEGUARD)
socket.on('ring-bell', () => {
    // ΜΟΝΟ ΑΝ ΕΧΟΥΜΕ ΚΑΝΕΙ LOGIN
    if (currentUser) {
        updateMediaSession('alarm');
        Watchdog.triggerPanicMode();
    }
});
