import { Sundromes } from './sundromes.js';

export function initDriverSockets(App, userData) {
    if (!window.socket) {
        const forceLive = localStorage.getItem('use_live_backend') === 'true';
        const isLocal = !window.location.hostname.includes('onrender.com');
        const serverUrl = (isLocal && !forceLive) ? "" : "https://bellgo-final.onrender.com";
        window.socket = io(serverUrl, { transports: ['polling', 'websocket'], reconnection: true });
    }
    
    // Καθαρισμός παλιών listeners για να μην διπλασιάζονται
    window.socket.removeAllListeners();
    
    const socket = window.socket;

    socket.on('connect', () => {
        document.getElementById('connDot').style.background = '#00E676';
        socket.emit('join-store', { 
            storeName: userData.store, 
            username: userData.name, 
            role: 'driver', 
            token: localStorage.getItem('fcm_token'),
            isNative: !!window.Capacitor 
        });

        // ✅ NEW: Handle SoftPOS Completion after reload
        if (App.pendingSoftPosCompletion) {
            const { id, amount } = App.pendingSoftPosCompletion;
            window.socket.emit('charge-order-to-staff', { orderId: id, staffName: userData.name, amount: parseFloat(amount), method: 'card' });
            App.pendingSoftPosCompletion = null;
        }
        
        // ✅ ROBUST FETCH: Επαναλαμβανόμενο αίτημα ρυθμίσεων μέχρι να μας απαντήσει ο Server
        const fetchSettings = () => {
            if (window._settingsArrivedDriver) return;
            if (socket.connected) socket.emit('get-store-settings', { storeName: userData.store });
            setTimeout(fetchSettings, 2000);
        };
        fetchSettings();
    });

    if (socket.connected) {
        socket.emit('join-store', { storeName: userData.store, username: userData.name, role: 'driver', token: localStorage.getItem('fcm_token'), isNative: !!window.Capacitor });
        socket.emit('get-store-settings', { storeName: userData.store });
    }

    socket.on('disconnect', () => { document.getElementById('connDot').style.background = 'red'; });

    socket.on('orders-update', (orders) => {
        App.activeOrders = orders;
        App.renderOrders();
    });
    
    socket.on('order-changed', (data) => {
        const o = App.activeOrders.find(x => x.id === data.id);
        if(o) { 
            o.status = data.status; 
            App.renderOrders(); 
        }
    });

    socket.on('force-logout', () => App.logout());
    socket.on('chat-message', (data) => App.appendChat(data)); // ✅ NEW: Chat Listener

    // ✅ NEW: Listen for Settings (Name & SoftPOS)
    socket.on('store-settings-update', (settings) => {
        window._settingsArrivedDriver = true; // ✅ Σταματάει το loop
        if(settings) {
            if(settings.name) {
                document.getElementById('storeNameHeader').innerText = settings.name + " 🛵";
                localStorage.setItem('bellgo_store_name', settings.name); // ✅ Cache Name
            }
            if(settings.softPos) App.softPosSettings = settings.softPos;
            if(settings.features) {
                const fStr = JSON.stringify(settings.features);
                if (window.lastFeatsStr !== fStr) {
                    App.features = settings.features;
                    // ✅ Re-check subscription (Real-time unlock)
                    Sundromes.checkSubscriptionAndEnforce({ ...userData, features: App.features });
                    App.applyFeatureVisibility();
                    window.lastFeatsStr = fStr;
                }
                
                // ✅ ΕΞΥΠΝΟ ΤΡΙΚ: Ανάκτηση από τα features
                if (settings.features.softPosConfig) settings.softPos = settings.features.softPosConfig;
                if (settings.features.warnOnBackground !== undefined) settings.warnOnBackground = settings.features.warnOnBackground;
                if (settings.features.fakeLockEnabled !== undefined) settings.fakeLockEnabled = settings.features.fakeLockEnabled;
            }
            
            if (settings.warnOnBackground !== undefined) {
                const isWarnEnabled = settings.warnOnBackground === true;
                console.log("🕵️‍♂️ [Driver-Socket] KeepAlive Setting arrived:", settings.warnOnBackground, "-> Saving as:", String(isWarnEnabled));
                document.querySelectorAll('[id="switchWarnOnBackgroundDriver"]').forEach(el => el.checked = isWarnEnabled);
                localStorage.setItem('bellgo_keepalive', isWarnEnabled ? 'true' : 'false');
            } else {
                // ✅ FIX: Αν ο Server ΔΕΝ έχει τη ρύθμιση, ΥΠΟΘΕΤΟΥΜΕ ΟΤΙ ΕΙΝΑΙ ΑΝΟΙΧΤΟ (true)!
                console.log("🕵️‍♂️ [Driver-Socket] KeepAlive Setting is UNDEFINED. Defaulting to true.");
                document.querySelectorAll('[id="switchWarnOnBackgroundDriver"]').forEach(el => el.checked = true);
                localStorage.setItem('bellgo_keepalive', 'true');
            }

            if (settings.fakeLockEnabled !== undefined) {
                const isFakeLockEnabled = settings.fakeLockEnabled !== false;
                document.querySelectorAll('[id="switchFakeLockDriver"]').forEach(el => el.checked = isFakeLockEnabled);
                window.disableFakeLock = !isFakeLockEnabled;
                localStorage.setItem('bellgo_fakelock', isFakeLockEnabled);
            } else {
                const saved = localStorage.getItem('bellgo_fakelock');
                if (saved !== null) {
                    const isFakeLockEnabled = saved === 'true';
                    document.querySelectorAll('[id="switchFakeLockDriver"]').forEach(el => el.checked = isFakeLockEnabled);
                    window.disableFakeLock = !isFakeLockEnabled;
                }
            }
            
            const btnFakeLock = document.getElementById('btnFakeLock');
            if (btnFakeLock) btnFakeLock.style.display = window.disableFakeLock ? 'none' : 'flex';
        }
    });

    // ✅ NEW: ALARM LISTENERS
    socket.on('ring-bell', (data) => {
        // ✅ FIX: Ensure alert.mp3 plays (Fallback if AudioEngine missing)
        if(window.AudioEngine) {
            window.AudioEngine.isRinging = false; // ✅ Force reset to ensure play
            window.AudioEngine.triggerAlarm(data ? data.source : null);
        } else {
            // ✅ FIX: Try file, fallback to Synth if missing
            const audio = new Audio('/alert.mp3');
            audio.play().catch(e => {
                console.error("Audio Play Error (Using Synth):", e);
                try {
                    const AudioContext = window.AudioContext || window.webkitAudioContext;
                    if (AudioContext) {
                        const ctx = new AudioContext();
                        const osc = ctx.createOscillator();
                        const gain = ctx.createGain();
                        osc.type = 'square';
                        osc.frequency.setValueAtTime(600, ctx.currentTime);
                        gain.gain.setValueAtTime(0.5, ctx.currentTime);
                        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
                        osc.connect(gain);
                        gain.connect(ctx.destination);
                        osc.start();
                        osc.stop(ctx.currentTime + 0.5);
                    }
                } catch(err){}
            });
            if (navigator.vibrate) navigator.vibrate([1000, 500, 1000, 500, 2000]);
        }
        
        // Εμφάνιση κουμπιού
        const bell = document.getElementById('driverBellBtn');
        if(bell) {
            bell.style.display = 'flex';
            bell.classList.add('ringing');
            bell.innerText = data && data.source ? `🔔 ${data.source}` : "🔔";
        }

        // ✅ SHOW OVERLAY INFO ONLY IF LOCKED
        const fakeLock = document.getElementById('fakeLockOverlay');
        const overlay = document.getElementById('alarmOverlay');
        if (overlay && fakeLock && fakeLock.style.display === 'flex') {
            const text = document.getElementById('alarmText');
            if (text && data && data.source) text.innerText = data.source;
        }
    });

    socket.on('stop-bell', () => {
        if(window.AudioEngine) window.AudioEngine.stopAlarm();
        const bell = document.getElementById('driverBellBtn');
        if(bell) {
            bell.style.display = 'none';
            bell.classList.remove('ringing');
        }
    });

    // ✅ NEW: Αυτόματο κλείσιμο QR
    socket.on('payment-confirmed', (data) => {
        if (App.currentQrOrderId && App.currentQrOrderId == data.orderId) {
            document.getElementById('qrModal').style.display = 'none';
            alert(App.t('payment_accepted') || "Η πληρωμή έγινε δεκτή! ✅");
            App.currentQrOrderId = null;
        }
    });
}