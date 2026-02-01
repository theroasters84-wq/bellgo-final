const AudioEngine = {
    player: null,
    isRinging: false,
    vibrationInterval: null,
    alarmStartTime: 0,

    init() {
        console.log("🔈 Audio Engine: Long-Track Keep-Alive Mode");
        
        if (!this.player) {
            this.player = document.createElement('audio');
            this.player.id = 'mainAudioPlayer';
            this.player.loop = true; // Να παίζει πάντα κύκλο
            
            // 1. ΑΠΟΔΟΧΗ ΜΕ PAUSE (Από την μπάρα)
            this.player.onpause = () => {
                if (this.isRinging) {
                    console.log("⏸️ System Pause Detected -> ACCEPTING CALL");
                    this.stopAlarm();
                } else {
                    // Αν πατήσει Pause ενώ είναι σε αναμονή (test.mp3), το ξαναξεκινάμε αμέσως
                    // για να μην κλείσει η σύνδεση.
                    console.log("⚠️ Pause on Keep-Alive -> Restarting instantly");
                    this.player.play();
                }
            };

            // 2. ΑΠΟΔΟΧΗ ΜΕ VOLUME BUTTONS
            this.player.onvolumechange = () => {
                if (this.isRinging) {
                    if (Date.now() - this.alarmStartTime > 2000) {
                        console.log("🎚️ Volume Changed -> ACCEPTING CALL");
                        this.stopAlarm();
                    }
                }
            };

            document.body.appendChild(this.player);
        }

        this.setupMediaSession();
        
        // Ξεκινάμε το "Keep Alive" με το μεγάλο αρχείο
        this.startKeepAliveSession();
    },

    setupMediaSession() {
        if ('mediaSession' in navigator) {
            const acceptCall = () => {
                if (this.isRinging) {
                    console.log("⏯️ Media Button -> ACCEPTING CALL");
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

    // --- ΛΕΙΤΟΥΡΓΙΑ 1: KEEP ALIVE (ONLINE) ---
    // Εδώ παίζει το test.mp3 για να μένει ξύπνιος ο browser
    startKeepAliveSession() {
        this.isRinging = false; 

        // Χρησιμοποιούμε το μεγάλο αρχείο για να κρατάει το Session
        this.player.src = 'test.mp3';
        
        // Βάζουμε την ένταση στο 1% (ίσα που να υπάρχει σήμα ήχου)
        // ώστε να μην ενοχλεί αν είναι τραγούδι, αλλά να κρατάει το κινητό ξύπνιο.
        this.player.volume = 0.05; 
        
        this.updateMetadata("BellGo Active", "🟢 Online (Keep-Alive)", "https://cdn-icons-png.flaticon.com/512/190/190411.png");

        const playPromise = this.player.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
            }).catch(e => console.log("Waiting for interaction..."));
        }
    },

    // --- ΛΕΙΤΟΥΡΓΙΑ 2: ALARM (ΚΛΗΣΗ) ---
    // Εδώ αλλάζει σε alert.mp3
    triggerAlarm() {
        if (this.isRinging) return;
        
        this.isRinging = true;
        this.alarmStartTime = Date.now();
        console.log("🔔 TRIGGER ALARM (Switching to Alert)");

        // UI
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
            const slider = document.getElementById('acceptSlider');
            if (slider) slider.value = 50; 
        }

        // AUDIO: Αλλαγή σε Σειρήνα
        this.player.src = 'alert.mp3';
        this.player.volume = 1.0; // Τέρμα ένταση για να ακουστεί
        
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

    // --- ΛΕΙΤΟΥΡΓΙΑ 3: STOP (ΑΠΟΔΟΧΗ) ---
    stopAlarm() {
        if (!this.isRinging && this.player.src.includes('test.mp3')) return;
        
        console.log("🔕 STOP ALARM -> Back to Keep-Alive");
        this.isRinging = false;

        // UI
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) overlay.style.display = 'none';

        // Stop Vibration
        if (this.vibrationInterval) clearInterval(this.vibrationInterval);
        if (navigator.vibrate) navigator.vibrate(0);

        // Γυρνάμε αμέσως στο test.mp3
        this.startKeepAliveSession();
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
