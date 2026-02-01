const AudioEngine = {
    player: null,
    isRinging: false,
    wakeLock: null,

    async init() {
        console.log("🌐 AudioEngine: INTERNET STREAMING MODE");

        if (!this.player) {
            this.player = document.createElement("audio");
            this.player.id = 'streamPlayer';
            this.player.crossOrigin = "anonymous"; // Για να επιτρέπεται από το ίντερνετ
            
            // ΦΟΡΤΩΝΟΥΜΕ ΕΝΑ ONLINE ΤΡΑΓΟΥΔΙ (6 λεπτά διάρκεια)
            // Αυτό ξεγελάει το Android ότι είναι Spotify/Radio
            this.player.src = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"; 
            
            this.player.loop = true; 
            
            // Ξεκινάμε με "Σίγαση" (Όχι Pause, απλά χαμηλή ένταση)
            this.player.volume = 0.0001; 
            
            document.body.appendChild(this.player);
        }

        this.setupMediaSession();
        this.requestWakeLock();

        // Ξεκινάμε το Stream
        try {
            await this.player.play();
            this.updateDisplay("online");
            console.log("✅ Stream Started (Silent)");
        } catch (e) {
            console.log("⏳ Waiting for user tap to start stream...");
        }
    },

    // --- ΚΟΥΜΠΙΑ ΜΠΑΡΑΣ ---
    setupMediaSession() {
        if (!("mediaSession" in navigator)) return;

        const handleUserAction = () => {
            console.log("⏯️ User Action on Bar");
            
            if (this.isRinging) {
                // Αν χτυπάει -> ΑΠΟΔΟΧΗ (Χαμηλώνουμε)
                this.stopAlarm();
            } else {
                // Αν είναι Online -> Δεν αφήνουμε να σταματήσει!
                this.player.play();
                this.updateDisplay("online");
            }
        };

        // Όλα τα κουμπιά κάνουν το ίδιο
        navigator.mediaSession.setActionHandler('play', handleUserAction);
        navigator.mediaSession.setActionHandler('pause', handleUserAction);
        navigator.mediaSession.setActionHandler('stop', handleUserAction);
        navigator.mediaSession.setActionHandler('nexttrack', handleUserAction);
        navigator.mediaSession.setActionHandler('previoustrack', handleUserAction);
    },

    // --- ΚΛΗΣΗ (ΔΥΝΑΜΩΝΟΥΜΕ ΤΟ STREAM) ---
    triggerAlarm() {
        if (this.isRinging) return;
        this.isRinging = true;

        console.log("🚨 ALARM: Volume UP");

        this.updateDisplay("alarm");

        // Εμφάνιση κόκκινης οθόνης
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
            const slider = document.getElementById('acceptSlider');
            if (slider) slider.value = 50;
        }

        // Δυναμώνουμε το online τραγούδι
        // (ΠΡΟΣΟΧΗ: Θα παίζει μουσική, όχι σειρήνα, για το τεστ)
        this.player.volume = 1.0; 

        this.vibrate(true);
        this.sendNotification();
    },

    // --- ΑΠΟΔΟΧΗ (ΧΑΜΗΛΩΝΟΥΜΕ ΤΟ STREAM) ---
    stopAlarm() {
        if (!this.isRinging) return;
        this.isRinging = false;

        console.log("🟢 SILENCE: Volume DOWN");

        this.updateDisplay("online");

        const overlay = document.getElementById('alarmOverlay');
        if (overlay) overlay.style.display = 'none';

        // Χαμηλώνουμε ξανά (χωρίς Pause)
        this.player.volume = 0.0001; 

        this.vibrate(false);
    },

    updateDisplay(state) {
        if (!("mediaSession" in navigator)) return;

        if (state === "alarm") {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ",
                artist: "STREAMING MODE",
                album: "Πάτα ΠΑΥΣΗ για Αποδοχή",
                artwork: [{ src: "https://cdn-icons-png.flaticon.com/512/564/564619.png", sizes: "512x512", type: "image/png" }]
            });
        } else {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: "BellGo Online",
                artist: "Live Stream",
                album: "Connected",
                artwork: [{ src: "https://cdn-icons-png.flaticon.com/512/190/190411.png", sizes: "512x512", type: "image/png" }]
            });
        }
        
        // Λέμε στο Android ότι είναι Live Radio
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
