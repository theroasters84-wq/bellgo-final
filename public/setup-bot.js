// SETUP BOT: Αυτοματοποίηση Εγκρίσεων
const SetupBot = {
    run: function() {
        if (typeof fully === 'undefined') {
            alert("⚠️ ΠΡΟΣΟΧΗ: Αυτό λειτουργεί μόνο μέσα στο Fully Kiosk Browser!");
            return;
        }

        fully.showToast("🤖 Setup Bot: Ξεκινάω ρυθμίσεις...");

        // 1. Ενεργοποίηση Ρυθμίσεων Fully (Native)
        fully.setBooleanSetting("keepScreenOn", true);          // Να μην σβήνει η οθόνη
        fully.setBooleanSetting("unlockScreen", true);          // Να ξεκλειδώνει αυτόματα
        fully.setBooleanSetting("foregroundOnActivity", true);  // Να έρχεται μπροστά
        fully.setBooleanSetting("listenVolumeButtons", true);   // Να ακούει τα κουμπιά έντασης

        // --- ΟΙ ΝΕΕΣ ΕΝΤΟΛΕΣ (CPU & WiFi) ---
        // Prevent from Sleep while Screen Off (Κρατάει τον επεξεργαστή ξύπνιο)
        fully.setBooleanSetting("preventSleep", true); 
        
        // Set Wifi Wakelock (Απαγορεύει στο WiFi να κοιμηθεί)
        fully.setBooleanSetting("wifiWakeLock", true); 

        // 2. ΑΝΟΙΓΜΑ ΠΑΡΑΘΥΡΩΝ ANDROID (Για να πατήσει ο χρήστης)
        setTimeout(() => {
            alert("🤖 ΒΗΜΑ 1: Θα ανοίξει το μενού 'Display over other apps'.\n\n👉 Βρες το Fully Kiosk και βάλτο ON.");
            fully.requestOverlayPermission();
        }, 1000);

        setTimeout(() => {
            if(confirm("🤖 ΒΗΜΑ 2: Θα ανοίξει το μενού Μπαταρίας.\n\n👉 Πάτα 'Allow/Επιτρέπεται' για να μην κοιμάται ποτέ.")) {
                fully.requestIgnoreBatteryOptimizations();
            }
        }, 8000); // Δίνουμε χρόνο στον χρήστη να κάνει το πρώτο βήμα
    }
};
