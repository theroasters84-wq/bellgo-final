const AudioEngine = {
    player: null,
    isRinging: false,
    wakeLock: null,      // Για να μένει ανοιχτή η οθόνη
    vibrationInterval: null,
    alarmStartTime: 0,   // Για την ασφάλεια του Volume Button

    async init() {
        console.log("🔊 AudioEngine: 19Hz Keep-Alive Mode");

        // 1. ΔΗΜΙΟΥΡΓΙΑ PLAYER
        if (!this.player) {
            this.player = document.createElement("audio");
            this.player.id = 'mainAudioPlayer';
            this.player.loop = true;
            this.player.volume = 1.0; // Τέρμα ένταση (για να μην κοιμηθεί το Android)
            this.player.src = "tone19hz.wav"; // Ο υπόηχος
            
            // LOGIC: Αν πατηθεί Pause από το σύστημα
            this.player.onpause = () => {
                if (this.isRinging) {
                    console.log("⏸️ System Pause -> ACCEPTING CALL");
                    this.stopAlarm();
                } else {
                    // Αν είμαστε σε αναμονή, απαγορεύουμε το Pause
                    console.log("⚠️ Keep-Alive enforce: Restarting Tone");
                    this.player.play();
                }
            };

            // LOGIC: Volume Button Hack
            this.player.onvolumechange = () => {
                if (this.isRinging && (Date.now() - this.alarmStartTime > 2000)) {
                    console.log("🎚️ Volume Changed -> ACCEPTING CALL");
                    this.stopAlarm();
                }
            };

            document.body.appendChild(this.player);
        }

        // 2. WAKE LOCK (Κρατάει την οθόνη/CPU ξύπνια)
        this.requestWakeLock();
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") this.requestWakeLock();
        });

        // 3. MEDIA SESSION (Κουμπιά Lock Screen)
        this.setupMediaSession();

        // 4. ΕΚΚΙΝΗΣΗ (Παίζουμε τον υπόηχο)
        try {
            await this.player.play();
            this.setIdleMetadata();
            console.log("✅ 19Hz Tone Playing (System thinks it's music)");
        } catch (e) {
            console.log("⏳ Waiting for user interaction...", e);
        }
    },

    async requestWakeLock() {
        if ('wakeLock' in navigator) {
            try {
                this.wakeLock = await navigator.wakeLock.request("screen");
                console.log("🔆 Wake Lock ACTIVE");
            } catch (e) { console.log("WakeLock Error", e); }
        }
    },

    setupMediaSession() {
        if (!("mediaSession" in navigator)) return;

        const accept = () => {
            if (this.isRinging) {
                console.log("✅ ACCEPT via Media Button");
                this.stopAlarm();
            }
        };

        // Όλα τα κουμπιά κάνουν Αποδοχή
        ["play", "pause", "stop", "nexttrack", "previoustrack"].forEach(action => {
            try { navigator.mediaSession.setActionHandler(action, accept); } catch(e){}
        });
    },

    // 🚨 TRIGGER ALARM
    async triggerAlarm() {
        if (this.isRinging) return;

        this.isRinging = true;
        this.alarmStartTime = Date.now();
        console.log("🚨 ALARM START");

        // UI: Εμφάνιση
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
            const slider = document.getElementById('acceptSlider');
            if (slider) slider.value = 50;
        }

        // AUDIO: Αλλαγή σε Σειρήνα
        this.player.src = "alert.mp3";
        this.player.loop = true;
        // Το volume είναι ήδη 1.0 από το init

        try {
            await this.player.play();
        } catch (e) { console.error("Play Error", e); }

        // METADATA: Ενημέρωση μπάρας
        if ("mediaSession" in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ",
                artist: "Πάτα ΠΑΥΣΗ για Αποδοχή",
                album: "BellGo Alert",
                artwork: [{ src: "https://cdn-icons-png.flaticon.com/512/564/564619.png", sizes: "512x512", type: "image/png" }]
            });
            navigator.mediaSession.playbackState = "playing";
        }

        // VIBRATION
        if (navigator.vibrate) {
            navigator.vibrate([1000, 500]);
            if (this.vibrationInterval) clearInterval(this.vibrationInterval);
            this.vibrationInterval = setInterval(() => navigator.vibrate([1000, 500]), 1600);
        }

        this.sendNotification();
    },

    // 🛑 STOP / ACCEPT
    async stopAlarm() {
        if (!this.isRinging) return;

        console.log("🛑 ALARM STOP");
        this.isRinging = false;

        // UI: Απόκρυψη
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) overlay.style.display = 'none';

        // AUDIO: Επιστροφή στον υπόηχο
        this.player.src = "tone19hz.wav";
        this.player.loop = true;

        try {
            await this.player.play();
        } catch (e) {}

        // RESET
        this.setIdleMetadata();
        if (this.vibrationInterval) clearInterval(this.vibrationInterval);
        if (navigator.vibrate) navigator.vibrate(0);
    },

    setIdleMetadata() {
        if (!("mediaSession" in navigator)) return;

        navigator.mediaSession.metadata = new MediaMetadata({
            title: "🟢 BellGo Online",
            artist: "Αναμονή...",
            album: "System Active",
            artwork: [{ src: "https://cdn-icons-png.flaticon.com/512/190/190411.png", sizes: "512x512", type: "image/png" }]
        });

        navigator.mediaSession.playbackState = "playing";
    },

    sendNotification() {
        if (Notification.permission === "granted") {
            try {
                const notif = new Notification("🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ!", {
                    body: "Πάτα εδώ για αποδοχή",
                    icon: "/icon.png",
                    vibrate: [200, 100, 200],
                    requireInteraction: true,
                    tag: 'alarm-tag'
                });
                notif.onclick = () => { window.focus(); this.stopAlarm(); notif.close(); };
            } catch (e) {}
        }
    }
};

// Physical Buttons Listener (Fully Kiosk / Android)
window.addEventListener('keydown', (e) => {
    if (AudioEngine.isRinging) {
        // Ασφάλεια 2 δευτερολέπτων
        if (Date.now() - AudioEngine.alarmStartTime > 2000) {
            const validKeys = [24, 25, 179, 32, 13]; 
            if (validKeys.includes(e.keyCode)) {
                e.preventDefault(); 
                AudioEngine.stopAlarm();
            }
        }
    }
});

window.AudioEngine = AudioEngine;
