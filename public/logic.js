const socket = io();
let isFully = typeof fully !== 'undefined';
let messaging = null;
let myToken = null;
let currentUser = null;

// Namespace για να τα καλούμε από το HTML (Logic.login, Logic.logout)
const Logic = {
    
    // 1. LOGIN
    login: async function(store, name, role, pass) {
        // --- A. START AUDIO (FORCE) ---
        const silence = document.getElementById('silence');
        if (silence) {
            silence.volume = 1.0;
            silence.play().then(() => {
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing";
                this.setupMediaSession();
            }).catch(e => console.log("Audio block:", e));
        }

        // --- B. SETUP WATCHDOG & WAKELOCK ---
        Watchdog.start(isFully);
        
        currentUser = { store, name, role, pass };

        if (!isFully && role !== 'admin') {
            try { 
               // Firebase Setup (μόνο αν δεν είναι Fully)
               // ... (ίδιος κώδικας Firebase με πριν, παραλείπεται για συντομία αλλά υπάρχει στο αρχείο)
               this.initFirebase();
            } catch(e){}
        }

        // --- C. CONNECT ---
        socket.emit('join-store', { 
            storeName: store, 
            username: name, 
            role: role, 
            fcmToken: myToken 
        });

        // UI Update
        document.getElementById('userInfo').innerText = `${name} (${role}) | ${store}`;
    },

    // 2. LOGOUT (ΕΔΩ ΣΒΗΝΕΙ Ο ΧΡΗΣΤΗΣ)
    logout: function() {
        if(confirm("Σίγουρα έξοδος;")) {
            socket.emit('logout-user'); // Εντολή στον Server να διαγράψει
            location.reload(); // Επανεκκίνηση σελίδας
        }
    },

    // 3. CHAT SEND
    sendChat: function() {
        const inp = document.getElementById('chatInput');
        const text = inp.value.trim();
        if (!text || !currentUser) return;
        
        socket.emit('send-chat', {
            store: currentUser.store,
            user: currentUser.name,
            role: currentUser.role,
            text: text
        });
        inp.value = '';
    },

    // --- FIREBASE HELPER ---
    initFirebase: function() {
       // Βάλε εδώ τον κώδικα Firebase config αν θες, αλλιώς άστο στο global scope όπως πριν
       // Για συντομία, θεωρούμε ότι το Firebase έχει γίνει init στην αρχή του αρχείου (δες προηγούμενα)
    },

    setupMediaSession: function() {
        if ('mediaSession' in navigator) {
            this.updateMediaSession('idle');
            const stopHandler = () => { Watchdog.stopPanicMode(); this.updateMediaSession('idle'); };
            navigator.mediaSession.setActionHandler('play', stopHandler);
            navigator.mediaSession.setActionHandler('pause', stopHandler);
            navigator.mediaSession.setActionHandler('stop', stopHandler);
        }
    },

    updateMediaSession: function(state) {
        if (!('mediaSession' in navigator)) return;
        navigator.mediaSession.playbackState = "playing";
        const meta = state === 'alarm' 
            ? { title: "🚨 ΚΛΗΣΗ!", artist: "ΠΑΤΑ ΓΙΑ STOP", artwork: [] }
            : { title: "🟢 BellGo", artist: "Online", artwork: [] };
        navigator.mediaSession.metadata = new MediaMetadata(meta);
    }
};

// --- GLOBAL LISTENERS ---

// A. LIST UPDATE
socket.on('update-staff-list', (staffList) => {
    const container = document.getElementById('staffListContainer');
    container.innerHTML = ''; // Clear

    staffList.forEach(user => {
        // Δείχνουμε μόνο τους άλλους (όχι τον εαυτό μας) ή όλους αν είμαστε Admin
        if (user.role === 'admin') return; // Δεν δείχνουμε κουμπί για να καλέσεις τον Admin

        const btn = document.createElement('button');
        const role = user.role.toLowerCase();
        btn.className = role === 'driver' ? 'btn-staff driver' : 'btn-staff waiter';
        
        // Αν είμαι Admin, το κουμπί κάνει ΚΛΗΣΗ. Αν είμαι Staff, απλά βλέπω.
        if (currentUser && currentUser.role === 'admin') {
            btn.innerText = `🔔 ${user.username}`;
            btn.onclick = () => socket.emit('trigger-alarm', user.username); // Καλώ με το όνομα
        } else {
            btn.innerText = `👤 ${user.username}`;
            btn.style.opacity = "0.7"; // Απλά ένδειξη
        }
        container.appendChild(btn);
    });
});

// B. CHAT RECEIVE
socket.on('new-chat', (data) => {
    const chatBox = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `msg ${data.role === 'admin' ? 'admin' : ''} ${data.user === currentUser?.name ? 'self' : ''}`;
    
    // Αν είναι Admin, το κείμενο είναι τεράστιο
    div.innerHTML = `<span class="name">${data.user}</span>${data.text}`;
    
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight; // Auto-scroll
});

// C. ALARM
socket.on('ring-bell', () => {
    Logic.updateMediaSession('alarm');
    Watchdog.triggerPanicMode();
});

// D. FIREBASE (Global Init)
// ... (Ο κώδικας Firebase από το προηγούμενο logic.js μπαίνει εδώ έξω από το object)
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
        messaging.onMessage(() => { if(currentUser) { Logic.updateMediaSession('alarm'); Watchdog.triggerPanicMode(); }});
    } catch(e) {}
}

window.onload = function() {
    const siren = document.getElementById('siren');
    if(siren) { siren.pause(); siren.currentTime = 0; }
};
