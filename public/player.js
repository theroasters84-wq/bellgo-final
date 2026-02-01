const AudioEngine = {
    player: null,
    isRinging: false,
    vibrationInterval: null,
    alarmStartTime: 0,

    init() {
        console.log("🔈 Audio Engine: Test Mode Initialized");
        
        if (!this.player) {
            this.player = document.createElement('audio');
            this.player.id = 'mainAudioPlayer';
            this.player.loop = true; // Loop για σιγουριά
            
            // 1. ΑΠΟΔΟΧΗ ΜΕ PAUSE (Από την μπάρα)
            this.player.onpause = () => {
                if (this.isRinging) {
                    console.log("⏸️ System Pause Detected -> ACCEPTING CALL");
                    this.stopAlarm();
                }
            };

            // 2. ΑΠΟΔΟΧΗ ΜΕ VOLUME BUTTONS
            this.player.onvolumechange = () => {
                if (this.isRinging) {
                    // Ασφάλεια 2 δευτερολέπτων
                    if (Date.now() - this.alarmStartTime > 2000) {
                        console.log("🎚️ Volume Changed -> ACCEPTING CALL");
                        this.stopAlarm();
                    }
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

            // Όλα τα κουμπιά κάνουν STOP
            navigator.mediaSession.setActionHandler('play', acceptCall);
            navigator.mediaSession.setActionHandler('pause', acceptCall);
            navigator.mediaSession.setActionHandler('stop', acceptCall);
            navigator.mediaSession.setActionHandler('previoustrack', acceptCall);
            navigator.mediaSession.setActionHandler('nexttrack', acceptCall);
        }
    },

    // --- 1. SILENCE (ONLINE) ---
    startSilenceSession() {
        this.isRinging = false; 

        this.player.src = 'silence.mp3';
        this.player.volume = 0.5; 
        
        this.updateMetadata("BellGo Active", "🟢 Online", "https://cdn-icons-png.flaticon.com/512/190/190411.png");

        const playPromise = this.player.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
            }).catch(e => console.log("Waiting for interaction..."));
        }
    },

    // --- 2. ALARM (ΠΑΙΖΟΥΜΕ TO TEST.MP3) ---
    triggerAlarm() {
        if (this.isRinging) return;
        
        this.isRinging = true;
        this.alarmStartTime = Date.now();
        console.log("🔔 TRIGGER ALARM: Playing test.mp3");

        // UI: Εμφάνιση
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
            const slider = document.getElementById('acceptSlider');
            if (slider) slider.value = 50; 
        }

        // AUDIO: Παίζουμε το τραγούδι
        this.player.src = 'test.mp3';
        
        // Metadata: Δείχνουμε τίτλο "ΚΛΗΣΗ" ακόμα κι αν παίζει τραγούδι
        this.updateMetadata("🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ", "Πάτα ΠΑΥΣΗ για Αποδοχή", "https://cdn-icons-png.flaticon.com/512/564/564619.png");
        
        this.player.play()
            .then(() => {
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
            })
            .catch(e => console.error("❌ Play failed:", e));

        // Vibration
        if (navigator.vibrate) {
            navigator.vibrate([1000, 500]); 
            if (this.vibrationInterval) clearInterval(this.vibrationInterval);
            this.vibrationInterval = setInterval(() => {
                navigator.vibrate([1000, 500]);
            }, 1500);
        }
        
        this.sendNotification();
    },

    // --- 3. STOP (ΓΥΡΝΑΜΕ ΣΤΟ SILENCE) ---
    stopAlarm() {
        if (!this.isRinging && this.player.src.includes('silence')) return;
        
        console.log("🔕 STOP ALARM -> Back to Silence");
        this.isRinging = false;

        const overlay = document.getElementById('alarmOverlay');
        if (overlay) overlay.style.display = 'none';

        if (this.vibrationInterval) clearInterval(this.vibrationInterval);
        if (navigator.vibrate) navigator.vibrate(0);

        // Άμεση αλλαγή χωρίς Pause
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
