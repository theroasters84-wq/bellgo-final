import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";
import { firebaseConfig, vapidKey } from './config.js';
import { StatsUI } from './premium-stats.js';
import { PaySystem } from './pay.js'; // ✅ Import PaySystem

const savedSession = localStorage.getItem('bellgo_session');
if (!savedSession) window.location.replace("login.html");
const userData = JSON.parse(savedSession || '{}');
if (userData.role !== 'admin' && userData.role !== 'kitchen' && userData.role !== 'waiter') { alert("Access Denied"); window.location.replace("login.html"); }

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

// --- I18N LOGIC (FIX FOR TRANSLATIONS) ---
let translations = {};
const t = (key) => translations[key] || key;

async function setLanguage(lang) {
    localStorage.setItem('bellgo_lang', lang);
    try {
        const response = await fetch(`/i18n/${lang}.json`);
        translations = await response.json();
        applyTranslations();
    } catch (error) { console.error(`Lang Error: ${lang}`, error); }
}

function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[key]) el.innerText = translations[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (translations[key]) el.placeholder = translations[key];
    });
}

const calculateTotal = (text) => {
    let total = 0;
    if (!text) return 0;
    const lines = text.split('\n');
    lines.forEach(line => {
        const match = line.match(/^(\d+)?\s*(.+):(\d+(?:\.\d+)?)$/);
        if (match) {
            let qty = parseInt(match[1] || '1');
            let price = parseFloat(match[3]);
            total += qty * price;
        }
    });
    return total;
};

// --- PIN MODULE ---
let pinValue = '';
window.PIN = {
    add: (n) => { if(pinValue.length < 4) { pinValue += n; PIN.updateDisplay(); } },
    clear: () => { pinValue = ''; PIN.updateDisplay(); },
    updateDisplay: () => { document.getElementById('pinDisplay').innerText = pinValue; },
    submit: () => {
        if(pinValue.length < 4) return alert("Το PIN πρέπει να είναι 4 ψηφία");
        window.socket.emit('set-new-pin', { pin: pinValue, email: userData.email });
        App.closePinModal();
    }
};

const DEFAULT_CATEGORIES = [
    { order: 1, name: "ΚΑΦΕΔΕΣ", items: [] },
    { order: 2, name: "SANDWICH", items: [] },
    { order: 3, name: "ΑΝΑΨΥΚΤΙΚΑ", items: [] },
    { order: 4, name: "ΡΟΦΗΜΑΤΑ", items: [] },
    { order: 5, name: "ΖΕΣΤΗ ΚΟΥΖΙΝΑ", items: [] },
    { order: 6, name: "ΚΡΥΑ ΚΟΥΖΙΝΑ", items: [] },
    { order: 7, name: "ΣΦΟΛΙΑΤΕΣ", items: [] },
    { order: 8, name: "SNACKS", items: [] }
];

// ✅ BELLGO BOT: Οδηγός για "Override Do Not Disturb" (Android)
const DNDBot = {
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
    skip: () => { localStorage.setItem('bellgo_dnd_setup', 'true'); document.getElementById('dndBotOverlay').remove(); }
};
window.DNDBot = DNDBot;

window.App = {
    activeOrders: [],
    currentCategoryIndex: null,
    isChatOpen: false, 
    pendingAction: null, 
    lastRingingState: {}, 
    tempComingState: {},
    lastStaffList: [],
    scheduleData: {},
    adminMode: localStorage.getItem('bellgo_admin_mode') || 'cashier', // 'cashier' or 'kitchen'
    coverPrice: 0,
    sidebarMode: 'paso', // ✅ Default Mode
    
    // EXTRAS STATE
    currentExtrasItemIndex: null,
    currentExtrasCatIndex: null,
    tempExtras: [],
    cachedStats: null, // ✅ Store stats for navigation
    autoPrint: false, // ✅ Auto Print State
    autoClosePrint: false, // ✅ Auto Close Window State
    printerEnabled: true, // ✅ NEW: Master Printer Switch
    knownOrderIds: new Set(), // ✅ Track printed orders
    expensePresets: [], // ✅ Local storage for presets
    fixedExpenses: [], // ✅ NEW: Fixed Expenses
    
    einvoicingEnabled: false, // ✅ NEW: E-Invoicing State
    // ✅ NEW: Cash Register State
    cashRegValue: "0",
    cashRegItems: [],
    cashRegButtons: [], // ✅ Store custom buttons
    tempPasoText: "", // ✅ Store PASO order text temporarily

    hasCheckedPendingReservations: false, // ✅ NEW: Flag για έλεγχο κρατήσεων κατά την είσοδο
    staffChargeMode: false, // ✅ NEW: Staff Charge Setting
    ...(StatsUI || {}), // ✅ Import Statistics Logic (Safe Spread)
    
    // Expose setLanguage for console or future use
    setLanguage: setLanguage,

    init: () => {
        // ✅ iOS INSTALL PROMPT (Admin/Staff Only)
        const isIos = () => /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

        if (isIos() && !isStandalone) {
            const div = document.createElement('div');
            div.id = 'iosInstallPrompt';
            div.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.95); z-index:20000; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:30px; text-align:center; color:white;";
            div.innerHTML = `
                <div style="font-size:60px; margin-bottom:20px;">📲</div>
                <h2 style="color:#FFD700; margin-bottom:10px;">ΕΓΚΑΤΑΣΤΑΣΗ APP</h2>
                <p style="color:#ccc; font-size:15px; margin-bottom:20px;">Για να λειτουργούν οι <b>Ειδοποιήσεις</b> και ο <b>Ήχος</b> στο iPhone, η εφαρμογή πρέπει να εγκατασταθεί.</p>
                
                <div style="background:#222; border:1px solid #444; padding:20px; border-radius:15px; width:100%; text-align:left; font-size:14px; color:#eee;">
                    <div style="margin-bottom:15px;">1. Πατήστε το κουμπί <b>Share</b> <span style="font-size:18px;">⎋</span> κάτω στο Safari.</div>
                    <div>2. Επιλέξτε <b>"Προσθήκη στην Οθόνη Αφετηρίας"</b> (Add to Home Screen).</div>
                </div>
                
                <button onclick="document.getElementById('iosInstallPrompt').remove()" style="margin-top:30px; background:none; border:none; color:#555; text-decoration:underline; cursor:pointer;">Συνέχεια στον Browser (Χωρίς Ήχο)</button>
            `;
            document.body.appendChild(div);
        }
        document.body.addEventListener('click', () => { 
            if(window.AudioEngine) window.AudioEngine.init();
        }, {once:true});
        
        // ✅ UI SETUP BASED ON MODE
        // ✅ FIX: Άμεση εμφάνιση ονόματος (για να μην φαίνεται κενό μέχρι να συνδεθεί)
        if (userData.store) {
            const inpHeader = document.getElementById('inpStoreNameHeader');
            if (inpHeader) inpHeader.value = userData.store;
        }

        if (App.adminMode === 'kitchen') {
            // 👨‍🍳 KITCHEN MODE: Καθαρό περιβάλλον
            const btnNew = document.getElementById('btnNewOrderSidebar'); if(btnNew) btnNew.style.display = 'none';
            const btnMenu = document.getElementById('btnMenuToggle'); if(btnMenu) btnMenu.style.display = 'none';
            const btnSet = document.getElementById('btnSettings'); if(btnSet) btnSet.style.display = 'none';
            const btnExit = document.getElementById('btnKitchenExit'); if(btnExit) btnExit.style.display = 'flex';
            const inpHeader = document.getElementById('inpStoreNameHeader'); if(inpHeader) inpHeader.disabled = true;
            // 🔒 ΚΟΥΖΙΝΑ: Απενεργοποίηση Sidebar
            const sb = document.getElementById('orderSidebar');
            if(sb) sb.style.display = 'none';
        } else {
            // 🏪 CASHIER MODE
            const btnNew = document.getElementById('btnNewOrderSidebar'); if(btnNew) btnNew.style.display = 'flex';
            // ✅ ΤΑΜΕΙΟ: Η μπάρα υπάρχει αλλά ξεκινάει ΚΛΕΙΣΤΗ
            const sb = document.getElementById('orderSidebar');
            if(sb) { sb.style.display = 'flex'; sb.style.left = '-100%'; }
        }

        // ✅ FIX: Απόκρυψη StartScreen αν υπάρχει (για να μην μπλοκάρει τα κλικ)
        const startScreen = document.getElementById('startScreen');
        if(startScreen) startScreen.style.display = 'none';

        App.connectSocket();
        App.startHeartbeat();
        // App.requestNotifyPermission(); 
        App.checkNotificationPermission(); // ✅ UI Check

        // ✅ NEW: Detect Background/Foreground State
        document.addEventListener('visibilitychange', () => {
            if (window.socket && window.socket.connected) {
                window.socket.emit('set-user-status', document.hidden ? 'background' : 'online');
            }
        });
        
        // ✅ FIX: Close Settings on Background Click & Add Back Button
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) {
            settingsModal.addEventListener('click', (e) => {
                if (e.target === settingsModal) settingsModal.style.display = 'none';
            });
            const box = settingsModal.querySelector('.modal-box') || settingsModal.firstElementChild;
            if (box) {
                if (window.getComputedStyle(box).position === 'static') box.style.position = 'relative';
                const closeBtn = document.createElement('button');
                closeBtn.innerHTML = '✕';
                closeBtn.style.cssText = "position:absolute; top:15px; right:15px; background:transparent; border:none; color:#aaa; font-size:20px; font-weight:bold; cursor:pointer; z-index:10;";
                closeBtn.onclick = () => settingsModal.style.display = 'none';
                box.appendChild(closeBtn);
            }
        }

        setInterval(() => {
            if (Object.keys(App.tempComingState).length > 0 && App.lastStaffList.length > 0) {
                App.renderStaffList(App.lastStaffList);
            }
        }, 1000);

        // ✅ UI CUSTOMIZATIONS: Hidden Stats, Moved Auto-Reset, Renamed Plugins
        setTimeout(() => {
            // 1. Hide Stats Button & Add 5-Click Secret on Settings
            const btnStats = document.querySelector('button[onclick="App.openStatsModal()"]');
            if(btnStats) btnStats.style.display = 'none';

            const btnSet = document.getElementById('btnSettings');
            if(btnSet) {
                const originalClick = btnSet.onclick;
                let c = 0, t = null;
                btnSet.onclick = (e) => {
                    c++;
                    if(t) clearTimeout(t);
                    t = setTimeout(() => c=0, 2000);
                    if(c === 5) { 
                        e.preventDefault(); e.stopPropagation(); 
                        App.openStatsModal(); 
                        document.getElementById('settingsModal').style.display = 'none'; 
                        c=0; 
                    } else {
                        if(originalClick) originalClick.call(btnSet, e);
                    }
                };
            }

            // 3. Move Delivery Hours to Menu Editor (Top Right)
            const inpHours = document.getElementById('inpHours');
            const menuPanel = document.getElementById('menuFullPanel');
            if(inpHours && menuPanel) {
                if(inpHours.previousElementSibling && inpHours.previousElementSibling.tagName === 'LABEL') {
                    inpHours.previousElementSibling.style.display = 'none';
                }
                const wrapper = document.createElement('div');
                wrapper.style.cssText = "display:flex; align-items:center; gap:5px; margin-right:10px;";
                const lbl = document.createElement('span');
                lbl.innerText = "🕒";
                lbl.style.cssText = "font-size:10px; color:#666; font-weight:bold;";
                inpHours.style.cssText = "width:80px; padding:2px; font-size:11px; background:#111; border:1px solid #444; color:#fff; border-radius:4px; text-align:center;";
                wrapper.appendChild(lbl);
                wrapper.appendChild(inpHours);
                
                // ✅ FIX: Τοποθέτηση μέσα στα actions για να μην πέφτει πάνω στο κουμπί ΠΙΣΩ
                const headerActions = menuPanel.querySelector('.menu-header > div');
                if(headerActions) headerActions.insertBefore(wrapper, headerActions.firstChild);
            }
        }, 500);

        // ✅ Start Bot
        DNDBot.init();
        
        // ✅ Init Pay System
        PaySystem.init();

        // ✅ LOAD LANGUAGE ON INIT
        const savedLang = localStorage.getItem('bellgo_lang') || 'el';
        setLanguage(savedLang);
    },
    
    requestNotifyPermission: async () => {
        try {
            // ✅ FIX: Αποφυγή "Unwanted Notifications" - Ζητάμε άδεια ΜΟΝΟ αν είναι 'default'
            if (Notification.permission === 'default') {
                await Notification.requestPermission();
            }
            
            if (Notification.permission === "granted") {
                const registration = await navigator.serviceWorker.ready;
                const token = await getToken(messaging, { 
                    vapidKey: vapidKey, 
                    serviceWorkerRegistration: registration 
                }); 
                if (token) {
                    localStorage.setItem('fcm_token', token);
                    window.socket.emit('update-token', { token: token, username: userData.name });
                }
            }
        } catch (error) { console.error("Notification Error:", error); }
    },

    checkNotificationPermission: () => {
        if (Notification.permission === 'default') {
            const div = document.createElement('div');
            div.id = 'notifPermRequest';
            div.style.cssText = "position:fixed; bottom:20px; right:20px; width:300px; background:#333; border:1px solid #FFD700; padding:15px; z-index:10000; text-align:center; border-radius:10px; box-shadow:0 4px 15px rgba(0,0,0,0.5);";
            div.innerHTML = `
                <div style="color:white; font-weight:bold; margin-bottom:5px;">🔔 Ειδοποιήσεις Ήχου</div>
                <div style="color:#aaa; font-size:11px; margin-bottom:10px;">Απαραίτητο για να χτυπάει όταν είναι κλειστό.</div>
                <button id="btnAllowNotif" style="background:#FFD700; color:black; border:none; padding:8px 20px; border-radius:5px; font-weight:bold; cursor:pointer;">ΕΝΕΡΓΟΠΟΙΗΣΗ</button>
            `;
            document.body.appendChild(div);
            
            document.getElementById('btnAllowNotif').onclick = async () => {
                await App.requestNotifyPermission();
                document.getElementById('notifPermRequest').remove();
            };
        } else if (Notification.permission === 'granted') {
            App.requestNotifyPermission();
        }
    },

    connectSocket: () => {
        if (!window.socket) {
            window.socket = io({ transports: ['polling', 'websocket'], reconnection: true });
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

            // ✅ FIX: Περιμένουμε να ολοκληρωθεί η σύνδεση (join-store) πριν στείλουμε το Stripe ID
            // Χρησιμοποιούμε το 'menu-update' ως ένδειξη ότι ο server μας έβαλε στο δωμάτιο.
            socket.once('menu-update', () => {
                const pendingStripe = localStorage.getItem('temp_stripe_connect_id');
                if (pendingStripe) {
                    socket.emit('save-store-settings', { stripeConnectId: pendingStripe });
                    localStorage.removeItem('temp_stripe_connect_id');
                    alert("Ο λογαριασμός Stripe συνδέθηκε επιτυχώς!");
                }
                
                // ✅ NEW: Ζητάμε τις κρατήσεις μόλις συνδεθούμε (αφού μπούμε στο δωμάτιο)
                socket.emit('get-reservations');
            });
        });

        // ✅ FIX: Αν είναι ήδη συνδεδεμένο, κάνε trigger το join χειροκίνητα
        if(socket.connected) {
            socket.emit('join-store', { storeName: userData.store, username: userData.name, role: userData.role, token: localStorage.getItem('fcm_token'), isNative: !!window.Capacitor });
        }

        socket.on('disconnect', () => { 
            document.getElementById('connDot').style.background = 'red'; 
            App.hasCheckedPendingReservations = false; // ✅ Reset για να ξαναελέγξει όταν συνδεθεί
        });
        
        socket.on('menu-update', (data) => {
            try {
                if (!data || data.length === 0) {
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
                if(settings.name && inpHeader) inpHeader.value = settings.name;
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
                
                // ✅ NEW: Load E-Invoicing State
                if(settings.einvoicing && settings.einvoicing.enabled) App.einvoicingEnabled = true;
                else App.einvoicingEnabled = false;

                // ✅ NEW: Visibility of Cash Register Button
                const btnCash = document.getElementById('btnCashRegister');
                if(btnCash) btnCash.style.display = App.einvoicingEnabled ? 'flex' : 'none';
                
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
                
                // ✅ NEW: Load POS Settings
                if(settings.pos) {
                    document.getElementById('inpPosProvider').value = settings.pos.provider || '';
                    document.getElementById('inpPosId').value = settings.pos.id || '';
                    document.getElementById('inpPosKey').value = settings.pos.key || '';
                }

                const statusEl = document.getElementById('stripeStatus');
                if (settings.stripeConnectId) {
                    statusEl.innerHTML = "✅ <b>Συνδεδεμένο!</b> ID: " + settings.stripeConnectId;
                    statusEl.style.color = "#00E676";
                } else {
                    statusEl.innerText = "Μη συνδεδεμένο";
                    statusEl.style.color = "#aaa";
                }
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

        // ✅ NEW: Listen for Quick Order Print (PASO)
        socket.on('print-quick-order', (data) => {
            if (!App.printerEnabled) return; // ✅ Check setting
            const mockOrder = { id: data.id, text: data.text, from: 'PASO' };
            if (data.signature) mockOrder.text += `\n\nSIGNATURE: ${data.signature}`;
            // Print immediately
            App.printOrder(null, mockOrder);
        });

        // ✅ IMMEDIATE STATUS CHANGE (Fixes delays)
        socket.on('order-changed', (data) => {
            const existing = App.activeOrders.find(o => o.id == data.id);
            if (existing) {
                existing.status = data.status;
                if (data.startTime) existing.startTime = data.startTime;
                App.renderDesktopIcons(App.activeOrders);
                
                // ✅ AUTO PRINT: Τυπώνει αυτόματα μόλις γίνει ΑΠΟΔΟΧΗ (Cooking)
                if (App.autoPrint && data.status === 'cooking') {
                    App.printOrder(data.id);
                }
            }
        });

        socket.on('ring-bell', (data) => {
            if(window.AudioEngine) window.AudioEngine.triggerAlarm(data ? data.source : null);
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
    },
    
    saveStoreName: () => {
        const newName = document.getElementById('inpStoreNameHeader').value.trim();
        if(newName) window.socket.emit('save-store-name', newName);
    },

    toggleStatus: (type) => {
        const isOpen = (type === 'customer') 
            ? document.getElementById('switchCust').checked 
            : document.getElementById('switchStaff').checked;
        window.socket.emit('toggle-status', { type: type, isOpen: isOpen });
    },

    // ✅ NEW: Toggle Staff Charge directly
    toggleStaffCharge: (isChecked) => {
        window.socket.emit('save-store-settings', { staffCharge: isChecked });
    },

    acceptAlarm: () => {
        if(window.AudioEngine) window.AudioEngine.stopAlarm();
        window.socket.emit('admin-stop-ringing'); 
    },

    togglePresetPanel: () => {
        const p = document.getElementById('presetPanel');
        if(p) p.style.display = (p.style.display === 'none' ? 'block' : 'none');
    },

    toggleMenuMode: () => {
        const panel = document.getElementById('menuFullPanel');
        const btn = document.getElementById('btnMenuToggle');
        if (panel.style.display === 'flex') {
            panel.style.display = 'none';
            btn.classList.remove('menu-active');
        } else {
            panel.style.display = 'flex';
            btn.classList.add('menu-active');
        }
    },
    
    toggleStaffPanel: () => {
        const el = document.getElementById('staffContainer');
        const icon = document.getElementById('staffToggleIcon');
        if (el.classList.contains('minimized')) {
            el.classList.remove('minimized');
            icon.innerText = "▼";
            icon.style.transform = "rotate(0deg)";
        } else {
            el.classList.add('minimized');
            icon.innerText = "▲";
            icon.style.transform = "rotate(180deg)";
        }
    },

    // --- MODALS ---
    openPinModal: () => {
        document.getElementById('settingsModal').style.display = 'none'; 
        pinValue = '';
        PIN.updateDisplay();
        document.getElementById('pinChangeModal').style.display = 'flex';
    },
    closePinModal: () => { 
        document.getElementById('pinChangeModal').style.display = 'none'; 
        document.getElementById('settingsModal').style.display = 'flex'; 
    },
    openSettingsModal: () => { 
        document.getElementById('settingsModal').style.display = 'flex';
        App.closeSettingsSub(); // Reset to main view
    },
    
    openSettingsSub: (id) => {
        document.getElementById('settingsMain').style.display = 'none';
        document.querySelectorAll('.settings-sub').forEach(el => el.style.display = 'none');
        const target = document.getElementById(id);
        if(target) target.style.display = 'block';
    },

    closeSettingsSub: () => {
        document.querySelectorAll('.settings-sub').forEach(el => el.style.display = 'none');
        const main = document.getElementById('settingsMain');
        if(main) main.style.display = 'block';
    },
    
    autoSaveSettings: () => {
        const time = document.getElementById('inpResetTime').value;
        const hours = document.getElementById('inpHours').value;
        const cp = document.getElementById('inpCoverPrice').value;
        const gmaps = document.getElementById('inpGoogleMaps').value.trim();
        const ap = document.getElementById('selAutoPrint').value === 'true';
        const acp = document.getElementById('switchAutoClosePrint').checked;
        const pe = document.getElementById('switchPrinterEnabled').checked; // ✅ NEW
        const sc = document.getElementById('switchStaffCharge').checked; // ✅ Save Staff Charge
        const resEnabled = document.getElementById('switchReservations').checked; // ✅ NEW
        const totalTables = document.getElementById('inpTotalTables').value; // ✅ NEW
        
        // ✅ NEW: POS Settings
        const posData = {
            provider: document.getElementById('inpPosProvider').value,
            id: document.getElementById('inpPosId').value,
            key: document.getElementById('inpPosKey').value
        };

        window.socket.emit('save-store-settings', { resetTime: time, hours: hours, coverPrice: cp, googleMapsUrl: gmaps, autoPrint: ap, autoClosePrint: acp, printerEnabled: pe, staffCharge: sc, reservationsEnabled: resEnabled, totalTables: totalTables, pos: posData });
    },
    saveSettings: () => {
        App.autoSaveSettings();
        document.getElementById('settingsModal').style.display = 'none';
    },

    openScheduleModal: () => {
        document.getElementById('settingsModal').style.display = 'none';
        const days = ['Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο', 'Κυριακή'];
        const container = document.getElementById('weekDaysContainer');
        container.innerHTML = '';
        days.forEach(day => {
            const row = document.createElement('div');
            row.className = 'day-row';
            const val = App.scheduleData[day] || '';
            row.innerHTML = `<span class="day-label">${day.substring(0,3)}</span>
                             <input type="text" class="day-input" data-day="${day}" value="${val}" placeholder="π.χ. 18:00 - 23:00">`;
            container.appendChild(row);
        });
        document.getElementById('scheduleModal').style.display = 'flex';
    },
    saveSchedule: () => {
        const inputs = document.querySelectorAll('.day-input');
        let newSched = {};
        inputs.forEach(inp => { newSched[inp.dataset.day] = inp.value; });
        App.scheduleData = newSched;
        window.socket.emit('save-store-settings', { schedule: newSched });
        document.getElementById('scheduleModal').style.display = 'none';
        document.getElementById('settingsModal').style.display = 'flex';
    },

    // --- EXPENSES LOGIC ---
    openExpensesModal: () => {
        document.getElementById('expensesModal').style.display = 'flex';
        App.renderExpensePresets();
        App.renderFixedExpenses(); // ✅ Render Fixed
        // Load today's expenses from cached stats if available
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });
        const [year, month, day] = dateStr.split('-');
        const monthKey = `${year}-${month}`;
        
        let currentText = "";
        if (App.cachedStats && App.cachedStats[monthKey] && App.cachedStats[monthKey].days[day] && App.cachedStats[monthKey].days[day].expenses) {
            currentText = App.cachedStats[monthKey].days[day].expenses.text || "";
        }
        document.getElementById('txtExpenses').value = currentText;
        // ✅ Load Wages
        let currentWages = 0;
        if (App.cachedStats && App.cachedStats[monthKey] && App.cachedStats[monthKey].days[day] && App.cachedStats[monthKey].days[day].expenses) {
            currentWages = App.cachedStats[monthKey].days[day].expenses.wages || 0;
        }
        document.getElementById('inpWages').value = currentWages > 0 ? currentWages : '';

        App.calcExpensesTotal();

        // ✅ NEW: Writing Mode Logic (Auto-Focus & Layout Shift)
        const txt = document.getElementById('txtExpenses');
        const modal = document.getElementById('expensesModal');
        if (!txt.dataset.hasListeners) {
            txt.dataset.hasListeners = "true";
            txt.addEventListener('focus', () => { modal.classList.add('writing-mode'); });
            txt.addEventListener('blur', () => { setTimeout(() => modal.classList.remove('writing-mode'), 150); });
        }
    },
    
    // ✅ NEW: FIXED EXPENSES LOGIC
    renderFixedExpenses: () => {
        const container = document.getElementById('fixedExpensesContainer');
        container.innerHTML = '';
        (App.fixedExpenses || []).forEach((fixed, idx) => {
            const btn = document.createElement('div');
            btn.style.cssText = "background:#444; color:#FFD700; padding:5px 10px; border-radius:15px; font-size:12px; display:flex; align-items:center; gap:5px; border:1px solid #FFD700;";
            btn.innerHTML = `<span>${fixed.name}: <b>${fixed.price.toFixed(2)}€</b></span> <span style="color:#FF5252; font-weight:bold; font-size:10px; cursor:pointer;">✕</span>`;
            
            // Click on X -> Remove
            btn.children[1].onclick = (e) => {
                if(confirm("Διαγραφή πάγιου εξόδου;")) {
                    App.fixedExpenses.splice(idx, 1);
                    window.socket.emit('save-store-settings', { fixedExpenses: App.fixedExpenses });
                    App.renderFixedExpenses();
                    App.calcExpensesTotal();
                }
            };
            container.appendChild(btn);
        });
    },

    addFixedExpense: () => {
        const name = document.getElementById('inpFixedName').value.trim();
        const price = parseFloat(document.getElementById('inpFixedPrice').value);
        if(!name || isNaN(price)) return alert("Συμπληρώστε όνομα και τιμή!");
        
        if(!App.fixedExpenses) App.fixedExpenses = [];
        App.fixedExpenses.push({ name, price });
        
        window.socket.emit('save-store-settings', { fixedExpenses: App.fixedExpenses });
        
        document.getElementById('inpFixedName').value = '';
        document.getElementById('inpFixedPrice').value = '';
        App.renderFixedExpenses();
        App.calcExpensesTotal();
    },

    renderExpensePresets: () => {
        const container = document.getElementById('expensePresetsContainer');
        container.innerHTML = '';
        (App.expensePresets || []).forEach((preset, idx) => {
            const btn = document.createElement('div');
            btn.style.cssText = "background:#333; color:white; padding:5px 10px; border-radius:15px; font-size:12px; cursor:pointer; display:flex; align-items:center; gap:5px; border:1px solid #555;";
            
            // Handle old string presets vs new object presets
            let name = preset;
            let price = null;
            if(typeof preset === 'object') { name = preset.name; price = preset.price; }
            
            btn.innerHTML = `<span>${name}${price ? ` (${price}€)` : ''}</span> <span style="color:#FF5252; font-weight:bold; font-size:10px;">✕</span>`;
            
            // Click on text -> Add to textarea
            btn.onclick = (e) => {
                const txt = document.getElementById('txtExpenses');
                const lineToAdd = price ? `${name} . ${price}` : `${name} . `;
                txt.value += (txt.value ? '\n' : '') + lineToAdd;
                App.calcExpensesTotal();
            };
            
            // Click on X -> Remove preset
            btn.children[1].onclick = (e) => {
                e.stopPropagation();
                if(confirm("Διαγραφή παγίου;")) {
                    App.expensePresets.splice(idx, 1);
                    window.socket.emit('save-store-settings', { expensePresets: App.expensePresets }); // ✅ Save on delete
                    App.renderExpensePresets();
                }
            };
            container.appendChild(btn);
        });
    },
    
    addExpensePreset: () => {
        const val = document.getElementById('inpNewPreset').value.trim();
        const price = parseFloat(document.getElementById('inpNewPresetPrice').value);
        if(!val) return;
        
        if(!App.expensePresets) App.expensePresets = [];
        
        if(!isNaN(price) && price > 0) {
            App.expensePresets.push({ name: val, price: price });
        } else {
            App.expensePresets.push(val); // Backwards compatibility for string-only
        }
        
        window.socket.emit('save-store-settings', { expensePresets: App.expensePresets }); // ✅ Save on add
        
        document.getElementById('inpNewPreset').value = '';
        document.getElementById('inpNewPresetPrice').value = '';
        App.renderExpensePresets();
    },
    
    calcExpensesTotal: () => {
        let total = 0;
        
        // 1. Add Fixed Expenses
        if(App.fixedExpenses) {
            App.fixedExpenses.forEach(f => total += (f.price || 0));
        }

        // 2. Add Wages (Merokamata)
        const wages = parseFloat(document.getElementById('inpWages').value) || 0;
        total += wages;

        // 3. Add Textarea Expenses
        const txt = document.getElementById('txtExpenses').value;
        txt.split('\n').forEach(line => {
            // ✅ FIX: Support for comma decimals and various separators
            // Regex looks for a number at the end of the line (e.g. "Item . 2,50" or "Item 2.50")
            const match = line.match(/[\d,.]+$/);
            if(match) {
                let numStr = match[0];

                // ✅ FIX: Έλεγχος αν η τελεία/κόμμα στην αρχή είναι διαχωριστικό
                if (numStr.startsWith('.') || numStr.startsWith(',')) {
                    // 1. Αν υπάρχει κι άλλη τελεία/κόμμα μέσα (π.χ. .2.50 ή .2,50), τότε το πρώτο είναι σίγουρα διαχωριστικό
                    if (numStr.slice(1).match(/[.,]/)) {
                        numStr = numStr.substring(1);
                    }
                    // 2. Αν είναι κολλημένο σε λέξη (π.χ. "Ψωμί.2"), τότε το θεωρούμε διαχωριστικό και όχι υποδιαστολή
                    else if (match.index > 0 && line[match.index - 1].trim() !== '') {
                        numStr = numStr.substring(1);
                    }
                }

                // Replace comma with dot for JS parsing
                numStr = numStr.replace(/,/g, '.');
                const val = parseFloat(numStr);
                if(!isNaN(val)) total += val;
            }
        });
        document.getElementById('expensesTotal').innerText = total.toFixed(2) + '€';
        return total;
    },
    
    saveExpenses: () => {
        const total = App.calcExpensesTotal();
        const text = document.getElementById('txtExpenses').value;
        const wages = parseFloat(document.getElementById('inpWages').value) || 0;
        // Note: Presets and Fixed are saved via save-store-settings now.
        // We only send the daily text and total here.
        window.socket.emit('save-expenses', { text: text, total: total, wages: wages });
        document.getElementById('expensesModal').style.display = 'none';
        alert("Αποθηκεύτηκε!");
    },

    // --- TEMPLATE LOGIC ---
    applyPresetMenu: () => {
        // ✅ FIX: Έλεγχος και από το Panel και από τα Settings
        let type = document.getElementById('selShopTypePanel').value;
        if (!type) type = document.getElementById('selShopType').value;

        if (!type) return alert("Παρακαλώ επιλέξτε είδος καταστήματος!");
        if (!confirm("ΠΡΟΣΟΧΗ: Αυτό θα αντικαταστήσει το υπάρχον μενού. Συνέχεια;")) return;
        
        const newMenu = JSON.parse(JSON.stringify(PRESET_MENUS[type]));
        App.menuData = newMenu;
        window.socket.emit('save-menu', { menu: newMenu, mode: 'permanent' });
        App.renderMenu();
        alert("Το μενού φορτώθηκε επιτυχώς!");
        document.getElementById('settingsModal').style.display = 'none';
    },

    showLink: () => {
        document.getElementById('settingsModal').style.display = 'none'; 
        const el = document.getElementById('qrOverlay');
        const linkEl = document.getElementById('storeLink');
        const qrEl = document.getElementById('qrcode');
        const baseUrl = window.location.origin;
        const customName = document.getElementById('inpStoreNameHeader').value.trim();
        
        // 🔥 FIX: Χρήση του userData.store (email/room ID) για να συνδέονται στο ίδιο δωμάτιο
        let fullLink = `${baseUrl}/shop/${encodeURIComponent(userData.store)}/`;
        if(customName) fullLink += `&name=${encodeURIComponent(customName)}`;
        
        linkEl.href = fullLink;
        linkEl.innerText = fullLink;
        qrEl.innerHTML = "";
        new QRCode(qrEl, { text: fullLink, width: 200, height: 200 });
        el.style.display = 'flex';
    },

    handlePlusButton: () => {
        if (App.currentCategoryIndex === null) {
            let order = prompt("Αριθμός Σειράς (π.χ. 1, 2):");
            if(!order) return;
            let name = prompt("Όνομα Κατηγορίας (π.χ. ΚΑΦΕΔΕΣ):");
            if(!name) return;
            App.pendingAction = () => {
                App.menuData.push({ id: Date.now(), order: parseInt(order) || 99, name: name.toUpperCase(), items: [] });
            };
            App.openSaveModal(); 
        } else {
            App.addItemInput('');
        }
    },

    renderMenu: () => {
        const container = document.getElementById('menuInputContainer');
        container.innerHTML = '';
        App.menuData.sort((a,b) => a.order - b.order);
        if (App.currentCategoryIndex === null) {
            document.getElementById('btnBackCat').style.display = 'none';
            App.menuData.forEach((cat, index) => {
                const div = document.createElement('div');
                div.className = 'category-box';
                div.innerHTML = `<span class="category-order">${cat.order}</span>${cat.name}`;
                const delBtn = document.createElement('button');
                delBtn.className = 'btn-delete-cat';
                delBtn.innerText = 'X';
                delBtn.onclick = (e) => {
                    e.stopPropagation();
                    App.pendingAction = () => { App.menuData.splice(index, 1); };
                    App.openSaveModal();
                };
                div.appendChild(delBtn);
                div.onclick = () => { App.currentCategoryIndex = index; App.renderMenu(); };
                container.appendChild(div);
            });
        } else {
            const cat = App.menuData[App.currentCategoryIndex];
            if(!cat) { App.currentCategoryIndex = null; App.renderMenu(); return; }
            document.getElementById('btnBackCat').style.display = 'block';
            cat.items.forEach((item, itemIdx) => { App.addItemInput(item, itemIdx); });
        }
    },

    addItemInput: (val, index = null) => {
        const container = document.getElementById('menuInputContainer');
        const wrapper = document.createElement('div');
        wrapper.className = 'item-wrapper';
        
        // Determine display values
        let displayText = "";
        let itemObj = null;

        if (typeof val === 'object' && val !== null) {
            itemObj = val;
            displayText = `${itemObj.name}:${itemObj.price}`;
        } else {
            displayText = val; // Assuming string "Name:Price"
        }

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'menu-input-box';
        input.value = displayText;
        input.placeholder = "Προϊόν:Τιμή"; 

        // ✅ NEW: VAT INPUT (Κουτάκι ΦΠΑ)
        const vatInput = document.createElement('input');
        vatInput.type = 'number';
        vatInput.placeholder = 'ΦΠΑ';
        
        // ✅ FIX: Show only if E-Invoicing is enabled
        const vatDisplay = App.einvoicingEnabled ? 'inline-block' : 'none';
        vatInput.style.cssText = `width:50px; padding:10px; margin-left:5px; background:#222; border:1px solid #444; color:#fff; border-radius:4px; text-align:center; font-size:14px; display:${vatDisplay};`;
        
        if (itemObj && itemObj.vat !== undefined) {
            vatInput.value = itemObj.vat;
        } else {
            vatInput.value = 24; // Default
        }
        
        // EXTRAS BUTTON
        const extrasBtn = document.createElement('button');
        extrasBtn.className = 'btn-item-extras';
        extrasBtn.innerHTML = '+';
        if (itemObj && itemObj.extras && itemObj.extras.length > 0) {
            extrasBtn.classList.add('has-extras');
        }
        extrasBtn.onclick = () => { App.openExtrasModal(App.currentCategoryIndex, index); };

        const delBtn = document.createElement('button');
        delBtn.className = 'btn-item-del';
        delBtn.innerText = 'X';
        delBtn.onclick = () => {
            wrapper.remove();
            App.pendingAction = () => {
                const cat = App.menuData[App.currentCategoryIndex];
                if (index !== null) cat.items.splice(index, 1);
            };
            App.openSaveModal();
        };
        
        // ✅ NEW: Unified Update Logic (Handles both Name/Price and VAT)
        const updateItem = (e) => {
            if (e.relatedTarget === input || e.relatedTarget === vatInput) return; // Ignore internal focus change

            const newVal = input.value.trim();
            if (!newVal) return;
            
            const cat = App.menuData[App.currentCategoryIndex];
            
            // Parse Name:Price
            const parts = newVal.split(':');
            let price = 0; 
            let name = newVal;
            if(parts.length > 1) {
                 name = parts.slice(0, -1).join(':').trim();
                 price = parseFloat(parts[parts.length-1]) || 0;
            }
            
            const vat = parseInt(vatInput.value) || 24;

            // Preserve existing object structure if it exists
            let newItem;
            if (index !== null && typeof cat.items[index] === 'object') {
                newItem = { ...cat.items[index], name: name, price: price, vat: vat };
            } else {
                newItem = { name: name, price: price, vat: vat, extras: [] };
            }

            App.pendingAction = () => {
                if(index === null) cat.items.push(newItem); 
                else cat.items[index] = newItem;
            };
            App.openSaveModal();
        };
        
        input.addEventListener('blur', updateItem);
        vatInput.addEventListener('blur', updateItem);
        
        wrapper.appendChild(input);
        wrapper.appendChild(vatInput); // ✅ Add VAT Input to DOM
        wrapper.appendChild(extrasBtn);
        if (index !== null) wrapper.appendChild(delBtn); 
        container.appendChild(wrapper);
        if(index === null) input.focus();
    },
    
    // --- EXTRAS LOGIC ---
    openExtrasModal: (catIdx, itemIdx) => {
        if (itemIdx === null) return alert("Αποθηκεύστε πρώτα το προϊόν!");
        App.currentExtrasCatIndex = catIdx;
        App.currentExtrasItemIndex = itemIdx;
        
        const item = App.menuData[catIdx].items[itemIdx];
        // Ensure item is an object
        if (typeof item === 'string') {
            const parts = item.split(':');
            let p = 0, n = item;
            if(parts.length > 1) { n = parts.slice(0,-1).join(':'); p = parseFloat(parts[parts.length-1])||0; }
            App.tempExtras = []; // No extras yet
        } else {
            App.tempExtras = JSON.parse(JSON.stringify(item.extras || []));
        }

        document.getElementById('extrasModalTitle').innerText = "EXTRAS: " + (typeof item==='string'?item.split(':')[0]:item.name);
        App.renderExtrasList();
        document.getElementById('extrasModal').style.display = 'flex';
    },

    renderExtrasList: () => {
        const container = document.getElementById('extrasListContainer');
        container.innerHTML = '';
        App.tempExtras.forEach((ex, idx) => {
            const div = document.createElement('div');
            div.className = 'extra-item-row';
            div.innerHTML = `<span>${ex.name} ${ex.price>0 ? `(+${ex.price}€)`:''}</span>
                             <button class="btn-del-extra" onclick="App.removeExtra(${idx})">X</button>`;
            container.appendChild(div);
        });
    },

    addExtraRow: () => {
        const name = document.getElementById('inpExtraName').value.trim();
        const price = parseFloat(document.getElementById('inpExtraPrice').value) || 0;
        if(!name) return;
        App.tempExtras.push({ name, price });
        document.getElementById('inpExtraName').value = '';
        document.getElementById('inpExtraPrice').value = '';
        App.renderExtrasList();
    },

    removeExtra: (idx) => {
        App.tempExtras.splice(idx, 1);
        App.renderExtrasList();
    },

    saveExtras: () => {
        const catIdx = App.currentExtrasCatIndex;
        const itemIdx = App.currentExtrasItemIndex;
        const item = App.menuData[catIdx].items[itemIdx];
        
        // Convert string item to object if needed
        if (typeof item === 'string') {
            const parts = item.split(':');
            let p = 0, n = item;
            if(parts.length > 1) { n = parts.slice(0,-1).join(':'); p = parseFloat(parts[parts.length-1])||0; }
            App.menuData[catIdx].items[itemIdx] = { name: n, price: p, extras: App.tempExtras };
        } else {
            App.menuData[catIdx].items[itemIdx].extras = App.tempExtras;
        }
        
        App.executeSave('permanent'); // Auto save immediately
        document.getElementById('extrasModal').style.display = 'none';
    },

    goBackToCategories: () => { App.currentCategoryIndex = null; App.renderMenu(); },
    openSaveModal: () => { document.getElementById('saveModeModal').style.display = 'flex'; },
    
    executeSave: (mode) => {
        if (App.pendingAction) { App.pendingAction(); App.pendingAction = null; }
        // Clean empty items
        App.menuData.forEach(cat => { 
            cat.items = cat.items.filter(i => {
                if(typeof i === 'string') return i.trim() !== '';
                return i.name && i.name.trim() !== '';
            }); 
        });
        window.socket.emit('save-menu', { menu: App.menuData, mode: mode });
        document.getElementById('saveModeModal').style.display = 'none';
        App.renderMenu(); 
    },

    // --- SIDEBAR ORDER LOGIC (CASHIER) ---
    toggleOrderSidebar: () => {
        const sb = document.getElementById('orderSidebar');
        // Ελέγχουμε αν είναι ανοιχτό (0px) ή κλειστό (-100%) με βάση το LEFT
        const currentLeft = sb.style.left;
        const isOpen = currentLeft === '0px' || currentLeft === '0';
        
        if (isOpen) {
            sb.style.left = '-100%';
        } else {
            sb.style.left = '0px';
            App.renderSidebarMenu();
        }
    },
    
    // ✅ FIX: Διόρθωση της συνάρτησης που ήταν κομμένη
    setSidebarMode: (mode) => {
        App.sidebarMode = mode;
        
        // Reset Buttons
        const btnPaso = document.getElementById('btnModePaso');
        const btnTable = document.getElementById('btnModeTable');
        const btnDel = document.getElementById('btnModeDelivery');
        
        if(btnPaso) { btnPaso.style.background = '#333'; btnPaso.style.color = 'white'; }
        if(btnTable) { btnTable.style.background = '#333'; btnTable.style.color = 'white'; }
        if(btnDel) { btnDel.style.background = '#333'; btnDel.style.color = 'white'; }
        
        // Hide All Inputs
        const divTable = document.getElementById('divTableInputs');
        const divDel = document.getElementById('divDeliveryInputs');
        if(divTable) divTable.style.display = 'none';
        if(divDel) divDel.style.display = 'none';

        // Activate Selected
        const activeBtn = document.getElementById(mode === 'paso' ? 'btnModePaso' : mode === 'table' ? 'btnModeTable' : 'btnModeDelivery');
        if(activeBtn) {
            activeBtn.style.background = '#FFD700';
            activeBtn.style.color = 'black';
        }

        if (mode === 'table' && divTable) { 
            divTable.style.display = 'flex'; 
            setTimeout(()=> { const el = document.getElementById('sidebarTable'); if(el) el.focus(); }, 100); 
        }
        if (mode === 'delivery' && divDel) { 
            divDel.style.display = 'flex'; 
            setTimeout(()=> { const el = document.getElementById('sidebarDelName'); if(el) el.focus(); }, 100); 
        }
    },
    renderSidebarMenu: () => {
        const container = document.getElementById('sidebarMenuContainer');
        container.innerHTML = '';
        App.menuData.forEach(cat => {
            const title = document.createElement('div');
            title.className = 'category-title';
            title.innerText = cat.name;
            const itemsDiv = document.createElement('div');
            itemsDiv.className = 'category-items';
            cat.items.forEach(item => {
                let name = item, price = 0;
                if(typeof item === 'object') { name = item.name; price = item.price; }
                else { const p = item.split(':'); name = p[0]; if(p.length>1) price=parseFloat(p[p.length-1]); }
                
                const box = document.createElement('div');
                box.className = 'item-box';
                box.innerHTML = `<span class="item-name">${name}</span>${price>0?`<span class="item-price">${price}€</span>`:''}`;
                box.onclick = () => App.addToSidebarOrder(name, price);
                itemsDiv.appendChild(box);
            });
            container.appendChild(title);
            container.appendChild(itemsDiv);
        });
    },
    addToSidebarOrder: (name, price) => {
        const txt = document.getElementById('sidebarOrderText');
        const line = price > 0 ? `${name}:${price}` : name;
        txt.value += (txt.value ? '\n' : '') + `1 ${line}`;
        App.calcSidebarTotal();
    },
    calcSidebarTotal: () => {
        const txt = document.getElementById('sidebarOrderText').value;
        const total = calculateTotal(txt);
        document.getElementById('sidebarTotal').innerText = `ΣΥΝΟΛΟ: ${total.toFixed(2)}€`;
    },
    sendSidebarOrder: () => {
        const txt = document.getElementById('sidebarOrderText').value.trim();
        if(!txt) return alert("Κενή παραγγελία");
        
        // ✅ NEW: PASO LOGIC (Quick Checkout)
        if (App.sidebarMode === 'paso') {
            App.openPasoCheckout(txt);
            return;
        }
        
        let header = "";
        let finalBody = txt;

        if (App.sidebarMode === 'paso') {
            header = "[PASO]";
        } else if (App.sidebarMode === 'table') {
            const table = document.getElementById('sidebarTable').value;
            const covers = parseInt(document.getElementById('sidebarCovers').value) || 0;
            if (!table) return alert("Παρακαλώ βάλτε τραπέζι ή επιλέξτε PASO.");
            header = `[ΤΡ: ${table}]`;
            if (covers > 0) {
                header += ` [AT: ${covers}]`;
                if (App.coverPrice > 0) {
                    finalBody += `\n${covers} ΚΟΥΒΕΡ:${(covers * App.coverPrice).toFixed(2)}`;
                }
            }
        } else if (App.sidebarMode === 'delivery') {
            const name = document.getElementById('sidebarDelName').value.trim();
            const addr = document.getElementById('sidebarDelAddr').value.trim();
            const floor = document.getElementById('sidebarDelFloor').value.trim();
            const phone = document.getElementById('sidebarDelPhone').value.trim();
            const zip = document.getElementById('sidebarDelZip').value.trim();
            if(!name || !addr || !phone) return alert("Συμπληρώστε τα στοιχεία Delivery!");
            header = `[DELIVERY 🛵]\n👤 ${name}\n📍 ${addr}\n📮 T.K.: ${zip || '-'}\n🏢 ${floor || '-'}\n📞 ${phone}\n💵 ΜΕΤΡΗΤΑ`;
        }
        
        const separator = App.sidebarMode === 'delivery' ? '\n---\n' : '\n';
        window.socket.emit('new-order', `${header}${separator}${finalBody}`);
        
        alert("Εστάλη!");
        document.getElementById('sidebarOrderText').value = '';
        if(document.getElementById('sidebarTable')) document.getElementById('sidebarTable').value = '';
        if(document.getElementById('sidebarCovers')) document.getElementById('sidebarCovers').value = '';
        if(document.getElementById('sidebarDelName')) document.getElementById('sidebarDelName').value = '';
        if(document.getElementById('sidebarDelAddr')) document.getElementById('sidebarDelAddr').value = '';
        if(document.getElementById('sidebarDelFloor')) document.getElementById('sidebarDelFloor').value = '';
        if(document.getElementById('sidebarDelPhone')) document.getElementById('sidebarDelPhone').value = '';
        if(document.getElementById('sidebarDelZip')) document.getElementById('sidebarDelZip').value = '';
        App.toggleOrderSidebar(); // Close
    },

    // ✅ NEW: PASO CHECKOUT FUNCTIONS
    openPasoCheckout: (text) => {
        App.tempPasoText = text;
        const total = calculateTotal(text);
        document.getElementById('pasoTotal').innerText = total.toFixed(2) + '€';
        
        const divEinv = document.getElementById('pasoEinvoicingOptions');
        const divSimple = document.getElementById('pasoSimpleOptions');
        
        // ✅ NEW: Update Button Text based on printerEnabled
        const btnClose = document.getElementById('btnPasoClosePrint');
        if(btnClose) {
            btnClose.innerText = App.printerEnabled ? "💵 ΚΛΕΙΣΙΜΟ & ΕΚΤΥΠΩΣΗ" : "💵 ΚΛΕΙΣΙΜΟ";
        }

        // Show options based on E-Invoicing setting
        if (App.einvoicingEnabled) {
            divEinv.style.display = 'grid';
            divSimple.style.display = 'none';
        } else {
            divEinv.style.display = 'none';
            divSimple.style.display = 'flex';
        }
        
        document.getElementById('pasoCheckoutModal').style.display = 'flex';
    },

    processPasoOrder: (method, type) => { // type: 'receipt', 'simple', 'qr'
        const text = App.tempPasoText;
        const total = calculateTotal(text);
        
        if (type === 'qr') {
             // Open QR Modal logic
             // We use a temporary ID for the QR
             const tempId = Date.now();
             App.openQrPayment(tempId, true); // true = isPaso
             // We don't close the modal yet, waiting for QR scan or manual close
             return;
        }

        // Send to server for recording (Stats) & Printing
        window.socket.emit('quick-order', {
            text: text,
            total: total,
            method: method, // 'cash', 'card'
            issueReceipt: (type === 'receipt')
        });
        
        document.getElementById('pasoCheckoutModal').style.display = 'none';
        App.toggleOrderSidebar(); // Close sidebar
        document.getElementById('sidebarOrderText').value = '';
    },

    renderDesktopIcons: (orders) => {
        const desktop = document.getElementById('desktopArea');
        desktop.innerHTML = '';
        orders.forEach(order => {
            // ✅ NEW: Kitchen Mode - Hide Ready/Completed orders (Φεύγουν από την οθόνη της κουζίνας)
            if (App.adminMode === 'kitchen' && (order.status === 'ready' || order.status === 'completed')) return;

            // ✅ NEW: Waiter Mode - Hide Delivery Orders (Only Tables)
            if (userData.role === 'waiter' && order.text.includes('[DELIVERY')) return;

            const time = new Date(order.id).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            let style = '';
            const isPaid = order.text.includes('PAID');
            
            // ✅ NEW: Ανίχνευση Τραπεζιού για Label
            let displayLabel = order.from;
            const tableMatch = order.text.match(/\[ΤΡ:\s*([^|\]]+)/);
            if (tableMatch) {
                displayLabel = `Τραπέζι ${tableMatch[1]}`;
            }

            const icon = document.createElement('div');
            icon.className = `order-folder ${order.status === 'pending' ? 'ringing' : ''}`;
            // ✅ Apply Cooking style
            if (order.status === 'cooking') icon.classList.add('cooking');
            // ✅ Apply Paid style
            if (isPaid) icon.style.border = "2px solid #00E676";
            
            icon.style = style;
            icon.innerHTML = `<div class="folder-icon">${isPaid ? '✅' : '📂'}</div><div class="folder-label">${displayLabel}</div><div class="folder-time">${time}</div>`;
            icon.onclick = () => App.openOrderWindow(order);
            desktop.appendChild(icon);
        });
    },
    openOrderWindow: (order) => {
        if(window.AudioEngine) window.AudioEngine.stopAlarm();
        window.socket.emit('admin-stop-ringing'); 

        let win = document.getElementById(`win-${order.id}`);
        if (!win) {
            win = document.createElement('div');
            win.className = 'order-window';
            win.id = `win-${order.id}`;
            document.getElementById('windowsContainer').appendChild(win);
        }
        
        // ✅ Add Time Info
        let timeInfo = `<div style="font-size:12px; color:#aaa; margin-top:5px;">Λήψη: ${new Date(order.id).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>`;
        if(order.startTime) {
            timeInfo += `<div style="font-size:12px; color:#FFD700; font-weight:bold;">Έναρξη: ${new Date(order.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>`;
        }

        // ✅ NEW: Parse Items for Partial Payment (Cash/Card)
        let infoText = "";
        const allLines = order.text.split('\n');
        let startIndex = 0;
        
        if (order.text.includes("---")) {
            const parts = order.text.split("---");
            infoText = parts[0].replace(/\n/g, '<br>').trim();
            startIndex = allLines.findIndex(l => l.includes("---")) + 1;
        }

        let displayItems = '';
        for (let i = startIndex; i < allLines.length; i++) {
            const line = allLines[i];
            if (!line.trim()) continue;
            
            const isPaidCash = line.includes('✅ 💶');
            const isPaidCard = line.includes('✅ 💳');
            const isPaid = line.includes('✅');
            
            const cleanLine = line.replace(/ ✅ 💶| ✅ 💳| ✅/g, '');
            
            // ✅ FIX: Καθαρός κώδικας για κουμπιά (Φωτεινά by default, αχνά αν επιλέχθηκε το άλλο)
            const btnCash = `<button onclick="App.payItemPartial(${order.id}, ${i}, 'cash')" style="background:transparent; border:none; cursor:pointer; font-size:18px; margin-left:5px; opacity:${isPaidCard ? '0.3' : '1'}; filter:${isPaidCard ? 'grayscale(1)' : 'none'};" title="Μετρητά">💶</button>`;
            const btnCard = `<button onclick="App.payItemPartial(${order.id}, ${i}, 'card')" style="background:transparent; border:none; cursor:pointer; font-size:18px; margin-left:5px; opacity:${isPaidCash ? '0.3' : '1'}; filter:${isPaidCash ? 'grayscale(1)' : 'none'};" title="Κάρτα">💳</button>`;

            displayItems += `<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #333; padding:5px 0;">
                                <span style="color:${isPaid ? '#00E676' : 'white'};">${cleanLine}</span>
                                <div style="white-space:nowrap;">${btnCash}${btnCard}</div>
                             </div>`;
        }

        const total = calculateTotal(order.text);
        let actions = '';
        let treatBtn = ''; // ✅ Κουμπί Κεράσματος για το Header
        let receiptBtn = ''; // ✅ NEW: Κουμπί Απόδειξης

        // ✅ NEW: E-Invoicing Button Logic
        if (App.einvoicingEnabled) {
            const hasReceipt = order.text.includes('[🧾 ΑΠΟΔΕΙΞΗ]');
            const btnColor = hasReceipt ? '#00E676' : '#FF9800';
            receiptBtn = `<button class="win-btn-top" style="background:transparent; border:1px solid ${btnColor}; color:${btnColor}; padding:6px 12px; border-radius:6px; margin-right:8px; cursor:pointer; font-weight:bold;" onclick="App.issueReceipt('${order.id}')" title="Ηλ. Τιμολόγηση">${hasReceipt ? '🧾 ΕΚΔΟΘΗΚΕ' : '🧾 ΑΠΟΔΕΙΞΗ'}</button>`;
        }

        // ✅ Εμφάνιση κουμπιών (Κέρασμα + Εκτύπωση) σε ΟΛΑ τα στάδια (εκτός αν είναι Kitchen Mode)
        if (App.adminMode !== 'kitchen') {
             treatBtn = `<button style="background:transparent; border:1px solid #FFD700; color:#FFD700; padding:6px 12px; border-radius:6px; margin-right:8px; cursor:pointer; font-size:16px;" onclick="App.showTreatOptions('${order.id}')" title="Κέρασμα">🎁</button>`;
             treatBtn += `<button style="background:transparent; border:1px solid #aaa; color:#aaa; padding:6px 12px; border-radius:6px; margin-right:8px; cursor:pointer; font-size:16px;" onclick="App.printOrder('${order.id}')" title="Εκτύπωση">🖨️</button>`;
             // ✅ NEW: Hide Print Button if disabled
             if (!App.printerEnabled) treatBtn = `<button style="background:transparent; border:1px solid #FFD700; color:#FFD700; padding:6px 12px; border-radius:6px; margin-right:8px; cursor:pointer; font-size:16px;" onclick="App.showTreatOptions('${order.id}')" title="Κέρασμα">🎁</button>`;
        }

        if (order.status === 'pending') {
            actions = `<button class="btn-win-action" style="background:#2196F3; color:white;" onclick="App.acceptOrder(${order.id})">🔊 ΑΠΟΔΟΧΗ</button>`;
        } else if (order.status === 'cooking') {
            actions = `<button class="btn-win-action" style="background:#FFD700; color:black;" onclick="App.markReady(${order.id})">🛵 ΕΤΟΙΜΟ / ΔΙΑΝΟΜΗ</button>`;
        } else {
            if (App.adminMode === 'kitchen') {
                actions = `<button class="btn-win-action" style="background:#555; color:white;" onclick="App.minimizeOrder('${order.id}')">OK (ΚΛΕΙΣΙΜΟ)</button>`;
            } else {
                // ✅ Μεταφορά Κεράσματος πάνω και αφαίρεση από κάτω
                treatBtn = `<button style="background:transparent; border:1px solid #FFD700; color:#FFD700; padding:6px 12px; border-radius:6px; margin-right:8px; cursor:pointer; font-size:16px;" onclick="App.showTreatOptions('${order.id}')" title="Κέρασμα">🎁</button>`;
                // ✅ Μικρό και διακριτικό κουμπί εκτύπωσης δίπλα στο κέρασμα
                if (App.printerEnabled) {
                    treatBtn += `<button style="background:transparent; border:1px solid #aaa; color:#aaa; padding:6px 12px; border-radius:6px; margin-right:8px; cursor:pointer; font-size:16px;" onclick="App.printOrder('${order.id}')" title="Εκτύπωση">🖨️</button>`;
                }
                
                actions = `<button class="btn-win-action" style="background:#635BFF; color:white; margin-bottom:10px;" onclick="App.openQrPayment('${order.id}')">💳 QR CARD (ΠΕΛΑΤΗΣ)</button>`;
                actions += `<button class="btn-win-action" style="background:#00E676;" onclick="App.completeOrder(${order.id})">💰 ΕΞΟΦΛΗΣΗ / ΚΛΕΙΣΙΜΟ</button>`;
            }
        }
        win.style.border = `none`;
        win.innerHTML = `
            <div class="win-header">
                <span style="font-weight:bold; color:white; font-size:24px;">${order.from}</span>
                <div class="win-controls" style="display:flex; align-items:center;">
                    ${receiptBtn}
                    ${treatBtn}
                    <button class="win-btn-top" style="background:#FF9800; color:black; padding:6px 12px; border:none; border-radius:6px; font-weight:bold; cursor:pointer;" onclick="App.minimizeOrder('${order.id}')">🔙 ΠΙΣΩ</button>
                </div>
            </div>
            <div class="win-body">
                <div class="order-info-section">
                    ${infoText}
                    ${timeInfo}
                </div>
                <div class="order-items-section">${displayItems}</div>
                <div style="font-size:24px; color:#FFD700; font-weight:bold; text-align:right; margin-top:20px;">ΣΥΝΟΛΟ: ${total.toFixed(2)}€</div>
            </div>
            <div class="win-footer">${actions}</div>
        `;
        win.style.display = 'flex';
    },
    
    // ✅ NEW: PRINT ORDER FUNCTION
    printOrder: (id, directObj = null) => {
        let order = null;
        if (directObj) {
            order = directObj; // Use passed object (for PASO)
        } else {
            order = App.activeOrders.find(o => o.id == id);
        }
        
        if(!order) return;
        
        const total = calculateTotal(order.text);
        const date = new Date(order.id).toLocaleString('el-GR');
        const storeName = document.getElementById('inpStoreNameHeader').value || "BellGo Order";
        const itemsHtml = order.text.replace(/\n/g, '<br>');

        // ✅ NEW: AADE QR Code Generation (Για την Απόδειξη)
        let qrHtml = '';
        if (order.aadeQr) {
            const div = document.createElement('div');
            // Χρήση της βιβλιοθήκης QRCode που έχουμε ήδη
            new QRCode(div, { text: order.aadeQr, width: 100, height: 100, correctLevel: QRCode.CorrectLevel.L });
            
            // Παίρνουμε την εικόνα από το div (Canvas ή Img)
            const img = div.querySelector('img');
            const canvas = div.querySelector('canvas');
            let src = '';
            if (canvas) src = canvas.toDataURL();
            else if (img) src = img.src;
            
            if (src) {
                qrHtml = `
                    <div style="text-align:center; margin-top:20px; border-top:1px dashed #000; padding-top:10px;">
                        <div style="font-size:10px; font-weight:bold; margin-bottom:5px;">QR Code ΑΑΔΕ</div>
                        <img src="${src}" style="width:100px; height:100px;"/>
                    </div>
                `;
            }
        }

        const win = window.open('', '', 'width=300,height=600');
        win.document.write(`
            <html>
            <head>
                <title>Print Order #${id}</title>
                <style>
                    body { font-family: 'Courier New', monospace; width: 280px; margin: 0 auto; padding: 10px; color: black; }
                    .header { text-align: center; font-weight: bold; margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 5px; }
                    .meta { font-size: 12px; margin-bottom: 10px; }
                    .items { font-size: 14px; font-weight: bold; border-bottom: 1px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
                    .total { text-align: right; font-size: 18px; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="header">${storeName}</div>
                <div class="meta">${date}<br>${order.from}</div>
                <div class="items">${itemsHtml}</div>
                <div class="total">ΣΥΝΟΛΟ: ${total.toFixed(2)}€</div>
                ${qrHtml} <!-- ✅ QR Code Here -->
                <script>window.onload = function() { window.print(); setTimeout(function(){ window.close(); }, 500); }</script>
            </body></html>`);

        // ✅ Κλείσιμο παραθύρου παραγγελίας μετά την εκτύπωση (Αν είναι ενεργοποιημένο)
        if (App.autoClosePrint) {
            const winEl = document.getElementById(`win-${id}`);
            if(winEl) winEl.style.display = 'none';
        }
    },

    // ✅ NEW: ISSUE RECEIPT (Manual)
    issueReceipt: (id) => {
        const order = App.activeOrders.find(o => o.id == id);
        if(order && order.text.includes('[🧾 ΑΠΟΔΕΙΞΗ]')) return alert("Η απόδειξη έχει ήδη εκδοθεί!");
        
        if(confirm("Έκδοση απόδειξης (myDATA);")) {
            window.socket.emit('issue-receipt', Number(id));
        }
    },

    // ✅ NEW: DIALOG FOR CLOSING ORDER
    showReceiptDialog: (id) => {
        const div = document.createElement('div');
        div.className = 'modal-overlay';
        div.style.display = 'flex';
        div.style.zIndex = '10000';
        div.innerHTML = `
           <div class="modal-box" style="text-align:center; max-width:350px;">
               <h3 style="color:#FFD700;">Κλείσιμο Παραγγελίας</h3>
               <p style="color:#ccc;">Δεν έχει εκδοθεί απόδειξη. Τι θέλετε να κάνετε;</p>
               <button class="modal-btn" style="background:#00E676; color:black;" onclick="App.issueAndClose(${id}, this)">🧾 ΕΚΔΟΣΗ & ΚΛΕΙΣΙΜΟ</button>
               <button class="modal-btn" style="background:#2196F3; color:white;" onclick="App.forceCompleteOrder(${id}); this.closest('.modal-overlay').remove();">🚪 ΜΟΝΟ ΚΛΕΙΣΙΜΟ</button>
               <button class="modal-btn" style="background:#555;" onclick="this.closest('.modal-overlay').remove()">ΑΚΥΡΟ</button>
           </div>
        `;
        document.body.appendChild(div);
    },

    issueAndClose: (id, btn) => {
        window.socket.emit('issue-receipt', Number(id));
        btn.innerText = "⏳ ΕΚΔΟΣΗ...";
        setTimeout(() => {
            App.forceCompleteOrder(id);
            btn.closest('.modal-overlay').remove();
        }, 1000); // Μικρή καθυστέρηση για να προλάβει να πάρει το tag
    },

    showTreatOptions: (id) => {
        const order = App.activeOrders.find(o => o.id == id);
        if (!order) return;
        
        const win = document.getElementById(`win-${id}`);
        const body = win.querySelector('.win-body');
        const footer = win.querySelector('.win-footer');
        
        // Render items as clickable buttons for partial treat
        let itemsHtml = '<div style="margin-bottom:10px; color:#aaa;">Επιλέξτε είδος για κέρασμα ή πατήστε "ΟΛΑ":</div>';
        const lines = order.text.split('\n');
        
        lines.forEach((line, idx) => {
            if (!line.trim() || line.startsWith('[')) return;
             // Only show items that have a price
            if (line.includes(':') && !line.includes(':0')) {
                itemsHtml += `<button onclick="App.treatItem('${id}', ${idx})" style="width:100%; padding:10px; margin-bottom:5px; background:#333; color:white; border:1px solid #555; border-radius:6px; text-align:left; cursor:pointer;">${line}</button>`;
            } else {
                itemsHtml += `<div style="padding:5px; color:#777;">${line}</div>`;
            }
        });
        
        body.innerHTML = itemsHtml;
        
        footer.innerHTML = `
            <button class="btn-win-action" style="background:#FFD700; color:black; margin-bottom:10px;" onclick="App.treatFull('${id}')">🎁 ΚΕΡΑΣΜΑ ΟΛΑ</button>
            <button class="btn-win-action" style="background:#555; color:white;" onclick="App.openOrderWindow(App.activeOrders.find(o=>o.id==${id}))">🔙 ΑΚΥΡΟ</button>
        `;
    },
    treatItem: (id, idx) => { if(confirm("Κέρασμα για αυτό το είδος;")) window.socket.emit('treat-order', { id: id, type: 'partial', index: idx }); },
    treatFull: (id) => { if(confirm("Κέρασμα ΟΛΗ η παραγγελία;")) window.socket.emit('treat-order', { id: id, type: 'full' }); },

    // ✅ NEW: PARTIAL PAYMENT (Cash/Card)
    payItemPartial: (id, index, method) => {
        window.socket.emit('pay-partial', { id: id, index: index, method: method });
    },

    // ✅ NEW: QR PAYMENT LOGIC
    openQrPayment: async (id, isPaso = false) => {
        App.currentQrOrderId = id; // ✅ Save ID to track payment
        App.currentQrIsPaso = isPaso;

        let total = 0;
        if (isPaso) {
            total = calculateTotal(App.tempPasoText);
        } else {
            const order = App.activeOrders.find(o => o.id == id);
            if(!order) return;
            total = calculateTotal(order.text);
        }
        
        if(total <= 0) return alert("Το ποσό είναι μηδενικό.");

        try {
            const res = await fetch('/create-qr-payment', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ amount: total, storeName: userData.store, orderId: id })
            });
            const data = await res.json();
            if(data.url) {
                document.getElementById('qrPaymentCode').innerHTML = "";
                new QRCode(document.getElementById('qrPaymentCode'), { text: data.url, width: 200, height: 200 });
                
                // ✅ Προσθήκη κουμπιού για άνοιγμα στη συσκευή του καταστήματος
                const linkContainer = document.getElementById('qrLinkContainer');
                if(linkContainer) {
                    linkContainer.innerHTML = `<button onclick="window.open('${data.url}', '_blank')" style="background:#2196F3; color:white; border:none; padding:10px; border-radius:6px; cursor:pointer; width:100%; font-weight:bold;">🔗 ΠΛΗΡΩΜΗ ΕΔΩ (MANUAL)</button>`;
                }
                
                // If PASO, add a "Complete" button to finish the flow manually
                if (isPaso) {
                    linkContainer.innerHTML += `<button onclick="App.processPasoOrder('card', 'receipt')" style="background:#00E676; color:black; border:none; padding:10px; border-radius:6px; cursor:pointer; width:100%; font-weight:bold; margin-top:10px;">✅ ΟΛΟΚΛΗΡΩΣΗ (ΕΚΤΥΠΩΣΗ)</button>`;
                    // Hide checkout modal to avoid confusion
                    document.getElementById('pasoCheckoutModal').style.display = 'none';
                }

                document.getElementById('qrPaymentModal').style.display = 'flex';
            } else { alert("Σφάλμα: " + (data.error || "Άγνωστο")); }
        } catch(e) { alert("Σφάλμα σύνδεσης."); }
    },

    // ✅ NEW: TABLE QR GENERATOR
    openTableQrModal: () => {
        document.getElementById('settingsModal').style.display = 'none';
        document.getElementById('tableQrModal').style.display = 'flex';
    },
    generateTableQrs: () => {
        const input = document.getElementById('inpTableNumbers').value.trim();
        const container = document.getElementById('qrGrid');
        container.innerHTML = '';
        
        if(!input) return alert("Δώστε αριθμούς τραπεζιών (π.χ. 1-10)");
        
        let tables = [];
        // Έλεγχος αν είναι εύρος αριθμών (π.χ. 1-10)
        if(input.includes('-') && !isNaN(parseInt(input.split('-')[0]))) {
            const parts = input.split('-');
            const start = parseInt(parts[0]);
            const end = parseInt(parts[1]);
            for(let i=start; i<=end; i++) tables.push(i);
        } else {
            // ✅ Αλλαγή: Δέχεται και γράμματα (π.χ. A1, B2)
            tables = input.split(',').map(x => x.trim()).filter(x => x !== "");
        }
        
        const baseUrl = window.location.origin;
        // Χρήση του userData.store (email) για το link
        const storeParam = encodeURIComponent(userData.store);
        
        tables.forEach(t => {
            const url = `${baseUrl}/trapaizei.html?store=${storeParam}&table=${encodeURIComponent(t)}`;
            const wrapper = document.createElement('div');
            wrapper.style.cssText = "display:flex; flex-direction:column; align-items:center; padding:10px; border:1px solid #ccc; page-break-inside: avoid;";
            wrapper.innerHTML = `<div style="font-weight:bold; font-size:18px; margin-bottom:5px;">Τραπέζι ${t}</div><div id="qr-tbl-${t}"></div><div style="font-size:10px; margin-top:5px;">Scan to Order</div>`;
            container.appendChild(wrapper);
            new QRCode(document.getElementById(`qr-tbl-${t}`), { text: url, width: 100, height: 100 });
        });
    },
    printQrs: () => {
        const content = document.getElementById('qrGrid').innerHTML;
        const win = window.open('', '', 'width=800,height=600');
        win.document.write(`<html><head><title>Print QR</title><style>body{font-family:sans-serif;} .grid{display:grid; grid-template-columns:repeat(4, 1fr); gap:20px;} @media print { .grid { display:grid; grid-template-columns:repeat(4, 1fr); gap:20px; } div { page-break-inside: avoid; } }</style></head><body><div class="grid">${content}</div><script>window.print();window.close();<\/script></body></html>`);
    },

    minimizeOrder: (id) => { document.getElementById(`win-${id}`).style.display = 'none'; },
    acceptOrder: (id) => {
        if(window.AudioEngine) window.AudioEngine.stopAlarm();
        window.socket.emit('admin-stop-ringing'); 
        window.socket.emit('accept-order', Number(id)); // Send as Number
        const win = document.getElementById(`win-${id}`);
        if(win) win.style.display = 'none';
    },
    markReady: (id) => {
        if (App.staffChargeMode) {
            // ✅ NEW: Αν είναι ενεργή η χρέωση προσωπικού, ανοίγουμε Modal Ανάθεσης
            App.openDeliveryAssignModal(id);
        } else {
            // Κλασική λειτουργία
            window.socket.emit('ready-order', Number(id)); 
            const win = document.getElementById(`win-${id}`);
            if(win) win.style.display = 'none';
        }
    },

    openDeliveryAssignModal: (orderId) => {
        const modal = document.getElementById('deliveryAssignModal');
        const list = document.getElementById('driverAssignList');
        list.innerHTML = '';

        // 1. Broadcast Button
        const btnAll = document.createElement('button');
        btnAll.className = 'modal-btn';
        btnAll.style.background = '#FFD700';
        btnAll.style.color = 'black';
        btnAll.innerHTML = '🔊 ΟΛΟΙ (Broadcast)';
        btnAll.onclick = () => {
            window.socket.emit('assign-delivery', { orderId: orderId, targetDriver: 'ALL' });
            modal.style.display = 'none';
            App.minimizeOrder(orderId);
        };
        list.appendChild(btnAll);

        // 2. Specific Drivers (Από το lastStaffList που έχουμε ήδη)
        App.lastStaffList.forEach(u => {
            if (u.role === 'driver') {
                const btn = document.createElement('button');
                btn.className = 'modal-btn';
                btn.style.background = '#333';
                btn.innerHTML = `🛵 ${u.username}`;
                btn.onclick = () => {
                    // Υπολογισμός ποσού για χρέωση
                    const order = App.activeOrders.find(o => o.id == orderId);
                    const total = calculateTotal(order.text);
                    
                    // Χρέωση και Ανάθεση
                    window.socket.emit('charge-order-to-staff', { orderId: orderId, staffName: u.username, amount: total, method: 'cash' });
                    
                    modal.style.display = 'none';
                    App.minimizeOrder(orderId);
                };
                list.appendChild(btn);
            }
        });

        modal.style.display = 'flex';
    },
    completeOrder: (id) => {
        // ✅ NEW: Check if receipt is needed
        const order = App.activeOrders.find(o => o.id == id);
        if (App.einvoicingEnabled && order && !order.text.includes('[🧾 ΑΠΟΔΕΙΞΗ]')) {
             App.showReceiptDialog(id);
             return;
        }
        App.forceCompleteOrder(id);
    },
    // ✅ NEW: Helper to bypass check
    forceCompleteOrder: (id) => {
        window.socket.emit('pay-order', Number(id)); 
        const win = document.getElementById(`win-${id}`);
        if(win) win.remove();
    },
    removeStaff: (username) => {
        if(confirm(`Αφαίρεση χρήστη ${username};`)) {
            window.socket.emit('manual-logout', { targetUser: username });
        }
    },
    
    renderStaffList: (list) => {
        const container = document.getElementById('staffList');
        if (!container) return;
        const now = Date.now();
        if(!App.tempComingState) App.tempComingState = {};

        list.forEach(u => {
            const wasRinging = App.lastRingingState[u.username];
            const isRinging = u.isRinging;
            if (wasRinging && !isRinging) { App.tempComingState[u.username] = now; }
            App.lastRingingState[u.username] = isRinging;
        });

        container.innerHTML = '';
        list.forEach(u => {
            if (u.role === 'admin' || u.role === 'customer') return;

            const staffDiv = document.createElement('div');
            // ✅ FIX: Χειρισμός Offline χρηστών (εμφάνιση ως Ghost/Away)
            const isAway = u.status === 'away' || u.status === 'offline' || u.status === 'background';
            
            let roleClass = 'role-waiter';
            let icon = '🧑‍🍳';
            if (u.role === 'driver') {
                roleClass = 'role-driver';
                icon = '🛵';
            }

            staffDiv.className = `staff-folder ${roleClass} ${isAway ? 'ghost' : ''}`;

            let stTxt = u.status === 'offline' ? "Offline" : (isAway ? "Away" : "Idle");
            const isComing = App.tempComingState[u.username] && (now - App.tempComingState[u.username] < 15000);

            if (u.isRinging) {
                stTxt = "Ringing";
                staffDiv.classList.add('ringing');
            } else if (isComing) {
                stTxt = "Coming";
                staffDiv.classList.add('coming');
            }

            let closeBtn = '';
            if (isAway) {
                closeBtn = `<button class="btn-staff-close" onclick="event.stopPropagation(); App.removeStaff('${u.username}')">✕</button>`;
                // ✅ FIX: Κουμπί διαγραφής (X) για προσωπικό που είναι Offline/Background
                closeBtn = `<button onclick="event.stopPropagation(); App.removeStaff('${u.username}')" style="position:absolute; top:2px; right:2px; background:#D32F2F; color:white; border:none; border-radius:50%; width:20px; height:20px; font-size:10px; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; z-index:10; box-shadow:0 2px 4px rgba(0,0,0,0.5);">✕</button>`;
            }
            
            staffDiv.style.position = 'relative'; // Ensure positioning context
            staffDiv.innerHTML = `
                ${closeBtn}
                <div class="staff-icon">${icon}</div>
                <div class="staff-label">${u.username}</div>
                <div class="staff-status">${stTxt}</div>
            `;
            
            staffDiv.onclick = () => {
                const sourceLabel = App.adminMode === 'kitchen' ? "👨‍🍳" : "💸";
                window.socket.emit('trigger-alarm', { target: u.username, source: sourceLabel });
                staffDiv.querySelector('.staff-status').innerText = 'Ringing';
                staffDiv.classList.add('ringing');
            };
            
            // The old logic for a delete button on 'away' users can be added here if needed.
            // For now, focusing on the visual replacement.

            container.appendChild(staffDiv);
        });
    },
    
    // ✅ NEW: RESERVATIONS LOGIC
    openReservationsModal: () => {
        document.getElementById('reservationsModal').style.display = 'flex';
        window.socket.emit('get-reservations');
    },

    updateReservationsBadge: (list) => {
        if (!list) return;
        const badge = document.getElementById('resBadge');
        if (!badge) return;

        const pending = list.filter(r => r.status === 'pending');
        const confirmed = list.filter(r => r.status === 'confirmed');

        let count = 0;
        let color = '';

        if (userData.role === 'admin') {
            // Ο Admin βλέπει Κόκκινο αν υπάρχει Αναμονή, αλλιώς Πράσινο
            if (pending.length > 0) {
                count = pending.length;
                color = '#FF5252'; // Red (Pending)
            } else if (confirmed.length > 0) {
                count = confirmed.length;
                color = '#00E676'; // Green (Confirmed)
            }
        } else {
            // Οι Σερβιτόροι βλέπουν Πράσινο αν υπάρχει Επιβεβαιωμένη
            if (confirmed.length > 0) {
                count = confirmed.length;
                color = '#00E676'; // Green (Confirmed)
            }
        }

        if (count > 0) {
            badge.style.display = 'flex';
            badge.innerText = count;
            badge.style.background = color;
            badge.style.animation = 'pulse 2s infinite';
        } else {
            badge.style.display = 'none';
            badge.style.animation = 'none';
        }
    },
    
    renderReservations: (list) => {
        const container = document.getElementById('reservationsList');
        if(!container) return;
        container.innerHTML = '';
        
        if(!list || list.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:#555;">Δεν υπάρχουν κρατήσεις.</div>';
            return;
        }

        // Sort by Date/Time
        list.sort((a,b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`));

        list.forEach(r => {
            if (r.status === 'completed') return; // ✅ Hide completed
            const isPending = r.status === 'pending';
            const div = document.createElement('div');
            div.style.cssText = `background:#222; padding:10px; border-radius:8px; border-left:4px solid ${isPending ? '#FF9800' : '#9C27B0'}; display:flex; justify-content:space-between; align-items:center;`;
            div.innerHTML = `
                <div onclick="App.processReservation(${r.id}, ${r.pax})" style="cursor:pointer;">
                    <div style="font-weight:bold; color:white;">${r.name} (${r.pax} άτ.) ${isPending ? '<span style="color:#FF9800; font-size:12px;">(ΑΝΑΜΟΝΗ)</span>' : ''}</div>
                    <div style="color:#FFD700; font-size:14px;">📅 ${r.date} 🕒 ${r.time}</div>
                    <div style="color:#aaa; font-size:12px;">📞 ${r.phone}</div>
                </div>
                <div style="display:flex; gap:5px;">
                    <button onclick="App.processReservation(${r.id}, ${r.pax})" style="background:#2196F3; color:white; border:none; padding:5px 10px; border-radius:5px; cursor:pointer; font-weight:bold;" title="Έναρξη & Ολοκλήρωση">🚀</button>
                    ${isPending ? `<button onclick="App.acceptReservation(${r.id})" style="background:#00E676; color:black; border:none; padding:5px 10px; border-radius:5px; cursor:pointer; font-weight:bold;">✅</button>` : ''}
                    <button onclick="App.deleteReservation(${r.id})" style="background:#D32F2F; color:white; border:none; padding:5px 10px; border-radius:5px; cursor:pointer;">✕</button>
                </div>
            `;
            container.appendChild(div);
        });
    },

    // ✅ NEW: Process Reservation (Open Sidebar & Complete)
    processReservation: (id, pax) => {
        // 1. Open Sidebar
        const sb = document.getElementById('orderSidebar');
        if (sb.style.left !== '0px' && sb.style.left !== '0') {
            App.toggleOrderSidebar();
        }
        // 2. Set Mode Table & Covers
        App.setSidebarMode('table');
        if(document.getElementById('sidebarCovers')) document.getElementById('sidebarCovers').value = pax;
        
        // 3. Mark as Completed
        window.socket.emit('complete-reservation', id);
    },
    
    acceptReservation: (id) => {
        if(window.AudioEngine) window.AudioEngine.stopAlarm();
        window.socket.emit('admin-stop-ringing');
        window.socket.emit('accept-reservation', id);
    },
    
    deleteReservation: (id) => {
        if(confirm("Διαγραφή κράτησης;")) window.socket.emit('delete-reservation', id);
    },

    // ✅ NEW: CASH REGISTER LOGIC (ΤΑΜΕΙΑΚΗ)
    openCashRegister: () => {
        App.cashRegValue = "0";
        App.cashRegItems = [];
        App.updateCashRegUI();
        App.renderCashRegButtonsUI(); // ✅ Render dynamic buttons
        document.getElementById('cashRegisterModal').style.display = 'flex';
    },

    cashRegInput: (val) => {
        if (App.cashRegValue === "0" && val !== ".") App.cashRegValue = val;
        else App.cashRegValue += val;
        App.updateCashRegUI();
    },

    cashRegClear: () => {
        if (App.cashRegValue === "0") {
            // Αν είναι ήδη 0, καθαρίζουμε τη λίστα
            App.cashRegItems = [];
        } else {
            App.cashRegValue = "0";
        }
        App.updateCashRegUI();
    },

    // ✅ NEW: Render Dynamic Buttons
    renderCashRegButtonsUI: () => {
        const container = document.getElementById('cashRegButtonsContainer');
        container.innerHTML = '';
        
        // Αν δεν υπάρχουν κουμπιά, βάλε default
        const buttons = (App.cashRegButtons && App.cashRegButtons.length > 0) 
            ? App.cashRegButtons 
            : [{label:'ΦΑΓΗΤΟ', vat:13}, {label:'ΠΟΤΟ', vat:24}, {label:'ΕΙΔΗ', vat:24}];

        buttons.forEach(btn => {
            const el = document.createElement('button');
            el.className = 'modal-btn';
            el.style.cssText = "background:#444; font-size:14px; margin:0; font-weight:bold; height:50px;";
            el.innerText = `${btn.label}\n${btn.vat}%${btn.price ? ` (${btn.price}€)` : ''}`;
            el.onclick = () => App.cashRegAddItem(btn);
            container.appendChild(el);
        });
    },

    cashRegAddItem: (btn) => {
        let amount = 0;
        
        // Αν το κουμπί έχει preset τιμή, τη χρησιμοποιούμε
        if (btn.price && btn.price > 0) {
            amount = btn.price;
        } else {
            // Αλλιώς παίρνουμε από την οθόνη
            amount = parseFloat(App.cashRegValue);
            if (isNaN(amount) || amount <= 0) return; // Δεν κάνει τίποτα αν είναι 0
        }

        App.cashRegItems.push({
            name: btn.label,
            price: amount,
            vat: btn.vat
        });
        
        App.cashRegValue = "0"; // Reset screen
        App.updateCashRegUI();
    },

    updateCashRegUI: () => {
        document.getElementById('cashRegScreen').innerText = App.cashRegValue;
        
        const listEl = document.getElementById('cashRegList');
        listEl.innerHTML = '';
        let total = 0;
        
        App.cashRegItems.forEach(item => {
            total += item.price;
            const div = document.createElement('div');
            div.innerText = `${item.name}: ${item.price.toFixed(2)}€`;
            listEl.appendChild(div);
        });
        
        document.getElementById('cashRegTotal').innerText = `ΣΥΝΟΛΟ: ${total.toFixed(2)}€`;
    },

    cashRegPay: (method) => {
        let total = App.cashRegItems.reduce((sum, item) => sum + item.price, 0);
        
        // Αν δεν υπάρχουν είδη στη λίστα, αλλά υπάρχει ποσό στην οθόνη, το παίρνουμε ως "Γενικό"
        // ✅ NEW LOGIC: Δεν επιτρέπεται πληρωμή αν η λίστα είναι άδεια (πρέπει να πατηθεί τμήμα)
        if (total === 0) {
            return alert("⚠️ Πρέπει να επιλέξετε Τμήμα/ΦΠΑ για το ποσό πριν την έκδοση!");
        }

        if (method === 'card') {
            // ✅ REAL POS INTEGRATION LOGIC
            const btn = document.getElementById('btnCashRegPos');
            const originalText = btn.innerText;
            
            // 1. Αλλαγή UI σε "Αναμονή"
            btn.innerText = "⏳ ΑΠΟΣΤΟΛΗ...";
            btn.disabled = true;
            btn.style.background = "#555";

            // 2. Listener για την απάντηση του Server
            const handlePosResult = (res) => {
                window.socket.off('pos-result', handlePosResult); // Καθαρισμός listener
                btn.innerText = originalText;
                btn.disabled = false;
                btn.style.background = "#2196F3";

                if (res.success) {
                    alert("✅ Πληρωμή POS Επιτυχής!");
                    App.finalizeCashRegOrder(total, '💳 ΚΑΡΤΑ (POS)');
                } else {
                    alert("❌ Σφάλμα POS: " + res.error);
                    // Fallback: Αν ο χρήστης είδε ότι πέρασε αλλά κόλλησε το ίντερνετ
                    if(confirm("Αν η πληρωμή εγκρίθηκε στο τερματικό αλλά δεν ήρθε σήμα, πατήστε ΟΚ για κλείσιμο.")) {
                        App.finalizeCashRegOrder(total, '💳 ΚΑΡΤΑ (POS)');
                    }
                }
            };

            window.socket.on('pos-result', handlePosResult);
            window.socket.emit('pos-pay', { amount: total });
        } else {
            App.finalizeCashRegOrder(total, '💵 ΜΕΤΡΗΤΑ');
        }
    },

    finalizeCashRegOrder: (total, methodLabel) => {
        // Δημιουργία κειμένου παραγγελίας για εκτύπωση/αποθήκευση
        let orderText = `[ΤΑΜΕΙΑΚΗ 📠]\n${methodLabel}\n---\n`;
        App.cashRegItems.forEach(item => {
            orderText += `${item.name}: ${item.price.toFixed(2)}\n`;
        });
        orderText += `✅ PAID`;

        // ✅ NEW: Χρήση 'quick-order' για να ΜΗΝ μπαίνει στις ενεργές παραγγελίες
        window.socket.emit('quick-order', {
            text: orderText,
            total: total,
            method: methodLabel.includes('ΚΑΡΤΑ') ? 'card' : 'cash',
            issueReceipt: true, // Πάντα true για την ταμειακή
            source: 'Admin (Ταμείο)'
        });

        document.getElementById('cashRegisterModal').style.display = 'none';
    },

    toggleAdminChat: () => { 
        const el = document.getElementById('adminChatOverlay');
        App.isChatOpen = (el.style.display === 'flex');
        if (App.isChatOpen) { el.style.display = 'none'; App.isChatOpen = false; } 
        else { el.style.display = 'flex'; App.isChatOpen = true; document.getElementById('chatBadge').style.display = 'none'; }
    },
    sendChat: () => {
        const inp = document.getElementById('adminChatInp');
        if (inp.value.trim()) { window.socket.emit('chat-message', { text: inp.value }); inp.value = ''; }
    },
    appendChat: (data) => {
        if (data.sender !== userData.name && !App.isChatOpen) { document.getElementById('chatBadge').style.display = 'block'; }
        const box = document.getElementById('adminChatBox');
        if(box) {
            box.innerHTML += `<div class="chat-msg ${data.sender === userData.name ? 'me' : 'other'}"><b>${data.sender}:</b> ${data.text}</div>`;
            box.scrollTop = box.scrollHeight;
        }
    },
    logout: () => { if(window.socket) window.socket.emit('manual-logout'); localStorage.removeItem('bellgo_session'); window.location.replace("login.html"); },
    toggleFakeLock: () => { 
        const el=document.getElementById('fakeLockOverlay'); 
        const isLocked = (el.style.display !== 'flex');
        el.style.display = isLocked ? 'flex' : 'none';
        // ✅ Αν κλειδώσει, δηλώνουμε background για να έρχονται ειδοποιήσεις
        if(window.socket) window.socket.emit('set-user-status', isLocked ? 'background' : 'online');
    },
    forceReconnect: () => { window.socket.disconnect(); setTimeout(()=>window.socket.connect(), 500); },
    startHeartbeat: () => setInterval(() => { if (window.socket && window.socket.connected) window.socket.emit('heartbeat'); }, 3000)
};

window.onload = App.init;
