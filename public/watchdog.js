// WATCHDOG: Η Μονάδα Επιθετικής Επιτήρησης
const Watchdog = {
    interval: null,
    panicInterval: null,
    isRinging: false,

    // Καλείται μόλις μπει ο Staff
    start: function() {
        console.log("🛡️ Watchdog: Anti-Sleep ενεργοποιήθηκε.");
        
        // Κάθε 10 δευτερόλεπτα κάνε "Reinforce"
        this.interval = setInterval(() => {
            this.reinforce();
        }, 10000);
    },

    // Ενίσχυση Αμυνών (Anti-Sleep)
    reinforce: function() {
        // 1. Fully Kiosk Keep Awake
        if (typeof fully !== 'undefined') {
            fully.keepScreenOn(true);
            fully.setMusicVolume(100, false); 
        }

        // 2. Wake Lock API
        if ('wakeLock' in navigator && (!window.wakeLockObj || window.wakeLockObj.released)) {
            navigator.wakeLock.request('screen').then((wl) => {
                window.wakeLockObj = wl;
            }).catch(()=>{});
        }

        // 3. Heartbeat στον Server
        if (typeof socket !== 'undefined' && socket.connected) {
            socket.emit('im-alive', { status: 'OK' });
        }
        
        // 4. Fake Title Activity
        document.title = "BellGo Active " + new Date().getSeconds();
    },

    // 🚨 PANIC MODE: ΟΤΑΝ ΧΤΥΠΑΕΙ Η ΚΛΗΣΗ 🚨
    triggerPanicMode: function() {
        this.isRinging = true;
        console.log("🚨 PANIC MODE START");

        if (this.panicInterval) clearInterval(this.panicInterval);

        // Κάθε 0.8 δευτερόλεπτα σφυροκοπάμε το Android
        this.panicInterval = setInterval(() => {
            if (!this.isRinging) return;

            if (typeof fully !== 'undefined') {
                fully.turnScreenOn();       // ΑΝΑΨΕ ΟΘΟΝΗ
                fully.bringToForeground();  // ΕΛΑ ΜΠΡΟΣΤΑ (System Alarm Window)
                fully.setMusicVolume(100);  // ΤΕΡΜΑ ΗΧΟΣ
            }

            // Δόνηση
            if (navigator.vibrate) navigator.vibrate([500, 200, 500]);

        }, 800);
    },

    stopPanicMode: function() {
        this.isRinging = false;
        if (this.panicInterval) clearInterval(this.panicInterval);
        if (navigator.vibrate) navigator.vibrate(0);
        console.log("🛑 PANIC MODE STOP");
    }
};
