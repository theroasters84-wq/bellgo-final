const AudioEngine = {
    player: null, 
    isRinging: false,
    wakeLock: null,
    vibrationInterval: null,
    alarmStartTime: 0,

    async init() {
        console.log("🔊 AudioEngine: Sticky Notification Mode");

        // 1. ΔΗΜΙΟΥΡΓΙΑ PLAYER
        if (!this.player) {
            this.player = document.createElement("audio");
            this.player.id = 'unifiedPlayer';
            this.player.loop = true; 
            this.player.volume = 1.0; 
            this.player.src = "tone19hz.wav"; 
            
            // --- ΑΝΙΧΝΕΥΣΗ PAUSE ΑΠΟ ΤΟ ΣΥΣΤΗΜΑ ---
            // Αν το Android κάνει Pause (επειδή πάτησες το κουμπί), εμείς αντιδρούμε:
            this.player.onpause = () => {
                if (this.isRinging) {
                    console.log("⏸️ System Pause -> ACCEPTING");
                    this.stopAlarm();
                } else {
                    // Αν δεν χτυπάει, απαγορεύουμε το Pause!
                    console.log("⚠️ Anti-Kill: Forcing Play");
                    this.player.play();
                }
            };

            // Volume Buttons Listener
            this.player.onvolumechange = () => {
                if (this.isRinging && (Date.now() - this.alarmStartTime > 2000)) {
                    this.stopAlarm();
                }
            };

            document.body.appendChild(this.player);
        }

        this.requestWakeLock();
        this.setupMediaSession();

        // 2. ΕΚΚΙΝΗΣΗ
        try {
            await this.player.play();
            this.updateMetadata("online"); 
        } catch (e) {
            console.log("⏳ Waiting for interaction...");
        }
    },

    // --- ΚΛΗΣΗ (ALARM) ---
    async triggerAlarm() {
        if (this.isRinging) return;

        this.isRinging = true;
        this.alarmStartTime = Date.now();
        console.log("🚨 ALARM START");

        this.updateMetadata("alarm"); // Αλλαγή τίτλου

        // UI
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
            const slider = document.getElementById('acceptSlider');
            if (slider) slider.value = 50;
        }

        // AUDIO Change
        this.player.src = "alert.mp3";
        this.player.load();
        
        try {
            await this.player.play();
            // Force state to playing
            if("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
        } catch (e) { console.error("Play Error", e); }

        // Vibrate
        if (navigator.vibrate) {
            navigator.vibrate([1000, 500]);
            if (this.vibrationInterval) clearInterval(this.vibrationInterval);
            this.vibrationInterval = setInterval(() => navigator.vibrate([1000, 500]), 1600);
        }

        this.sendNotification();
    },

    // --- ΑΠΟΔΟΧΗ (STOP) ---
    async stopAlarm() {
        if (!this.isRinging) return;

        console.log("🛑 STOP ALARM -> Back to Tone");
        this.isRinging = false;

        // ΚΟΛΠΟ: Λέμε στο Android "ΠΑΙΖΩ ΑΚΟΜΑ!" πριν κάνουμε οτιδήποτε άλλο
        // Αυτό εμποδίζει την μπάρα να κλείσει.
        if("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";

        // 1. Επαναφορά εμφάνισης μπάρας (Online)
        this.updateMetadata("online");

        // 2. Απόκρυψη κόκκινης οθόνης
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) overlay.style.display = 'none';

        // 3. Γυρνάμε στον υπόηχο
        this.player.src = "tone19hz.wav";
        this.player.load();
        
        try {
            await this.player.play();
            // Ξανα-βεβαιώνουμε ότι παίζει
            if("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
        } catch (e) {}

        // 4. Stop Vibrate
        if (this.vibrationInterval) clearInterval(this.vibrationInterval);
        if (navigator.vibrate) navigator.vibrate(0);
    },

    updateMetadata(state) {
        if (!("mediaSession" in navigator)) return;

        if (state === "alarm") {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ",
                artist: "Πάτα ΕΔΩ για Αποδοχή", 
                album: "BellGo Alert",
                artwork: [{ src: "https://cdn-icons-png.flaticon.com/512/564/564619.png", sizes: "512x512", type: "image/png" }]
            });
        } else {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: "🟢 BellGo Online",
                artist: "Σύστημα σε Αναμονή",
                album: "BellGo System",
                artwork: [{ src: "https://cdn-icons-png.flaticon.com/512/190/190411.png", sizes: "512x512", type: "image/png" }]
            });
        }
    },

    setupMediaSession() {
        if (!("mediaSession" in navigator)) return;

        // ΟΛΑ τα κουμπιά κάνουν το ίδιο: ΑΠΟΔΟΧΗ ΧΩΡΙΣ ΝΑ ΣΤΑΜΑΤΗΣΕΙ Η ΜΠΑΡΑ
        const accept = () => {
            // Αν χτυπάει, κάνουμε αποδοχή
            if (this.isRinging) {
                console.log("✅ Button Press -> Keeping Notification Alive");
                this.stopAlarm();
            } else {
                // Αν δεν χτυπάει και πατήσει play/pause, απλά σιγουρεύουμε ότι παίζει
                this.player.play();
                navigator.mediaSession.playbackState = "playing";
            }
        };

        ["play", "pause", "stop", "nexttrack", "previoustrack"].forEach(action => {
            try { navigator.mediaSession.setActionHandler(action, accept); } catch(e){}
        });
    },

    async requestWakeLock() {
        if ('wakeLock' in navigator) {
            try { this.wakeLock = await navigator.wakeLock.request("screen"); } catch (e) {}
        }
    },

    sendNotification() {
        if (Notification.permission === "granted") {
            try {
                const notif = new Notification("🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ!", {
                    body: "Πάτα εδώ για αποδοχή",
                    icon: "/icon.png",
                    tag: 'alarm-tag'
                });
                notif.onclick = () => { window.focus(); this.stopAlarm(); notif.close(); };
            } catch (e) {}
        }
    }
};

window.addEventListener('keydown', (e) => {
    if (AudioEngine.isRinging && (Date.now() - AudioEngine.alarmStartTime > 2000)) {
        const validKeys = [24, 25, 179, 32, 13]; 
        if (validKeys.includes(e.keyCode)) {
            e.preventDefault(); 
            AudioEngine.stopAlarm();
        }
    }
});

window.AudioEngine = AudioEngine;
