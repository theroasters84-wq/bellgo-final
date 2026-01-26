const SetupBot = {
    // 1. ΕΛΕΓΧΟΣ: Κοιτάει αν όλα είναι σωστά
    checkConfig: function() {
        // Αν δεν είμαστε σε Fully (π.χ. κινητό), εμφανίζουμε το κουμπί αν είναι Android
        if (typeof fully === 'undefined') {
            const ua = navigator.userAgent.toLowerCase();
            if (ua.indexOf("android") > -1) {
                const btn = document.getElementById('setupBotBtn');
                if(btn) btn.style.display = 'flex';
            }
            return;
        }

        console.log("🤖 SetupBot: Checking settings...");
        
        // Ελέγχουμε τις 3 βασικές ρυθμίσεις
        // Προσοχή: Το fully επιστρέφει "true" (string) ή true (boolean)
        const s1 = fully.getBooleanSetting("keepScreenOn") == true || fully.getBooleanSetting("keepScreenOn") == "true";
        const s2 = fully.getBooleanSetting("wifiWakeLock") == true || fully.getBooleanSetting("wifiWakeLock") == "true";
        const s3 = fully.getBooleanSetting("listenVolumeButtons") == true || fully.getBooleanSetting("listenVolumeButtons") == "true";

        const btn = document.getElementById('setupBotBtn');
        
        if (s1 && s2 && s3) {
            // Όλα σωστά -> Κρύψε το κουμπί
            console.log("✅ Fully Configured.");
            if(btn) btn.style.display = 'none';
        } else {
            // Κάτι λείπει -> Εμφάνισε το κουμπί να αναβοσβήνει
            console.log("❌ Settings missing.");
            if(btn) {
                btn.style.display = 'flex';
                btn.classList.add('needs-setup');
            }
            fully.showToast("⚠️ Το Tablet θέλει ρύθμιση! Πάτα το 🤖");
        }
    },

    // 2. ΕΚΤΕΛΕΣΗ: Εφαρμόζει τις ρυθμίσεις
    run: function() {
        // ΠΕΡΙΠΤΩΣΗ A: FULLY KIOSK
        if (typeof fully !== 'undefined') {
            fully.showToast("🤖 Ρομπότ: Ξεκινάω ρυθμίσεις...");
            
            try {
                // --- ΡΥΘΜΙΣΕΙΣ (Δεν κάνουν pop-up, γίνονται στο παρασκήνιο) ---
                fully.setBooleanSetting("keepScreenOn", true);       // Οθόνη πάντα ON
                fully.setBooleanSetting("unlockScreen", true);       // Ξεκλείδωμα
                fully.setBooleanSetting("preventSleep", true);       // Όχι ύπνος CPU
                fully.setBooleanSetting("wifiWakeLock", true);       // Όχι ύπνος WiFi
                fully.setBooleanSetting("forceWifi", true);          // Δύναμη στο WiFi
                fully.setBooleanSetting("listenVolumeButtons", true);// Κουμπιά έντασης
                fully.setBooleanSetting("autoplayMedia", true);      // Ήχος αυτόματα
                fully.setBooleanSetting("fakeUserInteraction", true);// Να φαίνεται ενεργό
                
                fully.showToast("✅ Ρυθμίσεις OK! Ζητάω άδειες...");

            } catch (e) {
                alert("ΣΦΑΛΜΑ: Δεν έχεις ενεργοποιήσει το 'Enable JavaScript Interface' στα Settings του Fully!");
                return;
            }

            // --- POP-UPS (Ζητάνε άδεια από τον χρήστη) ---
            
            // 1. Overlay (Εμφάνιση πάνω από άλλα) - Σε 1 δευτερόλεπτο
            setTimeout(() => {
                fully.requestOverlayPermission(); 
            }, 1000);

            // 2. Μπαταρία (Να μην κλείνει) - Σε 3 δευτερόλεπτα
            setTimeout(() => {
                fully.requestIgnoreBatteryOptimizations();
            }, 3000);

            // Επανέλεγχος σε 5 δευτερόλεπτα για να φύγει το κουμπί αν όλα πήγαν καλά
            setTimeout(() => {
                this.checkConfig();
            }, 5000);
        } 
        
        // ΠΕΡΙΠΤΩΣΗ B: CHROME ANDROID (WIZARD)
        else {
            const setupDiv = document.getElementById('androidSetup');
            if(setupDiv) {
                setupDiv.style.display = 'flex';
                
                // Ετοιμάζουμε το Link για αυτόματο άνοιγμα
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
