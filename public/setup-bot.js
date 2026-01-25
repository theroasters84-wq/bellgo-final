// SETUP BOT: Αυτοματοποίηση Εγκρίσεων & Ρυθμίσεων Fully Kiosk
const SetupBot = {
    run: function() {
        if (typeof fully === 'undefined') {
            alert("⚠️ ΠΡΟΣΟΧΗ: Αυτό λειτουργεί μόνο μέσα στο Fully Kiosk Browser!");
            return;
        }

        fully.showToast("🤖 Setup Bot: Ξεκινάω ρυθμίσεις...");

        // 1. ΒΑΣΙΚΕΣ ΡΥΘΜΙΣΕΙΣ (Οθόνη, Ξεκλείδωμα)
        try {
            fully.setBooleanSetting("keepScreenOn", true);          // Να μην σβήνει η οθόνη
            fully.setBooleanSetting("unlockScreen", true);          // Να ξεκλειδώνει αυτόματα
            fully.setBooleanSetting("foregroundOnActivity", true);  // Να έρχεται μπροστά
            fully.setBooleanSetting("listenVolumeButtons", true);   // Να ακούει τα κουμπιά έντασης
            
            // --- CPU & WiFi (Για να μην χάνει σύνδεση) ---
            fully.setBooleanSetting("preventSleep", true);          // Κρατάει την CPU ξύπνια
            fully.setBooleanSetting("wifiWakeLock", true);          // Κρατάει το WiFi ξύπνιο
            fully.setBooleanSetting("forceWifi", true);             // Πιέζει το WiFi να μείνει ανοιχτό

            // --- 🔥 ΟΙ ΝΕΕΣ ΡΥΘΜΙΣΕΙΣ (ΓΙΑ ΤΟΝ ΗΧΟ) 🔥 ---
            // Αυτά ζήτησες τώρα:
            fully.setBooleanSetting("autoplayMedia", true);         // Web Content -> Autoplay Media: ON
            fully.setBooleanSetting("fakeUserInteraction", true);   // Advanced -> Fake User Interaction: ON
            
            fully.showToast("✅ Ρυθμίσεις Ήχου & WiFi περάστηκαν!");
        } catch (e) {
            console.error(e);
            alert("Κάποια ρύθμιση απέτυχε. Βεβαιώσου ότι έχεις την PLUS έκδοση.");
        }

        // 2. ΑΝΟΙΓΜΑ ΠΑΡΑΘΥΡΩΝ ANDROID (Permissions)
        // Ζητάμε άδεια για Overlay (Να βγαίνει πάνω από άλλα)
        setTimeout(() => {
            alert("🤖 ΒΗΜΑ 1: Θα ανοίξει το μενού 'Display over other apps'.\n\n👉 Βρες το Fully Kiosk και βάλτο ON.");
            fully.requestOverlayPermission();
        }, 1000);

        // Ζητάμε άδεια για Μπαταρία (Να μην το σκοτώνει το Android)
        setTimeout(() => {
            if(confirm("🤖 ΒΗΜΑ 2: Θα ανοίξει το μενού Μπαταρίας.\n\n👉 Πάτα 'Allow/Επιτρέπεται' για να μην κοιμάται ποτέ.")) {
                fully.requestIgnoreBatteryOptimizations();
            }
        }, 8000); // Δίνουμε χρόνο στον χρήστη
    }
};
