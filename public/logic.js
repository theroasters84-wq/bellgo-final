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

        // Καθαρισμός "φαντασμάτων"
        const oldAlarm = localStorage.getItem('bellgo_is_ringing');
        if (oldAlarm === 'true') this.stopPanicMode();

        // Ρυθμίσεις Επιβίωσης (Fully)
        if (isFully) {
            fully.setBooleanSetting("preventSleep", true);
            fully.setBooleanSetting("wifiWakeLock", true);
            fully.setBooleanSetting("keepScreenOn", true);
        }

        // --- 1. ΑΚΡΟΑΣΗ ΚΛΕΙΔΩΜΑΤΟΣ ΟΘΟΝΗΣ (ΝΕΟ) ---
        // Αν ο σερβιτόρος πατήσει Power και κλείσει την οθόνη -> ΑΠΟΔΟΧΗ
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden' && this.isRinging) {
                console.log("🌑 Screen Locked -> Stopping Alarm (Ack)");
                this.buttonAck(); 
            }
        });

        // --- 2. ΑΚΡΟΑΣΗ ΚΟΥΜΠΙΩΝ ΕΝΤΑΣΗΣ ---
        document.addEventListener('keydown', (e) => {
            if ((e.key === "VolumeUp" || e.key === "VolumeDown") && this.isRinging) {
                console.log("🔊 Volume Key -> Stopping Alarm");
                this.buttonAck(); 
            }
        });

        // --- 3. HEARTBEAT LOOP ---
        if (this.interval) clearInterval(this.interval);
        this.interval = setInterval(() => {
             // Heartbeat
             if (socket.connected) {
                 socket.emit('heartbeat'); 
                 const statusDot = document.getElementById('connStatus');
                 if(statusDot) statusDot.style.background = '#00E676';
             } else {
                 const statusDot = document.getElementById('connStatus');
                 if(statusDot) statusDot.style.background = 'red';
             }

             // Audio Keep-Alive
             this.ensureAudioPlaying();
        }, 10000);
    },

    triggerPanicMode: function() {
        if (this.isRinging) return;
        this.isRinging = true;
        localStorage.setItem('bellgo_is_ringing', 'true');

        // 1. Media Session (Lock Screen UI)
        Logic.updateMediaSession('alarm');

        // 2. Ήχος
        const audio = document.getElementById('siren');
        if (audio) { audio.currentTime = 0; audio.loop = true; audio.play().catch(e=>{}); }
        
        // 3. Κόκκινη Οθόνη
        const alarmScreen = document.getElementById('alarmScreen');
        if(alarmScreen) alarmScreen.style.display = 'flex';
        
        // 4. Ξύπνημα Οθόνης (Safe Mode)
        if (isFully) fully.turnScreenOn();
        
        // 5. Δόνηση
        this.panicInterval = setInterval(() => {
            if (!this.isRinging) return;
            if (navigator.vibrate) navigator.vibrate([1000, 50, 1000]);
        }, 500);
    },

    stopPanicMode: function() {
        this.isRinging = false;
        localStorage.removeItem('bellgo_is_ringing');
        
        if (this.panicInterval) { clearInterval(this.panicInterval); this.panicInterval = null; }
        if (navigator.vibrate) navigator.vibrate(0);

        const audio = document.getElementById('siren');
        if (audio) { audio.pause(); audio.currentTime = 0; audio.loop = false; }
        
        const alarmScreen = document.getElementById('alarmScreen');
        if(alarmScreen) alarmScreen.style.display = 'none';

        // Επαναφορά Media Session
        Logic.updateMediaSession('active');
        this.ensureAudioPlaying();
    },
    
    buttonAck: function() {
        if (this.isRinging) {
            console.log("🔘 STOP ACTION DETECTED");
            socket.emit('alarm-ack'); 
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

        // 3. Firebase (Web Only)
        if (!isFully && role !== 'admin') {
            try { this.initFirebase(); } catch(e) {}
        }

        // 4. Socket Join
        const tokenToSend = myToken || (isFully ? 'FULLY' : 'WEB');
        socket.emit('join-store', { storeName: store, username: name, role: role, pass: pass, fcmToken: tokenToSend });
        
        const userInfo = document.getElementById('userInfo');
        if(userInfo) userInfo.innerText = `${name} (${role}) | ${store}`;
        
        if (role === 'admin') socket.emit('get-staff-list'); 
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
            // Placeholder
        }
    },

    setupMediaSession: function() {
        if ('mediaSession' in navigator) {
            const universalHandler = () => { 
                if (Watchdog.isRinging) {
                    Watchdog.buttonAck(); // Play/Pause/Next = ΑΠΟΔΟΧΗ
                }
                Watchdog.ensureAudioPlaying();
                Logic.updateMediaSession('active');
            };

            navigator.mediaSession.setActionHandler('play', universalHandler);
            navigator.mediaSession.setActionHandler('pause', universalHandler);
            navigator.mediaSession.setActionHandler('stop', universalHandler);
            navigator.mediaSession.setActionHandler('nexttrack', universalHandler);
            navigator.mediaSession.setActionHandler('previoustrack', universalHandler);
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
            artist: isAlarm ? "ΠΑΤΑ PLAY ΓΙΑ STOP" : "System Online",
            album: "Kitchen Alert",
            artwork: artwork
        });
    }
};

// ==========================================
// 4. SOCKET LISTENERS
// ==========================================

socket.on('connect', () => {
    console.log("✅ Connected");
    const statusDot = document.getElementById('connStatus');
    if(statusDot) statusDot.style.background = '#00E676';
});

socket.on('disconnect', () => {
    console.log("❌ Disconnected");
    const statusDot = document.getElementById('connStatus');
    if(statusDot) statusDot.style.background = 'red';
});

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
                btn.style.background = '#00E676'; 
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

socket.on('kitchen-alarm', () => {
    console.log("🔥 ALARM RECEIVED!");
    Watchdog.triggerPanicMode();
});

socket.on('ring-bell', () => {
    Watchdog.triggerPanicMode();
});

socket.on('stop-alarm', () => {
    Watchdog.stopPanicMode();
});

window.onload = function() {
    const siren = document.getElementById('siren');
    if(siren) { siren.pause(); siren.currentTime = 0; }
};
