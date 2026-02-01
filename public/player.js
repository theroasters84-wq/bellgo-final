const AudioEngine = {
    player: null,
    isRinging: false,
    vibrationInterval: null,

    init() {
        console.log("🔈 Audio Engine: Full Media Control Mode");
        
        if (!this.player) {
            this.player = document.createElement('audio');
            this.player.id = 'mainAudioPlayer';
            this.player.loop = true; 
            
            // --- ΤΟ ΚΟΛΠΟ ΓΙΑ ΤΗΝ ΜΠΑΡΑ ---
            // Αν ο χρήστης πατήσει PAUSE από την μπάρα, το audio σταματάει.
            // Εμείς το ανιχνεύουμε και τρέχουμε την Αποδοχή.
            this.player.onpause = () => {
                if (this.isRinging) {
                    console.log("⏸️ System Pause Detected -> ACCEPTING CALL");
                    this.stopAlarm();
                }
            };

            document.body.appendChild(this.player);
        }

        // Ρύθμιση κουμπιών Media Session (Για Next/Prev)
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
        // Βεβαιωνόμαστε ότι δεν χτυπάει
        this.isRinging = false; 

        this.player.src = 'silence.mp3';
        this.player.volume = 0.1; // Χαμηλή ένταση στο silence
        
        // Ενημέρωση Μπάρας
        this.updateMetadata("BellGo Active", "🟢 Συνδεδεμένος", "https://cdn-icons-png.flaticon.com/512/190/190411.png");

        const playPromise = this.player.play();
        if (playPromise !== undefined) {
            playPromise.catch(e => console.log("Waiting for click..."));
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
            const slider = document.getElementById('acceptSlider');
            if (slider) slider.value = 50; 
        }

        // 2. Αλλαγή Ήχου
        this.player.src = 'alert.mp3';
        this.player.volume = 1.0; // Τέρμα ένταση για το alarm
        
        // Ενημέρωση Μπάρας (Ξανά, για σιγουριά)
        this.updateMetadata("🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ", "Πάτα Παύση για Αποδοχή", "https://cdn-icons-png.flaticon.com/512/564/564619.png");
        
        this.player.play()
            .then(() => {
                // Ξανα-δηλώνουμε τα κουμπιά μόλις ξεκινήσει ο ήχος
                this.setupMediaSession();
            })
            .catch(e => console.error("❌ Play failed:", e));

        // 3. Δόνηση
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
        // Αν έχει ήδη σταματήσει (π.χ. από το onpause), μην το ξανατρέξεις
        if (!this.isRinging && document.getElementById('alarmOverlay').style.display === 'none') return;
        
        console.log("🔕 STOP ALARM -> Returning to Silence");
        this.isRinging = false;

        // Κρύψιμο UI
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) overlay.style.display = 'none';

        // Stop Δόνησης
        if (this.vibrationInterval) clearInterval(this.vibrationInterval);
        if (navigator.vibrate) navigator.vibrate(0);

        // ΕΠΙΣΤΡΟΦΗ ΣΤΟ SILENCE
        // Προσοχή: Εδώ δεν κάνουμε pause, αλλάζουμε κατευθείαν src
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

// Physical buttons Listener (Volume/Space/Enter)
window.addEventListener('keydown', (e) => {
    if (AudioEngine.isRinging) {
        const validKeys = [24, 25, 179, 32, 13]; 
        if (validKeys.includes(e.keyCode)) {
            e.preventDefault(); 
            AudioEngine.stopAlarm();
        }
    }
});

// Volume Change Listener (Backup)
document.addEventListener('volumechange', () => {
    if (AudioEngine.isRinging) {
         AudioEngine.stopAlarm();
    }
});

window.AudioEngine = AudioEngine;
