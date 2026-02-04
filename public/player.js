const AudioEngine = {
    keepAlivePlayer: null, // Player 1: Κρατάει την μπάρα (tone19hz)
    alarmPlayer: null,     // Player 2: Κάνει τον θόρυβο (alert)
    isRinging: false,
    wakeLock: null,
    initialized: false,

    async init() {
        if (this.initialized) return;
        
        console.log("🔊 AudioEngine: Starting Engine (Dual Mode)...");

        // --- 1. SETUP PLAYER 1 (KEEP ALIVE) ---
        // Χρησιμοποιούμε 19Hz tone για να μην το κόβει το iOS ως "silence"
        if (!this.keepAlivePlayer) {
            this.keepAlivePlayer = new Audio("tone19hz.wav"); // ΣΗΜΑΝΤΙΚΟ: Θέλει αυτό το αρχείο
            this.keepAlivePlayer.loop = true;
            this.keepAlivePlayer.volume = 1.0; 
            
            // Watchdog: Αν το iOS το κάνει pause μόνο του, το ξαναβάζουμε μπρος
            this.keepAlivePlayer.addEventListener('pause', () => {
                if (!this.isRinging) {
                    console.log("⚠️ KeepAlive Paused by System -> Force Play");
                    this.keepAlivePlayer.play().catch(e => console.log("Replay fail:", e));
                }
            });
        }

        // --- 2. SETUP PLAYER 2 (ALARM SOUND) ---
        if (!this.alarmPlayer) {
            this.alarmPlayer = new Audio("alert.mp3");
            this.alarmPlayer.loop = true;
            this.alarmPlayer.volume = 1.0;
        }

        this.requestWakeLock();
        this.setupMediaSession();

        // Ξεκινάμε το "Χαλί"
        try {
            await this.keepAlivePlayer.play();
            this.initialized = true;
            this.updateDisplay("online");
            console.log("✅ Keep-Alive Running");
        } catch (e) {
            console.log("⏳ Waiting for interaction to start AudioEngine...");
        }
    },

    // Καλείται αν η εφαρμογή βγει από background
    ensureKeepAlive() {
        if (this.keepAlivePlayer && this.keepAlivePlayer.paused && !this.isRinging) {
            this.keepAlivePlayer.play().catch(()=>{});
        }
    },

    setupMediaSession() {
        if (!("mediaSession" in navigator)) return;

        const handleNotificationClick = () => {
            console.log("👆 Media Button Clicked");
            
            if (this.isRinging) {
                // Αν χτυπάει, το κουμπί κάνει ΑΠΟΔΟΧΗ
                if (window.App && window.App.acceptAlarm) {
                    window.App.acceptAlarm(); 
                }
            } else {
                // Αν δεν χτυπάει, απλά σιγουρεύουμε ότι ο Player 1 παίζει
                this.keepAlivePlayer.play().catch(()=>{});
            }
        };

        // Συνδέουμε όλα τα κουμπιά
        const actions = ['play', 'pause', 'stop', 'previoustrack', 'nexttrack'];
        actions.forEach(action => {
             try {
                 navigator.mediaSession.setActionHandler(action, handleNotificationClick);
             } catch(e) {}
        });
    },

    // --- ΚΛΗΣΗ ---
    async triggerAlarm() {
        if (this.isRinging) return;
        this.isRinging = true;

        console.log("🚨 ALARM TRIGGERED");

        // 1. Παύση του KeepAlive για να μην μπλέκονται
        this.keepAlivePlayer.pause();

        // 2. Ξεκινάμε τον ΘΟΡΥΒΟ
        this.alarmPlayer.currentTime = 0;
        try {
            await this.alarmPlayer.play();
        } catch(e) { console.error("Alarm Play Error:", e); }

        this.updateDisplay("alarm");
        this.vibrate(true);
        this.sendNotification();
    },

    // --- ΑΠΟΔΟΧΗ ---
    stopAlarm() {
        if (!this.isRinging) return;
        this.isRinging = false;

        console.log("✅ ALARM STOPPED");

        // 1. Σταματάμε τον θόρυβο
        this.alarmPlayer.pause();
        this.alarmPlayer.currentTime = 0;

        // 2. Ξαναβάζουμε το KeepAlive
        this.keepAlivePlayer.play().catch(()=>{});

        // 3. Επαναφέρουμε τα γράμματα
        this.updateDisplay("online");
        this.vibrate(false);
    },

    updateDisplay(state) {
        if (!("mediaSession" in navigator)) return;

        if (state === "alarm") {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ",
                artist: "Πάτα ΕΔΩ για Αποδοχή",
                album: "BellGo Alert",
                artwork: [{ src: "icon.png", sizes: "512x512", type: "image/png" }]
            });
        } else {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: "BellGo Online",
                artist: "Σύστημα Ενεργό",
                album: "Μην κλείνετε την εφαρμογή",
                artwork: [{ src: "icon.png", sizes: "512x512", type: "image/png" }]
            });
        }

        navigator.mediaSession.playbackState = "playing";
    },

    vibrate(active) {
        if (!navigator.vibrate) return;
        if (active) {
            navigator.vibrate([1000, 500]);
            if (this.vibInt) clearInterval(this.vibInt);
            this.vibInt = setInterval(() => navigator.vibrate([1000, 500]), 1600);
        } else {
            if (this.vibInt) clearInterval(this.vibInt);
            navigator.vibrate(0);
        }
    },

    async requestWakeLock() {
        if ('wakeLock' in navigator) {
            try { 
                this.wakeLock = await navigator.wakeLock.request("screen"); 
                document.addEventListener('visibilitychange', async () => {
                    if (this.wakeLock !== null && document.visibilityState === 'visible') {
                        this.wakeLock = await navigator.wakeLock.request("screen");
                    }
                });
            } catch (e) {}
        }
    },

    sendNotification() {
        if (Notification.permission === "granted") {
            try {
                const notif = new Notification("🚨 ΚΛΗΣΗ!", { 
                    icon: "/icon.png", 
                    tag: 'alarm-tag',
                    requireInteraction: true 
                });
                
                notif.onclick = () => { 
                    window.focus(); 
                    if (window.App && window.App.acceptAlarm) {
                        window.App.acceptAlarm();
                    }
                    notif.close(); 
                };
            } catch (e) {}
        }
    }
};

// Volume Buttons (Accept Logic via Keydown)
window.addEventListener('keydown', (e) => {
    // 24 = Volume Up, 25 = Volume Down (Android/Keyboard only)
    if (AudioEngine.isRinging && (e.keyCode === 24 || e.keyCode === 25)) { 
        if (window.App && window.App.acceptAlarm) {
            window.App.acceptAlarm();
        }
    }
});

window.AudioEngine = AudioEngine;
