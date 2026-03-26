import { DEFAULT_CATEGORIES } from './menu-presets.js';

export function initKitchenSockets(App, userData) {
    if (!window.socket) {
        const forceLive = localStorage.getItem('use_live_backend') === 'true';
        const isLocal = window.location.hostname !== 'bellgo-final.onrender.com';
        const serverUrl = (isLocal && !forceLive) ? "" : "https://bellgo-final.onrender.com";
        window.socket = io(serverUrl, { transports: ['polling', 'websocket'], reconnection: true });
    }
    const socket = window.socket;
    
    // ✅ FIX: Καθαρισμός παλιών listeners για να μην διπλασιάζονται, αλλά επανασύνδεση
    socket.removeAllListeners();

    socket.on('connect', () => {
        document.getElementById('connDot').style.background = '#00E676';
        // ✅ NEW: Send Status Immediately on Connect
        socket.emit('set-user-status', document.hidden ? 'background' : 'online');

        const isNative = !!window.Capacitor;
        socket.emit('join-store', { 
            storeName: userData.store, 
            username: userData.name, 
            role: userData.role, 
            token: localStorage.getItem('fcm_token'), 
            isNative: isNative 
        });

        // ✅ NEW: Handle SoftPOS Completion
        if (App.pendingSoftPosCompletion) {
            const { id, amount } = App.pendingSoftPosCompletion;
            window.socket.emit('pay-order', { id: id, method: 'card' });
            App.pendingSoftPosCompletion = null;
        }

        // ✅ FIX: Περιμένουμε να ολοκληρωθεί η σύνδεση (join-store) πριν στείλουμε το Stripe ID
        socket.once('menu-update', () => {
            const pendingStripe = localStorage.getItem('temp_stripe_connect_id');
            if (pendingStripe) {
                socket.emit('save-store-settings', { stripeConnectId: pendingStripe });
                localStorage.removeItem('temp_stripe_connect_id');
                alert((window.App && window.App.t ? window.App.t('stripe_connected') : null) || "Ο λογαριασμός Stripe συνδέθηκε επιτυχώς!");
            }
        });
    });

    // ✅ FIX: Αν είναι ήδη συνδεδεμένο, κάνε trigger το join χειροκίνητα
    if(socket.connected) {
        socket.emit('join-store', { storeName: userData.store, username: userData.name, role: userData.role, token: localStorage.getItem('fcm_token'), isNative: !!window.Capacitor });
    }

    socket.on('disconnect', () => { document.getElementById('connDot').style.background = 'red'; });
    
    socket.on('menu-update', (data) => {
        try {
            if (!data) {
                App.menuData = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
            } else if (typeof data === 'string' && !data.startsWith('[')) {
                App.menuData = [{ id: 1, order: 1, name: "ΓΕΝΙΚΑ", items: data.split('\n').filter(x=>x) }];
            } else {
                App.menuData = typeof data === 'string' ? JSON.parse(data) : data;
            }
        } catch(e) { App.menuData = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)); }
        
        // ✅ FIX: Κάνουμε render το μενού ΜΟΝΟ αν υπάρχει ο αντίστοιχος πίνακας στο HTML
        if (typeof App.renderMenu === 'function' && document.getElementById('menuInputContainer')) {
            App.renderMenu();
        }
    });
    
    socket.on('store-settings-update', (settings) => {
        if(settings) {
            const inpHeader = document.getElementById('inpStoreNameHeader');
            if(settings.name && inpHeader) {
                inpHeader.value = settings.name;
                localStorage.setItem('bellgo_store_name', settings.name);
            }
            if(settings.features) {
                const fStr = JSON.stringify(settings.features);
                if (window.lastFeatsStr !== fStr) {
                    App.features = settings.features;
                    App.applyFeatureVisibility(); // ✅ Update UI based on features
                    window.lastFeatsStr = fStr;
                }
                
                // ✅ ΕΞΥΠΝΟ ΤΡΙΚ: Ανάκτηση από τα features (αν ο server το ξέχασε)
                if (settings.features.softPosConfig) settings.softPos = settings.features.softPosConfig;
                if (settings.features.posConfig) settings.pos = settings.features.posConfig;
                if (settings.features.posModeConfig) settings.posMode = settings.features.posModeConfig;
            }
            
            // ✅ FIX: Ασφαλείς αναθέσεις (γιατί στην κουζίνα λείπουν αυτά τα κουμπιά)
            const swCust = document.getElementById('switchCust');
            if(swCust) swCust.checked = settings.statusCustomer;
            const swStaff = document.getElementById('switchStaff');
            if(swStaff) swStaff.checked = settings.statusStaff;
            const inpReset = document.getElementById('inpResetTime');
            if(settings.resetTime && inpReset) inpReset.value = settings.resetTime;
            const inpHours = document.getElementById('inpHours');
            if(settings.hours && inpHours) inpHours.value = settings.hours;
            if(settings.schedule) App.scheduleData = settings.schedule;
            
            // ✅ FIX: Να δέχεται και το 0 ως τιμή
            if(settings.coverPrice !== undefined) { 
                if (settings.adminPin !== undefined) App.adminPin = settings.adminPin;
                if (settings.pin !== undefined) App.storePin = settings.pin;
                App.coverPrice = parseFloat(settings.coverPrice); 
                const inpCover = document.getElementById('inpCoverPrice');
                if(inpCover) inpCover.value = App.coverPrice; 
            }
            if(settings.googleMapsUrl !== undefined) {
                const inpMap = document.getElementById('inpGoogleMaps');
                if(inpMap) inpMap.value = settings.googleMapsUrl;
            }
            if(settings.autoPrint !== undefined) {
                App.autoPrint = settings.autoPrint;
                const selAuto = document.getElementById('selAutoPrint');
                if(selAuto) selAuto.value = App.autoPrint.toString();
            }
            if(settings.autoClosePrint !== undefined) {
                App.autoClosePrint = settings.autoClosePrint;
                const sw = document.getElementById('switchAutoClosePrint');
                if(sw) sw.checked = App.autoClosePrint;
            }
            if(settings.expensePresets) App.expensePresets = settings.expensePresets;
            if(settings.fixedExpenses) App.fixedExpenses = settings.fixedExpenses; // ✅ Load Fixed Expenses
            if(settings.staffWhitelist) App.staffWhitelist = settings.staffWhitelist;
            if(settings.whitelistEnabled !== undefined) App.whitelistEnabled = settings.whitelistEnabled;
            
            // ✅ NEW: Load SoftPOS Settings
            if(settings.softPos) App.softPosSettings = settings.softPos;
            if(settings.posMode) App.posMode = settings.posMode;
            if(settings.pos) App.posSettings = settings.pos; // ✅ Load Physical POS

            const statusEl = document.getElementById('stripeStatus');
            if (statusEl) {
                if (settings.stripeConnectId) {
                    statusEl.innerHTML = "✅ <b>Συνδεδεμένο!</b> ID: " + settings.stripeConnectId;
                    statusEl.style.color = "#00E676";
                } else {
                    statusEl.innerText = "Μη συνδεδεμένο";
                    statusEl.style.color = "#aaa";
                }
            }
        
            if (settings.warnOnBackground !== undefined) {
                const isWarnEnabled = settings.warnOnBackground === true;
                document.querySelectorAll('[id="switchWarnOnBackgroundKitchen"]').forEach(el => el.checked = isWarnEnabled);
                window.disableBackgroundWarning = !isWarnEnabled;
                localStorage.setItem('bellgo_keepalive', isWarnEnabled);
            } else {
                const saved = localStorage.getItem('bellgo_keepalive');
                if (saved !== null) {
                    const isWarnEnabled = saved === 'true';
                    document.querySelectorAll('[id="switchWarnOnBackgroundKitchen"]').forEach(el => el.checked = isWarnEnabled);
                    window.disableBackgroundWarning = !isWarnEnabled;
                }
            }

            if (settings.fakeLockEnabled !== undefined) {
                const isFakeLockEnabled = settings.fakeLockEnabled !== false;
                document.querySelectorAll('[id="switchFakeLockKitchen"]').forEach(el => el.checked = isFakeLockEnabled);
                window.disableFakeLock = !isFakeLockEnabled;
                localStorage.setItem('bellgo_fakelock', isFakeLockEnabled);
            } else {
                const saved = localStorage.getItem('bellgo_fakelock');
                if (saved !== null) {
                    const isFakeLockEnabled = saved === 'true';
                    document.querySelectorAll('[id="switchFakeLockKitchen"]').forEach(el => el.checked = isFakeLockEnabled);
                    window.disableFakeLock = !isFakeLockEnabled;
                }
            }
            
            const btnFakeLock = document.getElementById('btnFakeLock');
            if (btnFakeLock) btnFakeLock.style.display = window.disableFakeLock ? 'none' : 'flex';
        }
    });

    socket.on('pin-success', () => { alert((window.App && window.App.t ? window.App.t('pin_changed') : null) || "Το PIN άλλαξε επιτυχώς!"); });
    socket.on('chat-message', (data) => App.appendChat(data));
    

    socket.on('staff-list-update', (list) => {
        App.lastStaffList = list; 
        App.renderStaffList(list);
    });
    
    socket.on('staff-accepted-alarm', (data) => {
        if(!App.tempComingState) App.tempComingState = {};
        App.tempComingState[data.username] = Date.now();
        App.renderStaffList(App.lastStaffList);
    });

    // ✅ FIX: Προσθήκη listener για τα στατιστικά που έλειπε
    socket.on('stats-data', (data) => App.renderStats(data));
    
    // ✅ Update Full Order List
    socket.on('orders-update', (orders) => {
        // ✅ AUTO PRINT LOGIC
        orders.forEach(o => {
            if (!App.knownOrderIds.has(o.id)) {
                App.knownOrderIds.add(o.id);
            }
        });
        App.isInitialized = true; // Mark as initialized after first batch
        App.activeOrders = orders;
        App.renderDesktopIcons(orders);
    });

    // ✅ IMMEDIATE STATUS CHANGE (Fixes delays)
    socket.on('order-changed', (data) => {
        const existing = App.activeOrders.find(o => o.id == data.id);
        if (existing) {
            existing.status = data.status;
            if (data.startTime) existing.startTime = data.startTime;
            App.renderDesktopIcons(App.activeOrders);
            
            // ✅ NEW: Update Open Window if exists (Live Sync)
            const openWin = document.getElementById(`win-${data.id}`);
            if (openWin && openWin.style.display !== 'none') {
                App.openOrderWindow(existing);
            }

            // ✅ AUTO PRINT: Τυπώνει αυτόματα μόλις γίνει ΑΠΟΔΟΧΗ (Cooking)
            if (App.kitchenSettings.autoPrint && data.status === 'cooking') { 
                App.printOrder(data.id);
            }
        }
    });

    socket.on('ring-bell', (data) => {
        // ✅ FIX: Ensure alert.mp3 plays (Fallback if AudioEngine missing)
        if(window.AudioEngine) {
            window.AudioEngine.triggerAlarm(data ? data.source : null);
        } else {
            new Audio('/alert.mp3').play().catch(e => console.error("Audio Play Error:", e));
        }

        // ✅ SHOW OVERLAY INFO ONLY IF LOCKED
        const fakeLock = document.getElementById('fakeLockOverlay');
        const overlay = document.getElementById('alarmOverlay');
        if (overlay && fakeLock && fakeLock.style.display === 'flex') {
            const text = document.getElementById('alarmText');
            if (text && data && data.source) text.innerText = data.source;
        }
    });

    // ✅ NEW: Stop Alarm when someone else accepts
    socket.on('stop-bell', () => {
        if(window.AudioEngine) window.AudioEngine.stopAlarm();
    });

    // ✅ NEW: Force Logout (Kick)
    socket.on('force-logout', () => {
        localStorage.removeItem('bellgo_session');
        window.location.replace("login.html");
    });
}