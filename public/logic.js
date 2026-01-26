// ==========================================
// 1. SETUP & VARIABLES
// ==========================================
const socket = io();
let isFully = typeof fully !== 'undefined';
let messaging = null;
let myToken = null;
let currentUser = null;

// ==========================================
// 2. WATCHDOG (Ο Φύλακας - Safe Mode)
// ==========================================
const Watchdog = {
    interval: null,
    panicInterval: null,
    isRinging: false,

    start: function() {
        console.log("🛡️ Watchdog: Active (Safe Mode)");

        // Καθαρισμός τυχόν παλιών συναγερμών "φαντασμάτων"
        const oldAlarm = localStorage.getItem('bellgo_is_ringing');
        if (oldAlarm === 'true') this.stopPanicMode();

        // Ρυθμίσεις Επιβίωσης (Αν είμαστε σε Fully)
        if (isFully) {
            fully.setBooleanSetting("preventSleep", true);
            fully.setBooleanSetting("wifiWakeLock", true);
            fully.setBooleanSetting("keepScreenOn", true);
        }

        // Ακρόαση Κουμπιών Έντασης (Safe Way - Χωρίς fully.bind)
        document.addEventListener('keydown', (e) => {
            if ((e.key === "VolumeUp" || e.key === "VolumeDown") && this.isRinging) {
                console.log("🔊 Volume Key -> Stopping Alarm");
                this.buttonAck(); // Σταμάτα το
            }
        });

        // Heartbeat Loop (Κάθε 10 δευτερόλεπτα)
        if (this.interval) clearInterval(this.interval);
        this.interval = setInterval(() => {
             // 1. Στέλνουμε παλμό στον Server
             if (socket.connected) {
                 socket.emit('heartbeat'); 
                 const statusDot = document.getElementById('connStatus');
                 if(statusDot) statusDot.style.background = '#00E676'; // Πράσινο
             } else {
                 const statusDot = document.getElementById('connStatus');
                 if(statusDot) statusDot.style.background = 'red'; // Κόκκινο
             }

             // 2. Audio Keep-Alive (Για να μην κοιμηθεί το WebView)
             this.ensureAudioPlaying();
        }, 10000);
    },

    triggerPanicMode: function() {
        if (this.isRinging) return;
        this.isRinging = true;
        localStorage.setItem('bellgo_is_ringing', 'true');

        // 1. Ενημέρωση Media Session (Για Lock Screen)
        Logic.updateMediaSession('alarm');

        // 2. Ήχος Σειρήνας
        const audio = document.getElementById('siren');
        if (audio) { audio.currentTime = 0; audio.loop = true; audio.play().catch(e=>{}); }
        
        // 3. Εμφάνιση Κόκκινης Οθόνης
        const alarmScreen = document.getElementById('alarmScreen');
        if(alarmScreen) alarmScreen.style.display = 'flex';
        
        // 4. Ξύπνημα Οθόνης (SAFE: Μόνο TurnOn, ΟΧΙ Foreground για να μην κολλάει το Xiaomi)
        if (isFully) {
            fully.turnScreenOn();
        }
        
        // 5. Δόνηση
        this.panicInterval = setInterval(() => {
            if (!this.isRinging) return;
            if (navigator.vibrate) navigator.vibrate([1000, 50, 1000]);
        }, 500);
    },

    stopPanicMode: function() {
        this.isRinging = false;
        localStorage.removeItem('bellgo_is_ringing');
        
        // Σταματάμε δόνηση και Timer
        if (this.panicInterval) { clearInterval(this.panicInterval); this.panicInterval = null; }
        if (navigator.vibrate) navigator.vibrate(0);

        // Σταματάμε Σειρήνα
        const audio = document.getElementById('siren');
        if (audio) { audio.pause(); audio.currentTime = 0; audio.loop = false; }
        
        // Κρύβουμε Οθόνη
        const alarmScreen = document.getElementById('alarmScreen');
        if(alarmScreen) alarmScreen.style.display = 'none';

        // Επαναφορά Media Session (Normal)
        Logic.updateMediaSession('active');
        
        // Παίζουμε Σιωπή (συνέχεια λειτουργίας στο παρασκήνιο)
        this.ensureAudioPlaying();
    },
    
    buttonAck: function() {
        if (this.isRinging) {
            console.log("🔘 STOP ACTION DETECTED");
            socket.emit('alarm-ack'); // Λέμε στον Server "Το έλαβα"
            this.stopPanicMode();
        }
    },

    ensureAudioPlaying: function() {
        const silence = document.getElementById('silence');
        if (silence && silence.paused) { 
            silence.play().catch(e => {}); 
        }
    }
};

// ==========================================
// 3. LOGIC (Controller)
// ==========================================
const Logic = {
    login: function(store, name, role, pass) {
        console.log("Logic.login started...");
        
        // 1. Initialize Media Session
        this.updateMediaSession('active'); 
        this.setupMediaSession();

        // 2. Start Watchdog
        Watchdog.start();
        
        currentUser = { store, name, role, pass };

        // 3. Firebase (Web Only - Αν υπάρχει)
        if (!isFully && role !== 'admin') {
            try { this.initFirebase(); } catch(e) {}
        }

        // 4. Socket Join
        const tokenToSend = myToken || (isFully ? 'FULLY' : 'WEB');
        socket.emit('join-store', { storeName: store, username: name, role: role, pass: pass, fcmToken: tokenToSend });
        
        const userInfo = document.getElementById('userInfo');
        if(userInfo) userInfo.innerText = `${name} (${role}) | ${store}`;
        
        // Ζητάμε λίστα (αν είμαστε admin)
        if (role === 'admin') socket.emit('get-staff-list'); // Εδώ στέλνουμε αίτημα για τη λίστα
    },

    logout: function() {
        if(confirm("Σίγουρα έξοδος;")) {
            if(Watchdog.panicInterval) clearInterval(Watchdog.panicInterval);
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
        if (!isFully && typeof firebase !== 'undefined') {
            // Placeholder logic
        }
    },

    setupMediaSession: function() {
        if ('mediaSession' in navigator) {
            const stopHandler = () => { Watchdog.buttonAck(); };
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

// ==========================================
// 4. SOCKET LISTENERS
// ==========================================

socket.on('connect', () => {
    console.log("✅ Connected to Server");
    const statusDot = document.getElementById('connStatus');
    if(statusDot) statusDot.style.background = '#00E676';
});

socket.on('disconnect', () => {
    console.log("❌ Disconnected from Server");
    const statusDot = document.getElementById('connStatus');
    if(statusDot) statusDot.style.background = 'red';
});

// ✅ ΕΔΩ ΕΙΝΑΙ Η ΔΙΟΡΘΩΣΗ: ΑΚΟΥΜΕ ΤΟ 'staff-list-update'
socket.on('staff-list-update', (staffList) => {
    const container = document.getElementById('staffListContainer');
    if(container) {
        container.innerHTML = ''; 
        staffList.forEach(user => {
            if (user.role === 'admin') return; 
            const btn = document.createElement('button');
            const role = user.role.toLowerCase();
            btn.className = role === 'driver' ? 'btn-staff driver' : 'btn-staff waiter';
            
            if (currentUser && currentUser.role === 'admin') {
                btn.innerHTML = `🔔 <b>${user.name}</b>`;
                btn.onclick = () => {
                    btn.style.transform = "scale(0.95)";
                    setTimeout(() => btn.style.transform = "scale(1)", 100);
                    socket.emit('trigger-alarm', user.name);
                };
            } else {
                btn.innerText = `👤 ${user.name}`;
                btn.style.opacity = "0.7"; 
            }
            container.appendChild(btn);
        });
        if (staffList.length === 0) container.innerHTML = '<p style="color:#666; margin-top:20px;">Κανένας online...</p>';
    }
});

socket.on('alarm-receipt', (data) => {
    if (currentUser && currentUser.role === 'admin') {
        const btns = document.querySelectorAll('.btn-staff');
        btns.forEach(btn => {
            if(btn.innerText.includes(data.name)) {
                const originalText = btn.innerHTML;
                btn.style.background = '#00E676'; // Πράσινο
                btn.innerHTML = `✅ <b>${data.name}</b> (ΤΟ ΕΛΑΒΕ)`;
                setTimeout(() => { 
                    btn.style.background = ''; 
                    btn.innerHTML = originalText; 
                }, 4000);
            }
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

// Λήψη Συναγερμού
socket.on('kitchen-alarm', () => {
    console.log("🔥 ALARM RECEIVED!");
    Watchdog.triggerPanicMode();
});

// Συμβατότητα
socket.on('ring-bell', () => {
    Watchdog.triggerPanicMode();
});

// Stop από Admin
socket.on('stop-alarm', () => {
    Watchdog.stopPanicMode();
});

// Αρχικοποίηση Σιωπής
window.onload = function() {
    const siren = document.getElementById('siren');
    if(siren) { siren.pause(); siren.currentTime = 0; }
};
