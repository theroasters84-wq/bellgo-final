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
                        wakeLock.addEventListener('release', () => {
                            console.log('💡 Wake Lock released');
                            wakeLock = null;
                        });
                    } catch (err) {
                        console.log(`❌ Wake Lock error: ${err.name}, ${err.message}`);
                    }
                };
                // Ζητάμε το lock σε κάθε visibility change (αν ο χρήστης βγει και ξαναμπεί)
                document.addEventListener('visibilitychange', async () => {
                    if (document.visibilityState === 'visible') {
                        await requestLock();
                    }
                });
                // ✅ AGGRESSIVE RETRY: Ελέγχουμε κάθε 5 δευτερόλεπτα αν χάθηκε το Lock
                setInterval(async () => {
                    if (!wakeLock && document.visibilityState === 'visible') {
                        console.log("🔄 Re-applying Wake Lock...");
                        await requestLock();
                    }
                }, 5000);

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

    init: () => {
        console.log("🛡️ Initializing KeepAlive Shields...");
        KeepAlive.enableWakeLock();
        KeepAlive.preventBackExit();
        KeepAlive.preventTabClose();
    },
};

// --- BELLGO BOT (Interactive Setup) ---
const BellGoBot = {
    currentStep: 0,
    
    start: () => {
        BellGoBot.currentStep = 0;
        BellGoBot.showOverlay();
        BellGoBot.nextStep();
    },

    showOverlay: () => {
        if(document.getElementById('botOverlay')) return;
        const div = document.createElement('div');
        div.id = 'botOverlay';
        div.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.95); z-index:20000; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px; text-align:center; font-family:sans-serif;";
        document.body.appendChild(div);
    },

    nextStep: () => {
        BellGoBot.currentStep++;
        const box = document.getElementById('botOverlay');
        if(!box) return;
        box.innerHTML = ''; // Clear

        if(BellGoBot.currentStep === 1) {
            // Step 1: Intro & Permissions (Audio/WakeLock)
            box.innerHTML = `
                <div style="font-size:60px; margin-bottom:20px;">🤖</div>
                <h2 style="color:#FFD700; margin:0 0 10px 0;">Γεια! Είμαι ο BellGo Bot.</h2>
                <p style="color:#ccc; margin-bottom:30px; font-size:14px;">Θα σε βοηθήσω να "θωρακίσεις" την εφαρμογή για να μη χάνεις παραγγελίες!</p>
                <button onclick="BellGoBot.activateShields()" style="background:#00E676; color:black; padding:15px 30px; border:none; border-radius:30px; font-weight:bold; font-size:16px; cursor:pointer; box-shadow:0 4px 15px rgba(0,230,118,0.4);">ΕΝΕΡΓΟΠΟΙΗΣΗ ΠΡΟΣΤΑΣΙΑΣ 🛡️</button>
            `;
        } else if(BellGoBot.currentStep === 2) {
            // Step 2: Pinning Instructions
            const isIos = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
            let instructions = "";
            let title = "";
            
            if(isIos) {
                title = "🍎 Guided Access (iPhone)";
                instructions = `
                    <ol style="text-align:left; color:#ccc; line-height:1.6; font-size:14px; padding-left:20px;">
                        <li>Πήγαινε <b>Settings > Accessibility > Guided Access</b> και ενεργοποίησέ το.</li>
                        <li>Γύρνα εδώ και πάτα <b>3 φορές</b> γρήγορα το πλαϊνό κουμπί (Power).</li>
                        <li>Πάτα <b>Start</b> (πάνω δεξιά).</li>
                    </ol>`;
            } else {
                title = "🤖 App Pinning (Android)";
                instructions = `
                    <ol style="text-align:left; color:#ccc; line-height:1.6; font-size:14px; padding-left:20px;">
                        <li>Πήγαινε <b>Ρυθμίσεις > Ασφάλεια > Καρφίτσωμα (App Pinning)</b> και ενεργοποίησέ το.</li>
                        <li>Άνοιξε τις <b>Πρόσφατες Εφαρμογές</b> (Τετράγωνο ή Swipe Up).</li>
                        <li>Πάτα το εικονίδιο της εφαρμογής (πάνω μέρος) και επίλεξε <b>Καρφίτσωμα (Pin)</b>.</li>
                    </ol>`;
            }

            box.innerHTML = `
                <div style="font-size:50px; margin-bottom:10px;">🔒</div>
                <h2 style="color:#FFD700; margin:0 0 10px 0;">Κλείδωμα Εφαρμογής</h2>
                <p style="color:white; font-size:14px;">Για να μην κλείνει κατά λάθος, πρέπει να την "καρφιτσώσεις":</p>
                <div style="background:#222; padding:15px; border-radius:15px; margin-bottom:20px; border:1px solid #444; text-align:left;">
                    <h4 style="color:#2196F3; margin:0 0 10px 0;">${title}</h4>
                    ${instructions}
                </div>
                <button onclick="BellGoBot.finish()" style="background:#2196F3; color:white; padding:12px 30px; border:none; border-radius:30px; font-weight:bold; font-size:16px; cursor:pointer;">ΤΟ ΕΚΑΝΑ ✅</button>
                <button onclick="BellGoBot.finish()" style="background:none; border:none; color:#777; margin-top:15px; cursor:pointer; font-size:12px;">Κλείσιμο</button>
            `;
        }
    },

    activateShields: () => {
        // 1. Trigger KeepAlive (Audio & WakeLock)
        if(typeof KeepAlive !== 'undefined') {
            KeepAlive.init();
        }
        // 2. Request Notification Permission if needed
        if (Notification.permission === 'default') {
            Notification.requestPermission().then(() => {
                BellGoBot.nextStep();
            });
        } else {
            BellGoBot.nextStep();
        }
    },

    finish: () => {
        const box = document.getElementById('botOverlay');
        if(box) box.remove();
    }
};

// Auto-init on load
if (document.readyState === 'loading') {  
    document.addEventListener('DOMContentLoaded', KeepAlive.init);
} else {  
    KeepAlive.init();
}