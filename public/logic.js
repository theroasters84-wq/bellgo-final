const socket = io();
let isFully = typeof fully !== 'undefined';
let messaging = null;
let myToken = null;
let currentUser = null;

const Logic = {
    login: function(store, name, role, pass) {
        console.log("Logged in as Driver (Test Mode)");
        currentUser = { store, name, role, pass };

        // ΞΕΚΙΝΑΜΕ WATCHDOG
        if(typeof Watchdog !== 'undefined') Watchdog.start(isFully);

        // FIREBASE (ΓΙΑ ΝΑ ΜΗΝ ΤΟ ΧΑΣΟΥΜΕ)
        if (!isFully) {
            try { this.initFirebase(); } catch(e) {}
        }

        // SOCKET JOIN
        socket.emit('join-store', { storeName: store, username: name, role: role, fcmToken: myToken });
        
        // ΚΡΥΒΟΥΜΕ ΤΗ ΦΟΡΜΑ, ΔΕΙΧΝΟΥΜΕ ΤΟ CHAT (ΠΡΟΧΕΙΡΑ)
        document.body.innerHTML = "<h1 style='color:green'>PLAYER ACTIVE!</h1><br><h2 style='color:white'>Δες την μπάρα πάνω!</h2><br><button onclick='location.reload()'>ΕΞΟΔΟΣ</button>";
    },

    initFirebase: function() {
        if (!isFully) {
            const firebaseConfig = { 
                apiKey: "AIzaSyBDOAlwLn4P5PMlwkg_Hms6-4f9fEcBKn8",
                authDomain: "bellgo-5dbe5.firebaseapp.com",
                projectId: "bellgo-5dbe5",
                storageBucket: "bellgo-5dbe5.firebasestorage.app",
                messagingSenderId: "799314495253",
                appId: "1:799314495253:web:baf6852f2a065c3a2e8b1c",
                measurementId: "G-379ETZJP8H"
            };
            if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
            messaging = firebase.messaging();
            messaging.getToken().then(t => {
                myToken = t;
                if(currentUser) socket.emit('update-token', { store: currentUser.store, user: currentUser.name, token: t });
            }).catch(e=>{});
        }
    }
};

// --- ΑΠΑΡΑΙΤΗΤΟ ΓΙΑ ΝΑ ΜΗΝ ΣΠΑΕΙ ΤΟ HTML ---
socket.on('update-staff-list', () => {});
socket.on('new-chat', () => {});
socket.on('ring-bell', () => {
    // Αν χτυπήσει, απλά δείξε alert για το τεστ
    alert("RING RING! (TEST MODE)");
});
