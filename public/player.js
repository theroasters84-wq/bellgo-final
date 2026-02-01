// public/player.js

const AudioEngine = {
    player: null,
    isRinging: false,
    vibrationInterval: null, // Για επαναλαμβανόμενη δόνηση
    ignoreVolumeChanges: false, // Για να μην το κόβει μόνο του στην αρχή

    init() {
        console.log("🔈 Audio Engine Initializing...");
        
        // 1. Δημιουργία Audio Element
        if (!this.player) {
            this.player = document.createElement('audio');
            this.player.id = 'mainAudioPlayer';
            this.player.loop = true;
            // Προσθέτουμε ακρόαση για αλλαγή έντασης (Volume Buttons)
            this.player.onvolumechange = () => this.handleVolumeChange();
            document.body.appendChild(this.player);
        }

        // 2. Ζητάμε άδεια για Notifications με το που πατηθεί το Login
        if (Notification.permission !== "granted") {
            Notification.requestPermission();
        }

        // 3. Ρύθμιση Media Session (Κουμπιά Play/Pause από Lock Screen/Ακουστικά)
        if ('mediaSession' in navigator) {
            const stopAction = () => this.stopAlarm();
            navigator.mediaSession.setActionHandler('play', stopAction);
            navigator.mediaSession.setActionHandler('pause', stopAction);
            navigator.mediaSession.setActionHandler('stop', stopAction);
            navigator.mediaSession.setActionHandler('previoustrack', stopAction);
            navigator.mediaSession.setActionHandler('nexttrack', stopAction);
        }

        // 4. Παίζουμε Σιωπή ΑΜΕΣΩΣ
        this.player.src = 'silence.mp3'; 
        this.player.volume = 0.1;
        
        const playPromise = this.player.play();
        if (playPromise !== undefined) {
            playPromise
                .then(() => console.log("✅ Audio Context Unlocked! (Silence playing)"))
                .catch(error => console.error("❌ Audio Autoplay blocked:", error));
        }
    },

    // --- VOLUME BUTTON LOGIC ---
    handleVolumeChange() {
        // Αν δεν χτυπάει, δεν μας νοιάζει
        if (!this.isRinging) return;
        
        // Αν είμαστε στα πρώτα 2 δευτερόλεπτα της κλήσης, αγνόησέ το
        // (γιατί εμείς ανεβάζουμε την ένταση προγραμματιστικά και θα το έκοβε)
        if (this.ignoreVolumeChanges) return;

        console.log("🎚️ Volume Changed -> Accepting Call");
        this.stopAlarm();
    },

    triggerAlarm() {
        if (this.isRinging) return;
        this.isRinging = true;
        console.log("🔔 TRIGGER ALARM: Playing alert.mp3");

        // Α. Εμφάνιση UI
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) overlay.style.display = 'flex';

        // Β. Αλλαγή σε Σειρήνα & Ένταση στο Τέρμα
        this.player.src = 'alert.mp3'; 
        this.player.currentTime = 0;
        
        // Σηκώνουμε σημαία για να αγνοήσουμε την αλλαγή έντασης που κάνουμε τώρα
        this.ignoreVolumeChanges = true;
        this.player.volume = 1.0; 
        
        // Μετά από 2 δευτερόλεπτα, επιτρέπουμε την αποδοχή με volume buttons
        setTimeout(() => { this.ignoreVolumeChanges = false; }, 2000);

        this.player.play().catch(e => console.error("❌ Alarm play failed:", e));

        // Γ. Δόνηση σε Λούπα (Για να μην σταματάει)
        // (Δονείται 1s, σταματάει 0.5s)
        if (navigator.vibrate) {
            navigator.vibrate([1000, 500]); 
            if (this.vibrationInterval) clearInterval(this.vibrationInterval);
            this.vibrationInterval = setInterval(() => {
                navigator.vibrate([1000, 500]);
            }, 1600);
        }

        // Δ. Ενημέρωση Media Session (Για να φαίνεται στην οθόνη κλειδώματος)
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: "🚨 ΚΛΗΣΗ ΑΠΟ ΚΟΥΖΙΝΑ",
                artist: "BellGo Alert",
                album: "Πάτα οποιοδήποτε κουμπί"
            });
        }

        // Ε. Στέλνουμε Notification
        this.sendNotification();
    },

    stopAlarm() {
        if (!this.isRinging) return; // Αν έχει ήδη σταματήσει, φύγε
        console.log("🔕 STOP ALARM & RESUME SILENCE");
        
        this.isRinging = false;

        // Κρύψιμο οθόνης
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) overlay.style.display = 'none';

        // Σταμάτημα Δόνησης
        if (this.vibrationInterval) clearInterval(this.vibrationInterval);
        if (navigator.vibrate) navigator.vibrate(0);

        // Επιστροφή σε σιωπή (ΑΘΑΝΑΤΟ LOOP)
        this.player.pause();
        this.player.src = 'silence.mp3';
        this.player.volume = 0.1; 
        this.player.loop = true;
        this.player.play().catch(e => console.log("Silence resume err:", e));

        // Καθαρισμός Media Session
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: "BellGo Active",
                artist: "Online"
            });
        }
    },

    sendNotification() {
        if (Notification.permission === "granted") {
            try {
                const notif = new Notification("🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ!", {
                    body: "Πάτα εδώ για αποδοχή",
                    icon: "https://cdn-icons-png.flaticon.com/512/3602/3602145.png", // Ένα εικονίδιο καμπάνας
                    vibrate: [200, 100, 200],
                    requireInteraction: true // Να μένει στην οθόνη
                });
                
                // Αν πατήσει το notification, ανοίγει το app και σταματάει
                notif.onclick = () => {
                    window.focus();
                    this.stopAlarm();
                };
            } catch (e) {
                console.log("Notification error:", e);
            }
        }
    }
};

// Global Listeners (Πληκτρολόγιο PC)
window.addEventListener('keydown', () => {
    if (AudioEngine.isRinging) AudioEngine.stopAlarm();
});

window.AudioEngine = AudioEngine;
