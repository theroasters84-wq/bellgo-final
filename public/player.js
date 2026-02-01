const AudioEngine = {
    player: null,
    isRinging: false,
    wakeLock: null,      // Κρατάει την οθόνη ανοιχτή (WakeLock API)
    vibrationInterval: null,
    alarmStartTime: 0,   // Χρονόμετρο για ασφάλεια Volume Button

    async init() {
        console.log("🔊 AudioEngine: 19Hz Unified Player Mode");

        // 1. ΔΗΜΙΟΥΡΓΙΑ ΤΟΥ ΕΝΟΣ ΚΑΙ ΜΟΝΑΔΙΚΟΥ PLAYER
        if (!this.player) {
            this.player = document.createElement("audio");
            this.player.id = 'mainAudioPlayer';
            this.player.loop = true;
            this.player.volume = 1.0; // ΤΕΡΜΑ ΕΝΤΑΣΗ (Για να μην κοιμηθεί το Android)
            this.player.src = "tone19hz.wav"; // Ξεκινάμε με τον υπόηχο
            
            // --- LOGIC 1: PAUSE BUTTON (Media Session) ---
            this.player.onpause = () => {
                if (this.isRinging) {
                    console.log("⏸️ System Pause -> ACCEPTING CALL");
                    this.stopAlarm();
                } else {
                    // Αν πατηθεί Pause ενώ είμαστε Online (όχι κλήση), το ξαναξεκινάμε αμέσως!
                    console.log("⚠️ Keep-Alive enforce: Restarting Tone");
                    this.player.play();
                }
            };

            // --- LOGIC 2: VOLUME BUTTONS ---
            this.player.onvolumechange = () => {
                // Αν χτυπάει ΚΑΙ έχουν περάσει 2 δευτερόλεπτα (για να μην το κλείσει κατά λάθος στην αρχή)
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

    // Ζητάει από το Android να μην σβήσει την οθόνη
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

        // Όλα τα κουμπιά (Play, Pause, Next, Prev) κάνουν Αποδοχή
        ["play", "pause", "stop", "nexttrack", "previoustrack"].forEach(action => {
            try { navigator.mediaSession.setActionHandler(action, accept); } catch(e){}
        });
    },

    // --- 🚨 TRIGGER ALARM (ΚΛΗΣΗ) ---
    async triggerAlarm() {
        if (this.isRinging) return;

        this.isRinging = true;
        this.alarmStartTime = Date.now();
        console.log("🚨 ALARM START");

        // 1. UI: Εμφάνιση Κόκκινης Οθόνης
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
            const slider = document.getElementById('acceptSlider');
            if (slider) slider.value = 50; // Reset Slider στη μέση
        }

        // 2. AUDIO: Αλλαγή src σε ALERT.MP3
        this.player.src = "alert.mp3";
        this.player.loop = true;
        
        try {
            await this.player.play();
        } catch (e) { console.error("Play Error", e); }

        // 3. METADATA: Ενημέρωση μπάρας
        if ("mediaSession" in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ",
                artist: "Πάτα ΠΑΥΣΗ για Αποδοχή",
                album: "BellGo Alert",
                artwork: [{ src: "https://cdn-icons-png.flaticon.com/512/564/564619.png", sizes: "512x512", type: "image/png" }]
            });
            navigator.mediaSession.playbackState = "playing";
        }

        // 4. VIBRATION
        if (navigator.vibrate) {
            navigator.vibrate([1000, 500]);
            if (this.vibrationInterval) clearInterval(this.vibrationInterval);
            this.vibrationInterval = setInterval(() => navigator.vibrate([1000, 500]), 1600);
        }

        this.sendNotification();
    },

    // --- 🛑 STOP / ACCEPT (ΑΠΟΔΟΧΗ) ---
    async stopAlarm() {
        if (!this.isRinging) return;

        console.log("🛑 ALARM STOP -> Back to Tone");
        this.isRinging = false;

        // 1. UI: Απόκρυψη
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) overlay.style.display = 'none';

        // 2. AUDIO: Επιστροφή στον υπόηχο (TONE19HZ.WAV)
        this.player.src = "tone19hz.wav";
        this.player.loop = true;

        try {
            await this.player.play();
        } catch (e) {}

        // 3. RESET
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

// Physical Buttons Listener (Για Fully Kiosk / Android Wrappers)
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
