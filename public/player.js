/* --------------------------------------------------------------------------
   AUDIO ENGINE & BACKGROUND NOTIFICATIONS
   --------------------------------------------------------------------------
   1. Dual Player Strategy (KeepAlive + Alarm)
   2. Media Session Support (Lock Screen Controls)
   3. Background Web Notifications (Loop Support)
-------------------------------------------------------------------------- */

const AudioEngine = {
    keepAlivePlayer: null, // Player 1: Κρατάει την μπάρα (tone19hz)
    alarmPlayer: null,     // Player 2: Κάνει τον θόρυβο (alert)
    isRinging: false,
    wakeLock: null,
    vibInt: null,
    useSynth: false, // ✅ Flag for fallback
    synthInterval: null, // ✅ Interval for synth loop

    async init() {
        console.log("🔊 AudioEngine: DUAL PLAYER STRATEGY");

        // --- 1. SETUP PLAYER 1 (KEEP ALIVE / BAR OWNER) ---
        if (!this.keepAlivePlayer) {
            this.keepAlivePlayer = document.createElement("audio");
            this.keepAlivePlayer.id = 'keepAlive';
            this.keepAlivePlayer.src = "/tone19hz.wav"; 
            this.keepAlivePlayer.loop = true;
            this.keepAlivePlayer.volume = 1.0; 
            document.body.appendChild(this.keepAlivePlayer);
        }

        // --- 2. SETUP PLAYER 2 (ALARM SOUND) ---
        if (!this.alarmPlayer) {
            this.alarmPlayer = document.createElement("audio");
            this.alarmPlayer.id = 'alarmSound';
            this.alarmPlayer.src = "/alert.mp3"; 
            this.alarmPlayer.loop = true;
            this.alarmPlayer.volume = 1.0;
            
            // ✅ NEW: Detect missing file -> Switch to Synth
            this.alarmPlayer.onerror = () => {
                console.warn("⚠️ alert.mp3 missing! Switching to Synth.");
                this.useSynth = true;
            };
            
            document.body.appendChild(this.alarmPlayer);
        }

        this.requestWakeLock();
        this.setupMediaSession();

        // Ξεκινάμε το "Χαλί"
        try {
            await this.keepAlivePlayer.play();
            this.updateDisplay("online");
            console.log("✅ Keep-Alive Running");
        } catch (e) {
            console.log("⏳ Waiting for interaction to start AudioEngine...");
        }
    },

    setupMediaSession() {
        if (!("mediaSession" in navigator)) return;

        // Όταν πατάς κουμπί στην μπάρα (Play/Pause/Next), κάνουμε ΑΠΟΔΟΧΗ
        const handleNotificationClick = () => {
            console.log("👆 Notification Button Clicked");
            
            if (this.isRinging) {
                // ΣΗΜΑΝΤΙΚΟ: Καλουμε την Global συνάρτηση του App (premium.html)
                if (window.App && window.App.acceptAlarm) {
                    window.App.acceptAlarm(); 
                } else {
                    this.stopAlarm(); // Fallback
                }
            } else {
                // Αν δεν χτυπάει, απλά σιγουρεύουμε ότι ο Player 1 παίζει
                this.keepAlivePlayer.play();
            }
        };

        // Συνδέουμε όλα τα κουμπιά
        navigator.mediaSession.setActionHandler('play', handleNotificationClick);
        navigator.mediaSession.setActionHandler('pause', handleNotificationClick);
        navigator.mediaSession.setActionHandler('stop', handleNotificationClick);
        navigator.mediaSession.setActionHandler('previoustrack', handleNotificationClick);
        navigator.mediaSession.setActionHandler('nexttrack', handleNotificationClick);
    },

    // --- ΚΛΗΣΗ (Triggered by Socket) ---
    async triggerAlarm() {
        if (this.isRinging) return;
        this.isRinging = true;

        console.log("🚨 ALARM TRIGGERED");

        // 1. Αλλάζουμε τα γράμματα στην μπάρα
        this.updateDisplay("alarm");

        // 2. Ξεκινάμε τον ΘΟΡΥΒΟ (File or Synth)
        if (this.useSynth) {
            this.startSynthLoop();
        } else {
            if (this.alarmPlayer) {
                this.alarmPlayer.currentTime = 0;
                try {
                    await this.alarmPlayer.play();
                } catch(e) { 
                    console.error("Audio Play Error:", e); 
                    this.startSynthLoop(); // Fallback if play fails
                }
            } else {
                this.startSynthLoop(); // Fallback if player not ready
            }
        }

        // 3. UI Overlay (Αν υπάρχει στο HTML)
        const overlay = document.getElementById('alarmOverlay');
        const fakeLock = document.getElementById('fakeLockOverlay');
        if (overlay) {
            // Δείχνουμε το μεγάλο κουμπί ΜΟΝΟ αν είναι κλειδωμένη η οθόνη (Fake Lock)
            if (fakeLock && fakeLock.style.display === 'flex') {
                overlay.style.display = 'flex';
            }
        }

        this.vibrate(true);
        
        // 4. ΕΛΕΓΧΟΣ BACKGROUND: Αν η καρτέλα δεν φαίνεται, στείλε Notification
        // (Μόνο αν ΔΕΝ είμαστε σε Native App, γιατί εκεί το κάνει το Plugin)
        if (document.hidden && !window.Capacitor) {
            this.sendNotification();
        }
    },

    // --- ΑΠΟΔΟΧΗ ---
    stopAlarm() {
        if (!this.isRinging) return; 
        this.isRinging = false;

        console.log("✅ ALARM STOPPED (Audio Engine)");

        // 1. Σταματάμε ΜΟΝΟ τον θόρυβο
        if (this.alarmPlayer) {
            this.alarmPlayer.pause();
            this.alarmPlayer.currentTime = 0;
        }
        this.stopSynthLoop(); // ✅ Stop Synth

        // 2. Επαναφέρουμε τα γράμματα
        this.updateDisplay("online");

        // 3. UI Hide
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) overlay.style.display = 'none';

        this.vibrate(false);
    },

    updateDisplay(state) {
        if (!("mediaSession" in navigator)) return;

        if (state === "alarm") {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ",
                artist: "Πάτα ΠΑΥΣΗ για Αποδοχή",
                album: "BellGo Alert",
                artwork: [{ src: "icon.png", sizes: "512x512", type: "image/png" }]
            });
        } else {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: "BellGo Online",
                artist: "Σύστημα Ενεργό",
                album: "Αναμονή...",
                artwork: [{ src: "icon.png", sizes: "512x512", type: "image/png" }]
            });
        }
        navigator.mediaSession.playbackState = "playing";
    },

    vibrate(active) {
        if (!navigator.vibrate) return;
        if (active) {
            navigator.vibrate([1000, 500]);
            if (this.vibInt) clearInterval(this.vibInt);
            this.vibInt = setInterval(() => navigator.vibrate([1000, 500]), 1600);
        } else {
            if (this.vibInt) clearInterval(this.vibInt);
            navigator.vibrate(0);
        }
    },

    async requestWakeLock() {
        if ('wakeLock' in navigator) {
            try { this.wakeLock = await navigator.wakeLock.request("screen"); } catch (e) {}
        }
    },

    // Τοπικό Notification για Background (Backup στο Server Loop)
    sendNotification() {
        if (Notification.permission === "granted") {
            try {
                const notif = new Notification("🚨 ΚΛΗΣΗ!", { 
                    body: "Πατήστε για αποδοχή",
                    icon: "/admin.png", 
                    tag: 'bellgo-alarm', // Ίδιο tag με το sw.js για να μην γεμίζει
                    renotify: true,
                    requireInteraction: true 
                });
                
                notif.onclick = () => { 
                    window.focus(); 
                    if (window.App && window.App.acceptAlarm) {
                        window.App.acceptAlarm();
                    }
                    notif.close(); 
                };
            } catch (e) {}
        }
    },

    // ✅ NEW: SYNTHESIZER FUNCTIONS (No File Needed)
    startSynthLoop() {
        if (this.synthInterval) return;
        this.playBeep();
        this.synthInterval = setInterval(() => this.playBeep(), 1000);
    },

    stopSynthLoop() {
        if (this.synthInterval) {
            clearInterval(this.synthInterval);
            this.synthInterval = null;
        }
    },

    playBeep() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.type = 'square';
            osc.frequency.setValueAtTime(600, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.1);
            
            gain.gain.setValueAtTime(0.5, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.start();
            osc.stop(ctx.currentTime + 0.5);
        } catch(e) {}
    }
};

// Volume Buttons Listener (Hardware Keys -> Accept)
window.addEventListener('keydown', (e) => {
    // 24=VolUp, 25=VolDown (Android WebView specific often)
    // ArrowUp/Down for PC testing
    if (AudioEngine.isRinging && (e.keyCode === 24 || e.keyCode === 25 || e.code === 'ArrowUp' || e.code === 'ArrowDown')) { 
        if (window.App && window.App.acceptAlarm) {
            window.App.acceptAlarm();
        } else {
            AudioEngine.stopAlarm();
        }
    }
});

// Export to Window
window.AudioEngine = AudioEngine;
