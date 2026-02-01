const AudioEngine = {
    player: null,
    isRinging: false,
    wakeLock: null,
    
    // Αρχικοποίηση
    async init() {
        console.log("💿 AudioEngine: Music Playlist Mode");

        if (!this.player) {
            this.player = document.createElement("audio");
            this.player.id = 'musicPlayer';
            this.player.loop = true; // Πάντα loop το τρέχον τραγούδι
            this.player.volume = 1.0; 
            
            // Ξεκινάμε με το Track 1 (Υπόηχος)
            this.player.src = "tone19hz.wav"; 
            
            document.body.appendChild(this.player);
        }

        // Setup των κουμπιών της μπάρας
        this.setupMediaButtons();
        this.requestWakeLock();

        // Play (Έναρξη Λίστας)
        try {
            await this.player.play();
            this.updateDisplay("online");
        } catch (e) {
            console.log("⏳ Waiting for user tap...");
        }
    },

    // --- ΤΑ ΚΟΥΜΠΙΑ ΤΗΣ ΜΠΑΡΑΣ ---
    setupMediaButtons() {
        if (!("mediaSession" in navigator)) return;

        // Αυτή είναι η συνάρτηση "SKIP TRACK"
        const skipTrack = () => {
            console.log("⏭️ User pressed Button -> SKIPPING TRACK");
            
            if (this.isRinging) {
                // Αν παίζει το ALARM, πάμε στο επόμενο (που είναι το TONE)
                this.stopAlarm();
            } else {
                // Αν παίζει το TONE και πατήσει κουμπί, απλά σιγουρεύουμε ότι παίζει
                // Δεν αφήνουμε να γίνει Pause ποτέ!
                this.player.play();
                this.updateDisplay("online");
            }
        };

        // ΟΛΑ τα κουμπιά κάνουν το ίδιο: SKIP / PLAY
        // Κανένα δεν κάνει πραγματικό Pause/Stop στο σύστημα.
        navigator.mediaSession.setActionHandler('play', skipTrack);
        navigator.mediaSession.setActionHandler('pause', skipTrack); // Το Pause γίνεται Skip
        navigator.mediaSession.setActionHandler('stop', skipTrack);
        navigator.mediaSession.setActionHandler('nexttrack', skipTrack);
        navigator.mediaSession.setActionHandler('previoustrack', skipTrack);
    },

    // --- TRACK 2: ALARM (ΕΠΟΜΕΝΟ ΤΡΑΓΟΥΔΙ) ---
    async triggerAlarm() {
        if (this.isRinging) return;
        this.isRinging = true;

        console.log("🚨 PLAYING TRACK: ALARM");

        // 1. Ενημέρωση τίτλων (Σαν να μπήκε νέο τραγούδι)
        this.updateDisplay("alarm");

        // 2. Εμφάνιση κόκκινης οθόνης (Προαιρετικά, όπως είπες)
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
            const slider = document.getElementById('acceptSlider');
            if (slider) slider.value = 50;
        }

        // 3. Αλλαγή Πηγής
        this.player.src = "alert.mp3";
        this.player.load(); // Φόρτωση νέου track
        
        try {
            await this.player.play();
        } catch (e) { console.error("Play Error", e); }

        this.vibrate(true);
        this.sendNotification();
    },

    // --- TRACK 1: TONE (ΠΙΣΩ ΣΤΗΝ ΑΡΧΗ) ---
    async stopAlarm() {
        if (!this.isRinging) return;
        this.isRinging = false;

        console.log("🟢 PLAYING TRACK: SILENCE");

        // 1. Ενημέρωση τίτλων
        this.updateDisplay("online");

        // 2. Απόκρυψη UI
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) overlay.style.display = 'none';

        // 3. Αλλαγή Πηγής
        this.player.src = "tone19hz.wav";
        this.player.load();
        
        try {
            await this.player.play();
        } catch (e) {}

        this.vibrate(false);
    },

    // Διαχείριση Εμφάνισης στην Μπάρα (Metadata)
    updateDisplay(state) {
        if (!("mediaSession" in navigator)) return;

        if (state === "alarm") {
            // Μοιάζει με κανονικό τραγούδι
            navigator.mediaSession.metadata = new MediaMetadata({
                title: "🚨 ΚΛΗΣΗ ΑΠΟ ΚΟΥΖΙΝΑ",
                artist: "BellGo Alert System",
                album: "⚠️ ΠΑΤΑ PAUSE ΓΙΑ ΑΠΟΔΟΧΗ",
                artwork: [{ src: "https://cdn-icons-png.flaticon.com/512/564/564619.png", sizes: "512x512", type: "image/png" }]
            });
        } else {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: "BellGo Online",
                artist: "Σύστημα Συνδεδεμένο",
                album: "Αναμονή...",
                artwork: [{ src: "https://cdn-icons-png.flaticon.com/512/190/190411.png", sizes: "512x512", type: "image/png" }]
            });
        }

        // ΚΛΕΙΔΙ: Λέμε στο σύστημα "Είμαι σε κατάσταση PLAYING" πάντα.
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
    // Volume Up/Down = Skip Track (Accept)
    if (AudioEngine.isRinging && (e.keyCode === 24 || e.keyCode === 25)) { 
        AudioEngine.stopAlarm();
    }
});

window.AudioEngine = AudioEngine;
