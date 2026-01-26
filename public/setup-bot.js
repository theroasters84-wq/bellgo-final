const SetupBot = {
    // 1. ΕΛΕΓΧΟΣ
    checkConfig: function() {
        if (typeof fully === 'undefined') {
            const ua = navigator.userAgent.toLowerCase();
            if (ua.indexOf("android") > -1) {
                const btn = document.getElementById('setupBotBtn');
                if(btn) btn.style.display = 'flex';
            }
            return;
        }

        // Ελέγχουμε τα βασικά
        const s1 = fully.getBooleanSetting("keepScreenOn") == true || fully.getBooleanSetting("keepScreenOn") == "true";
        const s2 = fully.getBooleanSetting("wifiWakeLock") == true || fully.getBooleanSetting("wifiWakeLock") == "true";

        const btn = document.getElementById('setupBotBtn');
        
        if (s1 && s2) {
            if(btn) btn.style.display = 'none';
        } else {
            if(btn) {
                btn.style.display = 'flex';
                btn.classList.add('needs-setup');
            }
            fully.showToast("⚠️ Ρύθμισέ με! Πάτα το 🤖");
        }
    },

    // 2. ΕΚΤΕΛΕΣΗ
    run: function() {
        // --- ΠΕΡΙΠΤΩΣΗ A: FULLY KIOSK ---
        if (typeof fully !== 'undefined') {
            
            // ΒΗΜΑ 1: Εφαρμογή "Αθόρυβων" Ρυθμίσεων (Safe Mode)
            fully.showToast("🤖 Ρομπότ: Εφαρμόζω Safe Ρυθμίσεις...");
            try {
                fully.setBooleanSetting("keepScreenOn", true);
                fully.setBooleanSetting("unlockScreen", true);
                fully.setBooleanSetting("preventSleep", true);
                fully.setBooleanSetting("wifiWakeLock", true);
                fully.setBooleanSetting("forceWifi", true);
                fully.setBooleanSetting("listenVolumeButtons", true);
                fully.setBooleanSetting("autoplayMedia", true);
                fully.setBooleanSetting("mapVolumeKeysToMedia", true);
                
                // ❌ ΑΦΑΙΡΕΣΑΜΕ ΤΙΣ ΕΠΙΚΙΝΔΥΝΕΣ ΕΝΤΟΛΕΣ

                fully.showToast("✅ Ρυθμίσεις OK!");

            } catch (e) {
                alert("ΣΦΑΛΜΑ: Ενεργοποίησε το 'Enable JavaScript Interface' στα Settings του Fully!");
                return;
            }

            // ΒΗΜΑ 2: Έλεγχος Μάρκας για τα Pop-ups
            if (typeof DeviceCheck !== 'undefined' && DeviceCheck.isXiaomi) {
                // === ΕΙΔΙΚΗ ΛΟΓΙΚΗ ΓΙΑ XIAOMI ===
                alert(
                    "🚨 ΠΡΟΣΟΧΗ: Εντοπίστηκε XIAOMI!\n\n" +
                    "Το σύστημα μπλοκάρει τα αυτόματα παράθυρα.\n" +
                    "Πρέπει να κάνεις ΤΩΡΑ το εξής χειροκίνητα:\n\n" +
                    "1. Πήγαινε Ρυθμίσεις Tablet -> Εφαρμογές\n" +
                    "2. Βρες το Fully Kiosk\n" +
                    "3. Πάτα 'ΑΛΛΕΣ ΑΔΕΙΕΣ' (Other Permissions)\n" +
                    "4. Ενεργοποίησε το 'Εμφάνιση αναδυόμενων παραθύρων' (Pop-up windows)."
                );
                // Δεν καλούμε τα requestOverlayPermission γιατί θα αποτύχουν σιωπηλά
            } else {
                // === ΚΑΝΟΝΙΚΑ ANDROID (Samsung, Lenovo, etc) ===
                fully.showToast("Ζητάω Άδειες...");
                setTimeout(() => { fully.requestOverlayPermission(); }, 1000);
                setTimeout(() => { fully.requestIgnoreBatteryOptimizations(); }, 3000);
            }

            // Επανέλεγχος
            setTimeout(() => { this.checkConfig(); }, 5000);
        } 
        
        // --- ΠΕΡΙΠΤΩΣΗ B: CHROME BROWSER ---
        else {
            const setupDiv = document.getElementById('androidSetup');
            if(setupDiv) {
                setupDiv.style.display = 'flex';
                const currentUrl = window.location.href;
                const cleanUrl = currentUrl.replace('https://', '').replace('http://', '');
                const intentLink = `intent://${cleanUrl}#Intent;scheme=https;package=de.ozerov.fully;end`;
                const autoBtn = document.getElementById('btnAutoOpen');
                if(autoBtn) {
                    autoBtn.onclick = function() { window.location.href = intentLink; };
                }
            }
        }
    }
};
