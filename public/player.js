const AudioEngine = {
    hostPlayer: null,  // Παίζει το test.mp3 (Για την μπάρα)
    sirenPlayer: null, // Παίζει το alert.mp3 (Για τον ήχο κλήσης)
    isRinging: false,
    vibrationInterval: null,
    alarmStartTime: 0,

    init() {
        console.log("🔈 Audio Engine: Dual-Track Mode Initialized");
        
        // 1. Δημιουργία HOST PLAYER (Κρατάει την μπάρα ζωντανή)
        if (!this.hostPlayer) {
            this.hostPlayer = document.createElement('audio');
            this.hostPlayer.id = 'hostPlayer';
            this.hostPlayer.src = 'test.mp3'; // Το μεγάλο αρχείο
            this.hostPlayer.loop = true;
            this.hostPlayer.volume = 0.05; // Ίσα που να ακούγεται για να μην κόβει το session
            
            // Ακρόαση PAUSE από την μπάρα -> ΑΠΟΔΟΧΗ
            this.hostPlayer.onpause = () => {
                if (this.isRinging) {
                    console.log("⏸️ System Pause -> ACCEPTING CALL");
                    this.stopAlarm();
                } else {
                    // Αν δεν χτυπάει, απαγορεύουμε το Pause για να μην κλείσει η σύνδεση
                    this.hostPlayer.play(); 
                }
            };

            // Ακρόαση VOLUME -> ΑΠΟΔΟΧΗ
            this.hostPlayer.onvolumechange = () => {
                if (this.isRinging && (Date.now() - this.alarmStartTime > 2000)) {
                    console.log("🎚️ Volume Changed -> ACCEPTING CALL");
                    this.stopAlarm();
                }
            };
            
            document.body.appendChild(this.hostPlayer);
        }

        // 2. Δημιουργία SIREN PLAYER (Ο ήχος της κλήσης)
        if (!this.sirenPlayer) {
            this.sirenPlayer = document.createElement('audio');
            this.sirenPlayer.id = 'sirenPlayer';
            this.sirenPlayer.src = 'alert.mp3'; // Ο ήχος κλήσης
            this.sirenPlayer.loop = true;
            this.sirenPlayer.volume = 1.0; // Τέρμα ένταση
            document.body.appendChild(this.sirenPlayer);
        }

        this.setupMediaSession();
        
        // Ξεκινάμε τον Host
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

    // --- TRIGGER ALARM ---
    triggerAlarm() {
        if (this.isRinging) return;
        
        this.isRinging = true;
        this.alarmStartTime = Date.now();
        console.log("🔔 TRIGGER ALARM");

        // 1. UI: Κόκκινη Οθόνη
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
            const slider = document.getElementById('acceptSlider');
            if (slider) slider.value = 50; 
        }

        // 2. ΗΧΟΣ: Παίζουμε τη Σειρήνα (Siren Player)
        // ΣΗΜΕΙΩΣΗ: Δεν πειράζουμε τον Host Player, αυτός συνεχίζει να παίζει το test.mp3
        // για να κρατάει την μπάρα ζωντανή.
        this.sirenPlayer.currentTime = 0;
        this.sirenPlayer.play().catch(e => console.error("Siren failed:", e));

        // 3. METADATA: Αλλάζουμε απλά τα γράμματα στην μπάρα
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
        
        console.log("🔕 STOP ALARM");
        this.isRinging = false;

        // 1. UI Hide
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) overlay.style.display = 'none';

        // 2. Stop Siren Only
        this.sirenPlayer.pause();
        this.sirenPlayer.currentTime = 0;

        // 3. Stop Vibration
        if (this.vibrationInterval) clearInterval(this.vibrationInterval);
        if (navigator.vibrate) navigator.vibrate(0);

        // 4. Reset Metadata (Ο Host Player δεν σταμάτησε ποτέ)
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
