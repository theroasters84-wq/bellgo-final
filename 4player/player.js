// player.js - Η λογική του Player

// Δημιουργία Audio Elements δυναμικά
const silentAudio = new Audio('../4player/silent.mp3');
silentAudio.loop = true;
silentAudio.id = 'silent-player';

const alarmAudio = new Audio('../4player/alarm.mp3');
alarmAudio.loop = true;
alarmAudio.id = 'alarm-player';

// Append to body to ensure they are in DOM
document.body.appendChild(silentAudio);
document.body.appendChild(alarmAudio);

// 1. Immortal Logic: Ξεκινάμε το silent loop με το πρώτο click του χρήστη
document.body.addEventListener('click', () => {
    if (silentAudio.paused) {
        silentAudio.play().catch(e => console.log("Silent play blocked", e));
    }
}, { once: true });

// 2. Global Functions για το xrhsths.html
window.startRinging = function() {
    silentAudio.pause();
    alarmAudio.currentTime = 0;
    alarmAudio.play().catch(e => console.log("Alarm play blocked", e));
    window.myStatus = 'ringing';
};

window.stopRinging = function() {
    alarmAudio.pause();
    alarmAudio.currentTime = 0;
    silentAudio.play();
    window.myStatus = 'idle';
};

// 3. Αποδοχή με πλήκτρα έντασης (Volume Keys)
// Σημείωση: Τα Volume Keys δεν πιάνονται εύκολα σε web browser εκτός αν γίνει dispatchKeyEvent από native wrapper
// Εδώ βάζουμε γενικό key listener που πιάνει "οποιοδήποτε" πάτημα όταν χτυπάει
window.addEventListener('keydown', (e) => {
    // Αν χτυπάει και πατηθεί κουμπί (Volume Up/Down συχνά στέλνουν key codes ή απλά activity)
    if (window.myStatus === 'ringing') {
        console.log("Key pressed during ring:", e.code);
        // Αποδοχή της κλήσης
        if (window.acceptCallGlobal) {
            window.acceptCallGlobal();
        }
    }
});
