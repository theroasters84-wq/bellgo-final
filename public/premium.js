import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";
import { firebaseConfig, vapidKey } from './config.js';
import { StatsUI } from './premium-stats.js';
import { PaySystem } from './pay.js'; // ✅ Import PaySystem
import { Sundromes } from './sundromes.js'; // ✅ Import Sundromes (Case Sensitive Fix)
import { Apodiksh } from './apodiksh.js'; // ✅ Import Apodiksh
import { PrintSystem } from './premium-print.js'; // ✅ Import Print Logic
import { Admin } from './admin.js'; // ✅ Import Admin Logic
import { AdminUI } from './admin-ui.js'; // ✅ Import Admin UI Logic
import { ReserveTable } from './reserve-table.js'; // ✅ Import Reservation Logic
import { Menu, DEFAULT_CATEGORIES, PRESET_MENUS } from './menu-presets.js'; // ✅ Import Menu Logic
import { OrdersUI } from './premium-orders.js'; // ✅ Import Orders UI
import { I18n, PushNotifications } from './shared-utils.js';
import { initPremiumSockets } from './premium-sockets.js'; // ✅ Import WebSockets

const savedSession = localStorage.getItem('bellgo_session');
if (!savedSession) window.location.replace("login.html");
let userData = {};
try { userData = JSON.parse(savedSession || '{}'); } catch(e) { 
    console.error("Session Error", e); window.location.replace("login.html"); 
}
if (userData.role !== 'admin' && userData.role !== 'kitchen' && userData.role !== 'waiter') { alert("Access Denied"); window.location.replace("login.html"); }

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
    
    rewardSettings: { enabled: false, gift: '', target: 5 }, // ✅ NEW: Reward Settings
    softPosSettings: {}, // ✅ NEW: SoftPOS Settings
    posSettings: {}, // ✅ NEW: Physical POS Settings
    posMode: 'auto', // ✅ NEW: POS Mode (auto/ask)
    einvoicingEnabled: false, // ✅ NEW: E-Invoicing State
    features: {}, // ✅ NEW: Local Features State
    tempFeatures: {}, // ✅ NEW: Temporary Features for Editing
    cashRegButtons: [], // ✅ Store custom buttons
    tempPasoText: "", // ✅ Store PASO order text temporarily

    hasCheckedPendingReservations: false, // ✅ NEW: Flag για έλεγχο κρατήσεων κατά την είσοδο
    staffChargeMode: false, // ✅ NEW: Staff Charge Setting
    userData: userData, // ✅ Expose userData for Admin module
    ...(StatsUI || {}), // ✅ Import Statistics Logic (Safe Spread)
    ...(PaySystem || {}), // ✅ Import Pay Logic
    ...(Apodiksh || {}), // ✅ Import Receipt Logic
    ...(PrintSystem || {}), // ✅ Import Print Logic
    ...(Admin || {}), // ✅ Import Admin Logic (Safe Spread)
    ...(AdminUI || {}), // ✅ Import Admin UI Logic
    ...(ReserveTable || {}), // ✅ Import Reservation Logic
    ...(Menu || {}), // ✅ Import Menu Logic
        ...(OrdersUI || {}), // ✅ Import Orders UI
    
    
    init: () => {
        // ✅ FIX: Initialize features from local storage to prevent empty state
        if (userData.features) {
            App.features = { ...userData.features };
        }

        // ✅ FIX: Connect Socket FIRST to allow real-time unlock
        App.connectSocket();

        // ✅ NEW: Enforce Subscription (Overlay if none)
        Sundromes.checkSubscriptionAndEnforce({ ...userData, features: App.features });

        // ✅ FIX: Hide sensitive elements immediately to prevent FOUC (Flash of Unauthorized Content)
        ['desktopArea', 'btnMenuToggle', 'btnCashRegister', 'btnExpenses', 'btnNewOrderSidebar', 'btnModeTable', 'btnSettings', 'btnWallet', 'btnFakeLock'].forEach(id => { // ✅ Added more IDs
            const el = document.getElementById(id);
            if(el) el.style.display = 'none';
        });
        const btnRes = document.getElementById('btnReservations');
        if(btnRes && btnRes.parentElement) btnRes.parentElement.style.display = 'none';

        // ✅ iOS INSTALL PROMPT (Admin/Staff Only)
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
        document.body.addEventListener('click', () => { 
            if(window.AudioEngine) window.AudioEngine.init();
        }, {once:true});
        
        // ✅ UI SETUP BASED ON MODE
        // ✅ FIX: Άμεση εμφάνιση ονόματος (για να μην φαίνεται κενό μέχρι να συνδεθεί)
        const cachedName = localStorage.getItem('bellgo_store_name');
        const inpHeader = document.getElementById('inpStoreNameHeader');
        if (inpHeader && cachedName) {
            inpHeader.value = cachedName;
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
            // ❌ REMOVED: Μην το εμφανίζεις με το ζόρι. Άσε το applyFeatureVisibility να αποφασίσει.
            // const btnNew = document.getElementById('btnNewOrderSidebar'); if(btnNew) btnNew.style.display = 'flex';
            // ✅ ΤΑΜΕΙΟ: Η μπάρα υπάρχει αλλά ξεκινάει ΚΛΕΙΣΤΗ
            const sb = document.getElementById('orderSidebar');
            if(sb) { sb.style.display = 'flex'; sb.style.left = '-100%'; }
        }

        // ✅ FIX: Απόκρυψη StartScreen αν υπάρχει (για να μην μπλοκάρει τα κλικ)
        const startScreen = document.getElementById('startScreen');
        if(startScreen) startScreen.style.display = 'none';

        App.startHeartbeat();
        // App.requestNotifyPermission(); 
        PushNotifications.checkPermission(messaging, (token) => {
            if(window.socket && window.socket.connected) {
                window.socket.emit('update-token', { token: token, username: userData.name });
            }
        }, false);

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
        // if(window.DNDBot) window.DNDBot.init();
        
        // ✅ Init Pay System
        PaySystem.init();

        // ✅ Check SoftPOS Return
        PaySystem.checkSoftPosReturn();

        // ✅ NEW: Apply Feature Visibility Initial Check
        App.applyFeatureVisibility();
        
        // ✅ NEW: Re-apply visibility after a moment to ensure no overrides (Double Check)
        setTimeout(App.applyFeatureVisibility, 500);

        // ✅ LOAD LANGUAGE ON INIT
        const savedLang = localStorage.getItem('bellgo_lang') || 'el';
        I18n.setLanguage(savedLang);
    },
    
    connectSocket: () => {
        initPremiumSockets(window.App, userData);
    },
    
    // ✅ NEW: Feature Check Logic (Database OR Year Hack)
    hasFeature: (key) => {
        // Χρήση της κεντρικής λογικής από το sundromes.js
        // Περνάμε το userData που περιέχει plan, features και store (email)
        // Επίσης ελέγχουμε και τα τοπικά App.features αν έχουν ενημερωθεί
        const userContext = { ...userData, features: { ...userData.features, ...App.features } };
        return Sundromes.hasAccess(userContext, key);
    },

    // ✅ NEW: Apply Visibility based on Features
    applyFeatureVisibility: () => {
        console.log("🔍 Applying Features:", App.features); // Debugging
        // 1. Συλλογή όλων των IDs που ελέγχονται από τα πακέτα (για να τα κρύψουμε αρχικά)
        const allControllableIds = new Set();
        Sundromes.packages.forEach(p => {
            if(p.ui_ids) p.ui_ids.forEach(id => allControllableIds.add(id));
        });

        // 2. Συλλογή των IDs που ΠΡΕΠΕΙ να φαίνονται (βάσει ενεργών πακέτων)
        const visibleIds = new Set();
        Sundromes.packages.forEach(p => {
            if (App.hasFeature(p.key) && p.ui_ids) {
                p.ui_ids.forEach(id => visibleIds.add(id));
            }
        });
        
        // ✅ NEW: Custom Logic for Settings Restructuring
        // 3. Εφαρμογή (Εμφάνιση/Απόκρυψη) - GENERIC LOOP FIRST
        allControllableIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                if (visibleIds.has(id)) {
                    // Αν είναι εικονίδιο header, συνήθως θέλει flex, αλλιώς block
                    const isIcon = el.classList.contains('btn-icon') || el.classList.contains('btn-icon-wrapper');
                    const isSwitch = el.classList.contains('switch-row'); // ✅ FIX: Keep flex for switches
                    
                    if (id === 'desktopArea') el.style.display = 'grid'; // ✅ FIX: Keep grid for desktopArea
                    else if (isIcon || isSwitch) el.style.display = 'flex';
                    else el.style.display = 'block';
                } else {
                    el.style.display = 'none';
                }
            }
        });

        // ✅ NEW: Custom Logic for Settings Restructuring - RUNS AFTER GENERIC LOOP TO OVERRIDE
        const hasPos = App.hasFeature('pack_pos');
        const hasManager = App.hasFeature('pack_manager');
        const hasDelivery = App.hasFeature('pack_delivery');
        const hasTables = App.hasFeature('pack_tables');
        
        const isMidTier = hasManager || hasDelivery || hasTables; // 2, 3, 4

        const btnAdmin = document.getElementById('btnSettingsAdmin');
        const btnPinMain = document.getElementById('btnPinMain');
        const btnEinvMain = document.getElementById('btnSettingsEinvoicing');

        // Containers inside Admin Settings
        const softPos = document.getElementById('softPosSettingsContainer');
        const physPos = document.getElementById('physicalPosSettingsContainer');
        const stripe = document.getElementById('stripeSettingsContainer');
        const einvInner = document.getElementById('einvSettingsContainer');

        if (hasPos || isMidTier) {
            // Categories 2, 3, 4, 5: Show Admin Settings Category
            if(btnAdmin) btnAdmin.style.display = 'flex';
            if(btnPinMain) btnPinMain.style.display = 'none';
            
            if (hasPos) {
                // Category 5: Show All inside Admin
                if(softPos) softPos.style.display = 'block';
                if(physPos) physPos.style.display = 'block';
                if(stripe) stripe.style.display = 'block';
                if(einvInner) einvInner.style.display = 'block';
                if(btnEinvMain) btnEinvMain.style.display = 'none'; // Hide from main
            } else {
                // Categories 2, 3, 4: Show ONLY Stripe inside Admin
                if(softPos) softPos.style.display = 'none';
                if(physPos) physPos.style.display = 'none';
                if(stripe) stripe.style.display = 'block';
                if(einvInner) einvInner.style.display = 'none';
                if(btnEinvMain) btnEinvMain.style.display = 'none'; // Hide from main (not in these packs)
            }
        } else {
            // Categories 1, 6: Hide Admin Settings Category, Show PIN loose
            if(btnAdmin) btnAdmin.style.display = 'none';
            if(btnPinMain) btnPinMain.style.display = 'flex';
            if(btnEinvMain) btnEinvMain.style.display = 'none';
        }
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

    showLink: () => {
        document.getElementById('settingsModal').style.display = 'none'; 
        const el = document.getElementById('qrOverlay');
        const linkEl = document.getElementById('storeLink');
        const qrEl = document.getElementById('qrcode');
        const baseUrl = window.location.origin;
        const customName = document.getElementById('inpStoreNameHeader').value.trim();
        
        // 🔥 FIX: Χρήση του userData.store (email/room ID) για να συνδέονται στο ίδιο δωμάτιο
        let fullLink = `${baseUrl}/shop/${encodeURIComponent(userData.store)}/`;
        if(customName) fullLink += `?name=${encodeURIComponent(customName)}`;
        
        const titleEl = el.querySelector('div[data-i18n="store_link"]');
        if(titleEl) titleEl.innerText = "📲 Link Καταστήματος";

        linkEl.href = fullLink;
        linkEl.innerText = fullLink;
        qrEl.innerHTML = "";
        new QRCode(qrEl, { text: fullLink, width: 200, height: 200 });
        el.style.display = 'flex';
    },

    showReviewQr: () => {
        const url = document.getElementById('inpGoogleMaps').value.trim();
        if (!url) return alert("Παρακαλώ εισάγετε πρώτα το Link Αξιολόγησης!");

        document.getElementById('settingsModal').style.display = 'none'; 
        const el = document.getElementById('qrOverlay');
        const linkEl = document.getElementById('storeLink');
        const qrEl = document.getElementById('qrcode');
        
        const titleEl = el.querySelector('div[data-i18n="store_link"]');
        if(titleEl) titleEl.innerText = "⭐ QR Αξιολόγησης";

        linkEl.href = url;
        linkEl.innerText = url;
        qrEl.innerHTML = "";
        new QRCode(qrEl, { text: url, width: 200, height: 200 });
        el.style.display = 'flex';
    },

    openPinModal: () => {
        document.getElementById('pinChangeModal').style.display = 'flex';
        if(window.PIN) window.PIN.reset();
    },
    closePinModal: () => {
        document.getElementById('pinChangeModal').style.display = 'none';
    },
    changeAdminLockPass: () => {
        const p1 = prompt("🔐 ΝΕΟΣ ΚΩΔΙΚΟΣ ΔΙΑΧΕΙΡΙΣΤΗ\n\nΟρίστε κωδικό για το κλείδωμα των ρυθμίσεων:");
        if (!p1) return;
        const p2 = prompt("🔐 ΕΠΙΒΕΒΑΙΩΣΗ\n\nΠληκτρολογήστε ξανά τον κωδικό:");
        if (p1 === p2) {
            window.socket.emit('save-store-settings', { adminPin: p1.trim() });
            alert("✅ Ο κωδικός αποθηκεύτηκε!");
        } else {
            alert("❌ Οι κωδικοί δεν ταιριάζουν.");
        }
    },
};

// --- PIN MODULE ---
let pinValue = '';
let tempPin = ''; // ✅ For confirmation
let pinStep = 'create'; // 'create' | 'confirm'

window.PIN = {
    add: (n) => { if(pinValue.length < 4) { pinValue += n; PIN.updateDisplay(); } },
    clear: () => { pinValue = ''; PIN.updateDisplay(); },
    reset: () => { 
        pinValue = ''; 
        tempPin = ''; 
        pinStep = 'create'; 
        PIN.updateDisplay(); 
        const title = document.getElementById('pinModalTitle'); // Assuming ID exists or generic
        if(title) title.innerText = "ΝΕΟ PIN";
    },
    updateDisplay: () => { document.getElementById('pinDisplay').innerText = pinValue; },
    submit: () => {
        if(pinValue.length < 4) return alert("Το PIN πρέπει να είναι 4 ψηφία");
        
        // ✅ FIX: Double Confirmation Logic
        if (pinStep === 'create') {
            tempPin = pinValue;
            pinStep = 'confirm';
            pinValue = ''; // ✅ Clear for confirmation
            PIN.updateDisplay();
            alert("Επιβεβαίωση: Πληκτρολογήστε το ξανά.");
        } else if (pinStep === 'confirm') {
            if (pinValue !== tempPin) {
                alert("❌ Τα PIN δεν ταιριάζουν! Προσπαθήστε ξανά.");
                PIN.reset();
                return;
            }
            window.socket.emit('set-new-pin', { pin: pinValue, email: userData.email });
            App.closePinModal();
        }
    }
};

window.onload = App.init;
