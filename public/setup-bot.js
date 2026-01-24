// SETUP BOT: Αυτοματοποίηση Εγκρίσεων
const SetupBot = {
    run: function() {
        if (typeof fully === 'undefined') {
            alert("⚠️ ΠΡΟΣΟΧΗ: Αυτό λειτουργεί μόνο μέσα στο Fully Kiosk Browser!");
            return;
        }

        fully.showToast("🤖 Setup Bot: Ξεκινάω ρυθμίσεις...");

        // 1. Ενεργοποίηση Ρυθμίσεων Fully (Native)
        fully.setBooleanSetting("keepScreenOn", true);
        fully.setBooleanSetting("unlockScreen", true);
        fully.setBooleanSetting("foregroundOnActivity", true);
        fully.setBooleanSetting("listenVolumeButtons", true);

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
