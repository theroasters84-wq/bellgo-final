const socket = io();
let isFully = typeof fully !== 'undefined';
let messaging = null;
let myToken = null;
let currentUser = null;

// SAFETY: Stop alarm on load
window.onload = function() {
    const siren = document.getElementById('siren');
    if(siren) { siren.pause(); siren.currentTime = 0; }
};

// FIREBASE
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
        messaging.onMessage(() => { if(currentUser) { updateMediaSession('alarm'); Watchdog.triggerPanicMode(); }});
    } catch(e) {}
}

// LOGIN FUNCTION
async function login(store, name, role, pass) {
    // 1. ΑΜΕΣΗ ΕΚΤΕΛΕΣΗ ΗΧΟΥ (Χωρίς await πριν από αυτό)
    const silence = document.getElementById('silence');
    if (silence) {
        silence.volume = 1.0; 
        // Force Play Promise
        const playPromise = silence.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                console.log("🤫 Silence playing successfully.");
                setupMediaSession(); // Ενεργοποίηση μπάρας
            }).catch(error => {
                console.error("Audio blocked:", error);
                alert("⚠️ Πάτα κάπου στην οθόνη για να ενεργοποιηθεί ο ήχος!");
            });
        }
    }

    currentUser = { store, name, role };

    if (isFully) { try { Watchdog.runSetup(); } catch(e) {} }
    
    // Τώρα κάνουμε τα αργά (Async)
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
        const stopHandler = function() { Watchdog.stopPanicMode(); updateMediaSession('idle'); };
        navigator.mediaSession.setActionHandler('play', stopHandler);
        navigator.mediaSession.setActionHandler('pause', stopHandler);
        navigator.mediaSession.setActionHandler('stop', stopHandler);
    }
}

function updateMediaSession(state) {
    if (!('mediaSession' in navigator)) return;
    if (state === 'alarm') {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ!", artist: "ΠΑΤΑ ΓΙΑ STOP", album: "BellGo Alert",
            artwork: [{ src: 'https://cdn-icons-png.flaticon.com/512/10337/10337229.png', sizes: '512x512', type: 'image/png' }]
        });
    } else {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: "🟢 BellGo Active", artist: "Αναμονή...", album: currentUser.store || "System",
            artwork: [{ src: 'https://cdn-icons-png.flaticon.com/512/190/190411.png', sizes: '512x512', type: 'image/png' }]
        });
    }
}

// ADMIN UI UPDATE (ΕΔΩ ΕΙΝΑΙ ΤΟ ΠΡΟΒΛΗΜΑ ΤΩΝ ΡΟΛΩΝ)
socket.on('update-staff-list', (staffList) => {
    console.log("📥 Staff List Received:", staffList);
    
    if (!currentUser || currentUser.role !== 'admin') return;
    
    const waiterContainer = document.getElementById('waiter-list');
    const driverContainer = document.getElementById('driver-list');
    
    // Reset
    waiterContainer.innerHTML = '<h3>🤵 ΣΕΡΒΙΤΟΡΟΙ</h3>';
    driverContainer.innerHTML = '<h3>🛵 ΔΙΑΝΟΜΕΙΣ</h3>';

    if (staffList.length === 0) {
        waiterContainer.innerHTML += '<p style="color:gray; font-size:12px;">Κανείς συνδεδεμένος...</p>';
    }

    staffList.forEach(user => {
        const btn = document.createElement('button');
        // Έλεγχος Ρόλου (Case Insensitive για σιγουριά)
        const role = user.role.toLowerCase();
        
        btn.className = role === 'driver' ? 'btn-staff driver' : 'btn-staff waiter';
        btn.innerText = `🔔 ${user.username}`;
        btn.onclick = () => socket.emit('trigger-alarm', user.id);
        
        if (role === 'driver') driverContainer.appendChild(btn);
        else waiterContainer.appendChild(btn);
    });
});

socket.on('ring-bell', () => {
    if (currentUser) { updateMediaSession('alarm'); Watchdog.triggerPanicMode(); }
});
