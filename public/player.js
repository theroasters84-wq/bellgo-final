const AudioEngine = {
    player: null, // ΕΝΑΣ και ΜΟΝΑΔΙΚΟΣ Player για όλα
    isRinging: false,
    wakeLock: null,
    vibrationInterval: null,
    alarmStartTime: 0,

    async init() {
        console.log("🔊 AudioEngine: Playlist Mode (Single Player)");

        // 1. ΔΗΜΙΟΥΡΓΙΑ ΤΟΥ PLAYER (Αν δεν υπάρχει)
        if (!this.player) {
            this.player = document.createElement("audio");
            this.player.id = 'unifiedPlayer';
            this.player.loop = true; // Πάντα loop (είτε είναι tone είτε alarm)
            this.player.volume = 1.0; // Πάντα τέρμα
            
            // Ξεκινάμε με το Track 1 (Υπόηχος)
            this.player.src = "tone19hz.wav"; 
            
            // --- ΛΟΓΙΚΗ ΑΠΟΔΟΧΗΣ ---
            
            // Α. Αν πατηθεί Pause (από μπάρα ή ακουστικά)
            this.player.onpause = () => {
                if (this.isRinging) {
                    console.log("⏯️ Pause -> NEXT TRACK (Accept)");
                    this.stopAlarm(); // Αυτό θα αλλάξει το τραγούδι πίσω στο tone
                } else {
                    // Αν είμαστε online, δεν αφήνουμε να σταματήσει
                    console.log("⚠️ Keep-Alive: Restarting...");
                    this.player.play();
                }
            };

            // Β. Αν αλλάξει η ένταση (Volume Buttons)
            this.player.onvolumechange = () => {
                if (this.isRinging && (Date.now() - this.alarmStartTime > 2000)) {
                    console.log("🎚️ Volume -> NEXT TRACK (Accept)");
                    this.stopAlarm();
                }
            };

            document.body.appendChild(this.player);
        }

        // 2. ΡΥΘΜΙΣΕΙΣ ΣΥΣΤΗΜΑΤΟΣ
        this.requestWakeLock();
        this.setupMediaSession();

        // 3. ΕΚΚΙΝΗΣΗ PLAYLIST (Track 1)
        try {
            await this.player.play();
            this.updateMetadata("online"); // Δείχνουμε "Online"
            console.log("✅ Track 1 Playing (Tone)");
        } catch (e) {
            console.log("⏳ Waiting for interaction...", e);
        }
    },

    // --- ΤΟ ΚΡΙΣΙΜΟ ΣΗΜΕΙΟ: ΑΛΛΑΓΗ ΤΡΑΓΟΥΔΙΟΥ (ΚΛΗΣΗ) ---
    async triggerAlarm() {
        if (this.isRinging) return;

        this.isRinging = true;
        this.alarmStartTime = Date.now();
        console.log("🚨 CHANGING TRACK TO: ALARM");

        // 1. Ενημερώνουμε την μπάρα ΠΡΙΝ αλλάξει ο ήχος (για να φαίνεται άμεσα)
        this.updateMetadata("alarm");

        // 2. UI: Εμφάνιση κόκκινης οθόνης
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
            const slider = document.getElementById('acceptSlider');
            if (slider) slider.value = 50;
        }

        // 3. ΑΛΛΑΓΗ ΠΗΓΗΣ (Σαν να μπαίνει το επόμενο τραγούδι)
        this.player.src = "alert.mp3";
        this.player.load(); // Αναγκάζουμε τον browser να φορτώσει το νέο αρχείο
        
        try {
            await this.player.play();
        } catch (e) { console.error("Play Error", e); }

        // 4. Δόνηση
        if (navigator.vibrate) {
            navigator.vibrate([1000, 500]);
            if (this.vibrationInterval) clearInterval(this.vibrationInterval);
            this.vibrationInterval = setInterval(() => navigator.vibrate([1000, 500]), 1600);
        }

        this.sendNotification();
    },

    // --- ΤΟ ΚΡΙΣΙΜΟ ΣΗΜΕΙΟ: ΕΠΙΣΤΡΟΦΗ (ΑΠΟΔΟΧΗ) ---
    async stopAlarm() {
        if (!this.isRinging) return;

        console.log("🛑 CHANGING TRACK TO: TONE (Silence)");
        this.isRinging = false;

        // 1. Ενημέρωση Μπάρας
        this.updateMetadata("online");

        // 2. UI: Απόκρυψη
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) overlay.style.display = 'none';

        // 3. ΑΛΛΑΓΗ ΠΗΓΗΣ ΠΙΣΩ
        this.player.src = "tone19hz.wav";
        this.player.load(); // Φόρτωση
        
        try {
            await this.player.play();
        } catch (e) {}

        // 4. Stop Vibrate
        if (this.vibrationInterval) clearInterval(this.vibrationInterval);
        if (navigator.vibrate) navigator.vibrate(0);
    },

    // Διαχείριση των τίτλων στην μπάρα
    updateMetadata(state) {
        if (!("mediaSession" in navigator)) return;

        if (state === "alarm") {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ",
                artist: "Πάτα ΕΔΩ για Αποδοχή", // Πατώντας οπουδήποτε στην μπάρα
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
        
        // Λέμε στο σύστημα ότι παίζουμε ΚΑΝΟΝΙΚΑ
        navigator.mediaSession.playbackState = "playing";
    },

    setupMediaSession() {
        if (!("mediaSession" in navigator)) return;

        // Ό,τι και να πατήσει ο χρήστης στην μπάρα, σημαίνει ΑΠΟΔΟΧΗ
        const accept = () => {
            if (this.isRinging) {
                console.log("✅ ACCEPT via Media Button");
                this.stopAlarm();
            }
        };

        ["play", "pause", "stop", "nexttrack", "previoustrack"].forEach(action => {
            try { navigator.mediaSession.setActionHandler(action, accept); } catch(e){}
        });
    },

    async requestWakeLock() {
        if ('wakeLock' in navigator) {
            try {
                this.wakeLock = await navigator.wakeLock.request("screen");
            } catch (e) {}
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

// Physical Buttons (Backup)
window.addEventListener('keydown', (e) => {
    if (AudioEngine.isRinging) {
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
