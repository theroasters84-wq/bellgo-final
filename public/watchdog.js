// --- watchdog.js v4 (Aggressive) ---
const Watchdog = {
    interval: null,
    panicInterval: null,
    isRinging: false,

    start: function(isFully) {
        console.log("🛡️ Watchdog: Active");
        this.interval = setInterval(() => {
             if (typeof socket !== 'undefined' && socket.connected) socket.emit('heartbeat'); 
        }, 10000);
    },

    runSetup: function() {
        if (typeof fully === 'undefined') return;
        try {
            fully.setBooleanSetting("keepScreenOn", true);
            fully.setBooleanSetting("unlockScreen", true);
            fully.setBooleanSetting("turnScreenOnOnPowerConnect", true);
            fully.setBooleanSetting("forceWifi", true);
            fully.setMusicVolume(100);
            fully.showToast("Setup OK ✅");
        } catch (e) {}
    },

    triggerPanicMode: function() {
        if (this.isRinging) return;
        this.isRinging = true;

        // 1. ΗΧΟΣ (LOOP μέσω JS για σιγουριά)
        const audio = document.getElementById('siren');
        if (audio) { 
            audio.currentTime = 0; 
            audio.loop = true; // ΤΟ ΕΝΕΡΓΟΠΟΙΟΥΜΕ ΕΔΩ
            audio.play().catch(e=>{}); 
        }

        // 2. ΕΜΦΑΝΙΣΗ (Το CSS κάνει το flashing)
        document.getElementById('alarmScreen').style.display = 'flex';

        // 3. ΕΠΙΘΕΣΗ (Κάθε μισό δευτερόλεπτο)
        this.panicInterval = setInterval(() => {
            if (!this.isRinging) return;

            // ΔΟΝΗΣΗ: Πολύ δυνατή
            if (navigator.vibrate) navigator.vibrate([1000, 50, 1000, 50, 1000]);

            // FULLY KIOSK: Spamming για να βγει μπροστά
            if (typeof fully !== 'undefined') {
                fully.turnScreenOn();
                fully.bringToForeground(); // Τραβάει την εφαρμογή μπροστά
                fully.showToast("🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ 🚨"); // Πετάει μήνυμα
            }
            
            // Focus Window (Για Desktop/Chrome)
            window.focus();
        }, 500);
    },

    stopPanicMode: function() {
        this.isRinging = false;
        if (this.panicInterval) clearInterval(this.panicInterval);
        
        const audio = document.getElementById('siren');
        if (audio) { 
            audio.pause(); 
            audio.currentTime = 0; 
            audio.loop = false;
        }
        
        if (navigator.vibrate) navigator.vibrate(0);
        document.getElementById('alarmScreen').style.display = 'none';
    }
};
