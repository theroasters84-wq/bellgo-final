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
    },

    // 5. BOT GUIDE: Οδηγός Κλειδώματος (App Pinning)
    showLockGuide: () => {
        const isIos = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
        const isAndroid = /android/.test(navigator.userAgent.toLowerCase());
        
        let title = "🔒 Κλείδωμα Εφαρμογής";
        let steps = "";

        if (isIos) {
            title = "🍎 Guided Access (iPhone)";
            steps = `
                <ol style="text-align:left; padding-left:20px; margin-bottom:15px; font-size:14px; line-height:1.5;">
                    <li>Πήγαινε: <b>Settings > Accessibility > Guided Access</b> και ενεργοποίησέ το.</li>
                    <li>Γύρνα εδώ στο BellGo.</li>
                    <li>Πάτα <b>3 φορές</b> γρήγορα το πλαϊνό κουμπί (Power).</li>
                    <li>Πάτα <b>Start</b> (πάνω δεξιά).</li>
                </ol>
                <div style="font-size:12px; color:#aaa; margin-top:10px;">🔓 Για έξοδο: Πάτα πάλι 3 φορές το Power και βάλε τον κωδικό σου.</div>
            `;
        } else {
            // Default to Android instructions
            title = "🤖 App Pinning (Android)";
            steps = `
                <ol style="text-align:left; padding-left:20px; margin-bottom:15px; font-size:14px; line-height:1.5;">
                    <li>Πήγαινε: <b>Ρυθμίσεις > Ασφάλεια > Καρφίτσωμα εφαρμογής</b> (App Pinning) και ενεργοποίησέ το.</li>
                    <li>Γύρνα εδώ στο BellGo.</li>
                    <li>Άνοιξε τις <b>Πρόσφατες Εφαρμογές</b> (σύρε από κάτω προς τα πάνω).</li>
                    <li>Πάτα στο εικονίδιο της εφαρμογής (πάνω μέρος) και επίλεξε <b>"Καρφίτσωμα" (Pin)</b>.</li>
                </ol>
                <div style="font-size:12px; color:#aaa; margin-top:10px;">🔓 Για έξοδο: Κράτα πατημένα ταυτόχρονα τα κουμπιά "Πίσω" και "Πρόσφατα".</div>
            `;
        }

        const div = document.createElement('div');
        div.id = 'lockGuideOverlay';
        div.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); z-index:10000; display:flex; align-items:center; justify-content:center; padding:20px;";
        div.innerHTML = `
            <div style="background:#222; border:2px solid #FFD700; border-radius:15px; padding:20px; max-width:400px; color:white; text-align:center; box-shadow:0 0 20px rgba(255, 215, 0, 0.3); animation: popIn 0.3s ease;">
                <div style="font-size:50px; margin-bottom:10px;">🤖</div>
                <h3 style="color:#FFD700; margin-top:0;">${title}</h3>
                <p style="font-size:14px; color:#ccc;">Κλείδωσε την οθόνη για να μην κλείνει κατά λάθος!</p>
                ${steps}
                <button onclick="document.getElementById('lockGuideOverlay').remove()" style="margin-top:15px; background:#00E676; color:black; border:none; padding:12px 30px; border-radius:25px; font-weight:bold; cursor:pointer; font-size:16px;">ΚΑΤΑΛΑΒΑ ✅</button>
            </div>
            <style>@keyframes popIn { from {transform:scale(0.8); opacity:0;} to {transform:scale(1); opacity:1;} }</style>
        `;
        document.body.appendChild(div);
    }
};

// Auto-init on load
if (document.readyState === 'loading') {  
    document.addEventListener('DOMContentLoaded', KeepAlive.init);
} else {  
    KeepAlive.init();
}