const DeviceCheck = {
    isXiaomi: false,

    init: function() {
        const ua = navigator.userAgent.toLowerCase();
        // Έλεγχος για λέξεις κλειδιά της Xiaomi
        if (ua.includes("redmi") || ua.includes("xiaomi") || ua.includes("miui")) {
            this.isXiaomi = true;
        }
        
        console.log("📱 Έλεγχος Μάρκας: " + (this.isXiaomi ? "XIAOMI (Safe Mode)" : "STANDARD ANDROID"));
    }
};

// Εκτέλεση αμέσως μόλις φορτώσει
DeviceCheck.init();
