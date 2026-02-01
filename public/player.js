// public/player.js

const AudioEngine = {
    player: null,
    isRinging: false,

    init() {
        console.log("🔈 Audio Engine Initializing...");
        
        // 1. Δημιουργία Audio Element
        if (!this.player) {
            this.player = document.createElement('audio');
            this.player.id = 'mainAudioPlayer';
            this.player.loop = true;
            document.body.appendChild(this.player);
        }

        // 2. Παίζουμε Σιωπή ΑΜΕΣΩΣ (Επειδή είμαστε ήδη μέσα σε click handler από το Login)
        this.player.src = 'silence.mp3'; 
        this.player.volume = 0.1;
        
        const playPromise = this.player.play();
        
        if (playPromise !== undefined) {
            playPromise
                .then(() => console.log("✅ Audio Context Unlocked! (Silence playing)"))
                .catch(error => console.error("❌ Audio Autoplay blocked:", error));
        }
    },

    triggerAlarm() {
        if (this.isRinging) return;
        this.isRinging = true;
        console.log("🔔 TRIGGER ALARM: Playing alert.mp3");

        // Εμφάνιση κόκκινης οθόνης
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) overlay.style.display = 'flex';

        // Αλλαγή σε Σειρήνα
        this.player.src = 'alert.mp3'; 
        this.player.currentTime = 0;
        this.player.volume = 1.0;
        this.player.play().catch(e => console.error("❌ Alarm play failed:", e));

        // Δόνηση
        if (navigator.vibrate) navigator.vibrate([1000, 500, 1000]);
    },

    stopAlarm() {
        console.log("🔕 STOP ALARM");
        this.isRinging = false;

        // Κρύψιμο οθόνης
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) overlay.style.display = 'none';

        // Επιστροφή σε σιωπή
        this.player.pause();
        this.player.src = 'silence.mp3';
        this.player.volume = 0.1;
        this.player.play().catch(() => {});
        
        if (navigator.vibrate) navigator.vibrate(0);
    }
};

// Window Listeners
window.addEventListener('keydown', () => {
    if (AudioEngine.isRinging) AudioEngine.stopAlarm();
});

window.AudioEngine = AudioEngine;
