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
            if(sb) { sb.style.display = 'flex'; sb.style.right = '-100%'; }
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
                if(settings.coverPrice) { App.coverPrice = parseFloat(settings.coverPrice); document.getElementById('inpCoverPrice').value = App.coverPrice; }
                
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
        window.socket.emit('save-store-settings', { resetTime: time, hours: hours, coverPrice: cp });
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
        // Ελέγχουμε αν είναι ανοιχτό (0px) ή κλειστό (-100%)
        const currentRight = sb.style.right;
        const isOpen = currentRight === '0px' || currentRight === '0';
        
        if (isOpen) {
            sb.style.right = '-100%';
        } else {
            sb.style.right = '0px';
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
            
            const icon = document.createElement('div');
            icon.className = `order-folder ${order.status === 'pending' ? 'ringing' : ''}`;
            // ✅ Apply Cooking style
            if (order.status === 'cooking') icon.classList.add('cooking');
            
            icon.style = style;
            icon.innerHTML = `<div class="folder-icon">📂</div><div class="folder-label">${order.from}</div><div class="folder-time">${time}</div>`;
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
        if (order.status === 'pending') {
            actions = `<button class="btn-win-action" style="background:#2196F3; color:white;" onclick="App.acceptOrder(${order.id})">🔊 ΑΠΟΔΟΧΗ</button>`;
        } else if (order.status === 'cooking') {
            actions = `<button class="btn-win-action" style="background:#FFD700; color:black;" onclick="App.markReady(${order.id})">🛵 ΕΤΟΙΜΟ / ΔΙΑΝΟΜΗ</button>`;
        } else {
            if (App.adminMode === 'kitchen') {
                actions = `<button class="btn-win-action" style="background:#555; color:white;" onclick="App.minimizeOrder('${order.id}')">OK (ΚΛΕΙΣΙΜΟ)</button>`;
            } else {
                actions = `<button class="btn-win-action" style="background:#00E676;" onclick="App.completeOrder(${order.id})">💰 ΕΞΟΦΛΗΣΗ & ΚΛΕΙΣΙΜΟ</button>`;
            }
        }
        win.style.border = `none`;
        win.innerHTML = `
            <div class="win-header">
                <span style="font-weight:bold; color:white; font-size:24px;">${order.from}</span>
                <div class="win-controls">
                    <button class="win-btn-top" style="background:#FF9800; color:black;" onclick="App.minimizeOrder('${order.id}')">🔙 ΠΙΣΩ</button>
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

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(() => console.log("✅ Admin Service Worker Registered"))
        .catch(err => console.log("❌ Admin SW Error:", err));
}
