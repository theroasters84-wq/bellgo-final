/* -----------------------------------------------------------
   BELLGO KEEPALIVE MODULE
   Prevents screen sleep, accidental exits, and browser throttling.
----------------------------------------------------------- */

const KeepAlive = {
    // 1. WAKE LOCK: Κρατάει την οθόνη ανοιχτή (Screen Always On)
    enableWakeLock: async () => {
        try {
            if ('wakeLock' in navigator) {
                let wakeLock = null;
                const requestLock = async () => {
                    try {
                        wakeLock = await navigator.wakeLock.request('screen');
                        console.log('💡 Screen Wake Lock active');
                        wakeLock.addEventListener('release', () => console.log('💡 Wake Lock released'));
                    } catch (err) {
                        console.log(`❌ Wake Lock error: ${err.name}, ${err.message}`);
                    }
                };
                // Ζητάμε το lock σε κάθε visibility change (αν ο χρήστης βγει και ξαναμπεί)
                document.addEventListener('visibilitychange', async () => {
                    if (wakeLock !== null && document.visibilityState === 'visible') {
                        await requestLock();
                    }
                });
                // Ζητάμε το lock με το που πατήσει ο χρήστης οτιδήποτε (User Gesture)
                document.addEventListener('click', requestLock, { once: true });
            }
        } catch (e) { console.log("WakeLock logic error", e); }
    },

    // 2. BACK BUTTON TRAP: Ακυρώνει το κουμπί 'Πίσω'
    preventBackExit: () => {
        history.pushState(null, document.title, location.href);
        window.addEventListener('popstate', function (event) {
            history.pushState(null, document.title, location.href);
            // Προαιρετικά: Εμφάνιση Toast "Δεν μπορείτε να βγείτε"
        });
    },

    // 3. CONFIRM CLOSE: Ρωτάει πριν κλείσει το Tab
    preventTabClose: () => {
        window.addEventListener('beforeunload', function (e) {
            e.preventDefault();
            e.returnValue = 'Είστε σίγουροι ότι θέλετε να κλείσετε την εφαρμογή;';
            return 'Είστε σίγουροι ότι θέλετε να κλείσετε την εφαρμογή;';
        });
    },

    // 4. AUDIO LOOP: Παίζει αθόρυβο ήχο για να μην παγώνει ο Chrome το Tab
    startAudioLoop: () => {
        const audio = new Audio('/silence.mp3'); // Βεβαιώσου ότι υπάρχει το silence.mp3
        audio.loop = true;
        audio.volume = 0.01; 
        
        const tryPlay = () => {
            audio.play().then(() => {
                console.log("🔊 Audio Keep-Alive Started");
            }).catch(() => {
                // Αν αποτύχει (λόγω autoplay policy), ξαναδοκιμάζουμε στο πρώτο κλικ
                document.addEventListener('click', () => {
                    audio.play();
                }, { once: true });
            });
        };
        tryPlay();
    },

    init: () => {
        console.log("🛡️ Initializing KeepAlive Shields...");
        KeepAlive.enableWakeLock();
        KeepAlive.preventBackExit();
        KeepAlive.preventTabClose();
        KeepAlive.startAudioLoop();
    }
};

// Auto-init on load
if (document.readyState === 'loading') {  
    document.addEventListener('DOMContentLoaded', KeepAlive.init);
} else {  
    KeepAlive.init();
}