const AudioEngine = {
    player: null,
    isRinging: false,
    vibrationInterval: null,

    init() {
        console.log("🔈 Audio Engine: System Media Mode Initialized");
        
        // 1. Δημιουργία Audio Element
        if (!this.player) {
            this.player = document.createElement('audio');
            this.player.id = 'mainAudioPlayer';
            this.player.loop = true; 
            document.body.appendChild(this.player);
        }

        // 2. Ρύθμιση Media Session (Τα κουμπιά της μπάρας)
        if ('mediaSession' in navigator) {
            const acceptCall = () => {
                console.log("⏯️ Media Button Pressed -> ACCEPTING CALL");
                this.stopAlarm();
            };

            // Όλα τα κουμπιά κάνουν Αποδοχή (Stop)
            navigator.mediaSession.setActionHandler('play', acceptCall);
            navigator.mediaSession.setActionHandler('pause', acceptCall);
            navigator.mediaSession.setActionHandler('stop', acceptCall);
            navigator.mediaSession.setActionHandler('previoustrack', acceptCall);
            navigator.mediaSession.setActionHandler('nexttrack', acceptCall);
        }

        // 3. Ξεκινάμε με "Silence Mode"
        this.startSilenceSession();
    },

    // --- ΛΕΙΤΟΥΡΓΙΑ 1: ΚΑΤΑΣΤΑΣΗ ΑΝΑΜΟΝΗΣ (SILENCE) ---
    startSilenceSession() {
        this.player.src = 'silence.mp3';
        
        // Ενημέρωση της Μπάρας Ειδοποιήσεων (Να φαίνεται ότι είμαστε Online)
        this.updateMetadata("BellGo Active", "🟢 Συνδεδεμένος", "https://cdn-icons-png.flaticon.com/512/190/190411.png");

        const playPromise = this.player.play();
        if (playPromise !== undefined) {
            playPromise.catch(e => console.log("Waiting for click to start audio session..."));
        }
    },

    // --- ΛΕΙΤΟΥΡΓΙΑ 2: ΚΛΗΣΗ (ALARM) ---
    triggerAlarm() {
        if (this.isRinging) return;
        this.isRinging = true;
        console.log("🔔 TRIGGER ALARM: Switching Track to Alert");

        // 1. Εμφάνιση Κόκκινης Οθόνης
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
            // Reset Slider
            const slider = document.getElementById('acceptSlider');
            if (slider) slider.value = 50; 
        }

        // 2. ΑΛΛΑΓΗ "ΤΡΑΓΟΥΔΙΟΥ" ΣΤΗΝ ΜΠΑΡΑ
        this.player.src = 'alert.mp3';
        this.updateMetadata("🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ", "Πάτα Play/Next για Αποδοχή", "https://cdn-icons-png.flaticon.com/512/564/564619.png");
        
        this.player.play().catch(e => console.error("❌ Play failed:", e));

        // 3. Δόνηση
        if (navigator.vibrate) {
            navigator.vibrate([1000, 500]); 
            if (this.vibrationInterval) clearInterval(this.vibrationInterval);
            this.vibrationInterval = setInterval(() => {
                navigator.vibrate([1000, 500]);
            }, 1600);
        }
    },

    // --- ΛΕΙΤΟΥΡΓΙΑ 3: ΑΠΟΔΟΧΗ & ΕΠΙΣΤΡΟΦΗ ΣΤΟ SILENCE ---
    stopAlarm() {
        if (!this.isRinging) return;
        console.log("🔕 STOP ALARM -> Returning to Silence");
        
        this.isRinging = false;

        // Κρύψιμο UI
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) overlay.style.display = 'none';

        // Stop Δόνησης
        if (this.vibrationInterval) clearInterval(this.vibrationInterval);
        if (navigator.vibrate) navigator.vibrate(0);

        // ΕΠΙΣΤΡΟΦΗ ΣΤΟ SILENCE (Σαν να μπήκε το επόμενο τραγούδι)
        this.startSilenceSession();
    },

    // Βοηθητική συνάρτηση για να αλλάζουμε τα γράμματα στην μπάρα
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

// Physical buttons Listener (Volume buttons as backup)
window.addEventListener('keydown', (e) => {
    if (AudioEngine.isRinging) {
        // Αν πατήσει Space, Enter, Volume Up/Down
        const validKeys = [24, 25, 179, 32, 13]; 
        if (validKeys.includes(e.keyCode)) {
            e.preventDefault(); 
            AudioEngine.stopAlarm();
        }
    }
});

// Τέλος, κάνουμε το volume change να λειτουργεί επίσης ως STOP
// (Προσοχή: Μόνο αν χτυπάει)
document.addEventListener('volumechange', () => {
    if (AudioEngine.isRinging) {
         AudioEngine.stopAlarm();
    }
});

window.AudioEngine = AudioEngine;
