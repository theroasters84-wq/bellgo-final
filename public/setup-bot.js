const SetupBot = {
    // 1. ΕΛΕΓΧΟΣ (Τσεκάρει αν είμαστε έτοιμοι)
    checkConfig: function() {
        // Αν δεν είμαστε σε Fully, εμφάνισε το κουμπί μόνο σε Android
        if (typeof fully === 'undefined') {
            const ua = navigator.userAgent.toLowerCase();
            if (ua.indexOf("android") > -1) {
                const btn = document.getElementById('setupBotBtn');
                if(btn) btn.style.display = 'flex';
            }
            return;
        }

        console.log("🤖 SetupBot: Checking settings...");
        
        // Ελέγχουμε ΜΟΝΟ τα βασικά (Οθόνη & WiFi) για να μην κολλάει ο έλεγχος
        const s1 = fully.getBooleanSetting("keepScreenOn") == true || fully.getBooleanSetting("keepScreenOn") == "true";
        const s2 = fully.getBooleanSetting("wifiWakeLock") == true || fully.getBooleanSetting("wifiWakeLock") == "true";

        const btn = document.getElementById('setupBotBtn');
        
        if (s1 && s2) {
            // Όλα καλά -> Κρύψε το κουμπί
            if(btn) btn.style.display = 'none';
        } else {
            // Κάτι λείπει -> Εμφάνισε το κουμπί
            if(btn) {
                btn.style.display = 'flex';
                btn.classList.add('needs-setup');
            }
            fully.showToast("⚠️ Ρύθμισέ με! Πάτα το 🤖");
        }
    },

    // 2. ΕΚΤΕΛΕΣΗ (SAFE MODE - Χωρίς το Kiosk Crash)
    run: function() {
        // ΠΕΡΙΠΤΩΣΗ A: FULLY KIOSK
        if (typeof fully !== 'undefined') {
            fully.showToast("🤖 Ρομπότ: Ξεκινάω ρυθμίσεις (Safe Mode)...");
            
            try {
                // --- ΡΥΘΜΙΣΕΙΣ (Γίνονται αθόρυβα) ---
                fully.setBooleanSetting("keepScreenOn", true);       // Οθόνη πάντα ανοιχτή
                fully.setBooleanSetting("unlockScreen", true);       // Ξεκλείδωμα
                fully.setBooleanSetting("preventSleep", true);       // Να μην κοιμάται η CPU
                fully.setBooleanSetting("wifiWakeLock", true);       // Να μην κλείνει το WiFi
                fully.setBooleanSetting("forceWifi", true);          // Επανασύνδεση WiFi
                fully.setBooleanSetting("listenVolumeButtons", true);// Κουμπιά έντασης
                fully.setBooleanSetting("autoplayMedia", true);      // Ήχος αυτόματα
                fully.setBooleanSetting("mapVolumeKeysToMedia", true);

                // ❌ ΑΦΑΙΡΕΣΑΜΕ ΤΟ 'foregroundOnActivity' (Αυτό κράσαρε το Xiaomi)
                // ❌ ΑΦΑΙΡΕΣΑΜΕ ΤΟ 'fakeUserInteraction' (Για ασφάλεια)

                fully.showToast("✅ Ρυθμίσεις OK! Έρχονται τα Pop-ups...");

            } catch (e) {
                alert("ΣΦΑΛΜΑ: Πρέπει να ενεργοποιήσεις το 'Enable JavaScript Interface' στα Settings του Fully!");
                return;
            }

            // --- POP-UPS (Ζητάνε άδεια από τον χρήστη) ---
            
            // 1. Overlay (Εμφάνιση πάνω από άλλα) - Σε 1 δευτερόλεπτο
            setTimeout(() => {
                fully.requestOverlayPermission(); 
            }, 1000);

            // 2. Μπαταρία (Να μην κλείνει ποτέ) - Σε 3 δευτερόλεπτα
            setTimeout(() => {
                fully.requestIgnoreBatteryOptimizations();
            }, 3000);

            // Επανέλεγχος σε 5 δευτερόλεπτα για να εξαφανιστεί το κουμπί αν όλα πήγαν καλά
            setTimeout(() => {
                this.checkConfig();
            }, 5000);
        } 
        
        // ΠΕΡΙΠΤΩΣΗ B: CHROME ANDROID (WIZARD)
        else {
            const setupDiv = document.getElementById('androidSetup');
            if(setupDiv) {
                setupDiv.style.display = 'flex';
                
                // Link για αυτόματο άνοιγμα
                const currentUrl = window.location.href;
                const cleanUrl = currentUrl.replace('https://', '').replace('http://', '');
                const intentLink = `intent://${cleanUrl}#Intent;scheme=https;package=de.ozerov.fully;end`;
                
                const autoBtn = document.getElementById('btnAutoOpen');
                if(autoBtn) {
                    autoBtn.onclick = function() {
                        window.location.href = intentLink;
                    };
                }
            }
        }
    }
};
