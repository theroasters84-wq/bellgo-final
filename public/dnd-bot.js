/* -----------------------------------------------------------
   BELLGO BOT: Οδηγός για "Override Do Not Disturb" (Android)
----------------------------------------------------------- */

export const DNDBot = {
    init: () => {
        // Τρέχει μόνο σε Android και αν δεν έχει ξαναγίνει
        if(localStorage.getItem('bellgo_dnd_setup') === 'true') return;
        if(!/android/i.test(navigator.userAgent)) return;
        
        setTimeout(DNDBot.showIntro, 1500); // Μικρή καθυστέρηση
    },
    showIntro: () => {
        if(document.getElementById('dndBotOverlay')) return;
        const div = document.createElement('div');
        div.id = 'dndBotOverlay';
        div.className = 'bot-overlay';
        div.innerHTML = `
            <div class="bot-box">
                <div class="bot-icon">🤖</div>
                <div class="bot-title">BellGo Bot</div>
                <div class="bot-text">
                    Γεια! Είμαι ο βοηθός σου.<br><br>
                    Για να μη χάνεις παραγγελίες, πρέπει να ρυθμίσουμε το κινητό να χτυπάει <b>ΔΥΝΑΤΑ</b> ακόμα και στο <b>ΑΘΟΡΥΒΟ</b>.
                </div>
                <button class="bot-btn" onclick="DNDBot.step1()">Ξεκίνα Ρύθμιση 🚀</button>
                <button class="bot-skip" onclick="DNDBot.skip()">Όχι τώρα</button>
            </div>
        `;
        document.body.appendChild(div);
    },
    step1: () => {
        Notification.requestPermission().then(perm => {
            if(perm === 'granted') { DNDBot.step2(); } 
            else { alert("⚠️ Πρέπει να πατήσεις 'Allow' / 'Επιτρέπεται' για να λειτουργήσει!"); }
        });
    },
    step2: () => {
        const box = document.querySelector('#dndBotOverlay .bot-box');
        box.innerHTML = `
            <div class="bot-icon">📢</div>
            <div class="bot-title">Δημιουργία Καναλιού</div>
            <div class="bot-text">Θα στείλω τώρα μια δοκιμαστική ειδοποίηση για να εμφανιστεί η ρύθμιση στο κινητό σου.</div>
            <button class="bot-btn" onclick="DNDBot.step3()">Στείλε Δοκιμή 🔔</button>
        `;
    },
    step3: () => {
        // ✅ Ανάκτηση userData από το localStorage (αντί για scope variable)
        const userData = JSON.parse(localStorage.getItem('bellgo_session') || '{}');
        if(window.socket) window.socket.emit('trigger-alarm', { target: userData.name, source: 'BellGo Setup' });
        
        const box = document.querySelector('#dndBotOverlay .bot-box');
        box.innerHTML = `
            <div class="bot-icon">⚙️</div>
            <div class="bot-title">Τελικό Βήμα</div>
            <div class="bot-text" style="font-size:14px; text-align:left;">
                1. Μόλις έρθει η ειδοποίηση, πήγαινε:<br><b>Ρυθμίσεις > Εφαρμογές > Chrome > Ειδοποιήσεις</b><br>
                2. Βρες το <b>"bellgo_alarm_channel"</b>.<br>
                3. Ενεργοποίησε: <b>"Παράκαμψη Μην Ενοχλείτε"</b> (Override Do Not Disturb).
            </div>
            <button class="bot-btn" onclick="DNDBot.finish()">Το Έκανα! ✅</button>
        `;
    },
    finish: () => {
        localStorage.setItem('bellgo_dnd_setup', 'true');
        document.getElementById('dndBotOverlay').remove();
        if(window.AudioEngine) window.AudioEngine.stopAlarm();
        if(window.socket) window.socket.emit('admin-stop-ringing');
    },
    skip: () => { 
        localStorage.setItem('bellgo_dnd_setup', 'true'); 
        document.getElementById('dndBotOverlay').remove(); 
    }
};

// Expose to Window for inline HTML onclick handlers
window.DNDBot = DNDBot;