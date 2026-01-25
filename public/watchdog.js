const Watchdog = {
    interval: null,
    panicInterval: null,
    isRinging: false,
    wakeLock: null,

    start: function(isFully) {
        console.log("🛡️ Watchdog: Active");
        
        // 1. PLAY AUDIO & WAKELOCK
        this.ensureAudioPlaying();
        this.requestWakeLock();

        // 2. LISTENERS
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.requestWakeLock();
                this.ensureAudioPlaying();
                if(typeof Logic !== 'undefined' && !this.isRinging) Logic.updateMediaSession('active');
            }
        });

        // 3. FULLY KIOSK SETUP
        if (isFully && typeof fully !== 'undefined') {
            try {
                fully.setBooleanSetting("keepScreenOn", true);
                fully.setBooleanSetting("unlockScreen", true);
                fully.setBooleanSetting("forceWifi", true);
                fully.setBooleanSetting("preventSleep", true);
                fully.setBooleanSetting("wifiWakeLock", true);
                fully.setMusicVolume(100);
            } catch(e){}
        }

        // 4. THE LOOP (Κάθε 5 δευτερόλεπτα)
        if (this.interval) clearInterval(this.interval);
        this.interval = setInterval(() => {
             if (typeof socket !== 'undefined' && socket.connected) {
                 socket.emit('heartbeat'); 
             }
             
             this.requestWakeLock();
             this.ensureAudioPlaying();

             // Force Media Bar
             if (typeof Logic !== 'undefined' && !this.isRinging) {
                 Logic.updateMediaSession('active');
             }

        }, 5000);
    },

    ensureAudioPlaying: function() {
        const silence = document.getElementById('silence');
        if (silence && silence.paused && !this.isRinging) {
            // Προσπάθεια να παίξει ξανά αν σταμάτησε
            silence.play().catch(e => { console.log("Watchdog: Silence play error", e); }); 
        }
    },

    requestWakeLock: async function() {
        if ('wakeLock' in navigator && !this.wakeLock) {
            try { this.wakeLock = await navigator.wakeLock.request('screen'); } catch (err) {}
        }
    },

    triggerPanicMode: function() {
        if (this.isRinging) return;
        this.isRinging = true;

        // 🔥 ΑΠΟΘΗΚΕΥΣΗ ΟΤΙ ΧΤΥΠΑΕΙ (Για να αντέξει το refresh)
        localStorage.setItem('bellgo_is_ringing', 'true');

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
        
        // 🔥 ΚΑΘΑΡΙΣΜΟΣ ΜΝΗΜΗΣ (Σταμάτησε να χτυπάει)
        localStorage.removeItem('bellgo_is_ringing');
        
        if (this.panicInterval) clearInterval(this.panicInterval);
        
        const audio = document.getElementById('siren');
        if (audio) { audio.pause(); audio.currentTime = 0; audio.loop = false; }
        
        if (navigator.vibrate) navigator.vibrate(0);
        document.getElementById('alarmScreen').style.display = 'none';

        this.ensureAudioPlaying();
        if(typeof Logic !== 'undefined') Logic.updateMediaSession('active');
    },

    stopAll: function() {
        if (this.interval) clearInterval(this.interval);
        if (this.panicInterval) clearInterval(this.panicInterval);
        const silence = document.getElementById('silence');
        if (silence) { silence.pause(); silence.currentTime = 0; }
        if (this.wakeLock) { this.wakeLock.release().then(()=> this.wakeLock=null); }
    }
};
