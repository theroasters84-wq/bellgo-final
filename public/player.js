// Ένα μικρό MP3 "ησυχίας" κωδικοποιημένο σε κείμενο (Base64)
// Αυτό ξεγελάει το Android ότι παίζει "αρχείο" ενώ δεν ακούγεται τίποτα.
const SILENT_MP3_DATA = "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAApAAADTGF2ZjU4LjQ1LjEwMAAAAAAAAAAAAAAA//oeDAAAAAAAASwgAAAAIvXHAAAAAAASxyb84AAANIAAAA0gAAAB"; 

const AudioEngine = {
    hostPlayer: null,  // Το "Αόρατο" Χαλί
    sirenPlayer: null, // Η Σειρήνα
    isRinging: false,
    vibrationInterval: null,
    alarmStartTime: 0,

    init() {
        console.log("🔈 Audio Engine: Base64 Silent Mode");
        
        // 1. HOST PLAYER (Το αόρατο χαλί)
        if (!this.hostPlayer) {
            this.hostPlayer = document.createElement('audio');
            this.hostPlayer.id = 'hostPlayer';
            
            // Χρησιμοποιούμε τον κώδικα αντί για αρχείο
            this.hostPlayer.src = SILENT_MP3_DATA; 
            this.hostPlayer.loop = true;
            
            // ΚΟΛΠΟ: Βάζουμε την ένταση στο 100% !
            // Το Android βλέπει 100% και κρατάει την μπάρα ανοιχτή.
            // Εμείς δεν ακούμε τίποτα γιατί το αρχείο είναι κενό.
            this.hostPlayer.volume = 1.0; 
            
            // Αν πατήσει Pause στην μπάρα -> ΑΠΟΔΟΧΗ
            this.hostPlayer.onpause = () => {
                if (this.isRinging) {
                    console.log("⏸️ Pause Detected -> ACCEPT");
                    this.stopAlarm();
                } else {
                    // Αν δεν χτυπάει, απαγορεύουμε το Pause (για να μην φύγει η μπάρα)
                    console.log("⚠️ Keep-Alive enforce");
                    this.hostPlayer.play();
                }
            };
            
            document.body.appendChild(this.hostPlayer);
        }

        // 2. SIREN PLAYER (Ο ήχος κλήσης)
        if (!this.sirenPlayer) {
            this.sirenPlayer = document.createElement('audio');
            this.sirenPlayer.id = 'sirenPlayer';
            this.sirenPlayer.src = 'alert.mp3'; // Βεβαιώσου ότι το alert.mp3 υπάρχει στο public
            this.sirenPlayer.loop = true;
            this.sirenPlayer.volume = 1.0; 
            document.body.appendChild(this.sirenPlayer);
        }

        this.setupMediaSession();
        
        // Ξεκινάμε το αόρατο χαλί
        const playPromise = this.hostPlayer.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                this.updateMetadata("BellGo Active", "🟢 Online", "https://cdn-icons-png.flaticon.com/512/190/190411.png");
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
            }).catch(e => console.log("Waiting for interaction..."));
        }
    },

    setupMediaSession() {
        if ('mediaSession' in navigator) {
            const acceptCall = () => {
                if (this.isRinging) {
                    console.log("⏯️ Media Button -> ACCEPT");
                    this.stopAlarm();
                }
            };
            navigator.mediaSession.setActionHandler('play', acceptCall);
            navigator.mediaSession.setActionHandler('pause', acceptCall);
            navigator.mediaSession.setActionHandler('stop', acceptCall);
            navigator.mediaSession.setActionHandler('previoustrack', acceptCall);
            navigator.mediaSession.setActionHandler('nexttrack', acceptCall);
        }
    },

    // --- TRIGGER ALARM ---
    triggerAlarm() {
        if (this.isRinging) return;
        this.isRinging = true;
        this.alarmStartTime = Date.now();
        console.log("🔔 ALARM START");

        // UI
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
            const slider = document.getElementById('acceptSlider');
            if (slider) slider.value = 50; 
        }

        // AUDIO: Παίζουμε τη Σειρήνα (Πάνω από το αόρατο χαλί)
        this.sirenPlayer.currentTime = 0;
        this.sirenPlayer.play().catch(e => console.error("Siren error:", e));

        // METADATA
        this.updateMetadata("🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ", "Πάτα ΠΑΥΣΗ για Αποδοχή", "https://cdn-icons-png.flaticon.com/512/564/564619.png");

        // VIBRATION
        if (navigator.vibrate) {
            navigator.vibrate([1000, 500]); 
            if (this.vibrationInterval) clearInterval(this.vibrationInterval);
            this.vibrationInterval = setInterval(() => {
                navigator.vibrate([1000, 500]);
            }, 1500);
        }
        
        this.sendNotification();
    },

    // --- STOP ALARM ---
    stopAlarm() {
        if (!this.isRinging) return;
        console.log("🔕 ALARM STOP");
        this.isRinging = false;

        // UI Hide
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) overlay.style.display = 'none';

        // Stop Siren Only
        this.sirenPlayer.pause();
        this.sirenPlayer.currentTime = 0;

        // Stop Vibration
        if (this.vibrationInterval) clearInterval(this.vibrationInterval);
        if (navigator.vibrate) navigator.vibrate(0);

        // Reset Metadata
        this.updateMetadata("BellGo Active", "🟢 Online", "https://cdn-icons-png.flaticon.com/512/190/190411.png");
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

// Physical buttons
window.addEventListener('keydown', (e) => {
    if (AudioEngine.isRinging) {
        if (Date.now() - AudioEngine.alarmStartTime > 2000) {
            const validKeys = [24, 25, 179, 32, 13]; 
            if (validKeys.includes(e.keyCode)) {
                e.preventDefault(); 
                AudioEngine.stopAlarm();
            }
        }
    }
});

// Volume Change (Backup)
// Ακούμε τον hostPlayer γιατί αυτός είναι πάντα ενεργός
window.addEventListener('volumechange', () => {
    if (AudioEngine.isRinging && (Date.now() - AudioEngine.alarmStartTime > 2000)) {
         AudioEngine.stopAlarm();
    }
});

window.AudioEngine = AudioEngine;
