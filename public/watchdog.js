const Watchdog = {
    interval: null,
    panicInterval: null,
    isRinging: false,
    wakeLock: null,
    audioMonitor: null, // ΝΕΟ: Για έλεγχο του Media Player

    start: function(isFully) {
        console.log("🛡️ Watchdog: Active");
        
        // 1. ΕΚΚΙΝΗΣΗ MEDIA PLAYER (SILENCE LOOP)
        // Ξεκινάμε τον σιωπηλό ήχο για να κρατάμε το Android ξύπνιο (ΚΑΙ σε Kiosk ΚΑΙ σε Web)
        this.ensureAudioPlaying();

        // 2. WEB WAKELOCK (Για Chrome Android)
        this.requestWakeLock();
        // Αν πέσει το WakeLock (π.χ. αλλάξεις tab), ξαναζήτα το
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.requestWakeLock();
                this.ensureAudioPlaying(); // Τσεκάρουμε και τον ήχο αν γυρίσει ο χρήστης
            }
        });

        // 3. FULLY KIOSK SETUP
        if (isFully && typeof fully !== 'undefined') {
            try {
                fully.setBooleanSetting("keepScreenOn", true);
                fully.setBooleanSetting("unlockScreen", true);
                fully.setBooleanSetting("forceWifi", true);
                fully.setMusicVolume(100);
                console.log("🤖 Fully Kiosk Settings Applied");
            } catch(e){ console.log("Fully Error:", e); }
        }

        // 4. HEARTBEAT & MONITORING (Κάθε 5 δευτερόλεπτα)
        // Ελέγχει Socket, WakeLock και Audio Player
        if (this.interval) clearInterval(this.interval);
        this.interval = setInterval(() => {
             // A. Socket Heartbeat
             if (typeof socket !== 'undefined' && socket.connected) {
                 socket.emit('heartbeat'); 
             } else {
                 console.log("⚠️ Watchdog: Socket disconnected!");
             }

             // B. WakeLock Refresh
             this.requestWakeLock(); 

             // C. Audio Keep-Alive (Αν σταματήσει, το ξαναβάζουμε μπρος)
             this.ensureAudioPlaying();

        }, 5000); // Πιο συχνός έλεγχος (5 sec) για ασφάλεια
    },

    // --- ΝΕΑ ΣΥΝΑΡΤΗΣΗ: ΕΛΕΓΧΟΣ MEDIA PLAYER ---
    ensureAudioPlaying: function() {
        const silence = document.getElementById('silence');
        // Αν βρούμε τον ήχο και είναι παυμένος (paused) ΚΑΙ δεν χτυπάει συναγερμός -> ΠΑΤΑ PLAY!
        if (silence && silence.paused && !this.isRinging) {
            console.log("💤 Audio was sleeping. Kicking it awake!");
            silence.play().catch(e => {
                // Αθόρυβο fail, δεν μπορούμε να κάνουμε πολλά αν ο browser το μπλοκάρει τελείως,
                // αλλά θα ξαναπροσπαθήσουμε στο επόμενο interval.
            });
        }
    },

    requestWakeLock: async function() {
        if ('wakeLock' in navigator && !this.wakeLock) { // Ζητάμε μόνο αν δεν έχουμε ήδη
            try {
                this.wakeLock = await navigator.wakeLock.request('screen');
                console.log("💡 Screen Wake Lock active");
            } catch (err) {
                // console.log(`${err.name}, ${err.message}`); // Δεν χρειάζεται spam στο log
            }
        }
    },

    triggerPanicMode: function() {
        if (this.isRinging) return;
        this.isRinging = true;

        // Σταματάμε το silence για να παίξει η σειρήνα
        const silence = document.getElementById('silence');
        if(silence) silence.pause();

        const audio = document.getElementById('siren');
        if (audio) { audio.currentTime = 0; audio.loop = true; audio.play().catch(e=>{}); }

        document.getElementById('alarmScreen').style.display = 'flex';

        this.panicInterval = setInterval(() => {
            if (!this.isRinging) return;
            if (navigator.vibrate) navigator.vibrate([1000, 50, 1000]);
            
            if (typeof fully !== 'undefined') {
                fully.turnScreenOn();
                fully.bringToForeground();
                fully.showToast("🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ 🚨");
            }
            window.focus();
        }, 500);
    },

    stopPanicMode: function() {
        this.isRinging = false;
        if (this.panicInterval) clearInterval(this.panicInterval);
        
        const audio = document.getElementById('siren');
        if (audio) { audio.pause(); audio.currentTime = 0; audio.loop = false; }
        
        if (navigator.vibrate) navigator.vibrate(0);
        document.getElementById('alarmScreen').style.display = 'none';

        // ΞΕΚΙΝΑΜΕ ΠΑΛΙ ΤΟ SILENCE LOOP ΜΕΤΑ ΤΟΝ ΣΥΝΑΓΕΡΜΟ
        this.ensureAudioPlaying();
    },

    // --- ΝΕΑ ΣΥΝΑΡΤΗΣΗ: STOP ALL (ΓΙΑ LOGOUT) ---
    stopAll: function() {
        console.log("🛑 Watchdog: Stopping all services");
        if (this.interval) clearInterval(this.interval);
        if (this.panicInterval) clearInterval(this.panicInterval);
        
        const silence = document.getElementById('silence');
        if (silence) { silence.pause(); silence.currentTime = 0; }

        if (this.wakeLock) {
            this.wakeLock.release().then(() => this.wakeLock = null);
        }
    }
};
