const Watchdog = {
    interval: null,
    panicInterval: null,
    isRinging: false,
    wakeLock: null,

    start: function(isFully) {
        console.log("🛡️ Watchdog: Active");
        
        // 1. WEB WAKELOCK (Για Chrome Android)
        this.requestWakeLock();
        // Αν πέσει το WakeLock (π.χ. αλλάξεις tab), ξαναζήτα το
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') this.requestWakeLock();
        });

        // 2. FULLY KIOSK SETUP
        if (isFully && typeof fully !== 'undefined') {
            try {
                fully.setBooleanSetting("keepScreenOn", true);
                fully.setBooleanSetting("unlockScreen", true);
                fully.setBooleanSetting("forceWifi", true);
                fully.setMusicVolume(100);
            } catch(e){}
        }

        // 3. HEARTBEAT (Κρατάει το Socket ζωντανό)
        this.interval = setInterval(() => {
             if (typeof socket !== 'undefined' && socket.connected) socket.emit('heartbeat'); 
             this.requestWakeLock(); // Ξαναζήτα το WakeLock για σιγουριά
        }, 10000);
    },

    requestWakeLock: async function() {
        if ('wakeLock' in navigator) {
            try {
                this.wakeLock = await navigator.wakeLock.request('screen');
                console.log("💡 Screen Wake Lock active");
            } catch (err) {
                console.log(`${err.name}, ${err.message}`);
            }
        }
    },

    triggerPanicMode: function() {
        if (this.isRinging) return;
        this.isRinging = true;

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
    }
};
