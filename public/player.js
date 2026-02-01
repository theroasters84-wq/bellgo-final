const AudioEngine = {
    player: null,
    isRinging: false,
    wakeLock: null,

    async init() {
        console.log("📻 AudioEngine: RADIO MODE (Volume Ducking)");

        if (!this.player) {
            this.player = document.createElement("audio");
            this.player.id = 'radioPlayer';
            
            // Χρησιμοποιούμε ΜΟΝΟ το alert.mp3 για όλα!
            this.player.src = "alert.mp3"; 
            this.player.loop = true; 
            
            // Ξεκινάμε με ένταση σχεδόν μηδέν (Αθόρυβο)
            // Το Android νομίζει ότι παίζει μουσική, εσύ δεν ακούς.
            this.player.volume = 0.0001; 
            
            document.body.appendChild(this.player);
        }

        this.setupMediaSession();
        this.requestWakeLock();

        // Ξεκινάμε το "Ραδιόφωνο"
        try {
            await this.player.play();
            this.updateDisplay("online");
            console.log("✅ Radio Started (Silent)");
        } catch (e) {
            console.log("⏳ Waiting for user tap...");
        }
    },

    // --- ΚΟΥΜΠΙΑ ΜΠΑΡΑΣ (ΑΠΟΔΟΧΗ) ---
    setupMediaSession() {
        if (!("mediaSession" in navigator)) return;

        const handleUserAction = () => {
            console.log("⏯️ User Action Detected");
            
            if (this.isRinging) {
                // Αν χτυπάει -> ΑΠΟΔΟΧΗ (Χαμηλώνουμε ένταση)
                this.stopAlarm();
            } else {
                // Αν δεν χτυπάει -> Δεν αφήνουμε να σταματήσει ποτέ!
                this.player.play();
                this.updateDisplay("online");
            }
        };

        // Όλα τα κουμπιά κάνουν το ίδιο: "Χειρισμό Έντασης"
        navigator.mediaSession.setActionHandler('play', handleUserAction);
        navigator.mediaSession.setActionHandler('pause', handleUserAction);
        navigator.mediaSession.setActionHandler('stop', handleUserAction);
        navigator.mediaSession.setActionHandler('nexttrack', handleUserAction);
        navigator.mediaSession.setActionHandler('previoustrack', handleUserAction);
    },

    // --- ΚΛΗΣΗ (ΔΥΝΑΜΩΝΟΥΜΕ ΤΟΝ ΗΧΟ) ---
    triggerAlarm() {
        if (this.isRinging) return;
        this.isRinging = true;

        console.log("🚨 VOLUME UP: ALARM");

        // 1. Αλλαγή εμφάνισης μπάρας
        this.updateDisplay("alarm");

        // 2. UI
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
            const slider = document.getElementById('acceptSlider');
            if (slider) slider.value = 50;
        }

        // 3. ΔΥΝΑΜΩΝΟΥΜΕ ΤΟΝ ΗΧΟ (Χωρίς να διακόψουμε το playback)
        // Επαναφέρουμε το κομμάτι στην αρχή για να ακουστεί η σειρήνα
        this.player.currentTime = 0; 
        this.player.volume = 1.0; 

        this.vibrate(true);
        this.sendNotification();
    },

    // --- ΑΠΟΔΟΧΗ (ΧΑΜΗΛΩΝΟΥΜΕ ΤΟΝ ΗΧΟ) ---
    stopAlarm() {
        if (!this.isRinging) return;
        this.isRinging = false;

        console.log("🟢 VOLUME DOWN: SILENCE");

        // 1. Αλλαγή εμφάνισης μπάρας
        this.updateDisplay("online");

        // 2. UI Hide
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) overlay.style.display = 'none';

        // 3. ΧΑΜΗΛΩΝΟΥΜΕ ΤΟΝ ΗΧΟ (Δεν κάνουμε Pause!)
        this.player.volume = 0.0001; 

        this.vibrate(false);
    },

    updateDisplay(state) {
        if (!("mediaSession" in navigator)) return;

        if (state === "alarm") {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ",
                artist: "Πάτα ΠΑΥΣΗ για Αποδοχή",
                album: "BellGo Alert",
                artwork: [{ src: "https://cdn-icons-png.flaticon.com/512/564/564619.png", sizes: "512x512", type: "image/png" }]
            });
        } else {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: "BellGo Online",
                artist: "Σύστημα σε Αναμονή",
                album: "Μην κλείνετε την εφαρμογή",
                artwork: [{ src: "https://cdn-icons-png.flaticon.com/512/190/190411.png", sizes: "512x512", type: "image/png" }]
            });
        }

        // Κρατάμε την κατάσταση ΠΑΝΤΑ σε playing
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
                const notif = new Notification("🚨 ΚΛΗΣΗ!", { icon: "/icon.png", tag: 'alarm-tag' });
                notif.onclick = () => { window.focus(); this.stopAlarm(); notif.close(); };
            } catch (e) {}
        }
    }
};

// Volume Buttons Listener
window.addEventListener('keydown', (e) => {
    if (AudioEngine.isRinging && (e.keyCode === 24 || e.keyCode === 25)) { 
        AudioEngine.stopAlarm();
    }
});

window.AudioEngine = AudioEngine;
