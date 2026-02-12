import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";

// --- MANIFEST & PWA PRE-LOGIC ---
(function() {
    const params = new URLSearchParams(window.location.search);
    const pName = params.get('name');
    let pStore = params.get('store');

    if (pStore) {
        localStorage.setItem('bellgo_target_store', pStore);
    } else {
        pStore = localStorage.getItem('bellgo_target_store');
    }

    if (!pStore) {
        const pathParts = window.location.pathname.split('/');
        const shopIndex = pathParts.indexOf('shop');
        if (shopIndex !== -1 && pathParts[shopIndex + 1]) {
            pStore = pathParts[shopIndex + 1];
            localStorage.setItem('bellgo_target_store', pStore);
        }
    }

    if (pName) {
        document.title = decodeURIComponent(pName);
        let metaTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
        if(metaTitle) metaTitle.setAttribute('content', decodeURIComponent(pName));
    }

    const manifestLink = document.getElementById('dynamicManifest');
    if (manifestLink) {
        let manifestUrl = `manifest.json?icon=shop`; 
        if (pStore) {
            manifestUrl += `&store=${encodeURIComponent(pStore)}&id=cust_${encodeURIComponent(pStore)}`;
        } else {
            manifestUrl += `&id=customer_app_general`;
        }
        if (pName) manifestUrl += `&name=${encodeURIComponent(pName)}`;
        manifestLink.setAttribute('href', manifestUrl);
    }
})();

// --- SERVICE WORKER REGISTRATION ---
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => console.log('❌ SW Error:', err));
}

// --- INSTALL PROMPT LOGIC ---
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btnLogin = document.getElementById('btnInstallLogin');
    if(btnLogin) btnLogin.style.display = 'block';
    const btnHeader = document.getElementById('btnInstallHeader');
    if(btnHeader) btnHeader.style.display = 'block';
});

const isIos = () => /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
if (isIos() && !window.navigator.standalone) {
     document.getElementById('btnInstallLogin').style.display = 'block';
     document.getElementById('btnInstallHeader').style.display = 'block';
}

// --- FIREBASE CONFIG ---
const firebaseConfig = { 
    apiKey: "AIzaSyBDOAlwLn4P5PMlwkg_Hms6-4f9fEcBKn8", 
    authDomain: "bellgo-5dbe5.firebaseapp.com", 
    projectId: "bellgo-5dbe5", 
    storageBucket: "bellgo-5dbe5.firebasestorage.app", 
    messagingSenderId: "799314495253", 
    appId: "1:799314495253:web:baf6852f2a065c3a2e8b1c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const messaging = getMessaging(app);

// --- APP STATE ---
const params = new URLSearchParams(window.location.search);
let TARGET_STORE = params.get('store');

if (!TARGET_STORE) {
    const pathParts = window.location.pathname.split('/');
    const shopIndex = pathParts.indexOf('shop');
    if (shopIndex !== -1 && pathParts[shopIndex + 1]) { TARGET_STORE = pathParts[shopIndex + 1]; }
}

if (!TARGET_STORE) {
    TARGET_STORE = localStorage.getItem('bellgo_target_store');
}

const PRELOADED_NAME = params.get('name'); 

let currentUser = null;
let customerDetails = JSON.parse(localStorage.getItem('bellgo_customer_info') || 'null');
let activeOrderState = JSON.parse(localStorage.getItem('bellgo_active_order') || 'null');
const ORDER_TIMEOUT_MS = 60 * 60 * 1000; 
let storeSchedule = {};

// --- VISUAL VIEWPORT LOGIC ---
function handleViewport() {
    if (window.visualViewport) {
        document.documentElement.style.setProperty('--app-height', `${window.visualViewport.height}px`);
        if (window.visualViewport.height > (window.screen.height * 0.8)) {
            document.getElementById('orderPanel').classList.remove('writing-mode');
            document.getElementById('orderText').blur();
        }
    }
}
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleViewport);
    window.visualViewport.addEventListener('scroll', handleViewport);
}
window.addEventListener('resize', handleViewport);
handleViewport();

// --- MAIN APP LOGIC ---
window.App = {
    installPWA: async () => { if (deferredPrompt) { deferredPrompt.prompt(); const { outcome } = await deferredPrompt.userChoice; if (outcome === 'accepted') { document.getElementById('btnInstallLogin').style.display = 'none'; document.getElementById('btnInstallHeader').style.display = 'none'; } deferredPrompt = null; } else if (isIos()) { alert("Για εγκατάσταση σε iPhone:\n1. Πατήστε το κουμπί 'Share' (κάτω)\n2. Επιλέξτε 'Προσθήκη στην Οθόνη Αφετηρίας'"); } },
    loginGoogle: () => { signInWithPopup(auth, provider).catch(e => alert("Login Error: " + e.message)); },
    logout: () => { signOut(auth).then(() => location.reload()); },

    checkDetails: () => {
        document.getElementById('loginScreen').style.display = 'none';
        if (!customerDetails) {
            document.getElementById('detailsOverlay').style.display = 'flex';
            if (currentUser && currentUser.displayName) { document.getElementById('inpName').value = currentUser.displayName; }
        } else { App.startApp(); }
    },

    saveDetails: () => {
        const name = document.getElementById('inpName').value.trim();
        const address = document.getElementById('inpAddress').value.trim();
        const floor = document.getElementById('inpFloor').value.trim();
        const phone = document.getElementById('inpPhone').value.trim();
        if (!name || !address || !phone) return alert("Συμπληρώστε τα βασικά στοιχεία!");
        customerDetails = { name, address, floor, phone };
        localStorage.setItem('bellgo_customer_info', JSON.stringify(customerDetails));
        document.getElementById('detailsOverlay').style.display = 'none';
        App.startApp();
    },
    editDetails: () => { document.getElementById('appContent').style.display = 'none'; document.getElementById('detailsOverlay').style.display = 'flex'; document.getElementById('inpName').value = customerDetails.name; document.getElementById('inpAddress').value = customerDetails.address; document.getElementById('inpFloor').value = customerDetails.floor; document.getElementById('inpPhone').value = customerDetails.phone; },

    startApp: () => {
        document.getElementById('appContent').style.display = 'flex';
        document.body.addEventListener('click', () => { const audio = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA"); audio.play().catch(()=>{}); }, { once: true });

        if (PRELOADED_NAME) {
            const cleanName = decodeURIComponent(PRELOADED_NAME);
            document.getElementById('storeNameHeader').innerText = cleanName;
            document.title = cleanName;
        } else if(TARGET_STORE) { 
            document.getElementById('storeNameHeader').innerText = TARGET_STORE.split('@')[0].toUpperCase(); 
        }
        
        document.getElementById('displayAddress').innerText = `📍 ${customerDetails.address}, ${customerDetails.floor}`;
        App.checkActiveOrderStorage();
        
        const txt = document.getElementById('orderText');
        const panel = document.getElementById('orderPanel');
        txt.addEventListener('focus', () => { panel.classList.add('writing-mode'); });

        App.connectSocket();
        App.requestNotifyPermission(); 
    },

    requestNotifyPermission: async () => {
        try {
            const permission = await Notification.requestPermission();
            if (permission === "granted") {
                const registration = await navigator.serviceWorker.ready;
                const token = await getToken(messaging, { vapidKey: "BDUWH0UaYagUPXGB8BM59VFRBW8FMbgOy7YcbBHxT4aJ6rN0Jms-0dGWXIODGYWoSSHomos4gg1GOTZn6k70JcM", serviceWorkerRegistration: registration }); 
                if (token) {
                    localStorage.setItem('fcm_token', token);
                    if(window.socket && window.socket.connected) { 
                        window.socket.emit('join-store', { storeName: TARGET_STORE, username: customerDetails.name + " (Πελάτης)", role: 'customer', token: token, isNative: false }); 
                    }
                }
            }
        } catch (error) { console.error("Notification Error:", error); }
    },

    checkActiveOrderStorage: () => {
        if (activeOrderState) {
            const now = Date.now();
            if (activeOrderState.status === 'ready' && (now - activeOrderState.timestamp > ORDER_TIMEOUT_MS)) {
                localStorage.removeItem('bellgo_active_order');
                activeOrderState = null;
                App.resetUI();
            } else { App.updateStatusUI(activeOrderState.status); }
        }
    },

    checkStripeReturn: () => {
        const urlP = new URLSearchParams(window.location.search);
        const status = urlP.get('payment_status');
        if (status === 'success') {
            const saved = localStorage.getItem('bellgo_temp_card_order');
            if (saved) {
                const orderData = JSON.parse(saved);
                App.sendOrder(orderData.items, '💳 ΚΑΡΤΑ [ΠΛΗΡΩΘΗΚΕ ✅]');
                localStorage.removeItem('bellgo_temp_card_order');
                const cleanUrl = window.location.pathname + window.location.search.replace(/[?&]payment_status=[^&]+/, '');
                window.history.replaceState({}, document.title, cleanUrl);
            }
        } else if (status === 'cancel') { alert("Η πληρωμή ακυρώθηκε."); }
    },

    connectSocket: () => {
        if (window.socket && window.socket.connected) return;
        window.socket = io({ transports: ['polling', 'websocket'], reconnection: true });
        const socket = window.socket;

        socket.on('connect', () => {
            // 🔥 ROOM SYNC: Ensure we join using TARGET_STORE
            socket.emit('join-store', { storeName: TARGET_STORE, username: customerDetails.name + " (Πελάτης)", role: 'customer', token: localStorage.getItem('fcm_token'), isNative: false });
            setTimeout(() => { App.checkStripeReturn(); }, 1000);
        });

        socket.on('menu-update', (data) => { 
            const container = document.getElementById('menuContainer');
            container.classList.add('menu-fade-out');
            setTimeout(() => {
                  App.renderMenu(data);
                  container.classList.remove('menu-fade-out');
            }, 250); 
        });

        // ✅ NEW: Listen specifically for status changes from the server
        socket.on('order-changed', (data) => {
              if (!activeOrderState) return;
              // Loose equality check for ID safety
              if (data.id == activeOrderState.id) {
                  console.log("⚡ Order status changed:", data.status);
                  activeOrderState.status = data.status;
                  
                  // ✅ Save Start Time if provided
                  if (data.startTime) {
                      activeOrderState.startTime = data.startTime;
                  }
                  
                  localStorage.setItem('bellgo_active_order', JSON.stringify(activeOrderState));
                  App.updateStatusUI(data.status);
              }
        });

        socket.on('store-settings-update', (settings) => {
            if (settings) {
                if (settings.name) {
                    const newName = settings.name;
                    document.getElementById('storeNameHeader').innerText = newName;
                    document.title = newName;
                }
                const closedOverlay = document.getElementById('closedOverlay');
                const btnSend = document.getElementById('btnSendOrder');
                if (settings.statusCustomer === false) {
                    closedOverlay.style.display = 'flex';
                    if(btnSend) { btnSend.disabled = true; btnSend.innerText = "⛔ ΤΟ ΚΑΤΑΣΤΗΜΑ ΕΙΝΑΙ ΚΛΕΙΣΤΟ"; }
                } else {
                    closedOverlay.style.display = 'none';
                    if(btnSend) { btnSend.disabled = false; btnSend.innerText = "ΑΠΟΣΤΟΛΗ ΠΑΡΑΓΓΕΛΙΑΣ 🚀"; }
                }
                if (settings.schedule) {
                    storeSchedule = settings.schedule;
                    App.updateTodayHours();
                }
            }
        });

        socket.on('orders-update', (orders) => {
            if (!activeOrderState) return;
            // 🔥 FIX: Backup check for order status & start time
            const myOrder = orders.find(o => o.id == activeOrderState.id);
            if (myOrder) {
                // Check if status changed OR if we missed the start time
                if (activeOrderState.status !== myOrder.status || (myOrder.startTime && !activeOrderState.startTime)) {
                    
                    activeOrderState.status = myOrder.status;
                    if(myOrder.startTime) activeOrderState.startTime = myOrder.startTime; // <--- VITAL FIX
                    
                    localStorage.setItem('bellgo_active_order', JSON.stringify(activeOrderState));
                    App.updateStatusUI(myOrder.status);
                }
            }
        });
    },

    updateTodayHours: () => {
        const days = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'];
        const now = new Date();
        const todayName = days[now.getDay()];
        const hours = storeSchedule[todayName] || "Κλειστά";
        document.getElementById('todayHours').innerText = hours;
    },
    
    showFullSchedule: () => {
        const daysOrder = ['Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο', 'Κυριακή'];
        const list = document.getElementById('scheduleList');
        list.innerHTML = '';
        const now = new Date();
        const todayName = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'][now.getDay()];
        daysOrder.forEach(day => {
            const row = document.createElement('div');
            row.className = 'schedule-row';
            if(day === todayName) row.classList.add('today');
            row.innerHTML = `<span>${day}</span><span>${storeSchedule[day] || 'Κλειστά'}</span>`;
            list.appendChild(row);
        });
        document.getElementById('scheduleViewModal').style.display = 'flex';
    },

    renderMenu: (data) => {
        const container = document.getElementById('menuContainer');
        container.innerHTML = '';
        let menu = [];
        try {
            if(typeof data === 'string' && data.startsWith('[')) { menu = JSON.parse(data); } 
            else if (typeof data === 'object') { menu = data; } 
            else { const items = (data || "").split('\n'); menu = [{ name: "ΚΑΤΑΛΟΓΟΣ", items: items }]; }
        } catch(e) { menu = []; }
        if(Array.isArray(menu)) {
            menu.sort((a,b) => (a.order || 99) - (b.order || 99));
            menu.forEach(cat => {
                const title = document.createElement('div');
                title.className = 'category-title';
                title.innerText = cat.name;
                const itemsDiv = document.createElement('div');
                itemsDiv.className = 'category-items';
                cat.items.forEach(item => {
                    let itemName = "", itemPrice = 0, itemExtras = [];
                    if (typeof item === 'string') {
                        const parts = item.split(':');
                        itemName = parts[0].trim();
                        if(parts.length > 1) itemPrice = parseFloat(parts[parts.length-1]) || 0;
                    } else {
                        itemName = item.name;
                        itemPrice = item.price;
                        itemExtras = item.extras || [];
                    }
                    if(itemName) {
                        const box = document.createElement('div');
                        box.className = 'item-box menu-fade-in';
                        box.innerHTML = `<span class="item-name">${itemName}</span>${itemPrice > 0 ? `<span class="item-price">${itemPrice}€</span>` : ''}`;
                        box.addEventListener('click', (e) => { e.preventDefault(); App.handleItemClick(itemName, itemPrice, itemExtras); });
                        itemsDiv.appendChild(box);
                    }
                });
                const wrapper = document.createElement('div');
                wrapper.className = 'category-block menu-fade-in';
                wrapper.appendChild(title);
                wrapper.appendChild(itemsDiv);
                container.appendChild(wrapper);
            });
        }
    },

    currentItem: null,
    tempSelectedExtras: [],
    handleItemClick: (name, price, extras) => {
        if (!extras || extras.length === 0) {
            App.addToOrder(name, price);
        } else {
            App.currentItem = { name, price };
            App.tempSelectedExtras = [];
            const list = document.getElementById('userExtrasList');
            list.innerHTML = '';
            document.getElementById('userExtrasTitle').innerText = name;
            extras.forEach((ex) => {
                const btn = document.createElement('div');
                btn.className = 'extra-option';
                btn.innerHTML = `<span>${ex.name}</span><span>${ex.price > 0 ? `+${ex.price}€` : ''}</span>`;
                btn.onclick = () => {
                    if (btn.classList.contains('selected')) {
                        btn.classList.remove('selected');
                        App.tempSelectedExtras = App.tempSelectedExtras.filter(e => e.name !== ex.name);
                    } else {
                        btn.classList.add('selected');
                        App.tempSelectedExtras.push(ex);
                    }
                };
                list.appendChild(btn);
            });
            document.getElementById('userExtrasModal').style.display = 'flex';
        }
    },
    
    confirmExtras: () => {
        if (!App.currentItem) return;
        App.addToOrder(App.currentItem.name, App.currentItem.price);
        App.tempSelectedExtras.forEach(ex => { App.addToOrder(`  + ${ex.name}`, ex.price); });
        document.getElementById('userExtrasModal').style.display = 'none';
    },

    addToOrder: (item, price = 0) => {
        const txt = document.getElementById('orderText');
        const entry = price > 0 ? `${item}:${price}` : item;
        if (txt.value.trim() === '') txt.value = `1 ${entry}`;
        else txt.value += `\n1 ${entry}`;
        txt.scrollTop = txt.scrollHeight;
        const panel = document.getElementById('orderPanel');
        if (panel.classList.contains('minimized')) App.toggleOrderPanel();
        App.handleInput(); 
    },

    toggleOrderPanel: () => {
        const p = document.getElementById('orderPanel');
        const icon = document.getElementById('panelIcon');
        if(p.classList.contains('minimized')) {
            p.classList.remove('minimized');
            icon.innerText = '▼';
        } else {
            p.classList.add('minimized');
            icon.innerText = '▲';
        }
    },

    handleInput: () => {
        const text = document.getElementById('orderText').value.trim();
        const lines = text.split('\n');
        let validForCard = true;
        let total = 0;
        if (text.length === 0) validForCard = false;
        for (const line of lines) {
            if (!line.trim()) continue;
            let qty = 1; let rest = line;
            const qtyMatch = line.match(/^(\d+)\s+(.*)/);
            if(qtyMatch) { qty = parseInt(qtyMatch[1]); rest = qtyMatch[2]; }
            if(rest.includes(':')) {
                const parts = rest.split(':');
                const priceVal = parseFloat(parts[parts.length-1]);
                if(!isNaN(priceVal)) { total += qty * priceVal; } 
                else { validForCard = false; }
            } else if (!line.trim().startsWith('+')) { validForCard = false; }
        }
        document.getElementById('liveTotal').innerText = `ΣΥΝΟΛΟ: ${total.toFixed(2)}€`;
        const btnCard = document.getElementById('payCard');
        if (validForCard && total > 0) { btnCard.disabled = false; btnCard.innerHTML = "💳 ΚΑΡΤΑ"; } 
        else { btnCard.disabled = true; btnCard.innerHTML = "💳 ΚΑΡΤΑ (Μη διαθέσιμη)"; }
        return total;
    },

    requestPayment: () => {
        const items = document.getElementById('orderText').value.trim();
        if (!items) return alert("Το καλάθι είναι άδειο!");
        App.handleInput();
        document.getElementById('paymentOverlay').style.display = 'flex';
    },

    confirmPayment: (method) => {
        const items = document.getElementById('orderText').value.trim();
        if(method === '💳 ΚΑΡΤΑ') { App.payWithCard(items); } 
        else { App.sendOrder(items, method); document.getElementById('paymentOverlay').style.display = 'none'; }
    },

    payWithCard: async (items) => {
        const totalAmount = App.handleInput();
        if(totalAmount <= 0) return alert("Σφάλμα ποσού.");
        localStorage.setItem('bellgo_temp_card_order', JSON.stringify({ items: items, amount: totalAmount }));
        try {
            const res = await fetch('/create-order-payment', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ amount: totalAmount, storeName: TARGET_STORE })
            });
            const data = await res.json();
            if(data.url) { window.location.href = data.url; } 
            else { alert("Σφάλμα πληρωμής: " + (data.error || "Άγνωστο")); }
        } catch(e) { alert("Σφάλμα σύνδεσης με τον Server."); }
    },

    sendOrder: (items, method) => {
        const fullText = `[DELIVERY 🛵]\n👤 ${customerDetails.name}\n📍 ${customerDetails.address}\n🏢 ${customerDetails.floor}\n📞 ${customerDetails.phone}\n${method}\n---\n${items}`;
        activeOrderState = { id: Date.now(), status: 'pending', timestamp: Date.now() };
        localStorage.setItem('bellgo_active_order', JSON.stringify(activeOrderState));
        window.socket.emit('new-order', fullText);
        App.showStatus('pending'); 
        document.getElementById('orderText').value = ''; 
        document.getElementById('liveTotal').innerText = "ΣΥΝΟΛΟ: 0.00€";
    },

    minimizeStatus: () => { document.getElementById('statusOverlay').style.height = '0'; },
    maximizeStatus: () => { document.getElementById('statusOverlay').style.height = '100%'; },

    showStatus: (status) => {
        const overlay = document.getElementById('statusOverlay');
        const icon = document.getElementById('statusIcon');
        const text = document.getElementById('statusText');
        const sub = document.getElementById('statusSub');
        const btnNew = document.getElementById('btnNewOrder');
        const btnMini = document.getElementById('btnStatusMini');
        const miniText = document.getElementById('miniStatusText');
        overlay.style.height = '100%'; 
        btnNew.style.display = 'none'; 
        
        let timeString = "--:--";
        if (activeOrderState && activeOrderState.timestamp) {
            const date = new Date(activeOrderState.timestamp);
            timeString = date.toLocaleTimeString('el-GR', {hour: '2-digit', minute:'2-digit'});
        }
        if(btnMini) btnMini.style.display = 'flex';
        let statusLabel = "";
        
        if (status === 'pending') {
            statusLabel = "Αναμονή";
            icon.innerText = '⏳'; text.innerText = 'Στάλθηκε! Αναμονή...'; sub.innerText = 'Το κατάστημα ελέγχει την παραγγελία';
        } else if (status === 'cooking') {
            statusLabel = "Ετοιμάζεται";
            
            // ✅ DISPLAY START TIME LOGIC
            let startStr = "";
            if(activeOrderState.startTime) {
                const d = new Date(activeOrderState.startTime);
                startStr = " (" + d.toLocaleTimeString('el-GR', {hour:'2-digit', minute:'2-digit'}) + ")";
            }
            
            icon.innerText = '👨‍🍳'; text.innerText = '👨‍🍳 Η παραγγελία ετοιμάζεται!' + startStr; sub.innerText = 'Η παραγγελία έγινε αποδεκτή';
        } else if (status === 'ready') {
            statusLabel = "Έρχεται";
            icon.innerText = '🛵'; text.innerText = `🛵 Η παραγγελία έρχεται!`; sub.innerText = 'Ο διανομέας ξεκίνησε';
            btnNew.style.display = 'block'; 
        }
        if(miniText) miniText.innerText = `${statusLabel} ${timeString}`;
    },

    updateStatusUI: (status) => { App.showStatus(status); },

    resetForNewOrder: () => {
        if(confirm("Θέλετε να κάνετε νέα παραγγελία;")) {
            localStorage.removeItem('bellgo_active_order');
            activeOrderState = null;
            document.getElementById('statusOverlay').style.height = '0';
            document.getElementById('btnStatusMini').style.display = 'none';
            document.getElementById('orderText').value = '';
        }
    },
    resetUI: () => { 
        document.getElementById('statusOverlay').style.height = '0'; 
        document.getElementById('btnStatusMini').style.display = 'none';
    }
};

// --- AUTH LISTENER ---
onAuthStateChanged(auth, (user) => {
    if (user) { currentUser = user; App.checkDetails(); } 
    else { document.getElementById('loginScreen').style.display = 'flex'; document.getElementById('appContent').style.display = 'none'; }
});
