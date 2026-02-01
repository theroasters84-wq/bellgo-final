// player.js - Η λογική του Player
// Προσοχή: Τα αρχεία ήχου πρέπει να είναι στο root (έξω από τους φακέλους)

// Δημιουργία Audio Elements
// Χρησιμοποιούμε "../" επειδή το html αρχείο είναι μέσα στο φάκελο 3user, άρα πάμε ένα βήμα πίσω
const silentAudio = new Audio('../silence.mp3'); 
silentAudio.loop = true;
silentAudio.id = 'silent-player';

const alarmAudio = new Audio('../alert.mp3');
alarmAudio.loop = true;
alarmAudio.id = 'alarm-player';

// Προσθήκη στο body (απαραίτητο για browsers)
document.body.appendChild(silentAudio);
document.body.appendChild(alarmAudio);

// 1. Immortal Logic: Ξεκινάμε το silent loop με το πρώτο click
// Αυτό κρατάει τον browser "ξύπνιο"
document.body.addEventListener('click', () => {
    if (silentAudio.paused) {
        silentAudio.play().catch(e => console.log("Silent play blocked", e));
    }
}, { once: true });

// 2. Global Functions (καλούνται από το xrhsths.html)
window.startRinging = function() {
    silentAudio.pause();
    alarmAudio.currentTime = 0;
    alarmAudio.play().catch(e => console.log("Alarm play blocked", e));
    // Ενημερώνουμε το state για να πιάνουν τα κουμπιά
    window.myStatus = 'ringing';
};

window.stopRinging = function() {
    alarmAudio.pause();
    alarmAudio.currentTime = 0;
    silentAudio.play();
    window.myStatus = 'idle';
};

// 3. Volume Button Logic / Key Down
// Όταν χτυπάει, οποιοδήποτε κουμπί (π.χ. Volume) σταματάει τον ήχο (Αποδοχή)
window.addEventListener('keydown', (e) => {
    if (window.myStatus === 'ringing') {
        console.log("Key pressed during ring:", e.code);
        if (window.acceptCallGlobal) {
            window.acceptCallGlobal();
        }
    }
});
