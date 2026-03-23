import { DEFAULT_CATEGORIES } from './menu-presets.js';

export function initPremiumSockets(App, userData) {
    if (!window.socket) {
        const forceLive = localStorage.getItem('use_live_backend') === 'true';
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.') || window.location.hostname.startsWith('10.');
        const serverUrl = (isLocal && !forceLive) ? "" : "https://bellgo-final.onrender.com";
        console.log("🔌 Ταμείο συνδέεται στο:", serverUrl || "Local Network", "| Live Forced:", forceLive);
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
            isNative: isNative,
            isAndroid: /android/i.test(navigator.userAgent)
        });

        // ✅ FIX: Περιμένουμε να ολοκληρωθεί η σύνδεση (join-store) πριν στείλουμε το Stripe ID
        // Χρησιμοποιούμε το 'menu-update' ως ένδειξη ότι ο server μας έβαλε στο δωμάτιο.
        socket.once('menu-update', () => {
            
            // ✅ NEW: Ζητάμε τις κρατήσεις μόλις συνδεθούμε (αφού μπούμε στο δωμάτιο)
            socket.emit('get-reservations');
        });
    });

    // ✅ FIX: Αν είναι ήδη συνδεδεμένο, κάνε trigger το join χειροκίνητα
    if(socket.connected) {
        socket.emit('join-store', { storeName: userData.store, username: userData.name, role: userData.role, token: localStorage.getItem('fcm_token'), isNative: !!window.Capacitor, isAndroid: /android/i.test(navigator.userAgent) });
    }

    socket.on('disconnect', () => { 
        document.getElementById('connDot').style.background = 'red'; 
        App.hasCheckedPendingReservations = false; // ✅ Reset για να ξαναελέγξει όταν συνδεθεί
    });
    
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
        App.renderMenu();
    });
    
    socket.on('store-settings-update', (settings) => {
        if(settings) {
            const inpHeader = document.getElementById('inpStoreNameHeader');
            if(settings.name) {
                if(inpHeader) inpHeader.value = settings.name;
                localStorage.setItem('bellgo_store_name', settings.name); // ✅ Cache Name
            }
            if(settings.features) {
                const fStr = JSON.stringify(settings.features);
                if (window.lastFeatsStr !== fStr) {
                    App.features = settings.features;
                    App.applyFeatureVisibility(); // ✅ Update UI based on features
                    window.lastFeatsStr = fStr;
                }
            }
            if(settings.customExtraPresets) App.customExtraPresets = settings.customExtraPresets; // ✅ Φόρτωση Custom Presets

            document.getElementById('switchCust').checked = settings.statusCustomer;
            document.getElementById('switchStaff').checked = settings.statusStaff;
            document.getElementById('switchStaffCharge').checked = settings.staffCharge || false; // ✅ Load Setting
            if(settings.resetTime) document.getElementById('inpResetTime').value = settings.resetTime;
            if(settings.hours) document.getElementById('inpHours').value = settings.hours;
            if(settings.schedule) App.scheduleData = settings.schedule;
            // ✅ FIX: Να δέχεται και το 0 ως τιμή
            if(settings.coverPrice !== undefined) { 
                App.coverPrice = parseFloat(settings.coverPrice); 
                document.getElementById('inpCoverPrice').value = App.coverPrice; 
            }
            if(settings.googleMapsUrl !== undefined) document.getElementById('inpGoogleMaps').value = settings.googleMapsUrl;
            if(settings.autoPrint !== undefined) {
                App.autoPrint = settings.autoPrint;
                document.getElementById('selAutoPrint').value = App.autoPrint.toString();
            }
            if(settings.printerEnabled !== undefined) {
                App.printerEnabled = settings.printerEnabled;
                const swP = document.getElementById('switchPrinterEnabled');
                if(swP) swP.checked = App.printerEnabled;
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
            
            // ✅ NEW: Load E-Invoicing State
            if(settings.reward) {
                App.rewardSettings = settings.reward;
                // Update UI inputs
                const elReward = document.getElementById('switchRewardEnabled');
                if(elReward) {
                    elReward.checked = settings.reward.enabled;
                    document.getElementById('inpRewardGift').value = settings.reward.gift || '';
                    document.getElementById('inpRewardTarget').value = settings.reward.target || 5;
                    document.getElementById('selRewardMode').value = settings.reward.mode || 'manual';
                }
            }

            // ✅ FIX: Check for keys before enabling Cash Register
            const einv = settings.einvoicing || {};
            // Απαιτούμε Provider, API Key και User ID για να θεωρηθεί ενεργό
            const hasKeys = einv.provider && einv.apiKey && einv.userId;

            if(einv.enabled && hasKeys) App.einvoicingEnabled = true;
            else App.einvoicingEnabled = false;

            // ✅ NEW: Load Cash Register Buttons
            if(settings.cashRegButtons) App.cashRegButtons = settings.cashRegButtons;

            // ✅ SYNC STAFF CHARGE SWITCHES (Settings & Wallet)
            App.staffChargeMode = settings.staffCharge || false;
            const sw1 = document.getElementById('switchStaffCharge'); if(sw1) sw1.checked = App.staffChargeMode;
            const sw2 = document.getElementById('switchStaffChargeWallet'); if(sw2) sw2.checked = App.staffChargeMode;
            
            // ✅ NEW: Reservations Settings
            if(settings.reservationsEnabled !== undefined) {
                document.getElementById('switchReservations').checked = settings.reservationsEnabled;
                const resWrapper = document.getElementById('resWrapper');
                if(resWrapper) resWrapper.style.display = settings.reservationsEnabled ? 'block' : 'none';
            }
            if(settings.totalTables !== undefined) document.getElementById('inpTotalTables').value = settings.totalTables;
            
            // ✅ NEW: Load SoftPOS Settings
            if(settings.softPos) {
                App.softPosSettings = settings.softPos;
                document.getElementById('selSoftPosProvider').value = settings.softPos.provider || '';
                document.getElementById('inpSoftPosMerchantId').value = settings.softPos.merchantId || '';
                document.getElementById('inpSoftPosApiKey').value = settings.softPos.apiKey || '';
                document.getElementById('switchSoftPosEnabled').checked = settings.softPos.enabled || false;
                // ✅ REMOVED to prevent infinite loop with cached pay.js
            }
            if(settings.posMode) {
                App.posMode = settings.posMode;
                document.getElementById('selPosMode').value = App.posMode;
            }
            // ✅ NEW: Load Physical POS Settings
            if(settings.pos) {
                App.posSettings = settings.pos;
                document.getElementById('inpPosProvider').value = settings.pos.provider || '';
                document.getElementById('inpPosId').value = settings.pos.id || '';
                document.getElementById('inpPosKey').value = settings.pos.key || '';
            }
            
            const statusEl = document.getElementById('stripeStatus');
            if (statusEl) {
                if (settings.stripeConnectId) { statusEl.innerHTML = "✅ <b>Συνδεδεμένο!</b> ID: " + settings.stripeConnectId; statusEl.style.color = "#00E676"; }
                else { statusEl.innerText = "Μη συνδεδεμένο"; statusEl.style.color = "#aaa"; }
            }

            // ✅ NEW: Admin Lock Password Logic (Subscription 5)
            if (settings.adminPin !== undefined) {
                App.adminPin = settings.adminPin;
            }
            if (settings.pin !== undefined) {
                App.storePin = settings.pin;
            }
            
            if (settings.warnOnBackground !== undefined) {
                const isWarnEnabled = settings.warnOnBackground === true;
                document.querySelectorAll('[id="switchWarnOnBackground"]').forEach(el => el.checked = isWarnEnabled);
                window.disableBackgroundWarning = !isWarnEnabled;
                localStorage.setItem('bellgo_keepalive', isWarnEnabled);
            } else {
                const saved = localStorage.getItem('bellgo_keepalive');
                if (saved !== null) {
                    const isWarnEnabled = saved === 'true';
                    document.querySelectorAll('[id="switchWarnOnBackground"]').forEach(el => el.checked = isWarnEnabled);
                    window.disableBackgroundWarning = !isWarnEnabled;
                }
            }
            
            if (settings.fakeLockEnabled !== undefined) {
                const isFakeLockEnabled = settings.fakeLockEnabled !== false;
                document.querySelectorAll('[id="switchFakeLockEnabled"]').forEach(el => el.checked = isFakeLockEnabled);
                window.disableFakeLock = !isFakeLockEnabled;
                localStorage.setItem('bellgo_fakelock', isFakeLockEnabled);
            } else {
                const saved = localStorage.getItem('bellgo_fakelock');
                if (saved !== null) {
                    const isFakeLockEnabled = saved === 'true';
                    document.querySelectorAll('[id="switchFakeLockEnabled"]').forEach(el => el.checked = isFakeLockEnabled);
                    window.disableFakeLock = !isFakeLockEnabled;
                }
            }

            if (window.App && window.App.applyFeatureVisibility) window.App.applyFeatureVisibility();
        }
    });

    socket.on('pin-success', () => { alert("Το PIN άλλαξε επιτυχώς!"); });
    socket.on('chat-message', (data) => App.appendChat(data));
    
    socket.on('staff-list-update', (list) => {
        App.lastStaffList = list; 
        App.renderStaffList(list);
    });
    
    // ✅ NEW: Reservations Update
    socket.on('reservations-update', (list) => {
        App.updateReservationsBadge(list);
        App.renderReservations(list);
        
        // ✅ NEW: Έλεγχος για εκκρεμείς κρατήσεις κατά την είσοδο (Popup)
        if (!App.hasCheckedPendingReservations) {
            App.hasCheckedPendingReservations = true;
            const pending = list ? list.filter(r => r.status === 'pending') : [];
            if (pending.length > 0) {
                setTimeout(() => {
                    if(confirm(`📅 Έχετε ${pending.length} κρατήσεις σε αναμονή!\n\nΘέλετε να τις δείτε τώρα;`)) {
                        App.openReservationsModal();
                    }
                }, 1000);
            }
        }
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
        // ✅ NEW: Παρεμβολή στο κλικ του Φακέλου για να καθαρίζει η κλήση!
        if (App.openOrderWindow && !App._wrappedOpenOrderWindow) {
            const orig = App.openOrderWindow;
            App.openOrderWindow = function(order) {
                if (order && order.isCalling) {
                    window.socket.emit('clear-call', order.id);
                    order.isCalling = false; // ✅ Άμεσος τοπικός καθαρισμός
                    
                    if (order.isFakeCall || order.from === "ΚΛΗΣΗ ΤΡΑΠΕΖΙΟΥ") {
                        App.activeOrders = App.activeOrders.filter(x => x.id != order.id);
                        if (typeof App.renderDesktopIcons === 'function') App.renderDesktopIcons(App.activeOrders);
                    }

                    if(window.AudioEngine) window.AudioEngine.stopAlarm();
                    const bell = document.getElementById('adminBellBtn');
                    if (bell) bell.style.display = 'none';
                    
                    if (order.from === "ΚΛΗΣΗ ΤΡΑΠΕΖΙΟΥ") {
                        return; // ✅ Μην ανοίγεις το παράθυρο. Απλά διέγραψε την κλήση!
                    }
                }
                orig.call(App, order);
            };
            App._wrappedOpenOrderWindow = true;
        }

        // ✅ AUTO PRINT LOGIC
        orders.forEach(o => {
            if (!App.knownOrderIds.has(o.id)) {
                App.knownOrderIds.add(o.id);
            }
        });
        App.isInitialized = true; // Mark as initialized after first batch
        
        // ✅ FRONTEND AUTO-HEAL 2: Διατήρηση των τοπικών φακέλων κλήσης για να μην τους σβήνει ο Server!
        const fakeOrders = (App.activeOrders || []).filter(o => o.isFakeCall);
        App.activeOrders = [...orders, ...fakeOrders];
        
        if (typeof App.renderDesktopIcons === 'function') {
            App.renderDesktopIcons(App.activeOrders);
        }

        // ✅ NEW: Βάζουμε το καμπανάκι πάνω στους φακέλους που καλούν
        setTimeout(() => {
            App.activeOrders.forEach(o => {
                if (o.isCalling) {
                    const folders = document.querySelectorAll('.order-folder');
                    folders.forEach(f => {
                        if (f.dataset.orderId == o.id) { // ✅ FIX: Εντοπισμός βάσει dataset
                            f.classList.add('is-calling');
                            if (!f.querySelector('.folder-bell')) {
                                f.insertAdjacentHTML('beforeend', `<div class="folder-bell" style="position:absolute; top:-12px; right:-12px; font-size:20px; animation:shake 0.5s infinite; background:white; border-radius:50%; width:30px; height:30px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 10px rgba(0,0,0,0.3); z-index:10; border:2px solid #EF4444;">🛎️</div>`);
                                f.style.boxShadow = "0 0 15px #EF4444";
                                f.style.border = "2px solid #EF4444";
                            }
                        }
                    });
                }
            });
        }, 100);

        // ✅ NEW: Auto-Open Order from URL (Notification Click)
        const urlParams = new URLSearchParams(window.location.search);
        const orderIdParam = urlParams.get('orderId');
        if (orderIdParam) {
            const targetOrder = orders.find(o => o.id == orderIdParam);
            if (targetOrder) {
                // Open window after a slight delay to ensure UI is ready
                setTimeout(() => App.openOrderWindow(targetOrder), 500);
                // Clear URL to prevent re-opening on refresh
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        }
    });

    // ✅ NEW: Listen for Quick Order Print (PASO)
    socket.on('print-quick-order', (data) => {
        if (!App.printerEnabled) return; // ✅ Check setting
        const mockOrder = { id: data.id, text: data.text, from: 'PASO' };
        if (data.signature) mockOrder.text += `\n\nSIGNATURE: ${data.signature}`;
        // Print immediately
        App.printOrder(null, mockOrder);
    });

    // ✅ NEW: Listen for Standard Order Print (e.g. after Card Payment)
    socket.on('print-order', (data) => {
        if (!App.printerEnabled) return;
        // Δημιουργία προσωρινού αντικειμένου για εκτύπωση
        const mockOrder = { id: Date.now(), text: data.text, from: 'System', aadeQr: data.aadeQr };
        App.printOrder(null, mockOrder);
    });

    // ✅ IMMEDIATE STATUS CHANGE (Fixes delays)
    socket.on('order-changed', (data) => {
        const existing = App.activeOrders.find(o => o.id == data.id);
        if (existing) {
            existing.status = data.status;
            if (data.startTime) existing.startTime = data.startTime;
            App.renderDesktopIcons(App.activeOrders);
            
            // ✅ NEW: Update Open Window if exists (Live Sync between Admins)
            const openWin = document.getElementById(`win-${data.id}`);
            if (openWin && openWin.style.display !== 'none') {
                App.openOrderWindow(existing);
            }

            // ✅ AUTO PRINT: Τυπώνει αυτόματα μόλις γίνει ΑΠΟΔΟΧΗ (Cooking)
            if (App.autoPrint && data.status === 'cooking') {
                App.printOrder(data.id);
            }
        }
    });

    socket.on('ring-bell', (data) => {
        console.log("🔔 ΕΛΗΦΘΗ ΣΗΜΑ ΚΛΗΣΗΣ ΑΠΟ SERVER:", data);
        
        if (data && data.roleTarget && data.roleTarget !== 'admin') return; // ✅ Αγνοεί κλήσεις αν δεν προορίζονται για Admin
        
        // ✅ FRONTEND AUTO-HEAL: Φτιάχνει τον φάκελο μόνο του, ακόμα κι αν ο server έχει παλιό κώδικα!
        if (data && data.source && data.source.includes('🛎️ ΤΡΑΠΕΖΙ')) {
            const tableNum = data.source.replace('🛎️ ΤΡΑΠΕΖΙ', '').trim();
            let found = false;
            App.activeOrders.forEach(o => {
                const match = o.text ? o.text.match(/\[ΤΡ:\s*([^|\]]+)/) : null;
                if (match && match[1].trim() === tableNum && o.status !== 'completed') {
                    o.isCalling = true;
                    found = true;
                }
            });
            if (!found) {
                const fakeId = Date.now();
                App.activeOrders.push({
                    id: fakeId,
                    text: `[ΤΡ: ${tableNum} | AT: - | 🛎️]\n👤 Πελάτης\n---\n❗ ΖΗΤΑΕΙ ΕΞΥΠΗΡΕΤΗΣΗ`,
                    from: "ΚΛΗΣΗ ΤΡΑΠΕΖΙΟΥ",
                    status: "pending",
                    isCalling: true,
                    isFakeCall: true
                });
            }
            if (typeof App.renderDesktopIcons === 'function') App.renderDesktopIcons(App.activeOrders);
            
            setTimeout(() => {
                const folders = document.querySelectorAll('.order-folder');
                App.activeOrders.forEach(o => {
                    if (o.isCalling) {
                        folders.forEach(f => {
                            if (f.dataset.orderId == o.id) {
                                f.classList.add('is-calling');
                                if (!f.querySelector('.folder-bell')) {
                                    f.insertAdjacentHTML('beforeend', `<div class="folder-bell" style="position:absolute; top:-12px; right:-12px; font-size:20px; animation:shake 0.5s infinite; background:white; border-radius:50%; width:30px; height:30px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 10px rgba(0,0,0,0.3); z-index:10; border:2px solid #EF4444;">🛎️</div>`);
                                    f.style.boxShadow = "0 0 15px #EF4444";
                                    f.style.border = "2px solid #EF4444";
                                }
                            }
                        });
                    }
                });
            }, 100);
        }

        // ✅ FIX: Force reset and play, Fallback to Synth if AudioEngine is blocked
        if(window.AudioEngine) {
            window.AudioEngine.isRinging = false; 
            window.AudioEngine.triggerAlarm(data ? data.source : null);
        } else {
            const audio = new Audio('/alert.mp3');
            audio.play().catch(e => {
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
            if(navigator.vibrate) navigator.vibrate([1000, 500, 1000]);
        }
        
        // ✅ Εμφάνιση του μεγάλου κόκκινου κουμπιού της κλήσης
        const bell = document.getElementById('adminBellBtn');
        if (bell) {
            bell.style.display = 'flex';
            if (data && data.source) bell.innerText = '🔔 ' + data.source;
            else bell.innerText = '🔔';
        }
    });

    // ✅ NEW: Stop Alarm when someone else accepts
    socket.on('stop-bell', () => {
        if(window.AudioEngine) window.AudioEngine.stopAlarm();
        const bell = document.getElementById('adminBellBtn');
        if (bell) bell.style.display = 'none';
    });

    // ✅ NEW: Force Logout (Kick)
    socket.on('force-logout', () => {
        localStorage.removeItem('bellgo_session');
        window.location.replace("login.html");
    });

    // ✅ NEW: Αυτόματο κλείσιμο QR όταν πληρωθεί
    socket.on('payment-confirmed', (data) => {
        if (App.currentQrOrderId && App.currentQrOrderId == data.orderId) {
            document.getElementById('qrPaymentModal').style.display = 'none';
            alert("Η πληρωμή έγινε δεκτή! ✅");
            
            if (App.currentQrIsPaso) {
                // Ολοκλήρωση ροής PASO (Εκτύπωση & Κλείσιμο)
                App.processPasoOrder('card', 'receipt');
            }
            
            App.currentQrOrderId = null;
            App.currentQrIsPaso = false;
        }
    });
}