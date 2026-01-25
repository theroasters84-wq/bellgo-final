const socket = io();
let isFully = typeof fully !== 'undefined';
let messaging = null;
let myToken = null;
let currentUser = null;

const Logic = {
    login: function(store, name, role, pass) {
        console.log("Logic.login started...");
        
        // 1. ΕΝΗΜΕΡΩΣΗ ΜΠΑΡΑΣ ΕΙΔΟΠΟΙΗΣΕΩΝ (ΑΜΕΣΑ)
        this.updateMediaSession('idle');
        this.setupMediaSession();

        // 2. ΕΚΚΙΝΗΣΗ WATCHDOG
        Watchdog.start(isFully);
        
        currentUser = { store, name, role, pass };

        // 3. FIREBASE SETUP (Μόνο για Web/Mobile)
        if (!isFully && role !== 'admin') {
            try { this.initFirebase(); } catch(e) { console.log("Firebase init error:", e); }
        }

        // 4. ΣΥΝΔΕΣΗ SOCKET
        socket.emit('join-store', { storeName: store, username: name, role: role, fcmToken: myToken });
        document.getElementById('userInfo').innerText = `${name} (${role}) | ${store}`;
        
        if (role === 'admin') socket.emit('get-staff-list');
    },

    logout: function() {
        if(confirm("Σίγουρα έξοδος;")) {
            Watchdog.stopAll(); 
            socket.emit('logout-user'); 
            location.reload(); 
        }
    },

    sendChat: function() {
        const inp = document.getElementById('chatInput');
        const text = inp.value.trim();
        if (!text || !currentUser) return;
        socket.emit('send-chat', { store: currentUser.store, user: currentUser.name, role: currentUser.role, text: text });
        inp.value = '';
    },

    initFirebase: function() {
        if (!isFully) {
            const firebaseConfig = { 
                apiKey: "AIzaSyBDOAlwLn4P5PMlwkg_Hms6-4f9fEcBKn8",
                authDomain: "bellgo-5dbe5.firebaseapp.com",
                projectId: "bellgo-5dbe5",
                storageBucket: "bellgo-5dbe5.firebasestorage.app",
                messagingSenderId: "799314495253",
                appId: "1:799314495253:web:baf6852f2a065c3a2e8b1c",
                measurementId: "G-379ETZJP8H"
            };
            
            if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
            messaging = firebase.messaging();
            
            // Ζητάμε το Token και το στέλνουμε στον Server
            messaging.getToken().then((token) => {
                myToken = token;
                console.log("🔑 FCM Token Received:", token);
                if (currentUser) {
                    socket.emit('update-token', { store: currentUser.store, user: currentUser.name, token: token });
                }
            }).catch(e => console.log("⚠️ Token Error:", e));

            messaging.onMessage(() => { if(currentUser) { Logic.updateMediaSession('alarm'); Watchdog.triggerPanicMode(); }});
        }
    },

    setupMediaSession: function() {
        if ('mediaSession' in navigator) {
            const stopHandler = () => { Watchdog.stopPanicMode(); this.updateMediaSession('idle'); };
            navigator.mediaSession.setActionHandler('play', stopHandler);
            navigator.mediaSession.setActionHandler('pause', stopHandler);
            navigator.mediaSession.setActionHandler('stop', stopHandler);
        }
    },

    updateMediaSession: function(state) {
        if (!('mediaSession' in navigator)) return;
        
        navigator.mediaSession.playbackState = "playing"; // ΚΛΕΙΔΙ ΓΙΑ ANTI-SLEEP
        
        const artwork = state === 'alarm' 
            ? [{ src: 'https://cdn-icons-png.flaticon.com/512/10337/10337229.png', sizes: '512x512', type: 'image/png' }]
            : [{ src: 'https://cdn-icons-png.flaticon.com/512/190/190411.png', sizes: '512x512', type: 'image/png' }];

        navigator.mediaSession.metadata = new MediaMetadata({
            title: state === 'alarm' ? "🚨 ΚΛΗΣΗ!" : "🟢 BellGo Active",
            artist: state === 'alarm' ? "ΠΑΤΑ ΓΙΑ STOP" : "Online & Ready",
            album: currentUser ? currentUser.store : "System",
            artwork: artwork
        });
    }
};

// LISTENERS
socket.on('update-staff-list', (staffList) => {
    const container = document.getElementById('staffListContainer');
    if(container) {
        container.innerHTML = ''; 
        staffList.forEach(user => {
            if (user.role === 'admin') return; 
            const btn = document.createElement('button');
            const role = user.role.toLowerCase();
            btn.className = role === 'driver' ? 'btn-staff driver' : 'btn-staff waiter';
            
            if (currentUser && currentUser.role === 'admin') {
                btn.innerText = `🔔 ${user.username}`;
                btn.onclick = () => socket.emit('trigger-alarm', user.username);
            } else {
                btn.innerText = `👤 ${user.username}`;
                btn.style.opacity = "0.7"; 
            }
            container.appendChild(btn);
        });
    }
});

socket.on('new-chat', (data) => {
    const chatBox = document.getElementById('chat-messages');
    if(chatBox) {
        const div = document.createElement('div');
        div.className = `msg ${data.role === 'admin' ? 'admin' : ''} ${data.user === currentUser?.name ? 'self' : ''}`;
        div.innerHTML = `<span class="name">${data.user}</span>${data.text}`;
        chatBox.appendChild(div);
        chatBox.scrollTop = chatBox.scrollHeight;
    }
});

socket.on('ring-bell', () => {
    Logic.updateMediaSession('alarm');
    Watchdog.triggerPanicMode();
});

window.onload = function() {
    const siren = document.getElementById('siren');
    if(siren) { siren.pause(); siren.currentTime = 0; }
};
