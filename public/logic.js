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

        // 4. Socket Join
        socket.emit('join-store', { storeName: store, username: name, role: role, fcmToken: myToken });
        document.getElementById('userInfo').innerText = `${name} (${role}) | ${store}`;
        
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
            
            messaging.getToken().then((token) => {
                myToken = token;
                if (currentUser) {
                    socket.emit('update-token', { store: currentUser.store, user: currentUser.name, token: token });
                }
            }).catch(e => console.log("Token Fail:", e));

            messaging.onMessage(() => { if(currentUser) { Logic.updateMediaSession('alarm'); Watchdog.triggerPanicMode(); }});
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
            ? [
                { src: 'https://cdn-icons-png.flaticon.com/512/10337/10337229.png', sizes: '96x96', type: 'image/png' },
                { src: 'https://cdn-icons-png.flaticon.com/512/10337/10337229.png', sizes: '128x128', type: 'image/png' },
                { src: 'https://cdn-icons-png.flaticon.com/512/10337/10337229.png', sizes: '512x512', type: 'image/png' }
              ]
            : [
                { src: 'https://cdn-icons-png.flaticon.com/512/190/190411.png', sizes: '96x96', type: 'image/png' },
                { src: 'https://cdn-icons-png.flaticon.com/512/190/190411.png', sizes: '128x128', type: 'image/png' },
                { src: 'https://cdn-icons-png.flaticon.com/512/190/190411.png', sizes: '512x512', type: 'image/png' }
              ];

        navigator.mediaSession.metadata = new MediaMetadata({
            title: isAlarm ? "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ!" : "BellGo Active",
            artist: isAlarm ? "ΠΑΤΑ NEXT ΓΙΑ STOP" : "System Online",
            album: "Kitchen Alert",
            artwork: artwork
        });
    }
};

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
    if(typeof Watchdog !== 'undefined') Watchdog.triggerPanicMode();
});

window.onload = function() {
    const siren = document.getElementById('siren');
    if(siren) { siren.pause(); siren.currentTime = 0; }
};
