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
        // ✅ FIX: Χρήση Hash (#) για 100% ασφαλή παγίδευση χωρίς να κάνει reload ο browser (που προκαλεί τη λευκή/splash οθόνη)
        if (window.location.hash !== '#locked') {
            window.history.pushState(null, null, window.location.href.split('#')[0] + '#locked');
        }
        window.addEventListener('popstate', function (event) {
            window.history.pushState(null, null, window.location.href.split('#')[0] + '#locked');
        });
    },

    // 3. CONFIRM CLOSE: Ρωτάει πριν κλείσει το Tab
    preventTabClose: () => {
        window.addEventListener('beforeunload', function (e) {
            const lang = document.documentElement.lang || 'el';
            const msg = lang === 'en' ? 'Are you sure you want to close the application?' : 'Είστε σίγουροι ότι θέλετε να κλείσετε την εφαρμογή;';
            e.preventDefault();
            e.returnValue = msg;
            return msg;
        });
    },

    // 4. BACKGROUND WARNING: Προειδοποιεί αν κλειδώσουν την οθόνη ή βγουν από το app
    warnOnBackground: () => {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                // Έλεγχος αν ο χρήστης έχει ήδη ανοιχτό το Fake Lock
                const fakeLock = document.getElementById('fakeLockOverlay');
                if (fakeLock && fakeLock.style.display === 'flex') {
                    return; // Είναι ήδη στο Fake Lock, άρα έκανε το σωστό! Δεν τον ενοχλούμε.
                }

                // ✅ Ήχος προειδοποίησης (Σαν κλήση) μέσω AudioEngine
                if (window.AudioEngine && window.AudioEngine.triggerAlarm) {
                    window.AudioEngine.triggerAlarm();
                    
                    const lang = document.documentElement.lang || 'el';
                    const wrongLockTxt = lang === 'en' ? "🔔 WRONG LOCK" : "🔔 ΛΑΘΟΣ ΚΛΕΙΔΩΜΑ";
                    const stopSoundTxt = lang === 'en' ? "🔔 STOP SOUND (WRONG LOCK)" : "🔔 ΣΤΑΜΑΤΗΣΤΕ ΤΟΝ ΗΧΟ (ΛΑΘΟΣ ΚΛΕΙΔΩΜΑ)";

                    // Εμφάνιση του κουμπιού αποδοχής για να μπορέσει να το σταματήσει όταν επιστρέψει
                    const staffBell = document.getElementById('staffBellBtn');
                    const driverBell = document.getElementById('driverBellBtn');
                    
                    if (staffBell) { 
                        staffBell.style.display = 'flex'; 
                        staffBell.innerText = wrongLockTxt; 
                        staffBell.classList.add('ringing'); 
                    } else if (driverBell) { 
                        driverBell.style.display = 'flex'; 
                        driverBell.innerText = wrongLockTxt; 
                        driverBell.classList.add('ringing'); 
                    } else {
                        let warnBtn = document.getElementById('warningStopBtn');
                        if (!warnBtn) {
                            warnBtn = document.createElement('button');
                            warnBtn.id = 'warningStopBtn';
                            warnBtn.innerHTML = stopSoundTxt;
                            warnBtn.style.cssText = "position:fixed; top:20px; left:50%; transform:translateX(-50%); background:#EF4444; color:white; border:none; padding:15px 30px; border-radius:30px; font-weight:bold; font-size:14px; z-index:40000; box-shadow:0 10px 30px rgba(239,68,68,0.5); cursor:pointer; animation:pulse 1s infinite alternate;";
                            warnBtn.onclick = () => { if (window.AudioEngine) window.AudioEngine.stopAlarm(); warnBtn.style.display = 'none'; };
                            document.body.appendChild(warnBtn);
                        }
                        warnBtn.innerHTML = stopSoundTxt;
                        warnBtn.style.display = 'block';
                    }
                }

                // Αν ΔΕΝ έχει Fake Lock και βγει / κλειδώσει την οθόνη
                if (Notification.permission === 'granted' && !window.Capacitor) {
                    try {
                        if (navigator.serviceWorker && navigator.serviceWorker.ready) {
                            const lang = document.documentElement.lang || 'el';
                            const warningTitle = lang === 'en' ? "⚠️ WARNING (BellGo)" : "⚠️ ΠΡΟΣΟΧΗ (BellGo)";
                            const warningBody = lang === 'en' ? "Don't lock/hide the app! Use the 🌙 'Black Screen' to not miss orders." : "Μην κλειδώνεις/κρύβεις την εφαρμογή! Πάτα τη 🌙 'Μαύρη Οθόνη' για να μην χάνεις παραγγελίες.";
                            
                            navigator.serviceWorker.ready.then(reg => {
                                reg.showNotification(warningTitle, {
                                    body: warningBody,
                                    icon: "/admin.png",
                                    tag: "lock-warning",
                                    vibrate: [200, 100, 200],
                                    sound: "/alert.mp3", // ✅ Προσθήκη Ήχου στην ειδοποίηση
                                    requireInteraction: true
                                });
                            });
                        }
                    } catch(e) {
                        console.log("Warning notification failed", e);
                    }
                }
            }
        });
    },

    init: () => {
        console.log("🛡️ Initializing KeepAlive Shields...");
        KeepAlive.enableWakeLock();
        KeepAlive.preventBackExit();
        KeepAlive.preventTabClose();
        KeepAlive.warnOnBackground();
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
                    <ol style="text-align:left; color:#6b7280; line-height:1.6; font-size:14px; padding-left:20px;">
                        <li>Πήγαινε <b>Settings > Accessibility > Guided Access</b> και ενεργοποίησέ το.</li>
                        <li>Γύρνα εδώ και πάτα <b>3 φορές</b> γρήγορα το πλαϊνό κουμπί (Power).</li>
                        <li>Πάτα <b>Start</b> (πάνω δεξιά).</li>
                    </ol>`;
            } else {
                title = "🤖 App Pinning (Android)";
                instructions = `
                    <ol style="text-align:left; color:#6b7280; line-height:1.6; font-size:14px; padding-left:20px;">
                        <li>Πήγαινε <b>Ρυθμίσεις > Ασφάλεια > Καρφίτσωμα (App Pinning)</b> και ενεργοποίησέ το.</li>
                        <li>Άνοιξε τις <b>Πρόσφατες Εφαρμογές</b> (Τετράγωνο ή Swipe Up).</li>
                        <li>Πάτα το εικονίδιο της εφαρμογής (πάνω μέρος) και επίλεξε <b>Καρφίτσωμα (Pin)</b>.</li>
                    </ol>`;
            }

            innerBox.innerHTML = `
                <div style="font-size:50px; margin-bottom:10px;">🔒</div>
                <h2 style="color:#10B981; margin:0 0 10px 0;">Κλείδωμα Εφαρμογής</h2>
                <p style="color:#1f2937; font-size:14px;">Για να μην κλείνει κατά λάθος, πρέπει να την "καρφιτσώσεις":</p>
                <div style="background:#f9fafb; padding:15px; border-radius:15px; margin-bottom:20px; border:1px solid #e5e7eb; text-align:left;">
                    <h4 style="color:#2196F3; margin:0 0 10px 0;">${title}</h4>
                    ${instructions}
                </div>
                <button onclick="BellGoBot.finish()" style="background:#2196F3; color:white; padding:12px 30px; border:none; border-radius:30px; font-weight:bold; font-size:16px; cursor:pointer;">ΤΟ ΕΚΑΝΑ ✅</button>
                <button onclick="BellGoBot.finish()" style="background:none; border:none; color:#6b7280; margin-top:15px; cursor:pointer; font-size:12px; font-weight:bold;">Κλείσιμο</button>
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

// ✅ BELLGO BOT: Οδηγός για "Override Do Not Disturb" (Android)
const DNDBot = {
    init: () => {
        // Τρέχει μόνο σε Android και αν δεν έχει ξαναγίνει
        if(localStorage.getItem('bellgo_dnd_setup') === 'true') return;
        if(!/android/i.test(navigator.userAgent)) return;
        
        setTimeout(DNDBot.showIntro, 1500); // Μικρή καθυστέρηση
    },
    showIntro: () => {
        if(document.getElementById('dndBotOverlay')) return;
        const div = document.createElement('div');
        div.id = 'dndBotOverlay';
        div.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.4); backdrop-filter:blur(8px); z-index:20000; display:flex; align-items:center; justify-content:center; padding:20px;";
        div.innerHTML = `
            <div class="bot-box" style="background:#ffffff; color:#1f2937; border-radius:20px; padding:30px; box-shadow:0 10px 30px rgba(0,0,0,0.1); width:100%; max-width:350px; text-align:center;">
                <div class="bot-icon">🤖</div>
                <div class="bot-title" style="color:#10B981; font-size:22px; font-weight:bold; margin-bottom:10px;">BellGo Bot</div>
                <div class="bot-text" style="color:#6b7280; margin-bottom:20px; font-size:14px;">
                    Γεια! Είμαι ο βοηθός σου.<br><br>
                    Για να μη χάνεις παραγγελίες, πρέπει να ρυθμίσουμε το κινητό να χτυπάει <b>ΔΥΝΑΤΑ</b> ακόμα και στο <b>ΑΘΟΡΥΒΟ</b>.
                </div>
                <button class="bot-btn" style="background:#10B981; color:white; border:none; padding:12px 20px; border-radius:30px; font-weight:bold; width:100%; margin-bottom:10px; cursor:pointer;" onclick="DNDBot.step1()">Ξεκίνα Ρύθμιση 🚀</button>
                <button class="bot-skip" style="background:none; border:none; color:#6b7280; cursor:pointer; font-size:14px; text-decoration:underline;" onclick="DNDBot.skip()">Όχι τώρα</button>
            </div>
        `;
        document.body.appendChild(div);
    },
    step1: () => {
        Notification.requestPermission().then(perm => {
            if(perm === 'granted') { DNDBot.step2(); } 
            else { alert("⚠️ Πρέπει να πατήσεις 'Allow' / 'Επιτρέπεται' για να λειτουργήσει!"); }
        });
    },
    step2: () => {
        const box = document.querySelector('#dndBotOverlay > div');
        box.innerHTML = `
            <div class="bot-icon">📢</div>
            <div class="bot-title" style="color:#2196F3; font-size:22px; font-weight:bold; margin-bottom:10px;">Δημιουργία Καναλιού</div>
            <div class="bot-text" style="color:#6b7280; margin-bottom:20px; font-size:14px;">Θα στείλω τώρα μια δοκιμαστική ειδοποίηση για να εμφανιστεί η ρύθμιση στο κινητό σου.</div>
            <button class="bot-btn" style="background:#2196F3; color:white; border:none; padding:12px 20px; border-radius:30px; font-weight:bold; width:100%; cursor:pointer;" onclick="DNDBot.step3()">Στείλε Δοκιμή 🔔</button>
        `;
    },
    step3: () => {
        const userData = JSON.parse(localStorage.getItem('bellgo_session') || '{}');
        if(window.socket) window.socket.emit('trigger-alarm', { target: userData.name || 'User', source: 'BellGo Setup' });
        const box = document.querySelector('#dndBotOverlay > div');
        box.innerHTML = `
            <div class="bot-icon">⚙️</div>
            <div class="bot-title" style="color:#10B981; font-size:22px; font-weight:bold; margin-bottom:10px;">Τελικό Βήμα</div>
            <div class="bot-text" style="font-size:14px; text-align:left; color:#1f2937; margin-bottom:20px;">
                1. Μόλις έρθει η ειδοποίηση, πήγαινε:<br><b>Ρυθμίσεις > Εφαρμογές > Chrome > Ειδοποιήσεις</b><br>
                2. Βρες το <b>"bellgo_alarm_channel"</b>.<br>
                3. Ενεργοποίησε: <b>"Παράκαμψη Μην Ενοχλείτε"</b> (Override Do Not Disturb).
            </div>
            <button class="bot-btn" style="background:#10B981; color:white; border:none; padding:12px 20px; border-radius:30px; font-weight:bold; width:100%; cursor:pointer;" onclick="DNDBot.finish()">Το Έκανα! ✅</button>
        `;
    },
    finish: () => {
        localStorage.setItem('bellgo_dnd_setup', 'true');
        document.getElementById('dndBotOverlay').remove();
        if(window.AudioEngine) window.AudioEngine.stopAlarm();
        if(window.socket) window.socket.emit('admin-stop-ringing');
    },
    skip: () => { localStorage.setItem('bellgo_dnd_setup', 'true'); document.getElementById('dndBotOverlay').remove(); }
};
window.DNDBot = DNDBot;

// Auto-init on load
if (document.readyState === 'loading') {  
    document.addEventListener('DOMContentLoaded', KeepAlive.init);
} else {  
    KeepAlive.init();
}