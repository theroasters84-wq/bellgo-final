const AudioEngine = {
    player: null,
    isRinging: false,
    vibrationInterval: null,
    keepAliveInterval: null, // ΝΕΟ: Για να κρατάει την μπάρα ζωντανή

    init() {
        console.log("🔈 Audio Engine: Aggressive Media Mode");
        
        if (!this.player) {
            this.player = document.createElement('audio');
            this.player.id = 'mainAudioPlayer';
            this.player.loop = true; 
            
            // Ασφάλεια: Αν το σύστημα σταματήσει τον ήχο (π.χ. πατήσεις Pause στην μπάρα)
            // το θεωρούμε Αποδοχή Κλήσης.
            this.player.onpause = () => {
                if (this.isRinging) {
                    console.log("⏸️ System Pause Detected -> ACCEPTING CALL");
                    this.stopAlarm();
                }
            };

            document.body.appendChild(this.player);
        }

        this.setupMediaSession();
        this.startSilenceSession();
    },

    setupMediaSession() {
        if ('mediaSession' in navigator) {
            const acceptCall = () => {
                console.log("⏯️ Media Button Pressed -> ACCEPTING CALL");
                this.stopAlarm();
            };

            // Δηλώνουμε ότι ΟΛΑ τα κουμπιά κάνουν το ίδιο πράγμα (Stop)
            navigator.mediaSession.setActionHandler('play', acceptCall);
            navigator.mediaSession.setActionHandler('pause', acceptCall);
            navigator.mediaSession.setActionHandler('stop', acceptCall);
            navigator.mediaSession.setActionHandler('previoustrack', acceptCall);
            navigator.mediaSession.setActionHandler('nexttrack', acceptCall);
        }
    },

    // --- 1. SILENCE MODE (ONLINE) ---
    startSilenceSession() {
        this.isRinging = false; 
        
        // Σταματάμε το "σφυροκόπημα" της μπάρας αν τρέχει
        if(this.keepAliveInterval) clearInterval(this.keepAliveInterval);

        this.player.src = 'silence.mp3';
        this.player.volume = 0.1; 
        
        this.updateMetadata("BellGo Active", "🟢 Online - Αναμονή", "https://cdn-icons-png.flaticon.com/512/190/190411.png");

        const playPromise = this.player.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
            }).catch(e => console.log("Waiting for interaction..."));
        }
    },

    // --- 2. ALARM MODE (ΚΛΗΣΗ) ---
    triggerAlarm() {
        if (this.isRinging) return;
        this.isRinging = true;
        console.log("🔔 TRIGGER ALARM");

        // UI: Κόκκινη οθόνη
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
            const slider = document.getElementById('acceptSlider');
            if (slider) slider.value = 50; 
        }

        // AUDIO: Αλλαγή σε Σειρήνα
        this.player.src = 'alert.mp3';
        this.player.volume = 1.0; 
        
        this.player.play()
            .then(() => {
                // Μόλις ξεκινήσει ο ήχος, φτιάχνουμε την μπάρα
                this.updateMetadata("🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ", "Πάτα ΠΑΥΣΗ για Αποδοχή", "https://cdn-icons-png.flaticon.com/512/564/564619.png");
                
                // FORCE: Λέμε στο Android ότι παίζουμε μουσική
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';

                // EXTRA FORCE: Ξαναστέλνουμε την εντολή κάθε 1.5 δευτερόλεπτο
                // για να μην εξαφανιστεί η μπάρα
                if(this.keepAliveInterval) clearInterval(this.keepAliveInterval);
                this.keepAliveInterval = setInterval(() => {
                    if(this.isRinging) {
                        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
                    }
                }, 1500);
            })
            .catch(e => console.error("❌ Play failed:", e));

        // VIBRATION
        if (navigator.vibrate) {
            navigator.vibrate([1000, 500]); 
            if (this.vibrationInterval) clearInterval(this.vibrationInterval);
            this.vibrationInterval = setInterval(() => {
                navigator.vibrate([1000, 500]);
            }, 1600);
        }
    },

    // --- 3. STOP MODE (ΑΠΟΔΟΧΗ) ---
    stopAlarm() {
        if (!this.isRinging && this.player.src.includes('silence')) return;
        
        console.log("🔕 STOP ALARM -> Back to Silence");
        this.isRinging = false;

        // UI Hide
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) overlay.style.display = 'none';

        // Clear Intervals
        if (this.vibrationInterval) clearInterval(this.vibrationInterval);
        if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
        if (navigator.vibrate) navigator.vibrate(0);

        // Back to Silence (No pause, direct swap)
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
