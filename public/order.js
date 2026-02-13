import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => console.log('❌ SW Error:', err));
}

// --- INSTALL LOGIC ---
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btnLogin = document.getElementById('btnInstallLogin');
    if(btnLogin) btnLogin.style.display = 'block';
    const btnHeader = document.getElementById('btnInstallHeader');
    if(btnHeader) btnHeader.style.display = 'block';
});

// iOS Detection
const isIos = () => /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
if (isIos() && !window.navigator.standalone) {
        const btnLogin = document.getElementById('btnInstallLogin');
        if(btnLogin) btnLogin.style.display = 'block';
        const btnHeader = document.getElementById('btnInstallHeader');
        if(btnHeader) btnHeader.style.display = 'block';
}

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

// URL PARAMS
const params = new URLSearchParams(window.location.search);
let TARGET_STORE = params.get('store');

// Auto-detect store from path
if (!TARGET_STORE) {
    const pathParts = window.location.pathname.split('/');
    const shopIndex = pathParts.indexOf('shop');
    if (shopIndex !== -1 && pathParts[shopIndex + 1]) {
        TARGET_STORE = pathParts[shopIndex + 1];
    }
}

const PRELOADED_NAME = params.get('name'); 

const parseItem = (str) => {
    // ✅ FIX: Υποστήριξη για αντικείμενα από το Premium
    if (typeof str === 'object' && str !== null) {
        return { name: str.name, price: str.price || 0 };
    }
    const parts = str.split(':');
    let name = parts[0];
    let price = 0;
    if (parts.length > 1) {
        name = parts.slice(0, -1).join(':').trim();
        price = parseFloat(parts[parts.length - 1]);
    } else { name = str.trim(); }
    return { name, price: isNaN(price) ? 0 : price };
};

let currentUser = null;
let customerDetails = JSON.parse(localStorage.getItem('bellgo_customer_info') || 'null');
let activeOrders = JSON.parse(localStorage.getItem('bellgo_active_orders') || '[]');
let storeHasStripe = false;
const ORDER_TIMEOUT_MS = 60 * 60 * 1000; 

window.App = {
    installPWA: async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                document.getElementById('btnInstallLogin').style.display = 'none';
                document.getElementById('btnInstallHeader').style.display = 'none';
            }
            deferredPrompt = null;
        } else if (isIos()) {
            alert("Για εγκατάσταση σε iPhone:\n1. Πατήστε το κουμπί 'Share' (κάτω)\n2. Επιλέξτε 'Προσθήκη στην Οθόνη Αφετηρίας'");
        }
    },

    loginGoogle: () => { signInWithPopup(auth, provider).catch(e => alert("Login Error: " + e.message)); },
    logout: () => { signOut(auth).then(() => location.reload()); },

    checkDetails: () => {
        document.getElementById('loginScreen').style.display = 'none';
        if (!customerDetails) {
            document.getElementById('detailsOverlay').style.display = 'flex';
            if (currentUser && currentUser.displayName) {
                document.getElementById('inpName').value = currentUser.displayName;
            }
        } else {
            App.startApp();
        }
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

    editDetails: () => {
        document.getElementById('appContent').style.display = 'none'; 
        document.getElementById('detailsOverlay').style.display = 'flex';
        document.getElementById('inpName').value = customerDetails.name;
        document.getElementById('inpAddress').value = customerDetails.address;
        document.getElementById('inpFloor').value = customerDetails.floor;
        document.getElementById('inpPhone').value = customerDetails.phone;
    },

    startApp: () => {
        document.getElementById('appContent').style.display = 'flex';
        
        // ✅ WEB vs PWA DETECTION
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
        if (!isStandalone) document.body.classList.add('is-web');
        else document.body.classList.remove('is-web');

        // SILENT AUDIO UNLOCK
        document.body.addEventListener('click', () => {
            const audio = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA");
            audio.play().catch(()=>{});
        }, { once: true });

        if (PRELOADED_NAME) {
            const cleanName = decodeURIComponent(PRELOADED_NAME);
            document.getElementById('storeNameHeader').innerText = cleanName;
            document.title = cleanName;
            let maniUrl = `manifest.json?name=${PRELOADED_NAME}&icon=shop`;
            if (TARGET_STORE) maniUrl += `&store=${TARGET_STORE}`;
            document.getElementById('dynamicManifest').setAttribute('href', maniUrl);
        } else if(TARGET_STORE) {
            document.getElementById('storeNameHeader').innerText = TARGET_STORE.split('@')[0].toUpperCase();
        }
        
        document.getElementById('displayAddress').innerText = `📍 ${customerDetails.address}, ${customerDetails.floor}`;
        App.checkActiveOrderStorage();

        // 🔹 SIMPLIFIED WRITING MODE & VISUAL VIEWPORT (Web & Mobile Fix) - Same as Staff Premium
        const txt = document.getElementById('orderText');
        const panel = document.getElementById('orderPanel');

        function handleViewport() {
            if (window.visualViewport) {
                document.documentElement.style.setProperty('--app-height', `${window.visualViewport.height}px`);
                if (window.visualViewport.height > (window.screen.height * 0.8)) {
                    // Keyboard Closed
                    panel.classList.remove('writing-mode');
                    txt.blur();
                }
            }
        }
        
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', handleViewport);
            window.visualViewport.addEventListener('scroll', handleViewport);
        }
        window.addEventListener('resize', handleViewport);

        txt.addEventListener('focus', () => {
            panel.classList.add('writing-mode');
        });
        txt.addEventListener('blur', () => {
            setTimeout(() => {
                panel.classList.remove('writing-mode');
            }, 150);
        });
        
        App.connectSocket();
        // ✅ REQUEST NOTIFICATIONS FOR CUSTOMER
        App.requestNotifyPermission(); 
    },

    // ✅✅✅ NEW: REQUEST PERMISSION & GET TOKEN ✅✅✅
    requestNotifyPermission: async () => {
        try {
            const permission = await Notification.requestPermission();
            if (permission === "granted") {
                const registration = await navigator.serviceWorker.ready;
                // 👇 ΕΔΩ ΒΑΖΕΙΣ ΤΟ VAPID KEY ΣΟΥ 👇
                const token = await getToken(messaging, { 
                    vapidKey: "BDUWH0UaYagUPXGB8BM59VFRBW8FMbgOy7YcbBHxT4aJ6rN0Jms-0dGWXIODGYWoSSHomos4gg1GOTZn6k70JcM", 
                    serviceWorkerRegistration: registration 
                }); 
                if (token) {
                    localStorage.setItem('fcm_token', token);
                    // Αν το socket είναι ήδη συνδεδεμένο, στέλνουμε το token
                    if(window.socket && window.socket.connected) {
                        // Ξαναστέλνουμε join για update
                        const mySocketUsername = customerDetails.name + " (Πελάτης)";
                        window.socket.emit('join-store', { 
                            storeName: TARGET_STORE, 
                            username: mySocketUsername, 
                            role: 'customer', 
                            token: token, // 👈 Στέλνουμε το token
                            isNative: false 
                        });
                    }
                }
            }
        } catch (error) { console.error("Notification Error:", error); }
    },

    checkActiveOrderStorage: () => {
        if (!Array.isArray(activeOrders)) activeOrders = [];
        const now = Date.now();
        const TWELVE_HOURS = 12 * 60 * 60 * 1000;
        
        // Filter out 'ready' orders older than 1 hour AND any order older than 12 hours
        activeOrders = activeOrders.filter(o => {
            if ((now - o.timestamp) > TWELVE_HOURS) return false; // Safety cleanup
            if (o.status === 'ready') {
                const timeRef = o.readyTime || o.timestamp;
                return (now - timeRef) < ORDER_TIMEOUT_MS;
            }
            return true;
        });
        localStorage.setItem('bellgo_active_orders', JSON.stringify(activeOrders));
        
        if (activeOrders.length > 0) {
            App.updateStatusUI(false);
        }
    },

    // --- STRIPE RETURN HANDLER (MODIFIED) ---
    checkStripeReturn: () => {
        const urlP = new URLSearchParams(window.location.search);
        const status = urlP.get('payment_status');
        if (status === 'success') {
            const saved = localStorage.getItem('bellgo_temp_card_order');
            if (saved) {
                const orderData = JSON.parse(saved);
                // ✅ SEND ORDER ONLY IF SOCKET IS CONNECTED
                App.sendOrder(orderData.items, '💳 ΚΑΡΤΑ [ΠΛΗΡΩΘΗΚΕ ✅]');
                localStorage.removeItem('bellgo_temp_card_order');
                
                // Clear URL
                const cleanUrl = window.location.pathname + window.location.search.replace(/[?&]payment_status=[^&]+/, '');
                window.history.replaceState({}, document.title, cleanUrl);
            }
        } else if (status === 'cancel') {
            alert("Η πληρωμή ακυρώθηκε.");
        }
    },

    connectSocket: () => {
        // ✅ FIX: Robust connection logic
        if (!window.socket) {
            window.socket = io({ transports: ['polling', 'websocket'], reconnection: true });
        }
        const socket = window.socket;

        socket.removeAllListeners(); // Καθαρισμός παλιών listeners

        socket.on('connect', () => {
            const mySocketUsername = customerDetails.name + " (Πελάτης)";
            // ✅ SEND TOKEN ON JOIN
            socket.emit('join-store', { 
                storeName: TARGET_STORE, 
                username: mySocketUsername, 
                role: 'customer', 
                token: localStorage.getItem('fcm_token'), // 👈 Token here
                isNative: false 
            });
            
            // ✅ ✅ CLIENT-SIDE FIX: Wait 1s and then check for pending orders
            setTimeout(() => {
                App.checkStripeReturn();
            }, 1000);
        });

        socket.on('menu-update', (data) => { App.renderMenu(data); });

        // ✅✅✅ ΕΛΕΓΧΟΣ ΚΛΕΙΣΤΟΥ ΚΑΤΑΣΤΗΜΑΤΟΣ (Status Customer) ✅✅✅
        socket.on('store-settings-update', (settings) => {
            if (settings) {
                if (settings.name) {
                    const newName = settings.name;
                    document.getElementById('storeNameHeader').innerText = newName;
                    document.title = newName;
                    if (!new URLSearchParams(window.location.search).get('name')) {
                        const currentParams = new URLSearchParams(window.location.search);
                        currentParams.set('name', newName);
                        window.history.replaceState({}, '', `${window.location.pathname}?${currentParams.toString()}`);
                    }
                }
                
                storeHasStripe = !!settings.stripeConnectId;
                App.handleInput();
                
                const closedOverlay = document.getElementById('closedOverlay');
                const btnSend = document.getElementById('btnSendOrder');
                
                if (settings.statusCustomer === false) {
                    closedOverlay.style.display = 'flex';
                    if(btnSend) { 
                        btnSend.disabled = true; 
                        btnSend.innerText = "⛔ ΤΟ ΚΑΤΑΣΤΗΜΑ ΕΙΝΑΙ ΚΛΕΙΣΤΟ"; 
                    }
                } else {
                    closedOverlay.style.display = 'none';
                    if(btnSend) { 
                        btnSend.disabled = false; 
                        btnSend.innerText = "ΑΠΟΣΤΟΛΗ ΠΑΡΑΓΓΕΛΙΑΣ 🚀"; 
                    }
                }
            }
        });

        socket.on('orders-update', (orders) => {
            const mySocketUsername = customerDetails.name + " (Πελάτης)";
            const myServerOrders = orders.filter(o => o.from === mySocketUsername);
            
            let changed = false;
            
            // Update existing local orders
            activeOrders.forEach(localOrder => {
                const serverOrder = myServerOrders.find(so => so.id === localOrder.id);
                if (serverOrder) {
                    if (localOrder.status !== serverOrder.status) {
                        localOrder.status = serverOrder.status;
                        if (serverOrder.readyTime) localOrder.readyTime = serverOrder.readyTime;
                        changed = true;
                    }
                }
            });
            
            if (changed) {
                localStorage.setItem('bellgo_active_orders', JSON.stringify(activeOrders));
                App.updateStatusUI(false);
            }
        });

        // ✅ IMMEDIATE UPDATE (Fixes "den vlepw stadiaka")
        socket.on('order-changed', (data) => {
            const order = activeOrders.find(o => o.id === data.id);
            if (order) {
                order.status = data.status;
                if (data.readyTime) order.readyTime = data.readyTime;
                
                localStorage.setItem('bellgo_active_orders', JSON.stringify(activeOrders));
                App.updateStatusUI(false);
            }
        });

        // ✅ Force Connect / Re-Join if needed
        if (!socket.connected) {
            socket.connect();
        } else {
            // Αν είναι ήδη συνδεδεμένο, ξαναστέλνουμε join για σιγουριά
            const mySocketUsername = customerDetails.name + " (Πελάτης)";
            socket.emit('join-store', { 
                storeName: TARGET_STORE, 
                username: mySocketUsername, 
                role: 'customer', 
                token: localStorage.getItem('fcm_token'),
                isNative: false 
            });
        }
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

        if (!menu || menu.length === 0) { container.innerHTML = '<div style="text-align:center; color:#555; margin-top:50px;">Ο κατάλογος είναι κενός.</div>'; return; }

        if(Array.isArray(menu)) {
            menu.sort((a,b) => (a.order || 99) - (b.order || 99));
            menu.forEach(cat => {
                const title = document.createElement('div');
                title.className = 'category-title';
                title.innerText = cat.name;
                const itemsDiv = document.createElement('div');
                itemsDiv.className = 'category-items';

                cat.items.forEach(item => {
                    // ✅ FIX: Έλεγχος αν είναι αντικείμενο ή κείμενο
                    if (item && (typeof item === 'object' || item.trim())) {
                        const { name, price } = parseItem(item);
                        const box = document.createElement('div');
                        box.className = 'item-box';
                        box.innerHTML = `<span class="item-name">${name}</span>${price > 0 ? `<span class="item-price">${price}€</span>` : ''}`;
                        
                        // ✅ CUSTOM DOUBLE TAP: Λειτουργεί παντού (και iPhone) και προστατεύει από τυχαία κλικ
                        let lastTap = 0;
                        box.addEventListener('click', (e) => { 
                            e.preventDefault(); 
                            const currentTime = new Date().getTime();
                            const tapLength = currentTime - lastTap;
                            if (tapLength < 400 && tapLength > 0) {
                                const val = (typeof item === 'object') ? `${item.name}:${item.price}` : item.trim();
                                App.addToOrder(val); 
                                lastTap = 0;
                            } else {
                                lastTap = currentTime;
                            }
                        });
                        itemsDiv.appendChild(box);
                    }
                });
                const wrapper = document.createElement('div');
                wrapper.className = 'category-block';
                wrapper.appendChild(title);
                wrapper.appendChild(itemsDiv);
                container.appendChild(wrapper);
            });
        }
    },

    addToOrder: (item) => {
        const txt = document.getElementById('orderText');
        // txt.focus(); // Αφαιρέθηκε για να μην ανοίγει το πληκτρολόγιο στο iPhone
        txt.classList.add('flash'); setTimeout(() => txt.classList.remove('flash'), 200);
        let lines = txt.value.split('\n').filter(l => l.trim() !== '');
        let found = false;
        const { name } = parseItem(item);
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(name)) {
                const match = lines[i].match(/^(\d+)?\s*(.+)$/);
                if(match && match[2].includes(name)) {
                        let currentQty = parseInt(match[1] || '1');
                        lines[i] = `${currentQty + 1} ${item}`;
                        found = true;
                        break;
                }
            }
        }
        if (!found) lines.push(`1 ${item}`);
        txt.value = lines.join('\n');
        txt.scrollTop = txt.scrollHeight;
        App.handleInput(); 
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
            } else { validForCard = false; }
        }
        document.getElementById('liveTotal').innerText = `ΣΥΝΟΛΟ: ${total.toFixed(2)}€`;
        const btnCard = document.getElementById('payCard');
        if (validForCard && total > 0 && storeHasStripe) {
            btnCard.disabled = false;
            btnCard.innerHTML = "💳 ΚΑΡΤΑ";
        } else {
            btnCard.disabled = true;
            if (!storeHasStripe) {
                btnCard.innerHTML = "💳 ΚΑΡΤΑ (Μη ενεργή)";
            } else {
                btnCard.innerHTML = "💳 ΚΑΡΤΑ (Μη διαθέσιμη)";
            }
        }
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
        if(method === '💳 ΚΑΡΤΑ') {
            App.payWithCard(items);
        } else {
            App.sendOrder(items, method);
            document.getElementById('paymentOverlay').style.display = 'none';
        }
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
        const newOrder = { id: Date.now(), status: 'pending', timestamp: Date.now() };
        activeOrders.push(newOrder);
        localStorage.setItem('bellgo_active_orders', JSON.stringify(activeOrders));
        window.socket.emit('new-order', { text: fullText, id: newOrder.id });
        App.updateStatusUI(true); 
        document.getElementById('orderText').value = ''; 
        document.getElementById('liveTotal').innerText = "ΣΥΝΟΛΟ: 0.00€";
    },

    minimizeStatus: () => { 
        document.getElementById('statusOverlay').style.height = '0'; 
        document.getElementById('btnStatusMini').style.display = 'flex'; // Εμφάνιση μικρού κουμπιού
    },

    maximizeStatus: () => { document.getElementById('statusOverlay').style.height = '100%'; },

    updateStatusUI: (shouldOpen) => {
        const list = document.getElementById('orderStatusList');
        if (!list) return;
        list.innerHTML = '';
        
        document.getElementById('btnStatusMini').style.display = 'none'; // Απόκρυψη μικρού κουμπιού όταν είναι ανοιχτό

        // Sort: Newest first
        activeOrders.sort((a,b) => b.timestamp - a.timestamp);

        if (activeOrders.length === 0) {
            list.innerHTML = '<div style="color:#aaa; text-align:center; margin-top:20px;">Δεν υπάρχουν ενεργές παραγγελίες.</div>';
        } else {
            activeOrders.forEach(order => {
                const el = document.createElement('div');
                
                let icon = '⏳';
                let statusText = 'Στάλθηκε';
                let subText = 'Αναμονή για αποδοχή...';
                let color = '#FF9800'; // Orange
                
                if (order.status === 'cooking') {
                    icon = '👨‍🍳'; statusText = 'Ετοιμάζεται'; subText = 'Η κουζίνα το ανέλαβε!'; color = '#2196F3'; // Blue
                } else if (order.status === 'ready') {
                    icon = '🛵'; statusText = 'Έρχεται!'; subText = 'Πατήστε για απόκρυψη'; color = '#00E676'; // Green
                }

                const timeStr = new Date(order.timestamp).toLocaleTimeString('el-GR', {hour: '2-digit', minute:'2-digit'});

                el.innerHTML = `
                    <div style="font-size:30px; margin-right:15px;">${icon}</div>
                    <div style="text-align:left; flex:1;">
                        <div style="color:${color}; font-weight:bold; font-size:18px;">${statusText}</div>
                        <div style="color:#ccc; font-size:14px;">${subText}</div>
                        <div style="color:#666; font-size:12px; margin-top:4px;">${timeStr}</div>
                    </div>
                    <div class="btn-dismiss" style="font-size:22px; color:#888; padding:0 0 0 15px; cursor:pointer;">✖</div>
                `;
                
                el.style.cssText = `background:#222; border:1px solid ${color}; border-radius:10px; padding:15px; margin-bottom:10px; display:flex; align-items:center; width:100%;`;
                
                el.querySelector('.btn-dismiss').onclick = (e) => {
                    e.stopPropagation();
                    if (order.status !== 'ready' && !confirm("Απόκρυψη παραγγελίας;")) return;
                    App.dismissOrder(order.id);
                };
                
                list.appendChild(el);
            });
        }

        // Mini Status Update
        const miniText = document.getElementById('miniStatusText');
        if (miniText && activeOrders.length > 0) {
            const latest = activeOrders[0];
            if (latest.status === 'ready') miniText.innerText = "Έρχεται!";
            else if (latest.status === 'cooking') miniText.innerText = "Ετοιμάζεται";
            else miniText.innerText = "Αναμονή...";
        } else if (miniText) {
            miniText.innerText = "...";
        }

        if (shouldOpen) App.maximizeStatus();
    },

    dismissOrder: (id) => {
        activeOrders = activeOrders.filter(o => o.id !== id);
        localStorage.setItem('bellgo_active_orders', JSON.stringify(activeOrders));
        App.updateStatusUI(false);
        if (activeOrders.length === 0) App.minimizeStatus();
    },

    resetForNewOrder: () => {
        // Just minimize, don't clear history
        App.minimizeStatus();
    },

    resetUI: () => { 
        document.getElementById('statusOverlay').style.height = '0'; 
        document.getElementById('btnStatusMini').style.display = 'none';
    },

    toggleOrderPanel: () => {
        const p = document.getElementById('orderPanel');
        const icon = document.getElementById('panelIcon');
        if(p.classList.contains('minimized')) {
            p.classList.remove('minimized');
            icon.style.transform = 'rotate(0deg)';
            icon.innerText = '▼';
        } else {
            p.classList.add('minimized');
            icon.style.transform = 'rotate(180deg)';
            icon.innerText = '▲';
        }
    }
};

onAuthStateChanged(auth, (user) => {
    if (user) { currentUser = user; App.checkDetails(); } 
    else { document.getElementById('loginScreen').style.display = 'flex'; document.getElementById('appContent').style.display = 'none'; }
});
