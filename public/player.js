// public/player.js

const AudioEngine = {
    player: null,
    isRinging: false,
    vibrationInterval: null,

    init() {
        console.log("🔈 Audio Engine: System Media Mode Initialized");
        
        if (!this.player) {
            this.player = document.createElement('audio');
            this.player.id = 'mainAudioPlayer';
            this.player.loop = true; 
            
            // --- ΤΟ ΑΠΟΛΥΤΟ ΚΟΛΠΟ ΓΙΑ ΤΗΝ ΜΠΑΡΑ ---
            // Αν το σύστημα κάνει Pause (επειδή πάτησες το κουμπί στην μπάρα),
            // εμείς το μεταφράζουμε σε ΑΠΟΔΟΧΗ.
            this.player.onpause = () => {
                if (this.isRinging) {
                    console.log("⏸️ System Pause Detected -> ACCEPTING CALL");
                    this.stopAlarm();
                }
            };

            document.body.appendChild(this.player);
        }

        // Ρύθμιση κουμπιών
        this.setupMediaSession();

        // Ξεκινάμε με Silence
        this.startSilenceSession();
    },

    setupMediaSession() {
        if ('mediaSession' in navigator) {
            const acceptCall = () => {
                console.log("⏯️ Media Button Pressed -> ACCEPTING CALL");
                this.stopAlarm();
            };

            try {
                // Δηλώνουμε ΟΛΑ τα κουμπιά
                navigator.mediaSession.setActionHandler('play', acceptCall);
                navigator.mediaSession.setActionHandler('pause', acceptCall);
                navigator.mediaSession.setActionHandler('stop', acceptCall);
                navigator.mediaSession.setActionHandler('previoustrack', acceptCall);
                navigator.mediaSession.setActionHandler('nexttrack', acceptCall);
            } catch(e) { console.log("Media Session Error:", e); }
        }
    },

    // --- ΛΕΙΤΟΥΡΓΙΑ 1: SILENCE (ONLINE) ---
    startSilenceSession() {
        this.isRinging = false; 

        this.player.src = 'silence.mp3';
        this.player.volume = 0.1; 
        
        this.updateMetadata("BellGo Active", "🟢 Συνδεδεμένος", "https://cdn-icons-png.flaticon.com/512/190/190411.png");

        const playPromise = this.player.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                // ΛΕΜΕ ΣΤΟ ΚΙΝΗΤΟ: "ΠΑΙΖΩ ΜΟΥΣΙΚΗ, ΑΝΑΨΕ ΤΑ ΚΟΥΜΠΙΑ"
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
            }).catch(e => console.log("Waiting for click..."));
        }
    },

    // --- ΛΕΙΤΟΥΡΓΙΑ 2: ALARM (ΚΛΗΣΗ) ---
    triggerAlarm() {
        if (this.isRinging) return;
        this.isRinging = true;
        console.log("🔔 TRIGGER ALARM");

        // 1. Εμφάνιση Κόκκινης Οθόνης
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
            // Reset Slider (αν υπάρχει)
            const slider = document.getElementById('acceptSlider');
            if (slider) slider.value = 50; 
        }

        // 2. Αλλαγή Ήχου
        this.player.src = 'alert.mp3';
        // Δεν πειράζουμε την ένταση (σέβεται την ένταση του κινητού)
        
        // 3. Ενημέρωση Μπάρας
        this.updateMetadata("🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ", "Πάτα ΠΑΥΣΗ για Αποδοχή", "https://cdn-icons-png.flaticon.com/512/564/564619.png");
        
        this.player.play()
            .then(() => {
                // ΞΑΝΑ-ΕΝΕΡΓΟΠΟΙΗΣΗ ΚΟΥΜΠΙΩΝ
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
                this.setupMediaSession(); // Ξαναδένουμε τα κουμπιά για σιγουριά
            })
            .catch(e => console.error("❌ Play failed:", e));

        // 4. Δόνηση
        if (navigator.vibrate) {
            navigator.vibrate([1000, 500]); 
            if (this.vibrationInterval) clearInterval(this.vibrationInterval);
            this.vibrationInterval = setInterval(() => {
                navigator.vibrate([1000, 500]);
            }, 1600);
        }
    },

    // --- ΛΕΙΤΟΥΡΓΙΑ 3: STOP (ΑΠΟΔΟΧΗ) ---
    stopAlarm() {
        // Έλεγχος: Αν έχει ήδη σταματήσει, μην κάνεις τίποτα (για να μην κάνει loop)
        if (!this.isRinging && this.player.src.includes('silence')) return;
        
        console.log("🔕 STOP ALARM -> Returning to Silence");
        this.isRinging = false;

        // Κρύψιμο UI
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) overlay.style.display = 'none';

        // Stop Δόνησης
        if (this.vibrationInterval) clearInterval(this.vibrationInterval);
        if (navigator.vibrate) navigator.vibrate(0);

        // ΕΠΙΣΤΡΟΦΗ ΣΤΟ SILENCE (Χωρίς Pause, αλλάζουμε τραγούδι)
        this.startSilenceSession();
    },

    updateMetadata(title, artist, iconUrl) {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: title,
                artist: artist,
                album: "BellGo System",
                artwork: [{ src: iconUrl, sizes: '512x512', type: 'image/png' }]
            });
        }
    }
};

// Physical buttons Listener (Backup)
window.addEventListener('keydown', (e) => {
    if (AudioEngine.isRinging) {
        const validKeys = [24, 25, 179, 32, 13]; 
        if (validKeys.includes(e.keyCode)) {
            e.preventDefault(); 
            AudioEngine.stopAlarm();
        }
    }
});

// Volume Change Listener (Backup 2)
document.addEventListener('volumechange', () => {
    if (AudioEngine.isRinging) {
         AudioEngine.stopAlarm();
    }
});

window.AudioEngine = AudioEngine;
