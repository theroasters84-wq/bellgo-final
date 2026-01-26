const SetupBot = {
    run: function() {
        console.log("🤖 SetupBot: Scanning environment...");

        // ==========================================
        // ΠΕΡΙΠΤΩΣΗ A: FULLY KIOSK (ΕΧΟΥΜΕ ΤΟΝ ΕΛΕΓΧΟ)
        // ==========================================
        if (typeof fully !== 'undefined') {
            fully.showToast("🤖 Setup Bot: Εντοπίστηκε Fully Kiosk! Ξεκινάω...");

            try {
                // 1. Βασικά
                fully.setBooleanSetting("keepScreenOn", true);
                fully.setBooleanSetting("unlockScreen", true);
                fully.setBooleanSetting("foregroundOnActivity", true);
                fully.setBooleanSetting("listenVolumeButtons", true);
                
                // 2. WiFi & CPU (Ασφάλεια)
                fully.setBooleanSetting("preventSleep", true);
                fully.setBooleanSetting("wifiWakeLock", true);
                fully.setBooleanSetting("forceWifi", true);

                // 3. Ήχος & Media
                fully.setBooleanSetting("autoplayMedia", true);
                fully.setBooleanSetting("fakeUserInteraction", true);
                fully.setBooleanSetting("mapVolumeKeysToMedia", true);

                fully.showToast("✅ Ρυθμίσεις Fully περάστηκαν!");
            } catch (e) {
                console.error(e);
                alert("Σφάλμα Fully: Βεβαιώσου ότι έχεις την PLUS έκδοση.");
            }

            // Permissions (Overlay & Battery) - Αυτόματα ανοίγματα
            setTimeout(() => {
                alert("🤖 ΒΗΜΑ 1: Θα ανοίξει το 'Display over other apps'.\n\n👉 Βρες το Fully Kiosk και βάλτο ON.");
                fully.requestOverlayPermission();
            }, 1000);

            setTimeout(() => {
                if(confirm("🤖 ΒΗΜΑ 2: Θα ανοίξει το μενού Μπαταρίας.\n\n👉 Πάτα 'Allow/Επιτρέπεται' για να μην κοιμάται ποτέ.")) {
                    fully.requestIgnoreBatteryOptimizations();
                }
            }, 8000);

        } 
        
        // ==========================================
        // ΠΕΡΙΠΤΩΣΗ B: CHROME / ΑΠΛΑ ΚΙΝΗΤΑ
        // ==========================================
        else {
            console.log("🤖 SetupBot: Εντοπίστηκε απλός Browser.");
            
            // 1. Ζητάμε Ειδοποιήσεις (Απαραίτητο)
            if (window.Notification && Notification.permission !== "granted") {
                Notification.requestPermission().then(permission => {
                    if(permission === "granted") alert("✅ Ειδοποιήσεις: ΕΝΕΡΓΟΠΟΙΗΘΗΚΑΝ!");
                    else alert("❌ Ειδοποιήσεις: ΑΠΟΡΡΙΦΘΗΚΑΝ.\nΠρέπει να τις ανοίξεις από τις ρυθμίσεις του Chrome.");
                });
            }

            // 2. Screen Wake Lock (Προσπάθεια να κρατήσουμε οθόνη ανοιχτή)
            this.enableWakeLock();

            // 3. 🔥 ΟΔΗΓΙΕΣ ΓΙΑ ΜΠΑΤΑΡΙΑ & ΡΥΘΜΙΣΕΙΣ 🔥
            // Επειδή δεν μπορούμε να τις ανοίξουμε αυτόματα, δίνουμε λίστα οδηγιών.
            setTimeout(() => {
                const msg = 
                    "⚠️ ΣΗΜΑΝΤΙΚΕΣ ΡΥΘΜΙΣΕΙΣ (ΓΙΑ ΝΑ ΜΗΝ ΚΛΕΙΝΕΙ):\n\n" +
                    "1️⃣ ΜΠΑΤΑΡΙΑ: Πήγαινε Ρυθμίσεις Κινητού -> Εφαρμογές -> Chrome -> Μπαταρία -> Επέλεξε 'Χωρίς Περιορισμούς' (Unrestricted).\n\n" +
                    "2️⃣ ΗΧΟΣ: Βεβαιώσου ότι το κινητό δεν είναι στο αθόρυβο.\n\n" +
                    "3️⃣ ΚΑΡΤΕΛΑ: Μην κλείνεις αυτή την καρτέλα, άφησέ την ανοιχτή.";
                
                alert(msg);
            }, 1500);
        }
    },

    // Βοηθητική συνάρτηση για Wake Lock σε Chrome
    enableWakeLock: async function() {
        if ('wakeLock' in navigator) {
            try {
                const wakeLock = await navigator.wakeLock.request('screen');
                console.log("✅ Screen Wake Lock active");
            } catch (err) {
                console.log("Wake Lock Error: " + err.message);
            }
        }
    }
};
