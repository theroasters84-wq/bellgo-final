import { Sundromes } from './sundromes.js';

export function initDriverSockets(App, userData) {
    if (!window.socket) {
        const forceLive = localStorage.getItem('use_live_backend') === 'true';
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
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
    });

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
        if(settings) {
            if(settings.name) {
                document.getElementById('storeNameHeader').innerText = settings.name + " 🛵";
                localStorage.setItem('bellgo_store_name', settings.name); // ✅ Cache Name
            }
            if(settings.softPos) App.softPosSettings = settings.softPos;
            if(settings.features) {
                App.features = settings.features;
                // ✅ Re-check subscription (Real-time unlock)
                Sundromes.checkSubscriptionAndEnforce({ ...userData, features: App.features });
                App.applyFeatureVisibility();
            }
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

        // ✅ SHOW OVERLAY INFO
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) {
            const text = document.getElementById('alarmText');
            if (text && data && data.source) text.innerText = data.source;
            
            const locBox = document.getElementById('alarmLocationBox');
            const locText = document.getElementById('alarmLocationText');
            const btnGps = document.getElementById('btnGps');
            if (data && data.location && locBox) {
                locBox.style.display = 'flex';
                if(locText) locText.innerText = data.location;
                if(btnGps) btnGps.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.location)}`;
            } else if (locBox) {
                locBox.style.display = 'none';
            }
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
            alert("Η πληρωμή έγινε δεκτή! ✅");
            App.currentQrOrderId = null;
        }
    });
}