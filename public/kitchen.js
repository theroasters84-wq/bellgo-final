import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";
import { firebaseConfig, vapidKey } from './config.js';
import { StatsUI } from './premium-stats.js';
import { Sundromes } from './sundromes.js';
import { Admin } from './admin.js';
import { OrdersUI } from './premium-orders.js';
import { PaySystem } from './pay.js';
import { Menu } from './menu-presets.js';

const savedSession = localStorage.getItem('bellgo_session');
if (!savedSession) window.location.replace("login.html");
const userData = JSON.parse(savedSession || '{}');
if (userData.role !== 'admin' && userData.role !== 'kitchen') { alert("Access Denied"); window.location.replace("login.html"); }

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
let tempPin = ''; // ✅ For confirmation
let pinStep = 'create'; // 'create' | 'confirm'

window.PIN = {
    add: (n) => { if(pinValue.length < 4) { pinValue += n; PIN.updateDisplay(); } },
    clear: () => { pinValue = ''; PIN.updateDisplay(); },
    reset: () => { 
        pinValue = ''; tempPin = ''; pinStep = 'create'; 
        PIN.updateDisplay(); 
        const title = document.querySelector('#pinChangeModal .modal-title');
        if(title) title.innerText = "PIN";
    },
    updateDisplay: () => { document.getElementById('pinDisplay').innerText = pinValue; },
    submit: () => {
        if(pinValue.length < 4) return alert("Το PIN πρέπει να είναι 4 ψηφία");
        
        if (pinStep === 'create') {
            tempPin = pinValue; pinStep = 'confirm'; pinValue = ''; PIN.updateDisplay();
            const title = document.querySelector('#pinChangeModal .modal-title');
            if(title) title.innerText = "ΕΠΙΒΕΒΑΙΩΣΗ";
        } else if (pinStep === 'confirm') {
            if (pinValue !== tempPin) { alert("❌ Τα PIN δεν ταιριάζουν!"); PIN.reset(); return; }
            window.socket.emit('set-new-pin', { pin: pinValue, email: userData.email });
            App.closePinModal();
        }
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
    // ==========================================
    // 1. STATE & DATA (ΜΕΤΑΒΛΗΤΕΣ)
    // ==========================================
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
    kitchenSettings: JSON.parse(localStorage.getItem('bellgo_kitchen_settings') || '{"autoPrint":false, "autoClose":false}'), // ✅ NEW: Local Settings
    
    // EXTRAS STATE
    currentExtrasItemIndex: null,
    currentExtrasCatIndex: null,
    tempExtras: [],
    cachedStats: null, // ✅ Store stats for navigation
    autoPrint: false, // ✅ Auto Print State
    autoClosePrint: false, // ✅ Auto Close Window State
    knownOrderIds: new Set(), // ✅ Track printed orders
    expensePresets: [], // ✅ Local storage for presets
    fixedExpenses: [], // ✅ NEW: Fixed Expenses

    softPosSettings: {}, // ✅ NEW: SoftPOS Settings
    posSettings: {}, // ✅ NEW: Physical POS Settings
    posMode: 'auto', // ✅ NEW: POS Mode
    features: {}, // ✅ NEW: Local Features State
    ...(StatsUI || {}), // ✅ Import Statistics Logic (Safe Spread)
    ...(Admin || {}), // ✅ Import Admin Logic
    ...(OrdersUI || {}), // ✅ Import Orders UI
    ...(PaySystem || {}), // ✅ Import PaySystem
    ...(Menu || {}), // ✅ Import Menu Logic
    
    // Expose setLanguage for console or future use
    setLanguage: setLanguage,

    // ==========================================
    // 2. INITIALIZATION (ΕΚΚΙΝΗΣΗ)
    // ==========================================
    init: () => {
        // ✅ FIX: Initialize features from local storage
        if (userData.features) {
            App.features = { ...userData.features };
        }

        // ✅ iOS INSTALL PROMPT (Admin/Staff Only)
        App.setupIosPrompt();
        App.setupAudioUnlock();
        App.applyKitchenUI();

        App.connectSocket();
        App.startHeartbeat();
        App.checkNotificationPermission(); 
        
        App.setupVisibilityListener();
        App.setupSettingsModalBehavior();
        App.startStaffListLoop();
        App.setupCustomHacks();

        DNDBot.init();
        App.checkSoftPosReturn();
        App.initKitchenSettingsUI();

        App.applyFeatureVisibility();

        const savedLang = localStorage.getItem('bellgo_lang') || 'el';
        setLanguage(savedLang);
    },

    setupIosPrompt: () => {
        const isIos = () => /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

        if (isIos() && !isStandalone) {
            const div = document.createElement('div');
            div.id = 'iosInstallPrompt';
            div.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.4); backdrop-filter:blur(8px); z-index:20000; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:30px; text-align:center; color:#1f2937;";
            div.innerHTML = `
                <div style="font-size:60px; margin-bottom:20px;">📲</div>
                <h2 style="color:#10B981; margin-bottom:10px;">ΕΓΚΑΤΑΣΤΑΣΗ APP</h2>
                <p style="color:#6b7280; font-size:15px; margin-bottom:20px;">Για να λειτουργούν οι <b>Ειδοποιήσεις</b> και ο <b>Ήχος</b> στο iPhone, η εφαρμογή πρέπει να εγκατασταθεί.</p>
                
                <div style="background:#ffffff; border:1px solid #e5e7eb; padding:20px; border-radius:15px; width:100%; text-align:left; font-size:14px; color:#1f2937; box-shadow:0 10px 30px rgba(0,0,0,0.1);">
                    <div style="margin-bottom:15px;">1. Πατήστε το κουμπί <b>Share</b> <span style="font-size:18px;">⎋</span> κάτω στο Safari.</div>
                    <div>2. Επιλέξτε <b>"Προσθήκη στην Οθόνη Αφετηρίας"</b> (Add to Home Screen).</div>
                </div>
                
                <button onclick="document.getElementById('iosInstallPrompt').remove()" style="margin-top:30px; background:none; border:none; color:#6b7280; text-decoration:underline; cursor:pointer; font-weight:bold;">Συνέχεια στον Browser (Χωρίς Ήχο)</button>
            `;
            document.body.appendChild(div);
        }
    },

    setupAudioUnlock: () => {
        document.body.addEventListener('click', () => { 
            if(window.AudioEngine) window.AudioEngine.init();
        }, {once:true});
        
        // ✅ UI SETUP BASED ON MODE
        // ✅ FIX: Άμεση εμφάνιση ονόματος (για να μην φαίνεται κενό μέχρι να συνδεθεί)
    },

    applyKitchenUI: () => {
        if (userData.store) {
            const inpHeader = document.getElementById('inpStoreNameHeader');
            if (inpHeader) inpHeader.value = userData.store;
        }

        if (App.adminMode === 'kitchen') {
            // 👨‍🍳 KITCHEN MODE: Καθαρό περιβάλλον
            const btnNew = document.getElementById('btnNewOrderSidebar'); if(btnNew) btnNew.style.display = 'none';
            const btnMenu = document.getElementById('btnMenuToggle'); if(btnMenu) btnMenu.style.display = 'none';
            const btnExit = document.getElementById('btnKitchenExit'); if(btnExit) btnExit.style.display = 'flex';
            const inpHeader = document.getElementById('inpStoreNameHeader'); if(inpHeader) inpHeader.disabled = true;
            // 🔒 ΚΟΥΖΙΝΑ: Απενεργοποίηση Sidebar
            const sb = document.getElementById('orderSidebar');
            if(sb) sb.style.display = 'none';
            const staffContainer = document.getElementById('staffContainer');
            if(staffContainer) staffContainer.style.display = 'none';
            const adminChatOverlay = document.getElementById('adminChatOverlay');
            if(adminChatOverlay) adminChatOverlay.style.display = 'none';
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
    },

        App.connectSocket();
        App.startHeartbeat();
        // App.requestNotifyPermission(); 
        App.checkNotificationPermission(); // ✅ UI Check
        
        // ✅ NEW: Detect Background/Foreground State
    setupVisibilityListener: () => {
        document.addEventListener('visibilitychange', () => {
            if (window.socket && window.socket.connected) {
                window.socket.emit('set-user-status', document.hidden ? 'background' : 'online');
            }
        });
    },

        // ✅ FIX: Close Settings on Background Click & Add Back Button
    setupSettingsModalBehavior: () => {
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
    },

    startStaffListLoop: () => {
        setInterval(() => {
            if (Object.keys(App.tempComingState).length > 0 && App.lastStaffList.length > 0) {
                App.renderStaffList(App.lastStaffList);
            }
        }, 1000);
    },

        // ✅ UI CUSTOMIZATIONS: Hidden Stats, Moved Auto-Reset, Renamed Plugins
    setupCustomHacks: () => {
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
                wrapper.style.cssText = "position:absolute; top:15px; right:60px; display:flex; align-items:center; gap:5px; z-index:100;";
                const lbl = document.createElement('span');
                lbl.innerText = "Hours:";
                lbl.style.cssText = "font-size:10px; color:#666; font-weight:bold;";
                inpHours.style.cssText = "width:80px; padding:2px; font-size:11px; background:#111; border:1px solid #444; color:#fff; border-radius:4px; text-align:center;";
                wrapper.appendChild(lbl);
                wrapper.appendChild(inpHours);
                menuPanel.appendChild(wrapper);
            }
        }, 500);
    },

        // ✅ Start Bot
        DNDBot.init();
        // DNDBot.init();
        
        // ✅ Check SoftPOS Return
        App.checkSoftPosReturn();

        // ✅ Init Kitchen Settings UI
    initKitchenSettingsUI: () => {
        const swAP = document.getElementById('swKitchenAutoPrint'); if(swAP) swAP.checked = App.kitchenSettings.autoPrint;
        const swAC = document.getElementById('swKitchenAutoClose'); if(swAC) swAC.checked = App.kitchenSettings.autoClose;

        // ✅ NEW: Apply Feature Visibility Initial Check
        App.applyFeatureVisibility();

        // ✅ LOAD LANGUAGE ON INIT
        const savedLang = localStorage.getItem('bellgo_lang') || 'el';
        setLanguage(savedLang);
    },
    
    // ==========================================
    // 3. PUSH NOTIFICATIONS
    // ==========================================
    requestNotifyPermission: async () => {
        // ✅ NEW: Disable on Laptop/Desktop
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (!isMobile) return;

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
        // ✅ NEW: Disable on Laptop/Desktop
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (!isMobile) return;

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

    // ==========================================
    // 4. SOCKET.IO CONNECTION
    // ==========================================
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

            // ✅ NEW: Handle SoftPOS Completion
            if (App.pendingSoftPosCompletion) {
                const { id, amount } = App.pendingSoftPosCompletion;
                window.socket.emit('pay-order', { id: id, method: 'card' });
                App.pendingSoftPosCompletion = null;
            }

            // ✅ FIX: Περιμένουμε να ολοκληρωθεί η σύνδεση (join-store) πριν στείλουμε το Stripe ID
            // Χρησιμοποιούμε το 'menu-update' ως ένδειξη ότι ο server μας έβαλε στο δωμάτιο.
            socket.once('menu-update', () => {
                const pendingStripe = localStorage.getItem('temp_stripe_connect_id');
                if (pendingStripe) {
                    socket.emit('save-store-settings', { stripeConnectId: pendingStripe });
                    localStorage.removeItem('temp_stripe_connect_id');
                    alert("Ο λογαριασμός Stripe συνδέθηκε επιτυχώς!");
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
                if(settings.features) {
                    App.features = settings.features;
                    App.applyFeatureVisibility(); // ✅ Update UI based on features
                }
                document.getElementById('switchCust').checked = settings.statusCustomer;
                document.getElementById('switchStaff').checked = settings.statusStaff;
                if(settings.resetTime) document.getElementById('inpResetTime').value = settings.resetTime;
                if(settings.hours) document.getElementById('inpHours').value = settings.hours;
                if(settings.schedule) App.scheduleData = settings.schedule;
                // ✅ FIX: Να δέχεται και το 0 ως τιμή
                if(settings.coverPrice !== undefined) { 
                    if (settings.adminPin !== undefined) App.adminPin = settings.adminPin;
                    if (settings.pin !== undefined) App.storePin = settings.pin;
                    App.coverPrice = parseFloat(settings.coverPrice); 
                    document.getElementById('inpCoverPrice').value = App.coverPrice; 
                }
                if(settings.googleMapsUrl !== undefined) document.getElementById('inpGoogleMaps').value = settings.googleMapsUrl;
                if(settings.autoPrint !== undefined) {
                    App.autoPrint = settings.autoPrint;
                    document.getElementById('selAutoPrint').value = App.autoPrint.toString();
                }
                if(settings.autoClosePrint !== undefined) {
                    App.autoClosePrint = settings.autoClosePrint;
                    const sw = document.getElementById('switchAutoClosePrint');
                    if(sw) sw.checked = App.autoClosePrint;
                }
                if(settings.expensePresets) App.expensePresets = settings.expensePresets;
                if(settings.fixedExpenses) App.fixedExpenses = settings.fixedExpenses; // ✅ Load Fixed Expenses
                if(settings.fixedExpenses) App.fixedExpenses = settings.fixedExpenses; 
                
                // ✅ NEW: Load SoftPOS Settings
                if(settings.softPos) App.softPosSettings = settings.softPos;
                if(settings.posMode) App.posMode = settings.posMode;
                if(settings.pos) App.posSettings = settings.pos; // ✅ Load Physical POS
                if(settings.pos) App.posSettings = settings.pos; 

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
        
        // ✅ NEW: Secure Unlock Listener
        socket.on('pin-verified', (data) => {
            if (data.success && ['admin', 'driver', 'waiter'].includes(data.role)) {
                document.getElementById('fakeLockOverlay').style.display = 'none';
                if(window.socket) window.socket.emit('set-user-status', 'online');
            } else {
                alert("Access Denied (Only Admin/Waiter/Driver)");
            }
        });

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
            App.isInitialized = true; 
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
    },

    // ✅ NEW: Feature Check Logic
    // ==========================================
    // 5. FEATURES & VISIBILITY
    // ==========================================
    hasFeature: (key) => {
        const userContext = { ...userData, features: { ...userData.features, ...App.features } };
        return Sundromes.hasAccess(userContext, key);
    },

    // ✅ NEW: Apply Visibility based on Features
    applyFeatureVisibility: () => {
        // Package 1 (Chat) is base.
        // Package Manager (pack_manager) is needed for Orders & Settings.
        const hasManager = App.hasFeature('pack_manager');
        const hasChat = App.hasFeature('pack_chat');
        
        // Hide/Show Orders
        const desktop = document.getElementById('desktopArea');
        if(desktop) desktop.style.display = hasManager ? 'grid' : 'none';
        
        // Hide/Show Settings
        const btnSet = document.getElementById('btnSettings');
        if(btnSet) btnSet.style.display = hasManager ? 'flex' : 'none';
        
        // Hide/Show Menu
        const btnMenu = document.getElementById('btnMenuToggle');
        if(btnMenu) btnMenu.style.display = hasManager ? 'flex' : 'none';
        
        // ✅ NEW: Staff Container (Call Staff) - Visible if Chat or Manager is active
        const staffContainer = document.getElementById('staffContainer');
        if(staffContainer) {
            staffContainer.style.display = hasChat ? 'flex' : 'none';
        }

        // ✅ NEW: Chat Button
        const chatBtn = document.getElementById('adminChatBtn');
        if(chatBtn && chatBtn.parentElement.classList.contains('btn-icon-wrapper')) {
             chatBtn.parentElement.style.display = hasChat ? 'flex' : 'none';
        }
    },
    
    // ✅ NEW: Toggle Local Kitchen Settings
    // ==========================================
    // 6. UI TOGGLES & HELPERS
    // ==========================================
    toggleKitchenSetting: (key) => {
        App.kitchenSettings[key] = !App.kitchenSettings[key];
        localStorage.setItem('bellgo_kitchen_settings', JSON.stringify(App.kitchenSettings));
