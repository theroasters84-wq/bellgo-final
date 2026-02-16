/* --------------------------------------------------------------------------
   AUDIO ENGINE & BACKGROUND NOTIFICATIONS
   --------------------------------------------------------------------------
   1. Dual Player Strategy (KeepAlive + Alarm)
   2. Media Session Support (Lock Screen Controls)
   3. Background Web Notifications (Loop Support)
-------------------------------------------------------------------------- */

const AudioEngine = {
    keepAlivePlayer: null, // Player 1: Κρατάει την μπάρα (tone19hz)
    alarmPlayer: null,     // Player 2: Κάνει τον θόρυβο (alert)
    isRinging: false,
    wakeLock: null,
    vibInt: null,

    async init() {
        console.log("🔊 AudioEngine: DUAL PLAYER STRATEGY");

        // --- 1. SETUP PLAYER 1 (KEEP ALIVE / BAR OWNER) ---
        if (!this.keepAlivePlayer) {
            this.keepAlivePlayer = document.createElement("audio");
            this.keepAlivePlayer.id = 'keepAlive';
            this.keepAlivePlayer.src = "tone19hz.wav"; 
            this.keepAlivePlayer.loop = true;
            this.keepAlivePlayer.volume = 1.0; 
            document.body.appendChild(this.keepAlivePlayer);
        }

        // --- 2. SETUP PLAYER 2 (ALARM SOUND) ---
        if (!this.alarmPlayer) {
            this.alarmPlayer = document.createElement("audio");
            this.alarmPlayer.id = 'alarmSound';
            this.alarmPlayer.src = "alert.mp3"; 
            this.alarmPlayer.loop = true;
            this.alarmPlayer.volume = 1.0;
            document.body.appendChild(this.alarmPlayer);
        }

        this.requestWakeLock();
        this.setupMediaSession();

        // Ξεκινάμε το "Χαλί"
        try {
            await this.keepAlivePlayer.play();
            this.updateDisplay("online");
            console.log("✅ Keep-Alive Running");
        } catch (e) {
            console.log("⏳ Waiting for interaction to start AudioEngine...");
        }
    },

    setupMediaSession() {
        if (!("mediaSession" in navigator)) return;

        // Όταν πατάς κουμπί στην μπάρα (Play/Pause/Next), κάνουμε ΑΠΟΔΟΧΗ
        const handleNotificationClick = () => {
            console.log("👆 Notification Button Clicked");
            
            if (this.isRinging) {
                // ΣΗΜΑΝΤΙΚΟ: Καλουμε την Global συνάρτηση του App (premium.html)
                if (window.App && window.App.acceptAlarm) {
                    window.App.acceptAlarm(); 
                } else {
                    this.stopAlarm(); // Fallback
                }
            } else {
                // Αν δεν χτυπάει, απλά σιγουρεύουμε ότι ο Player 1 παίζει
                this.keepAlivePlayer.play();
            }
        };

        // Συνδέουμε όλα τα κουμπιά
        navigator.mediaSession.setActionHandler('play', handleNotificationClick);
        navigator.mediaSession.setActionHandler('pause', handleNotificationClick);
        navigator.mediaSession.setActionHandler('stop', handleNotificationClick);
        navigator.mediaSession.setActionHandler('previoustrack', handleNotificationClick);
        navigator.mediaSession.setActionHandler('nexttrack', handleNotificationClick);
    },

    // --- ΚΛΗΣΗ (Triggered by Socket) ---
    async triggerAlarm(source) {
        if (this.isRinging) return;
        this.isRinging = true;

        console.log("🚨 ALARM TRIGGERED");

        // 1. Αλλάζουμε τα γράμματα στην μπάρα
        this.updateDisplay("alarm", source);

        // 2. Ξεκινάμε τον ΘΟΡΥΒΟ
        this.alarmPlayer.currentTime = 0;
        try {
            await this.alarmPlayer.play();
        } catch(e) { console.error("Audio Play Error:", e); }

        // 3. UI Overlay (Αν υπάρχει στο HTML)
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) overlay.style.display = 'flex';

        this.vibrate(true); // ✅ Now uses the intense pattern from sw.js logic if background, or local here
        
        // 4. ΕΛΕΓΧΟΣ BACKGROUND: Αν η καρτέλα δεν φαίνεται, στείλε Notification
        // (Μόνο αν ΔΕΝ είμαστε σε Native App, γιατί εκεί το κάνει το Plugin)
        if (document.hidden && !window.Capacitor) {
            this.sendNotification(source);
        }
    },

    // --- ΑΠΟΔΟΧΗ ---
    stopAlarm() {
        if (!this.isRinging) return; 
        this.isRinging = false;

        console.log("✅ ALARM STOPPED (Audio Engine)");

        // 1. Σταματάμε ΜΟΝΟ τον θόρυβο
        this.alarmPlayer.pause();
        this.alarmPlayer.currentTime = 0;

        // 2. Επαναφέρουμε τα γράμματα
        this.updateDisplay("online");

        // 3. UI Hide
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) overlay.style.display = 'none';

        this.vibrate(false);
    },

    updateDisplay(state, source) {
        if (!("mediaSession" in navigator)) return;

        if (state === "alarm") {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: source ? `🚨 ${source}` : "🚨 ΚΛΗΣΗ",
                artist: "Πάτα ΠΑΥΣΗ για Αποδοχή",
                album: "BellGo Alert",
                artwork: [{ src: "icon.png", sizes: "512x512", type: "image/png" }]
            });
        } else {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: "BellGo Online",
                artist: "Σύστημα Ενεργό",
                album: "Αναμονή...",
                artwork: [{ src: "icon.png", sizes: "512x512", type: "image/png" }]
            });
        }
        navigator.mediaSession.playbackState = "playing";
    },

    vibrate(active) {
        if (!navigator.vibrate) return;
        if (active) {
            // ✅ SUPER INTENSE VIBRATION: 3 Short pulses, 1 Long pulse (SOS style)
            const pattern = [500, 100, 500, 100, 500, 100, 2000, 500]; 
            navigator.vibrate(pattern);
            if (this.vibInt) clearInterval(this.vibInt);
            this.vibInt = setInterval(() => navigator.vibrate(pattern), 4500);
        } else {
            if (this.vibInt) clearInterval(this.vibInt);
            navigator.vibrate(0);
        }
    },

    async requestWakeLock() {
        if ('wakeLock' in navigator) {
            try { this.wakeLock = await navigator.wakeLock.request("screen"); } catch (e) {}
        }
    },

    // Τοπικό Notification για Background (Backup στο Server Loop)
    sendNotification(source) {
        if (Notification.permission === "granted") {
            try {
                const notif = new Notification("🚨 ΚΛΗΣΗ!", { 
                    body: source ? `Ο ${source} σε ζητάει!` : "Πατήστε για αποδοχή",
                    icon: "/admin.png", 
                    tag: 'bellgo-alarm', // Ίδιο tag με το sw.js για να μην γεμίζει
                    renotify: true,
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

// Volume Buttons Listener (Hardware Keys -> Accept)
window.addEventListener('keydown', (e) => {
    // 24=VolUp, 25=VolDown (Android WebView specific often)
    // ArrowUp/Down for PC testing
    if (AudioEngine.isRinging && (e.keyCode === 24 || e.keyCode === 25 || e.code === 'ArrowUp' || e.code === 'ArrowDown')) { 
        if (window.App && window.App.acceptAlarm) {
            window.App.acceptAlarm();
        } else {
            AudioEngine.stopAlarm();
        }
    }
});

// Export to Window
window.AudioEngine = AudioEngine;
