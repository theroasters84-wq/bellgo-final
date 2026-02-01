const AudioEngine = {
    player: null,
    isRinging: false,
    vibrationInterval: null,
    alarmStartTime: 0, 

    init() {
        console.log("🔈 Audio Engine Initializing...");
        
        // 1. Δημιουργία ΕΝΟΣ και ΜΟΝΑΔΙΚΟΥ Audio Element
        if (!this.player) {
            this.player = document.createElement('audio');
            this.player.id = 'mainAudioPlayer';
            this.player.loop = true; // Loop πάντα (είτε silence είτε alert)
            
            // Ακρόαση για αλλαγή έντασης (Volume Buttons)
            this.player.onvolumechange = () => this.handleVolumeChange();
            
            document.body.appendChild(this.player);
        }

        // 2. Ζητάμε άδεια για Ειδοποιήσεις
        if (Notification.permission !== "granted") Notification.requestPermission();

        // 3. Ρύθμιση Media Session (Κουμπιά Ακουστικών / Lock Screen)
        // Ορίζουμε ότι το Play, Pause, Stop, Next, Prev κάνουν όλα STOP στο Alarm
        if ('mediaSession' in navigator) {
            const stopAction = () => {
                console.log("⏯️ Media Key Pressed -> Stopping Alarm");
                this.stopAlarm();
            };
            navigator.mediaSession.setActionHandler('play', stopAction);
            navigator.mediaSession.setActionHandler('pause', stopAction);
            navigator.mediaSession.setActionHandler('stop', stopAction);
            navigator.mediaSession.setActionHandler('previoustrack', stopAction);
            navigator.mediaSession.setActionHandler('nexttrack', stopAction);
        }

        // 4. Ξεκινάμε με Σιωπή (Χωρίς να πειράξουμε την ένταση του χρήστη)
        this.player.src = 'silence.mp3'; 
        
        // Προσπάθεια για Auto-Play
        const playPromise = this.player.play();
        if (playPromise !== undefined) {
            playPromise
                .then(() => console.log("✅ Silence playing (Session Active)"))
                .catch(e => console.log("⚠️ Waiting for interaction..."));
        }
    },

    // Λογική για τα κουμπιά έντασης
    handleVolumeChange() {
        if (!this.isRinging) return;

        // Ασφάλεια 2 δευτερολέπτων (για να μην το κλείσει κατά λάθος με το που το πιάσει)
        if (Date.now() - this.alarmStartTime < 2000) return;

        console.log("🎚️ Volume Changed -> ACCEPTING CALL");
        this.stopAlarm();
    },

    triggerAlarm() {
        if (this.isRinging) return;
        
        this.isRinging = true;
        this.alarmStartTime = Date.now();
        console.log("🔔 TRIGGER ALARM");

        // 1. Εμφάνιση Κόκκινης Οθόνης
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) overlay.style.display = 'flex';

        // 2. Επαναφορά Slider στη μέση (αν υπάρχει)
        const slider = document.getElementById('acceptSlider');
        if (slider) slider.value = 50;

        // 3. ΑΛΛΑΓΗ ΠΗΓΗΣ ΣΤΟΝ ΙΔΙΟ PLAYER (Χωρίς αλλαγή έντασης)
        // Ο ήχος θα παίξει στην ένταση που έχει ήδη η συσκευή
        this.player.src = 'alert.mp3'; 
        this.player.play().catch(e => console.error("❌ Play failed:", e));

        // 4. Ενημέρωση τίτλου στην οθόνη κλειδώματος
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: "🚨 ΚΛΗΣΗ ΑΠΟ ΚΟΥΖΙΝΑ",
                artist: "BellGo Alert",
                album: "Πάτα Play/Pause για Αποδοχή"
            });
        }

        // 5. Δόνηση
        if (navigator.vibrate) {
            navigator.vibrate([1000, 500]); 
            if (this.vibrationInterval) clearInterval(this.vibrationInterval);
            this.vibrationInterval = setInterval(() => {
                navigator.vibrate([1000, 500]);
            }, 1600);
        }

        this.sendNotification();
    },

    stopAlarm() {
        if (!this.isRinging) return;
        console.log("🔕 STOP ALARM -> Back to Silence");
        
        this.isRinging = false;

        // Κρύψιμο UI
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) overlay.style.display = 'none';

        // Stop Δόνησης
        if (this.vibrationInterval) clearInterval(this.vibrationInterval);
        if (navigator.vibrate) navigator.vibrate(0);

        // 6. ΕΠΙΣΤΡΟΦΗ ΣΤΗ ΣΙΩΠΗ (Στον ίδιο Player)
        // Δεν κάνουμε pause, απλά αλλάζουμε το src 'on the fly' για να μην κοπεί το session
        this.player.src = 'silence.mp3';
        this.player.play().catch(() => {});

        // Ενημέρωση τίτλου (Online)
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

// Physical buttons listener (Για Fully Kiosk)
window.addEventListener('keydown', (e) => {
    if (AudioEngine.isRinging) {
        // Space, Enter, Volume keys, Play/Pause
        const validKeys = [24, 25, 179, 32, 13, 85, 86]; // 85=Play/Pause
        if (validKeys.includes(e.keyCode)) {
            // Αν έχουν περάσει 2 δευτερόλεπτα
            if (Date.now() - AudioEngine.alarmStartTime > 2000) {
                e.preventDefault(); 
                AudioEngine.stopAlarm();
            }
        }
    }
});

window.AudioEngine = AudioEngine;
