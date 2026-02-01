// public/player.js

const AudioEngine = {
    player: null,
    isRinging: false,
    vibrationInterval: null,
    
    // Αποθηκεύουμε την ώρα που ξεκίνησε το alarm για να αποφύγουμε false triggers
    alarmStartTime: 0, 

    init() {
        console.log("🔈 Audio Engine Initializing...");
        
        // 1. Δημιουργία Audio Element
        if (!this.player) {
            this.player = document.createElement('audio');
            this.player.id = 'mainAudioPlayer';
            this.player.loop = true;
            
            // --- ΤΟ ΜΥΣΤΙΚΟ ΓΙΑ ΤΑ VOLUME BUTTONS ---
            // Ακούμε πότε αλλάζει η ένταση. Αν χτυπάει -> Σταμάτα το.
            this.player.onvolumechange = () => this.handleVolumeChange();
            
            document.body.appendChild(this.player);
        }

        // 2. Ζητάμε άδεια για Notifications
        if (Notification.permission !== "granted") {
            Notification.requestPermission();
        }

        // 3. Media Session (Για Play/Pause από ακουστικά ή Lock Screen)
        if ('mediaSession' in navigator) {
            const stopAction = () => this.stopAlarm();
            navigator.mediaSession.setActionHandler('play', stopAction);
            navigator.mediaSession.setActionHandler('pause', stopAction);
            navigator.mediaSession.setActionHandler('stop', stopAction);
            navigator.mediaSession.setActionHandler('previoustrack', stopAction);
            navigator.mediaSession.setActionHandler('nexttrack', stopAction);
        }

        // 4. Ξεκινάμε τη Σιωπή (Απαραίτητο για να κρατάει τον browser ξύπνιο)
        this.player.src = 'silence.mp3'; 
        this.player.volume = 0.5; // Το βάζουμε στη μέση για να πιάνει και το Up και το Down
        
        // Προσπάθεια αυτόματης εκκίνησης
        const playPromise = this.player.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => console.log("Waiting for user interaction..."));
        }
    },

    // --- ΛΟΓΙΚΗ VOLUME BUTTONS ---
    handleVolumeChange() {
        // Αν δεν χτυπάει, αγνόησέ το
        if (!this.isRinging) return;

        // Αν πέρασε λιγότερο από 1 δευτερόλεπτο από την έναρξη, αγνόησέ το
        // (Γιατί όταν ξεκινάει το alarm, αλλάζουμε την ένταση μόνοι μας στο 100%)
        if (Date.now() - this.alarmStartTime < 1000) return;

        console.log("🎚️ Volume Changed -> ACCEPTING CALL");
        this.stopAlarm();
    },

    triggerAlarm() {
        if (this.isRinging) return;
        
        this.isRinging = true;
        this.alarmStartTime = Date.now(); // Καταγραφή ώρας έναρξης
        
        console.log("🔔 TRIGGER ALARM");

        // 1. Εμφάνιση Κόκκινης Οθόνης
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) overlay.style.display = 'flex';

        // 2. Ρύθμιση Ήχου
        this.player.src = 'alert.mp3'; 
        this.player.currentTime = 0;
        
        // Βάζουμε την ένταση στο 100%
        // (Αυτό θα ενεργοποιήσει το onvolumechange, αλλά το φίλτρο χρόνου θα το αγνοήσει)
        this.player.volume = 1.0; 
        
        this.player.play().catch(e => console.error("❌ Play failed:", e));

        // 3. Δόνηση σε Λούπα
        if (navigator.vibrate) {
            navigator.vibrate([1000, 500]); 
            if (this.vibrationInterval) clearInterval(this.vibrationInterval);
            this.vibrationInterval = setInterval(() => {
                navigator.vibrate([1000, 500]);
            }, 1600);
        }

        // 4. Ενημέρωση Lock Screen
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: "🚨 ΚΛΗΣΗ ΑΠΟ ΚΟΥΖΙΝΑ",
                artist: "BellGo Alert",
                album: "Πάτα Volume για Αποδοχή"
            });
        }

        // 5. Ειδοποίηση
        this.sendNotification();
    },

    stopAlarm() {
        if (!this.isRinging) return;
        console.log("🔕 STOP ALARM");
        
        this.isRinging = false;

        // Κρύψιμο οθόνης
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) overlay.style.display = 'none';

        // Σταμάτημα Δόνησης
        if (this.vibrationInterval) clearInterval(this.vibrationInterval);
        if (navigator.vibrate) navigator.vibrate(0);

        // Επιστροφή στο Silence Loop
        this.player.pause();
        this.player.src = 'silence.mp3';
        this.player.volume = 0.5; // Επαναφορά στη μέση για την επόμενη φορά
        this.player.loop = true;
        this.player.play().catch(() => {});

        // Καθαρισμός Lock Screen
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
                    icon: "/icon.png", // Βεβαιώσου ότι υπάρχει, αλλιώς βγάλτο
                    vibrate: [200, 100, 200],
                    requireInteraction: true,
                    tag: 'alarm-tag'
                });
                
                notif.onclick = () => {
                    window.focus();
                    this.stopAlarm();
                    notif.close();
                };
            } catch (e) {
                console.log("Notification error:", e);
            }
        }
    }
};

// --- PHYSICAL BUTTONS LISTENER (ΓΙΑ FULLY KIOSK & ANDROID WEBVIEW) ---
window.addEventListener('keydown', (e) => {
    // Αν χτυπάει η καμπάνα
    if (AudioEngine.isRinging) {
        console.log("Key Pressed:", e.code, e.keyCode);
        
        // 24 = Volume Up, 25 = Volume Down (Android Standard Codes)
        // 179 = Play/Pause button
        // "Space" ή "Enter" (αν πατηθεί τυχαία)
        const validKeys = [24, 25, 179, 32, 13]; 
        
        if (validKeys.includes(e.keyCode) || e.key === "VolumeUp" || e.key === "VolumeDown") {
            // Σταματάμε τη φυσική λειτουργία του κουμπιού (π.χ. να μην αλλάξει η μπάρα έντασης)
            // αν μας το επιτρέπει ο browser
            e.preventDefault(); 
            AudioEngine.stopAlarm();
        }
    }
});

// Κάνουμε το αντικείμενο Global
window.AudioEngine = AudioEngine;
