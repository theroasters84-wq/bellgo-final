const socket = io();
let isFully = typeof fully !== 'undefined';
let messaging = null;
let myToken = null;
let currentUser = null;

const Logic = {
    login: function(store, name, role, pass) {
        console.log("Logic.login started...");
        
        // 1. Initialize Media Session
        this.updateMediaSession('active'); 
        this.setupMediaSession();

        // 2. Start Watchdog
        if(typeof Watchdog !== 'undefined') Watchdog.start(isFully);
        
        currentUser = { store, name, role, pass };

        // 3. Firebase (Web Only)
        if (!isFully && role !== 'admin') {
            try { this.initFirebase(); } catch(e) {}
        }

        // 4. Socket Join (Στέλνουμε ΚΑΙ το pass)
        socket.emit('join-store', { storeName: store, username: name, role: role, pass: pass, fcmToken: myToken });
        
        const userInfo = document.getElementById('userInfo');
        if(userInfo) userInfo.innerText = `${name} (${role}) | ${store}`;
        
        // Ζητάμε λίστα (αν είμαστε admin)
        if (role === 'admin') socket.emit('get-staff-list');
    },

    logout: function() {
        if(confirm("Σίγουρα έξοδος;")) {
            if(typeof Watchdog !== 'undefined') Watchdog.stopAll();
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
            // ... (Ο κώδικας Firebase μένει ίδιος) ...
            // Αν θες να το κρατήσεις καθαρό, άστο όπως το είχες
            // Το σημαντικό είναι παρακάτω στο socket.on
        }
    },

    setupMediaSession: function() {
        if ('mediaSession' in navigator) {
            const stopHandler = () => { if(typeof Watchdog !== 'undefined') Watchdog.stopPanicMode(); this.updateMediaSession('active'); };
            navigator.mediaSession.setActionHandler('play', stopHandler);
            navigator.mediaSession.setActionHandler('pause', stopHandler);
            navigator.mediaSession.setActionHandler('stop', stopHandler);
            navigator.mediaSession.setActionHandler('nexttrack', stopHandler);
            navigator.mediaSession.setActionHandler('previoustrack', stopHandler);
        }
    },

    updateMediaSession: function(state) {
        if (!('mediaSession' in navigator)) return;
        navigator.mediaSession.playbackState = "playing";
        const isAlarm = state === 'alarm';
        const artwork = isAlarm
            ? [ { src: 'https://cdn-icons-png.flaticon.com/512/10337/10337229.png', sizes: '512x512', type: 'image/png' } ]
            : [ { src: 'https://cdn-icons-png.flaticon.com/512/190/190411.png', sizes: '512x512', type: 'image/png' } ];

        navigator.mediaSession.metadata = new MediaMetadata({
            title: isAlarm ? "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ!" : "BellGo Active",
            artist: isAlarm ? "ΠΑΤΑ NEXT ΓΙΑ STOP" : "System Online",
            album: "Kitchen Alert",
            artwork: artwork
        });
    }
};

// --- SOCKET LISTENERS ---

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
                btn.innerText = `🔔 ${user.name}`; // Χρησιμοποιούμε user.name
                // 🔥 ΕΔΩ ΠΑΤΑΕΙ Ο ADMIN 🔥
                btn.onclick = () => {
                    console.log("Calling:", user.name);
                    socket.emit('trigger-alarm', user.name);
                };
            } else {
                btn.innerText = `👤 ${user.name}`;
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

// 🔥 Η ΜΕΓΑΛΗ ΔΙΟΡΘΩΣΗ ΕΔΩ 🔥
// O Server στέλνει 'kitchen-alarm', όχι 'ring-bell'
socket.on('kitchen-alarm', () => {
    console.log("🔥 ALARM RECEIVED (Socket)!");
    Logic.updateMediaSession('alarm');
    if(typeof Watchdog !== 'undefined') Watchdog.triggerPanicMode();
});

// Κρατάμε και το παλιό για συμβατότητα με Firebase
socket.on('ring-bell', () => {
    console.log("🔥 ALARM RECEIVED (Ring-Bell)!");
    Logic.updateMediaSession('alarm');
    if(typeof Watchdog !== 'undefined') Watchdog.triggerPanicMode();
});

window.onload = function() {
    const siren = document.getElementById('siren');
    if(siren) { siren.pause(); siren.currentTime = 0; }
};
