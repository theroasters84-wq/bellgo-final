const Watchdog = {
    interval: null,
    panicInterval: null,
    isRinging: false,
    wakeLock: null,

    start: function(isFully) {
        console.log("🛡️ Watchdog: Active");
        
        // 1. ΕΚΚΙΝΗΣΗ SILENCE LOOP (ΑΜΕΣΩΣ)
        this.ensureAudioPlaying();

        // 2. WEB WAKELOCK
        this.requestWakeLock();
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.requestWakeLock();
                this.ensureAudioPlaying();
            }
        });

        // 3. FULLY KIOSK SETUP
        if (isFully && typeof fully !== 'undefined') {
            try {
                fully.setBooleanSetting("keepScreenOn", true);
                fully.setBooleanSetting("unlockScreen", true);
                fully.setBooleanSetting("forceWifi", true);
                fully.setMusicVolume(100);
            } catch(e){}
        }

        // 4. HEARTBEAT & AUDIO CHECK (Κάθε 5 δευτ)
        if (this.interval) clearInterval(this.interval);
        this.interval = setInterval(() => {
             // A. Socket
             if (typeof socket !== 'undefined' && socket.connected) {
                 socket.emit('heartbeat'); 
             }
             
             // B. WakeLock
             this.requestWakeLock();

             // C. Audio Keep-Alive
             this.ensureAudioPlaying();

        }, 5000);
    },

    // Ελέγχει αν παίζει ο ήχος. Αν όχι, πατάει Play.
    ensureAudioPlaying: function() {
        const silence = document.getElementById('silence');
        if (silence && silence.paused && !this.isRinging) {
            silence.play().catch(e => {}); 
        }
    },

    requestWakeLock: async function() {
        if ('wakeLock' in navigator && !this.wakeLock) {
            try {
                this.wakeLock = await navigator.wakeLock.request('screen');
            } catch (err) {}
        }
    },

    triggerPanicMode: function() {
        if (this.isRinging) return;
        this.isRinging = true;

        const silence = document.getElementById('silence');
        if(silence) silence.pause(); // Παύση σιωπής

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

        // Ξεκινάμε πάλι τη σιωπή
        this.ensureAudioPlaying();
    },

    stopAll: function() {
        if (this.interval) clearInterval(this.interval);
        if (this.panicInterval) clearInterval(this.panicInterval);
        
        const silence = document.getElementById('silence');
        if (silence) { silence.pause(); silence.currentTime = 0; }
        
        if (this.wakeLock) {
            this.wakeLock.release().then(()=> this.wakeLock=null);
        }
    }
};
