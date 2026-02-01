const AudioEngine = {
    hostPlayer: null,  // Παίζει το silence.mp3 (Για να κρατάει την μπάρα)
    sirenPlayer: null, // Παίζει το alert.mp3 (Για τον ήχο κλήσης)
    isRinging: false,
    vibrationInterval: null,
    alarmStartTime: 0,

    init() {
        console.log("🔈 Audio Engine: Full Volume Silence Mode");
        
        // 1. HOST PLAYER (Το "Χαλί")
        if (!this.hostPlayer) {
            this.hostPlayer = document.createElement('audio');
            this.hostPlayer.id = 'hostPlayer';
            this.hostPlayer.src = 'silence.mp3'; // Βεβαιώσου ότι υπάρχει στο public
            this.hostPlayer.loop = true;
            
            // --- ΤΟ ΚΛΕΙΔΙ ---
            // Βάζουμε την ένταση στο 100%. 
            // Το κινητό νομίζει ότι παίζει τέρμα μουσική και κρατάει την μπάρα ανοιχτή.
            this.hostPlayer.volume = 1.0; 
            
            // Αν πατήσει Pause στην μπάρα -> ΑΠΟΔΟΧΗ
            this.hostPlayer.onpause = () => {
                if (this.isRinging) {
                    console.log("⏸️ System Pause -> ACCEPTING CALL");
                    this.stopAlarm();
                } else {
                    // Αν δεν χτυπάει, απαγορεύουμε το Pause (Restart)
                    console.log("⚠️ Keep-Alive enforce: Restarting Silence");
                    this.hostPlayer.play();
                }
            };
            
            // Αν αλλάξει την ένταση -> ΑΠΟΔΟΧΗ (Backup)
            this.hostPlayer.onvolumechange = () => {
                 if (this.isRinging && (Date.now() - this.alarmStartTime > 2000)) {
                    console.log("🎚️ Volume Changed -> ACCEPTING CALL");
                    this.stopAlarm();
                 }
            };

            document.body.appendChild(this.hostPlayer);
        }

        // 2. SIREN PLAYER (Η Σειρήνα)
        if (!this.sirenPlayer) {
            this.sirenPlayer = document.createElement('audio');
            this.sirenPlayer.id = 'sirenPlayer';
            this.sirenPlayer.src = 'alert.mp3';
            this.sirenPlayer.loop = true;
            this.sirenPlayer.volume = 1.0; // Τέρμα ένταση
            document.body.appendChild(this.sirenPlayer);
        }

        this.setupMediaSession();
        
        // Ξεκινάμε τη Σιωπή
        const playPromise = this.hostPlayer.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                // Ενημέρωση μπάρας
                this.updateMetadata("BellGo Active", "🟢 Online", "https://cdn-icons-png.flaticon.com/512/190/190411.png");
                
                // Λέμε στο σύστημα ότι παίζουμε ΚΑΝΟΝΙΚΑ
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
            }).catch(e => console.log("Waiting for interaction..."));
        }
    },

    setupMediaSession() {
        if ('mediaSession' in navigator) {
            const acceptCall = () => {
                if (this.isRinging) {
                    console.log("⏯️ Media Button -> ACCEPTING CALL");
                    this.stopAlarm();
                }
            };

            // Όλα τα κουμπιά κάνουν STOP
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

        // 1. UI Overlay
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
            const slider = document.getElementById('acceptSlider');
            if (slider) slider.value = 50; 
        }

        // 2. AUDIO: Παίζει η Σειρήνα (Πάνω από τη σιωπή)
        this.sirenPlayer.currentTime = 0;
        this.sirenPlayer.play().catch(e => console.error("Siren error:", e));

        // 3. METADATA UPDATE
        this.updateMetadata("🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ", "Πάτα ΠΑΥΣΗ για Αποδοχή", "https://cdn-icons-png.flaticon.com/512/564/564619.png");

        // 4. VIBRATION
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

        // Stop Siren Only (Η σιωπή συνεχίζει από κάτω)
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

// Physical buttons Listener
window.addEventListener('keydown', (e) => {
    if (AudioEngine.isRinging) {
        // Ασφάλεια 2 δευτερολέπτων
        if (Date.now() - AudioEngine.alarmStartTime > 2000) {
            const validKeys = [24, 25, 179, 32, 13]; 
            if (validKeys.includes(e.keyCode)) {
                e.preventDefault(); 
                AudioEngine.stopAlarm();
            }
        }
    }
});

window.AudioEngine = AudioEngine;
