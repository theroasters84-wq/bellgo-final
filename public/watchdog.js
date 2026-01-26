const Watchdog = {
    interval: null,
    panicInterval: null,
    isRinging: false,

    start: function(isFully) {
        console.log("🛡️ Watchdog: Active (Hardcore Mode)");
        
        // 1. ΔΕΣΜΕΥΣΗ ΚΟΥΜΠΙΩΝ (NATIVE BINDING)
        // Αυτό παρακάμπτει το Android και πιάνει τα κουμπιά απευθείας
        if (typeof fully !== 'undefined') {
            fully.bind('onVolumeUp', 'Watchdog.handleButtonPress();');
            fully.bind('onVolumeDown', 'Watchdog.handleButtonPress();');
            
            // Ρυθμίσεις Επιβίωσης
            fully.setBooleanSetting("preventSleep", true);
            fully.setBooleanSetting("wifiWakeLock", true);
            fully.setBooleanSetting("keepScreenOn", true); // Κρατάει την οθόνη τεχνικά ανοιχτή
        }

        // 2. THE LOOP (Κάθε 10 δευτερόλεπτα)
        if (this.interval) clearInterval(this.interval);
        this.interval = setInterval(() => {
             // A. Heartbeat στον Server
             if (typeof socket !== 'undefined' && socket.connected) {
                 socket.emit('heartbeat'); 
             }
             
             // B. AUDIO KEEP-ALIVE (Το μυστικό για το WiFi)
             this.ensureAudioPlaying();

        }, 10000);
    },

    // Αυτή η συνάρτηση καλείται ΟΤΑΝ ΠΑΤΑΣ ΤΟ ΚΟΥΜΠΙ
    handleButtonPress: function() {
        if (this.isRinging) {
            console.log("🔘 Hardware Button: Stopping Alarm!");
            this.stopPanicMode();
        } else {
            console.log("🔘 Button Pressed (No Alarm)");
        }
    },

    ensureAudioPlaying: function() {
        const silence = document.getElementById('silence');
        // ΠΡΟΣΟΧΗ: Παίζει ΠΑΝΤΑ, ακόμα και αν χτυπάει ο συναγερμός
        if (silence && silence.paused) { 
            silence.play().catch(e => {}); 
        }
    },

    triggerPanicMode: function() {
        if (this.isRinging) return;
        this.isRinging = true;
        localStorage.setItem('bellgo_is_ringing', 'true');

        // 1. Παίζουμε τη Σειρήνα (ΧΩΡΙΣ να σταματήσουμε το silence)
        const audio = document.getElementById('siren');
        if (audio) { audio.currentTime = 0; audio.loop = true; audio.play().catch(e=>{}); }

        // 2. Εμφανίζουμε την κόκκινη οθόνη
        const screen = document.getElementById('alarmScreen');
        if(screen) screen.style.display = 'flex';

        // 3. ΞΥΠΝΑΜΕ ΤΟ TABLET (Αν ήταν σε screensaver)
        if (typeof fully !== 'undefined') {
            fully.turnScreenOn();
            fully.bringToForeground();
            fully.setScreenBrightness(255);
        }

        this.panicInterval = setInterval(() => {
            if (!this.isRinging) return;
            if (navigator.vibrate) navigator.vibrate([1000, 50, 1000]);
        }, 500);
    },

    stopPanicMode: function() {
        this.isRinging = false;
        localStorage.removeItem('bellgo_is_ringing');
        
        if (this.panicInterval) clearInterval(this.panicInterval);
        
        const audio = document.getElementById('siren');
        if (audio) { audio.pause(); audio.currentTime = 0; audio.loop = false; }
        
        if (navigator.vibrate) navigator.vibrate(0);
        
        const screen = document.getElementById('alarmScreen');
        if(screen) screen.style.display = 'none';
    },

    stopAll: function() {
        if (this.interval) clearInterval(this.interval);
        if (this.panicInterval) clearInterval(this.panicInterval);
    }
};
