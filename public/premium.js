import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";

// --- MANIFEST LOGIC (Running immediately) ---
(function() {
    // PWA LOGIC: Μοναδικό ID για το Admin App
    const params = new URLSearchParams(window.location.search);
    const pName = params.get('name');
    const pStore = params.get('store');
    const manifestLink = document.getElementById('dynamicManifest');
    
    // 🔥 FIX: Μοναδικό ID ανά κατάστημα
    let url = `manifest.json?icon=admin`;
    if (pStore) {
        url += `&store=${pStore}&id=admin_${pStore}`;
    } else {
        url += `&id=admin_app_general`;
    }
    
    if (pName) url += `&name=${encodeURIComponent(pName)} (Admin)`;
    
    if (manifestLink) manifestLink.href = url;
    if (pName) document.title = decodeURIComponent(pName) + " (Admin)";
})();

// --- AUDIO ENGINE ---
const AudioEngine = {
    keepAlivePlayer: null, 
    alarmPlayer: null,      
    isRinging: false,
    wakeLock: null,
    
    async init() {
        if (!this.keepAlivePlayer) {
            this.keepAlivePlayer = document.createElement("audio");
            this.keepAlivePlayer.src = "tone19hz.wav"; 
            this.keepAlivePlayer.loop = true;
            this.keepAlivePlayer.volume = 1.0; 
            document.body.appendChild(this.keepAlivePlayer);
        }
        if (!this.alarmPlayer) {
            this.alarmPlayer = document.createElement("audio");
            this.alarmPlayer.src = "alert.mp3"; 
            this.alarmPlayer.loop = true;
            this.alarmPlayer.volume = 1.0;
            document.body.appendChild(this.alarmPlayer);
        }
        this.requestWakeLock();
        try { await this.keepAlivePlayer.play(); } catch (e) {}
    },
    async triggerAlarm() {
        if (this.isRinging) return;
        this.isRinging = true;
        this.alarmPlayer.currentTime = 0;
        try { await this.alarmPlayer.play(); } catch(e) {}
        if (navigator.vibrate) navigator.vibrate([1000, 500, 1000]);
    },
    stopAlarm() {
        if (!this.isRinging) return; 
        this.isRinging = false;
        this.alarmPlayer.pause();
        this.alarmPlayer.currentTime = 0;
        if (navigator.vibrate) navigator.vibrate(0);
    },
    async requestWakeLock() {
        if ('wakeLock' in navigator) {
            try { this.wakeLock = await navigator.wakeLock.request("screen"); } catch (e) {}
        }
    }
};
window.AudioEngine = AudioEngine;

// --- MAIN APPLICATION LOGIC ---

const savedSession = localStorage.getItem('bellgo_session');
if (!savedSession) window.location.href = "login.html";
const userData = JSON.parse(savedSession || '{}');
if (userData.role !== 'admin') { alert("Access Denied"); window.location.href = "login.html"; }

const firebaseConfig = { 
    apiKey: "AIzaSyBDOAlwLn4P5PMlwkg_Hms6-4f9fEcBKn8", 
    authDomain: "bellgo-5dbe5.firebaseapp.com", 
    projectId: "bellgo-5dbe5", 
    storageBucket: "bellgo-5dbe5.firebasestorage.app", 
    messagingSenderId: "799314495253", 
    appId: "1:799314495253:web:baf6852f2a065c3a2e8b1c"
};
const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

// ✅ PRESET MENUS LOADED FROM menu-presets.js
// If file missing, fallback to empty object
const PRESET_MENUS = window.PRESET_MENUS || {};

const calculateTotal = (text) => {
    let total = 0;
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

window.App = {
    activeOrders: [],
    menuData: [], 
    currentCategoryIndex: null,
    isChatOpen: false, 
    pendingAction: null, 
    lastRingingState: {}, 
    tempComingState: {},
    lastStaffList: [],
    scheduleData: {},
    adminMode: localStorage.getItem('bellgo_admin_mode') || 'cashier', // 'cashier' or 'kitchen'
    coverPrice: 0,
    
    // EXTRAS STATE
    currentExtrasItemIndex: null,
    currentExtrasCatIndex: null,
    tempExtras: [],
    cachedStats: null, // ✅ Store stats for navigation

    init: () => {
        document.body.addEventListener('click', () => { 
            if(window.AudioEngine) window.AudioEngine.init();
        }, {once:true});
        
        // ✅ UI SETUP BASED ON MODE
        if (App.adminMode === 'kitchen') {
            // 👨‍🍳 KITCHEN MODE: Καθαρό περιβάλλον
            document.getElementById('btnNewOrderSidebar').style.display = 'none';
            document.getElementById('btnMenuToggle').style.display = 'none';
            document.getElementById('btnSettings').style.display = 'none';
            document.getElementById('btnKitchenExit').style.display = 'flex';
            document.getElementById('inpStoreNameHeader').disabled = true;
            // 🔒 ΚΟΥΖΙΝΑ: Απενεργοποίηση Sidebar
            const sb = document.getElementById('orderSidebar');
            if(sb) sb.style.display = 'none';
        } else {
            // 🏪 CASHIER MODE
            document.getElementById('btnNewOrderSidebar').style.display = 'flex';
            // ✅ ΤΑΜΕΙΟ: Η μπάρα υπάρχει αλλά ξεκινάει ΚΛΕΙΣΤΗ
            const sb = document.getElementById('orderSidebar');
            if(sb) { sb.style.display = 'flex'; sb.style.left = '-100%'; }
        }

        App.connectSocket();
        App.startHeartbeat();
        App.requestNotifyPermission(); 
        
        setInterval(() => {
            if (Object.keys(App.tempComingState).length > 0 && App.lastStaffList.length > 0) {
                App.renderStaffList(App.lastStaffList);
            }
        }, 1000);
    },
    
    requestNotifyPermission: async () => {
        try {
            const permission = await Notification.requestPermission();
            if (permission === "granted") {
                const registration = await navigator.serviceWorker.ready;
                const token = await getToken(messaging, { 
                    vapidKey: "BDUWH0UaYagUPXGB8BM59VFRBW8FMbgOy7YcbBHxT4aJ6rN0Jms-0dGWXIODGYWoSSHomos4gg1GOTZn6k70JcM", 
                    serviceWorkerRegistration: registration 
                }); 
                if (token) {
                    localStorage.setItem('fcm_token', token);
                    window.socket.emit('update-token', { token: token, username: userData.name });
                }
            }
        } catch (error) { console.error("Notification Error:", error); }
    },

    connectSocket: () => {
        // ✅ FIX: Αν υπάρχει ήδη socket, δεν φτιάχνουμε νέο
        if (window.socket) {
            if (!window.socket.connected) window.socket.connect();
            return;
        }
        window.socket = io({ transports: ['polling', 'websocket'], reconnection: true });
        const socket = window.socket;
        socket.on('connect', () => {
            document.getElementById('connDot').style.background = '#00E676';
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
            });
        });
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
                if(settings.name) document.getElementById('inpStoreNameHeader').value = settings.name;
                document.getElementById('switchCust').checked = settings.statusCustomer;
                document.getElementById('switchStaff').checked = settings.statusStaff;
                if(settings.resetTime) document.getElementById('inpResetTime').value = settings.resetTime;
                if(settings.hours) document.getElementById('inpHours').value = settings.hours;
                if(settings.schedule) App.scheduleData = settings.schedule;
                // ✅ FIX: Να δέχεται και το 0 ως τιμή
                if(settings.coverPrice !== undefined) { 
                    App.coverPrice = parseFloat(settings.coverPrice); 
                    document.getElementById('inpCoverPrice').value = App.coverPrice; 
                }
                if(settings.googleMapsUrl !== undefined) document.getElementById('inpGoogleMaps').value = settings.googleMapsUrl;
                
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
        
        socket.on('staff-accepted-alarm', (data) => {
            if(!App.tempComingState) App.tempComingState = {};
            App.tempComingState[data.username] = Date.now();
            App.renderStaffList(App.lastStaffList);
        });

        // ✅ FIX: Προσθήκη listener για τα στατιστικά που έλειπε
        socket.on('stats-data', (data) => App.renderStats(data));
        
        // ✅ Update Full Order List
        socket.on('orders-update', (orders) => {
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
            }
        });

        socket.on('ring-bell', () => {
            if(window.AudioEngine) window.AudioEngine.triggerAlarm();
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

    acceptAlarm: () => {
        if(window.AudioEngine) window.AudioEngine.stopAlarm();
        window.socket.emit('admin-stop-ringing'); 
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
    openSettingsModal: () => { document.getElementById('settingsModal').style.display = 'flex'; },
    
    autoSaveSettings: () => {
        const time = document.getElementById('inpResetTime').value;
        const hours = document.getElementById('inpHours').value;
        const cp = document.getElementById('inpCoverPrice').value;
        const gmaps = document.getElementById('inpGoogleMaps').value.trim();
        window.socket.emit('save-store-settings', { resetTime: time, hours: hours, coverPrice: cp, googleMapsUrl: gmaps });
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

    // --- STATISTICS LOGIC ---
    openStatsModal: () => {
        document.getElementById('settingsModal').style.display = 'none';
        document.getElementById('statsModal').style.display = 'flex';
        App.refreshStats();
    },
    refreshStats: () => {
        document.getElementById('statsContent').innerHTML = '<p style="text-align:center; color:#aaa;">Φόρτωση...</p>';
        window.socket.emit('get-stats');
    },
    renderStats: (stats) => {
        App.cachedStats = stats;
        App.renderStatsDashboard();
    },
    renderStatsDashboard: () => {
        const stats = App.cachedStats;
        const container = document.getElementById('statsContent');
        if (!stats || Object.keys(stats).length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#aaa;">Δεν υπάρχουν δεδομένα ακόμα.</p>';
            return;
        }

        // Βρίσκουμε τον τρέχοντα μήνα και μέρα
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' }); // "2026-02-13"
        const [year, month, day] = dateStr.split('-');
        const monthKey = `${year}-${month}`;
        
        const mStats = stats[monthKey];
        if (!mStats) {
            container.innerHTML = `<p style="text-align:center; color:#aaa;">Κανένα δεδομένο για τον μήνα ${monthKey}</p>`;
            return;
        }

        // --- CALCULATIONS ---
        const todayStats = (mStats.days && mStats.days[day]) ? mStats.days[day] : { turnover: 0, orders: 0, products: {} };
        
        // Calculate Total Items for Today
        let todayItemsCount = 0;
        if(todayStats.products) Object.values(todayStats.products).forEach(q => todayItemsCount += q);

        // Calculate Total Items for Month
        let monthItemsCount = 0;
        if(mStats.products) Object.values(mStats.products).forEach(q => monthItemsCount += q);

        let html = `
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-bottom:25px;">
                <!-- TODAY CARD -->
                <div onclick="App.showPeriodDetails('today')" style="background:#222; padding:20px; border-radius:12px; text-align:center; border:1px solid #444; cursor:pointer; transition:0.2s; box-shadow:0 4px 10px rgba(0,0,0,0.3);">
                    <div style="font-size:14px; color:#aaa; font-weight:bold; margin-bottom:5px;">ΣΗΜΕΡΑ (${day}/${month})</div>
                    <div style="font-size:32px; font-weight:800; color:#FFD700;">${todayStats.turnover.toFixed(2)}€</div>
                    <div style="font-size:13px; color:#fff; margin-top:5px;">${todayItemsCount} τεμάχια</div>
                </div>
                <!-- MONTH CARD -->
                <div onclick="App.showPeriodDetails('month')" style="background:#222; padding:20px; border-radius:12px; text-align:center; border:1px solid #444; cursor:pointer; transition:0.2s; box-shadow:0 4px 10px rgba(0,0,0,0.3);">
                    <div style="font-size:14px; color:#aaa; font-weight:bold; margin-bottom:5px;">ΜΗΝΑΣ (${month})</div>
                    <div style="font-size:32px; font-weight:800; color:#00E676;">${mStats.turnover.toFixed(2)}€</div>
                    <div style="font-size:13px; color:#fff; margin-top:5px;">${monthItemsCount} τεμάχια</div>
                </div>
            </div>
        `;

        // --- STAFF LIST ---
        html += `<div style="font-size:18px; font-weight:bold; color:#2196F3; margin-bottom:15px; border-bottom:1px solid #333; padding-bottom:5px;">ΠΡΟΣΩΠΙΚΟ</div>`;
        html += `<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap:10px; margin-bottom:25px;">`;
        
        // Aggregate Staff Data from Days
        let staffAgg = {};
        if(mStats.days) {
            Object.values(mStats.days).forEach(d => {
                if(d.staff) {
                    Object.entries(d.staff).forEach(([name, sData]) => {
                        if(!staffAgg[name]) staffAgg[name] = { turnover: 0, orders: 0, items: 0 };
                        staffAgg[name].turnover += sData.turnover;
                        staffAgg[name].orders += sData.orders;
                        if(sData.products) Object.values(sData.products).forEach(q => staffAgg[name].items += q);
                    });
                }
            });
        }

        Object.entries(staffAgg).forEach(([name, data]) => {
            html += `
            <div onclick="App.showStaffDetails('${name}')" style="background:#2a2a2a; padding:15px; border-radius:10px; border:1px solid #444; cursor:pointer; text-align:center;">
                <div style="font-size:24px; margin-bottom:5px;">👤</div>
                <div style="font-weight:bold; color:#fff; margin-bottom:5px;">${name}</div>
                <div style="color:#00E676; font-weight:bold;">${data.turnover.toFixed(2)}€</div>
                <div style="font-size:11px; color:#aaa;">${data.items} τμχ</div>
            </div>`;
        });
        html += `</div>`;

        // --- PRODUCT CATALOG TABLE ---
        html += `<div style="font-size:18px; font-weight:bold; color:#FFD700; margin-bottom:15px; border-bottom:1px solid #333; padding-bottom:5px;">ΚΑΤΑΛΟΓΟΣ ΠΡΟΪΟΝΤΩΝ</div>`;
        html += `<div style="background:#222; border-radius:10px; overflow:hidden; border:1px solid #444;">
                    <div style="display:grid; grid-template-columns: 2fr 1fr 1fr; background:#333; padding:10px; font-weight:bold; font-size:12px; color:#aaa;">
                        <div>ΠΡΟΪΟΝ</div>
                        <div style="text-align:center;">ΣΗΜΕΡΑ</div>
                        <div style="text-align:center;">ΜΗΝΑΣ</div>
                    </div>
                    <div style="max-height:300px; overflow-y:auto;">`;
        
        // Flatten Menu to get all products
        let allProducts = [];
        App.menuData.forEach(cat => {
            cat.items.forEach(item => {
                let n = (typeof item === 'object') ? item.name : item.split(':')[0];
                allProducts.push(n);
            });
        });
        // Unique products
        allProducts = [...new Set(allProducts)];
        allProducts.sort();

        allProducts.forEach(prod => {
            const todayQty = (todayStats.products && todayStats.products[prod]) ? todayStats.products[prod] : 0;
            const monthQty = (mStats.products && mStats.products[prod]) ? mStats.products[prod] : 0;
            
            // Show only if sold at least once in month or exists in catalog
            if (monthQty > 0 || todayQty > 0) {
                html += `<div style="display:grid; grid-template-columns: 2fr 1fr 1fr; padding:10px; border-bottom:1px solid #333; font-size:14px;">
                            <div style="color:#eee;">${prod}</div>
                            <div style="text-align:center; color:${todayQty>0?'#FFD700':'#555'}; font-weight:bold;">${todayQty}</div>
                            <div style="text-align:center; color:${monthQty>0?'#00E676':'#555'}; font-weight:bold;">${monthQty}</div>
                         </div>`;
            }
        });

        html += `</div></div>`;
        container.innerHTML = html;
    },

    showPeriodDetails: (period) => {
        const stats = App.cachedStats;
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });
        const [year, month, day] = dateStr.split('-');
        const monthKey = `${year}-${month}`;
        const mStats = stats[monthKey];
        if(!mStats) return;

        let products = {};
        let title = "";
        
        if (period === 'today') {
            title = `ΠΩΛΗΣΕΙΣ ΣΗΜΕΡΑ (${day}/${month})`;
            if(mStats.days && mStats.days[day] && mStats.days[day].products) products = mStats.days[day].products;
        } else {
            title = `ΠΩΛΗΣΕΙΣ ΜΗΝΑ (${month})`;
            if(mStats.products) products = mStats.products;
        }

        const sorted = Object.entries(products).sort((a,b) => b[1] - a[1]);
        let html = `<div style="margin-bottom:15px; display:flex; align-items:center;"><button onclick="App.renderStatsDashboard()" style="background:#333; color:white; border:none; padding:5px 10px; border-radius:5px; margin-right:10px; cursor:pointer;">🔙</button><h3 style="margin:0; color:#FFD700;">${title}</h3></div>`;
        html += `<div style="display:flex; flex-direction:column; gap:5px;">`;
        sorted.forEach(([name, qty], idx) => {
            html += `<div style="display:flex; justify-content:space-between; background:#222; padding:10px; border-radius:6px; border:1px solid #444;">
                        <span><b>${idx+1}.</b> ${name}</span><span style="color:#00E676; font-weight:bold;">${qty} τμχ</span>
                     </div>`;
        });
        html += `</div>`;
        document.getElementById('statsContent').innerHTML = html;
    },

    showStaffDetails: (name) => {
        const stats = App.cachedStats;
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });
        const [year, month] = dateStr.split('-');
        const monthKey = `${year}-${month}`;
        const mStats = stats[monthKey];
        if(!mStats || !mStats.days) return;

        // Collect shifts
        let shifts = [];
        let totalTurnover = 0;
        let totalItems = 0;
        
        Object.entries(mStats.days).forEach(([d, dayData]) => {
            if(dayData.staff && dayData.staff[name]) {
                const sData = dayData.staff[name];
                let itemsCount = 0;
                if(sData.products) Object.values(sData.products).forEach(q => itemsCount += q);
                
                totalTurnover += sData.turnover;
                totalItems += itemsCount;
                
                // Top products for that day
                const topProds = Object.entries(sData.products || {}).sort((a,b)=>b[1]-a[1]).slice(0,3).map(p=>`${p[0]} (${p[1]})`).join(', ');

                shifts.push({ date: `${d}/${month}`, turnover: sData.turnover, items: itemsCount, orders: sData.orders, top: topProds });
            }
        });
        
        shifts.sort((a,b) => parseInt(b.date) - parseInt(a.date)); // Sort by day desc

        let html = `<div style="margin-bottom:15px; display:flex; align-items:center;"><button onclick="App.renderStatsDashboard()" style="background:#333; color:white; border:none; padding:5px 10px; border-radius:5px; margin-right:10px; cursor:pointer;">🔙</button><h3 style="margin:0; color:#2196F3;">👤 ${name}</h3></div>`;
        
        html += `<div style="background:#222; padding:15px; border-radius:10px; margin-bottom:20px; display:flex; justify-content:space-around; text-align:center; border:1px solid #444;">
                    <div><div style="color:#aaa; font-size:12px;">ΤΖΙΡΟΣ</div><div style="color:#00E676; font-weight:bold; font-size:20px;">${totalTurnover.toFixed(2)}€</div></div>
                    <div><div style="color:#aaa; font-size:12px;">ΤΕΜΑΧΙΑ</div><div style="color:white; font-weight:bold; font-size:20px;">${totalItems}</div></div>
                 </div>`;
                 
        html += `<div style="font-size:14px; font-weight:bold; color:#aaa; margin-bottom:10px;">ΑΝΑΛΥΤΙΚΑ ΑΝΑ ΒΑΡΔΙΑ</div>`;
        html += `<div style="display:flex; flex-direction:column; gap:10px;">`;
        
        shifts.forEach(s => {
            html += `<div style="background:#1a1a1a; padding:10px; border-radius:8px; border:1px solid #333;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                            <span style="color:#FFD700; font-weight:bold;">📅 ${s.date}</span>
                            <span style="color:#00E676; font-weight:bold;">${s.turnover.toFixed(2)}€</span>
                        </div>
                        <div style="font-size:12px; color:#ccc; display:flex; justify-content:space-between;">
                            <span>${s.items} τμχ / ${s.orders} παρ.</span>
                        </div>
                        <div style="font-size:11px; color:#777; margin-top:4px; font-style:italic;">${s.top}</div>
                     </div>`;
        });
        html += `</div>`;
        
        document.getElementById('statsContent').innerHTML = html;
    },

    
    // --- TEMPLATE LOGIC ---
    applyPresetMenu: () => {
        const type = document.getElementById('selShopType').value;
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
        let fullLink = `${baseUrl}/order.html?store=${encodeURIComponent(userData.store)}`;
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
        
        input.addEventListener('blur', () => {
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

            // Preserve existing object structure if it exists
            let newItem;
            if (index !== null && typeof cat.items[index] === 'object') {
                newItem = { ...cat.items[index], name: name, price: price };
            } else {
                newItem = { name: name, price: price, extras: [] };
            }

            App.pendingAction = () => {
                if(index === null) cat.items.push(newItem); 
                else cat.items[index] = newItem;
            };
            App.openSaveModal();
        });
        
        wrapper.appendChild(input);
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
    togglePaso: () => {
        const isPaso = document.getElementById('sidebarPaso').checked;
        const tblInp = document.getElementById('sidebarTable');
        if (isPaso) { tblInp.disabled = true; tblInp.value = ''; tblInp.placeholder = '#'; }
        else { tblInp.disabled = false; tblInp.focus(); }
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
        
        const isPaso = document.getElementById('sidebarPaso').checked;
        const table = document.getElementById('sidebarTable').value;
        const covers = parseInt(document.getElementById('sidebarCovers').value) || 0;
        
        let header = "";
        if (isPaso) header = "[PASO]";
        else {
            if (!table) return alert("Παρακαλώ βάλτε τραπέζι ή επιλέξτε PASO.");
            header = `[ΤΡ: ${table}]`;
        }
        
        let finalBody = txt;
        // ✅ AUTO COVER CHARGE
        if (covers > 0) {
            header += ` [AT: ${covers}]`;
            if (App.coverPrice > 0) {
                finalBody += `\n${covers} ΚΟΥΒΕΡ:${(covers * App.coverPrice).toFixed(2)}`;
            }
        }
        
        window.socket.emit('new-order', `${header}\n${finalBody}`);
        alert("Εστάλη!");
        document.getElementById('sidebarOrderText').value = '';
        document.getElementById('sidebarTable').value = '';
        document.getElementById('sidebarCovers').value = '';
        App.toggleOrderSidebar(); // Close
    },

    renderDesktopIcons: (orders) => {
        const desktop = document.getElementById('desktopArea');
        desktop.innerHTML = '';
        orders.sort((a,b) => a.id - b.id);
        orders.forEach(order => {
            const time = new Date(order.id).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            let style = '';
            const isPaid = order.text.includes('PAID') || order.text.includes('✅');
            
            const icon = document.createElement('div');
            icon.className = `order-folder ${order.status === 'pending' ? 'ringing' : ''}`;
            // ✅ Apply Cooking style
            if (order.status === 'cooking') icon.classList.add('cooking');
            // ✅ Apply Paid style
            if (isPaid) icon.style.border = "2px solid #00E676";
            
            icon.style = style;
            icon.innerHTML = `<div class="folder-icon">${isPaid ? '✅' : '📂'}</div><div class="folder-label">${order.from}</div><div class="folder-time">${time}</div>`;
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
        let infoText = "";
        let itemsText = order.text;
        if (order.text.includes("---")) {
            const parts = order.text.split("---");
            infoText = parts[0].replace(/\n/g, '<br>').trim();
            itemsText = parts[1].trim();
        } else {
            itemsText = order.text;
        }
        
        // ✅ Add Time Info
        let timeInfo = `<div style="font-size:12px; color:#aaa; margin-top:5px;">Λήψη: ${new Date(order.id).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>`;
        if(order.startTime) {
            timeInfo += `<div style="font-size:12px; color:#FFD700; font-weight:bold;">Έναρξη: ${new Date(order.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>`;
        }

        const total = calculateTotal(order.text);
        const displayItems = itemsText.replace(/\n/g, '<br>');
        let actions = '';
        let treatBtn = ''; // ✅ Κουμπί Κεράσματος για το Header

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
                actions = `<button class="btn-win-action" style="background:#635BFF; color:white; margin-bottom:10px;" onclick="App.openQrPayment('${order.id}')">💳 QR CARD (ΠΕΛΑΤΗΣ)</button>`;
                actions += `<button class="btn-win-action" style="background:#00E676;" onclick="App.completeOrder(${order.id})">💰 ΕΞΟΦΛΗΣΗ (ΜΕΤΡΗΤΑ)</button>`;
            }
        }
        win.style.border = `none`;
        win.innerHTML = `
            <div class="win-header">
                <span style="font-weight:bold; color:white; font-size:24px;">${order.from}</span>
                <div class="win-controls" style="display:flex; align-items:center;">
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

    // ✅ NEW: QR PAYMENT LOGIC
    openQrPayment: async (id) => {
        const order = App.activeOrders.find(o => o.id == id);
        if(!order) return;
        const total = calculateTotal(order.text);
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
            const url = `${baseUrl}/shop/${storeParam}/?table=${encodeURIComponent(t)}`;
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
        window.socket.emit('ready-order', Number(id)); // Send as Number
        const win = document.getElementById(`win-${id}`);
        if(win) win.style.display = 'none';
    },
    completeOrder: (id) => {
        if(confirm("Εξόφληση και κλείσιμο;")) {
            window.socket.emit('pay-order', Number(id)); 
            const win = document.getElementById(`win-${id}`);
            if(win) win.remove();
        }
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
            const isAway = u.status === 'away';
            
            let roleClass = 'role-waiter';
            let icon = '🧑‍🍳';
            if (u.role === 'driver') {
                roleClass = 'role-driver';
                icon = '🛵';
            }

            staffDiv.className = `staff-folder ${roleClass} ${isAway ? 'ghost' : ''}`;

            let stTxt = isAway ? "Away" : "Idle";
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
            }
            
            staffDiv.innerHTML = `
                ${closeBtn}
                <div class="staff-icon">${icon}</div>
                <div class="staff-label">${u.username}</div>
                <div class="staff-status">${stTxt}</div>
            `;
            
            staffDiv.onclick = () => {
                const sourceLabel = App.adminMode === 'kitchen' ? "ΚΟΥΖΙΝΑ" : "ΤΑΜΕΙΟ";
                window.socket.emit('trigger-alarm', { target: u.username, source: sourceLabel });
                staffDiv.querySelector('.staff-status').innerText = 'Ringing';
                staffDiv.classList.add('ringing');
            };
            
            // The old logic for a delete button on 'away' users can be added here if needed.
            // For now, focusing on the visual replacement.

            container.appendChild(staffDiv);
        });
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
    logout: () => { if(window.socket) window.socket.emit('manual-logout'); localStorage.removeItem('bellgo_session'); window.location.href = "login.html"; },
    toggleFakeLock: () => { const el=document.getElementById('fakeLockOverlay'); el.style.display=(el.style.display==='flex')?'none':'flex'; },
    forceReconnect: () => { window.socket.disconnect(); setTimeout(()=>window.socket.connect(), 500); },
    startHeartbeat: () => setInterval(() => { if(window.socket?.connected) window.socket.emit('heartbeat'); }, 3000)
};

window.onload = App.init;

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(() => console.log("✅ Admin Service Worker Registered"))
        .catch(err => console.log("❌ Admin SW Error:", err));
}
