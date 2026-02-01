const AudioEngine = {
    hostPlayer: null,  // Παίζει το test.mp3 (Μουσική Χαλί)
    sirenPlayer: null, // Παίζει το alert.mp3 (Σειρήνα)
    isRinging: false,
    vibrationInterval: null,
    alarmStartTime: 0,

    init() {
        console.log("🔈 Audio Engine: Muted-Song Keep Alive");
        
        // 1. HOST PLAYER (Το τραγούδι που κρατάει την μπάρα)
        if (!this.hostPlayer) {
            this.hostPlayer = document.createElement('audio');
            this.hostPlayer.id = 'hostPlayer';
            this.hostPlayer.src = 'test.mp3'; // Βάλε το τραγούδι που δουλεύει!
            this.hostPlayer.loop = true;
            
            // ΚΟΛΠΟ: Ένταση σχεδόν μηδέν, αλλά όχι μηδέν (για να μην το κόψει το Android)
            this.hostPlayer.volume = 0.001; 
            
            // Αν πατήσει Pause στην μπάρα -> ΑΠΟΔΟΧΗ
            this.hostPlayer.onpause = () => {
                if (this.isRinging) {
                    console.log("⏸️ Pause -> ACCEPT");
                    this.stopAlarm();
                } else {
                    // Αν δεν χτυπάει, απαγορεύουμε το Pause (για να μην κλείσει η μπάρα)
                    this.hostPlayer.play();
                }
            };
            
            document.body.appendChild(this.hostPlayer);
        }

        // 2. SIREN PLAYER (Ο ήχος κλήσης)
        if (!this.sirenPlayer) {
            this.sirenPlayer = document.createElement('audio');
            this.sirenPlayer.id = 'sirenPlayer';
            this.sirenPlayer.src = 'alert.mp3';
            this.sirenPlayer.loop = true;
            this.sirenPlayer.volume = 1.0; // Τέρμα ένταση
            document.body.appendChild(this.sirenPlayer);
        }

        this.setupMediaSession();
        
        // Ξεκινάμε το "Βουβό Τραγούδι"
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
                    console.log("⏯️ Button -> ACCEPT");
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

        // AUDIO: Παίζουμε τη Σειρήνα
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
// ΠΡΟΣΟΧΗ: Εδώ ακούμε τον Host Player γιατί αυτός παίζει συνέχεια
// Αν αλλάξει η ένταση του συστήματος, το πιάνουμε.
window.addEventListener('volumechange', () => {
    if (AudioEngine.isRinging && (Date.now() - AudioEngine.alarmStartTime > 2000)) {
         AudioEngine.stopAlarm();
    }
});

window.AudioEngine = AudioEngine;
