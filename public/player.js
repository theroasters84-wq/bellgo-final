const AudioEngine = {
    keepAlivePlayer: null, // Player 1: Κρατάει την μπάρα (tone19hz)
    alarmPlayer: null,     // Player 2: Κάνει τον θόρυβο (alert)
    isRinging: false,
    wakeLock: null,

    async init() {
        console.log("🔊 AudioEngine: DUAL PLAYER STRATEGY");

        // --- 1. SETUP PLAYER 1 (KEEP ALIVE / BAR OWNER) ---
        if (!this.keepAlivePlayer) {
            this.keepAlivePlayer = document.createElement("audio");
            this.keepAlivePlayer.id = 'keepAlive';
            this.keepAlivePlayer.src = "tone19hz.wav"; // Βεβαιώσου ότι υπάρχει!
            this.keepAlivePlayer.loop = true;
            this.keepAlivePlayer.volume = 1.0; // Τέρμα ένταση για να μείνει η μπάρα
            document.body.appendChild(this.keepAlivePlayer);
        }

        // --- 2. SETUP PLAYER 2 (ALARM SOUND) ---
        if (!this.alarmPlayer) {
            this.alarmPlayer = document.createElement("audio");
            this.alarmPlayer.id = 'alarmSound';
            this.alarmPlayer.src = "alert.mp3"; // Βεβαιώσου ότι υπάρχει!
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
            console.log("⏳ Waiting for interaction...");
        }
    },

    setupMediaSession() {
        if (!("mediaSession" in navigator)) return;

        // --- ΑΥΤΗ ΕΙΝΑΙ Η ΔΙΟΡΘΩΣΗ ---
        // Όταν πατάς κουμπί στην μπάρα (Play/Pause/Next), δεν σταματάμε απλά τον ήχο.
        // Φωνάζουμε την App.acceptAlarm() στο index.html για να το μάθει και ο Server!
        const handleNotificationClick = () => {
            console.log("👆 Notification Button Clicked");
            
            if (this.isRinging) {
                // ΣΗΜΑΝΤΙΚΟ: Καλουμε την Global συνάρτηση του App
                if (window.App && window.App.acceptAlarm) {
                    window.App.acceptAlarm(); 
                } else {
                    this.stopAlarm(); // Fallback αν κάτι πάει στραβά
                }
            } else {
                // Αν δεν χτυπάει, απλά σιγουρεύουμε ότι ο Player 1 παίζει
                this.keepAlivePlayer.play();
            }
        };

        // Συνδέουμε όλα τα κουμπιά με την παραπάνω λογική
        navigator.mediaSession.setActionHandler('play', handleNotificationClick);
        navigator.mediaSession.setActionHandler('pause', handleNotificationClick);
        navigator.mediaSession.setActionHandler('stop', handleNotificationClick);
        navigator.mediaSession.setActionHandler('previoustrack', handleNotificationClick);
        navigator.mediaSession.setActionHandler('nexttrack', handleNotificationClick);
    },

    // --- ΚΛΗΣΗ ---
    async triggerAlarm() {
        if (this.isRinging) return;
        this.isRinging = true;

        console.log("🚨 ALARM TRIGGERED");

        // 1. Αλλάζουμε τα γράμματα στην μπάρα (Ο Player 1 συνεχίζει να παίζει)
        this.updateDisplay("alarm");

        // 2. Ξεκινάμε τον ΘΟΡΥΒΟ (Player 2)
        this.alarmPlayer.currentTime = 0;
        try {
            await this.alarmPlayer.play();
        } catch(e) { console.error(e); }

        // 3. UI
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
        }

        this.vibrate(true);
        this.sendNotification();
    },

    // --- ΑΠΟΔΟΧΗ (Καλείται από το App.acceptAlarm) ---
    stopAlarm(fullyStop = false) {
        if (!this.isRinging && !fullyStop) return; // Ασφάλεια
        this.isRinging = false;

        console.log("✅ ALARM STOPPED (Audio Engine)");

        // 1. Σταματάμε ΜΟΝΟ τον θόρυβο (Player 2)
        this.alarmPlayer.pause();
        this.alarmPlayer.currentTime = 0;

        // 2. Επαναφέρουμε τα γράμματα (Ο Player 1 δεν σταμάτησε ποτέ!)
        this.updateDisplay("online");

        // 3. UI Hide
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) overlay.style.display = 'none';

        this.vibrate(false);
    },

    updateDisplay(state) {
        if (!("mediaSession" in navigator)) return;

        if (state === "alarm") {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ",
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

        // Λέμε στο σύστημα "Είμαι σε Playing State"
        // Αυτό κρατάει το κουμπί Pause ενεργό
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
            try { this.wakeLock = await navigator.wakeLock.request("screen"); } catch (e) {}
        }
    },

    sendNotification() {
        if (Notification.permission === "granted") {
            try {
                // Το 'requireInteraction: true' κρατάει το notification ανοιχτό
                const notif = new Notification("🚨 ΚΛΗΣΗ!", { 
                    icon: "/icon.png", 
                    tag: 'alarm-tag',
                    requireInteraction: true 
                });
                
                // Αν πατήσει το notification, ανοίγει το παράθυρο και κάνει αποδοχή
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

// Volume Buttons (Accept Logic)
window.addEventListener('keydown', (e) => {
    // 24 = Volume Up, 25 = Volume Down
    if (AudioEngine.isRinging && (e.keyCode === 24 || e.keyCode === 25)) { 
        // ΔΙΟΡΘΩΣΗ: Καλούμε το App.acceptAlarm()
        if (window.App && window.App.acceptAlarm) {
            window.App.acceptAlarm();
        } else {
            AudioEngine.stopAlarm();
        }
    }
});

window.AudioEngine = AudioEngine;
