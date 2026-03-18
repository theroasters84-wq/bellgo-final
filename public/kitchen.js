import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";
import { firebaseConfig, vapidKey } from './config.js';
import { StatsUI } from './premium-stats.js';
import { Sundromes } from './sundromes.js';
import { Admin } from './admin.js';
import { AdminUI } from './admin-ui.js';
import { OrdersUI } from './premium-orders.js';
import { PaySystem } from './pay.js';
import { Menu } from './menu-presets.js';
import { I18n, PushNotifications } from './shared-utils.js';
import { initKitchenSockets } from './kitchen-sockets.js'; // ✅ Import Sockets Logic
import { DNDBot } from './dnd-bot.js'; // ✅ Import DNDBot

const savedSession = localStorage.getItem('bellgo_session');
if (!savedSession) window.location.replace("login.html");
const userData = JSON.parse(savedSession || '{}');
if (userData.role !== 'admin' && userData.role !== 'kitchen') { alert("Access Denied"); window.location.replace("login.html"); }

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

// --- I18N LOGIC (FIX FOR TRANSLATIONS) ---
const t = (key) => I18n.t(key) || key;

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
    adminMode: 'kitchen', // ✅ FIX: Πάντα σε λειτουργία Κουζίνας, αποφεύγει bugs από το LocalStorage
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
    userData: userData, // ✅ FIX: Εξασφαλίζει ότι το admin-ui.js μπορεί να διαβάσει το κατάστημα (store) για το ξεκλείδωμα
    ...(StatsUI || {}), // ✅ Import Statistics Logic (Safe Spread)
    ...(Admin || {}), // ✅ Import Admin Logic
    ...(AdminUI || {}), // ✅ Import Admin UI Logic
    ...(OrdersUI || {}), // ✅ Import Orders UI
    ...(PaySystem || {}), // ✅ Import PaySystem
    ...(Menu || {}), // ✅ Import Menu Logic
    
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
        PushNotifications.checkPermission(messaging, (token) => {
            if(window.socket && window.socket.connected) {
                window.socket.emit('update-token', { token: token, username: userData.name });
            }
        }, false);
        
        App.setupVisibilityListener();
        App.setupSettingsModalBehavior();
        App.startStaffListLoop();
        App.setupCustomHacks();

        DNDBot.init();
        App.checkSoftPosReturn();
        App.initKitchenSettingsUI();

        App.applyFeatureVisibility();

        const savedLang = localStorage.getItem('bellgo_lang') || 'el';
        I18n.setLanguage(savedLang);
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

    setupVisibilityListener: () => {
        document.addEventListener('visibilitychange', () => {
            if (window.socket && window.socket.connected) {
                window.socket.emit('set-user-status', document.hidden ? 'background' : 'online');
            }
        });
    },

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

    initKitchenSettingsUI: () => {
        const swAP = document.getElementById('swKitchenAutoPrint'); if(swAP) swAP.checked = App.kitchenSettings.autoPrint;
        const swAC = document.getElementById('swKitchenAutoClose'); if(swAC) swAC.checked = App.kitchenSettings.autoClose;

        // ✅ NEW: Apply Feature Visibility Initial Check
        App.applyFeatureVisibility();

        // ✅ LOAD LANGUAGE ON INIT
        const savedLang = localStorage.getItem('bellgo_lang') || 'el';
        I18n.setLanguage(savedLang);
    },
    
    connectSocket: () => {
        initKitchenSockets(window.App, userData);
    },

    hasFeature: (key) => {
        const userContext = { ...userData, features: { ...userData.features, ...App.features } };
        return Sundromes.hasAccess(userContext, key);
    },

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
    
    toggleKitchenSetting: (key) => {
        App.kitchenSettings[key] = !App.kitchenSettings[key];
        localStorage.setItem('bellgo_kitchen_settings', JSON.stringify(App.kitchenSettings));
    },
    
    printOrder: (id) => {
        window.socket.emit('print-order', { id });
    }
};

window.onload = App.init;
