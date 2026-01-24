// --- watchdog.js ---
const Watchdog = {
    interval: null,
    panicInterval: null,
    isRinging: false,

    // Καλείται στο ξεκίνημα
    start: function(isFully) {
        console.log("🛡️ Watchdog: Activated");

        // ΑΥΤΟΜΑΤΟ SETUP ΓΙΑ FULLY KIOSK
        if (isFully) {
            try {
                fully.setBooleanSetting("keepScreenOn", true);       // Μην σβήνεις ποτέ
                fully.setBooleanSetting("unlockScreen", true);       // Ξεκλείδωσε
                fully.setBooleanSetting("turnScreenOnOnPowerConnect", true);
                fully.setBooleanSetting("forceWifi", true);          // Κράτα WiFi με το ζόρι
                fully.setMusicVolume(100);                           // Τέρμα ήχος
                console.log("🤖 Fully Kiosk Configured");
            } catch (e) { console.log("Fully Error:", e); }
        }

        // Heartbeat (Κάθε 10 sec λέει "Είμαι εδώ" για να μην κοιμηθεί ο Chrome)
        this.interval = setInterval(() => {
             // Fake Activity
             if (typeof socket !== 'undefined' && socket.connected) {
                 socket.emit('heartbeat'); 
             }
        }, 10000);
    },

    // 🚨 PANIC MODE: LOOP ΠΟΥ ΞΥΠΝΑΕΙ ΤΟΥΣ ΝΕΚΡΟΥΣ 🚨
    triggerPanicMode: function() {
        if (this.isRinging) return; // Αν χτυπάει ήδη, μην ξαναρχίζεις
        this.isRinging = true;
        console.log("🚨 PANIC MODE START");

        // 1. Ξεκινάμε Ήχο
        const audio = document.getElementById('siren');
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(e => console.log("Audio Blocked:", e));
        }

        // 2. Εμφανίζουμε Κόκκινη Οθόνη
        document.getElementById('alarmScreen').style.display = 'flex';

        // 3. Loop Επίθεσης (Κάθε 1 δευτερόλεπτο)
        this.panicInterval = setInterval(() => {
            if (!this.isRinging) return;

            // Δόνηση (500ms δόνηση, 200 παύση, 500 δόνηση)
            if (navigator.vibrate) navigator.vibrate([500, 200, 500]);

            // Fully Kiosk Wake Up Calls
            if (typeof fully !== 'undefined') {
                fully.turnScreenOn();
                fully.bringToForeground();
                fully.setMusicVolume(100); // Βεβαιώσου ότι είναι τέρμα
            }
        }, 1000);
    },

    // 🛑 STOP MODE: ΣΤΑΜΑΤΑΕΙ ΤΑ ΠΑΝΤΑ
    stopPanicMode: function() {
        this.isRinging = false;
        
        // 1. ΣΚΟΤΩΣΕ ΤΟ LOOP ΑΜΕΣΩΣ
        if (this.panicInterval) clearInterval(this.panicInterval);
        
        // 2. ΣΚΟΤΩΣΕ ΤΟΝ ΗΧΟ (Το πιο σημαντικό)
        const audio = document.getElementById('siren');
        if (audio) {
            audio.pause();
            audio.currentTime = 0; // Γύρνα στην αρχή
        }

        // 3. Σταμάτα Δόνηση
        if (navigator.vibrate) navigator.vibrate(0);

        // 4. Κρύψε οθόνη
        document.getElementById('alarmScreen').style.display = 'none';

        // 5. Προαιρετικό: Σβήσε οθόνη Fully μετά από λίγο
        if (typeof fully !== 'undefined') {
            // fully.turnScreenOff(); // <-- Αν θες να σβήνει τελείως, βγάλε τα σχόλια
        }
        
        console.log("🛑 STOPPED");
    }
};
