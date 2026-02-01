// player.js - Η λογική του Player (Διορθωμένη για το Unified App)

const AudioEngine = {
    player: null,
    isRinging: false,

    init() {
        console.log("🔈 Audio Engine Initialized");
        
        // 1. Δημιουργία Audio Element (αν δεν υπάρχει ήδη)
        if (!this.player) {
            this.player = document.createElement('audio');
            this.player.id = 'mainAudioPlayer';
            this.player.loop = true; // Να παίζει συνέχεια
            document.body.appendChild(this.player);
        }

        // 2. Ξεκινάμε με ΣΙΩΠΗ (Silence)
        // ΠΡΟΣΟΧΗ: Βάζουμε σκέτο 'silence.mp3' γιατί το index.html και το mp3 είναι στον ίδιο φάκελο (public)
        this.player.src = 'silence.mp3'; 
        this.player.volume = 0.1;

        // 3. Immortal Logic: Ξεκινάμε το silent loop με το πρώτο click
        // Αυτό ξεγελάει τον browser για να μας αφήσει να παίξουμε ήχο μετά
        const unlockAudio = () => {
            if(this.player.src.includes('silence')) {
                this.player.play()
                    .then(() => console.log("✅ Silent loop started"))
                    .catch(e => console.log("⚠️ Silent play blocked (waiting for interaction)", e));
            }
            // Αφαιρούμε το listener για να μην τρέχει συνέχεια
            document.body.removeEventListener('click', unlockAudio);
        };
        document.body.addEventListener('click', unlockAudio);
    },

    // Καλέιται όταν έρθει σήμα από τον Server
    triggerAlarm() {
        if (this.isRinging) return; // Αν χτυπάει ήδη, μην κάνεις τίποτα
        this.isRinging = true;

        console.log("🔔 TRIGGER ALARM: Playing alert.mp3");

        // Α. Εμφάνιση της Κόκκινης Οθόνης (UI)
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
        }

        // Β. Αλλαγή ήχου σε Σειρήνα
        // ΠΡΟΣΟΧΗ: Σκέτο 'alert.mp3'
        this.player.src = 'alert.mp3'; 
        this.player.currentTime = 0;
        this.player.volume = 1.0;
        
        this.player.play().catch(e => console.error("❌ Audio play failed:", e));

        // Γ. Δόνηση (Για κινητά Android)
        if (navigator.vibrate) navigator.vibrate([1000, 500, 1000]);
    },

    // Καλείται όταν πατήσεις STOP ή Volume Button
    stopAlarm() {
        console.log("🔕 STOP ALARM");
        this.isRinging = false;

        // Α. Κρύψιμο της Κόκκινης Οθόνης
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) {
            overlay.style.display = 'none';
        }

        // Β. Επιστροφή στη Σιωπή (για να μην κλείσει η σύνδεση)
        this.player.pause();
        this.player.src = 'silence.mp3'; // Επιστροφή στο silent
        this.player.volume = 0.1;
        this.player.play().catch(() => {});

        // Γ. Σταμάτημα Δόνησης
        if (navigator.vibrate) navigator.vibrate(0);
    }
};

// 4. Volume Button Logic (Hack)
// Αν ο χρήστης πατήσει κουμπί έντασης ενώ χτυπάει, το σταματάμε
window.addEventListener('keydown', (e) => {
    // Αν χτυπάει ΚΑΙ πατηθεί οποιοδήποτε κουμπί
    if (AudioEngine.isRinging) {
        console.log("Key pressed -> Stopping Alarm");
        AudioEngine.stopAlarm();
    }
});

// Κάνουμε το αντικείμενο Global για να το βλέπει το index.html
window.AudioEngine = AudioEngine;
