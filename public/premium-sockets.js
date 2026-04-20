import { DEFAULT_CATEGORIES } from './menu-presets.js';

export function initPremiumSockets(App, userData) {
    if (!window.socket) {
        const forceLive = localStorage.getItem('use_live_backend') === 'true';
        const isLocal = !window.location.hostname.includes('onrender.com');
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

        // ✅ ROBUST FETCH: Επαναλαμβανόμενο αίτημα ρυθμίσεων μέχρι να μας απαντήσει ο Server
        const fetchSettings = () => {
            if (window._settingsArrivedPremium) return;
            if (socket.connected) { 
                socket.emit('get-store-settings', { storeName: userData.store });
                socket.emit('get-reservations');
            }
            setTimeout(fetchSettings, 2000);
        };
        fetchSettings();

        socket.once('menu-update', () => {
            
            // ✅ Έλεγχος επιστροφής από Stripe
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
        socket.emit('join-store', { storeName: userData.store, username: userData.name, role: userData.role, token: localStorage.getItem('fcm_token'), isNative: !!window.Capacitor, isAndroid: /android/i.test(navigator.userAgent) });
        socket.emit('get-store-settings', { storeName: userData.store });
        socket.emit('get-reservations');
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
        
        // ✅ FIX: Ανανέωση του κεντρικού editor (αν είναι ανοιχτός)
        if (typeof App.renderMenu === 'function' && document.getElementById('menuInputContainer')) {
            App.renderMenu();
        }
        
        // ✅ FIX: Δυναμική ανανέωση της πλαϊνής μπάρας του ταμείου για να βλέπουμε το απόθεμα (stock) να μειώνεται ζωντανά!
        if (typeof App.renderSidebarMenu === 'function') {
            App.renderSidebarMenu();
        }
    });
    
    socket.on('store-settings-update', (settings) => {
        console.log("📥 [store-settings-update] - Λήψη νέων ρυθμίσεων από Server:", settings);
        window._settingsArrivedPremium = true; // ✅ Σταματάει το loop
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
                
                // ✅ ΕΞΥΠΝΟ ΤΡΙΚ: Ανάκτηση από τα features (αν ο server το ξέχασε)
                if (settings.features.softPosConfig) settings.softPos = settings.features.softPosConfig;
                if (settings.features.posConfig) settings.pos = settings.features.posConfig;
                if (settings.features.posModeConfig) settings.posMode = settings.features.posModeConfig;
                if (settings.features.warnOnBackground !== undefined) settings.warnOnBackground = settings.features.warnOnBackground;
                if (settings.features.fakeLockEnabled !== undefined) settings.fakeLockEnabled = settings.features.fakeLockEnabled;
            }
            if(settings.customExtraPresets) App.customExtraPresets = settings.customExtraPresets; // ✅ Φόρτωση Custom Presets

            // ✅ FIX: Ασφαλής ανάθεση τιμών στο DOM για αποφυγή crash στους Σερβιτόρους
            const setChecked = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };
            const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };

            setChecked('switchCust', settings.statusCustomer);
            setChecked('switchStaff', settings.statusStaff);
            setChecked('switchStaffCharge', settings.staffCharge || false);
            setChecked('switchStaffChargeWallet', settings.staffCharge || false);
            
            if(settings.resetTime) setVal('inpResetTime', settings.resetTime);
            if(settings.hours) setVal('inpHours', settings.hours);
            if(settings.schedule) App.scheduleData = settings.schedule;
            // ✅ FIX: Να δέχεται και το 0 ως τιμή
            if(settings.coverPrice !== undefined) { 
                App.coverPrice = parseFloat(settings.coverPrice); 
                setVal('inpCoverPrice', App.coverPrice); 
            }
            if(settings.googleMapsUrl !== undefined) setVal('inpGoogleMaps', settings.googleMapsUrl);
            if(settings.autoPrint !== undefined) {
                App.autoPrint = settings.autoPrint;
                setVal('selAutoPrint', App.autoPrint.toString());
            }
            if(settings.printerEnabled !== undefined) {
                App.printerEnabled = settings.printerEnabled;
                setChecked('switchPrinterEnabled', App.printerEnabled);
            }
            if(settings.autoClosePrint !== undefined) {
                App.autoClosePrint = settings.autoClosePrint;
                setChecked('switchAutoClosePrint', App.autoClosePrint);
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
            
            // ✅ NEW: Reservations Settings
            if(settings.reservationsEnabled !== undefined) {
                setChecked('switchReservations', settings.reservationsEnabled);
                const resWrapper = document.getElementById('resWrapper');
                if(resWrapper) resWrapper.style.display = settings.reservationsEnabled ? 'block' : 'none';
            }
            if(settings.totalTables !== undefined) setVal('inpTotalTables', settings.totalTables);
            
            // ✅ NEW: Load SoftPOS Settings
            if(settings.softPos) {
                App.softPosSettings = settings.softPos;
                const pEl = document.getElementById('selSoftPosProvider'); if(pEl) pEl.value = settings.softPos.provider || '';
                const mEl = document.getElementById('inpSoftPosMerchantId'); if(mEl) mEl.value = settings.softPos.merchantId || '';
                const aEl = document.getElementById('inpSoftPosApiKey'); if(aEl) aEl.value = settings.softPos.apiKey || '';
                const swEl = document.getElementById('switchSoftPosEnabled'); if(swEl) swEl.checked = settings.softPos.enabled || false;
                
                if (window.PaySystem && window.PaySystem.updateSoftPosUI) window.PaySystem.updateSoftPosUI();
            }
            if(settings.posMode) {
                App.posMode = settings.posMode;
                const pmEl = document.getElementById('selPosMode');
                if (pmEl) pmEl.value = App.posMode;
            }
            // ✅ NEW: Load Physical POS Settings
            if(settings.pos) {
                App.posSettings = settings.pos;
                const pEl = document.getElementById('inpPosProvider'); if(pEl) pEl.value = settings.pos.provider || '';
                const iEl = document.getElementById('inpPosId'); if(iEl) iEl.value = settings.pos.id || '';
                const kEl = document.getElementById('inpPosKey'); if(kEl) kEl.value = settings.pos.key || '';
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
                console.log("🕵️‍♂️ [Premium-Socket] KeepAlive Setting arrived:", settings.warnOnBackground, "-> Saving as:", String(isWarnEnabled));
                document.querySelectorAll('[id="switchWarnOnBackground"]').forEach(el => el.checked = isWarnEnabled);
                localStorage.setItem('bellgo_keepalive', isWarnEnabled ? 'true' : 'false');
            } else {
                // ✅ FIX: Αν ο Server ΔΕΝ έχει τη ρύθμιση, ΥΠΟΘΕΤΟΥΜΕ ΟΤΙ ΕΙΝΑΙ ΑΝΟΙΧΤΟ (true) για ασφάλεια!
                console.log("🕵️‍♂️ [Premium-Socket] KeepAlive Setting is UNDEFINED. Defaulting to true.");
                document.querySelectorAll('[id="switchWarnOnBackground"]').forEach(el => el.checked = true);
                localStorage.setItem('bellgo_keepalive', 'true');
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
                                const tm = o.text ? o.text.match(/\[ΤΡ:\s*([^|\]]+)/) : null;
                                const tNum = tm ? tm[1].trim() : '';
                                f.insertAdjacentHTML('beforeend', `<div class="folder-bell" style="position:absolute; top:-12px; right:-12px; font-size:${tNum ? '16px' : '20px'}; font-weight:bold; color:#EF4444; animation:shake 0.5s infinite; background:white; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 10px rgba(0,0,0,0.3); z-index:10; border:2px solid #EF4444;">${tNum ? tNum : '🛎️'}</div>`);
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
                                const tm = o.text ? o.text.match(/\[ΤΡ:\s*([^|\]]+)/) : null;
                                const tNum = tm ? tm[1].trim() : '';
                                f.insertAdjacentHTML('beforeend', `<div class="folder-bell" style="position:absolute; top:-12px; right:-12px; font-size:${tNum ? '16px' : '20px'}; font-weight:bold; color:#EF4444; animation:shake 0.5s infinite; background:white; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 10px rgba(0,0,0,0.3); z-index:10; border:2px solid #EF4444;">${tNum ? tNum : '🛎️'}</div>`);
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