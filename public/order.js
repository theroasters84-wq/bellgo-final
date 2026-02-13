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
let customerDetails = null;
try {
    customerDetails = JSON.parse(localStorage.getItem('bellgo_customer_info') || 'null');
} catch (e) {
    console.error("Error parsing bellgo_customer_info:", e);
    localStorage.removeItem('bellgo_customer_info');
}

let activeOrders = [];
try {
    activeOrders = JSON.parse(localStorage.getItem('bellgo_active_orders') || '[]');
} catch (e) {
    console.error("Error parsing bellgo_active_orders:", e);
    localStorage.removeItem('bellgo_active_orders');
}

let activeOrderState = null;
try {
    activeOrderState = JSON.parse(localStorage.getItem('bellgo_active_order') || 'null');
} catch (e) {
    console.error("Error parsing bellgo_active_order:", e);
    localStorage.removeItem('bellgo_active_order');
}
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
        // ✅ NEW: Check for TARGET_STORE
        if (!TARGET_STORE) {
            document.body.innerHTML = `
                <div style="text-align: center; padding: 40px; color: white; font-family: sans-serif; height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                    <h1 style="color: #FFD700;">Σφάλμα Συνδέσμου</h1>
                    <p>Το κατάστημα δεν προσδιορίστηκε.</p>
                    <p style="color: #aaa; font-size: 14px; max-width: 300px;">Παρακαλούμε χρησιμοποιήστε το σύνδεσμο (link) ή τον κωδικό QR που σας δόθηκε από το κατάστημα.</p>
                </div>
            `;
            return; 
        }

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

        if (TARGET_STORE) {
            // Priority 1: Use the store ID to create a unique PWA scope.
            let maniUrl = `/manifest.json?icon=shop&store=${encodeURIComponent(TARGET_STORE)}`;
            
            // Set the name from the preloaded param if available
            const name = PRELOADED_NAME ? decodeURIComponent(PRELOADED_NAME) : TARGET_STORE.split('@')[0].toUpperCase();
            document.getElementById('storeNameHeader').innerText = name;
            document.title = name;
            
            document.getElementById('dynamicManifest').setAttribute('href', maniUrl);

        } else if (PRELOADED_NAME) {
            // Fallback for older links that might only have the name
            const cleanName = decodeURIComponent(PRELOADED_NAME);
            document.getElementById('storeNameHeader').innerText = cleanName;
            document.title = cleanName;
            let maniUrl = `/manifest.json?name=${encodeURIComponent(cleanName)}&icon=shop`;
            document.getElementById('dynamicManifest').setAttribute('href', maniUrl);
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
        // ✅ NEW: Heartbeat για να μην χάνεται η σύνδεση
        setInterval(() => { if(window.socket?.connected) window.socket.emit('heartbeat'); }, 5000);
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
        if (activeOrders.length > 0) {
            const now = Date.now();
            const updatedOrders = activeOrders.filter(order => {
                if (order.status === 'ready' && (now - order.timestamp > ORDER_TIMEOUT_MS)) {
                    return false; // Remove old, ready orders
                }
                return true;
            });

            if (updatedOrders.length !== activeOrders.length) {
                activeOrders = updatedOrders;
                localStorage.setItem('bellgo_active_orders', JSON.stringify(activeOrders));
            }
            
            // ✅ FIX: Συγχρονισμός activeOrderState με την τελευταία παραγγελία
            if (activeOrders.length > 0) {
                activeOrderState = activeOrders[activeOrders.length - 1];
            }
            App.updateStatusUI();
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
        // ✅ FIX: Αν υπάρχει ήδη socket, δεν φτιάχνουμε νέο, απλά ελέγχουμε τη σύνδεση
        if (window.socket) {
            if (!window.socket.connected) {
                window.socket.connect();
            } else {
                // ✅ FIX: Αν είναι ήδη συνδεδεμένο, στέλνουμε join-store για να κατέβει το μενού
                if (customerDetails) {
                    const mySocketUsername = customerDetails.name + " (Πελάτης)";
                    window.socket.emit('join-store', { 
                        storeName: TARGET_STORE, 
                        username: mySocketUsername, 
                        role: 'customer', 
                        token: localStorage.getItem('fcm_token'), 
                        isNative: false 
                    });
                }
            }
            return;
        }
        
        // ✅ FIX: Ρύθμιση ίδια με το premium.js (polling + websocket) για μέγιστη συμβατότητα
        window.socket = io({ transports: ['polling', 'websocket'], reconnection: true });
        const socket = window.socket;

        socket.on('connect', () => {
            // ✅ FIX: Έλεγχος αν υπάρχουν στοιχεία πελάτη για να μην κρασάρει
            if (!customerDetails) {
                console.warn("⚠️ No customer details found on connect.");
                return;
            }

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

            // ✅ NEW: Αν κολλήσει η φόρτωση, ξαναπροσπαθούμε αυτόματα μετά από 2.5s
            setTimeout(() => {
                const container = document.getElementById('menuContainer');
                if (container && container.innerText.includes('Φόρτωση')) {
                    console.log("⚠️ Menu stuck, retrying join...");
                    const mySocketUsername = customerDetails.name + " (Πελάτης)";
                    socket.emit('join-store', { 
                        storeName: TARGET_STORE, 
                        username: mySocketUsername, 
                        role: 'customer', 
                        token: localStorage.getItem('fcm_token'), 
                        isNative: false 
                    });
                }
            }, 2500);
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
            const myOrders = orders.filter(o => o.from === mySocketUsername);

            // Simple replace for now, could be smarter (merge)
            activeOrders = myOrders;
            localStorage.setItem('bellgo_active_orders', JSON.stringify(activeOrders));
            
            // ✅ FIX: Ενημέρωση του activeOrderState από τον Server
            if (activeOrders.length > 0) {
                activeOrderState = activeOrders[activeOrders.length - 1];
                localStorage.setItem('bellgo_active_order', JSON.stringify(activeOrderState));
            } else {
                activeOrderState = null;
                localStorage.removeItem('bellgo_active_order');
            }
            App.updateStatusUI();
        });

        // ✅ IMMEDIATE UPDATE (Fixes "den vlepw stadiaka")
        socket.on('order-changed', (data) => {
            const orderIndex = activeOrders.findIndex(o => o.id === data.id);
            if (orderIndex > -1) {
                activeOrders[orderIndex].status = data.status;
                if (data.readyTime) activeOrders[orderIndex].readyTime = data.readyTime;
                
                // ✅ FIX: Update activeOrderState αν είναι η τρέχουσα
                if (activeOrderState && activeOrderState.id === data.id) {
                    activeOrderState = activeOrders[orderIndex];
                    localStorage.setItem('bellgo_active_order', JSON.stringify(activeOrderState));
                }
                
                localStorage.setItem('bellgo_active_orders', JSON.stringify(activeOrders));
                App.updateStatusUI();
            }
        });

        socket.on('order-status-changed', (data) => {
            const orderIndex = activeOrders.findIndex(o => o.id === data.id);
            if (orderIndex > -1) {
                activeOrders[orderIndex].status = data.status;
                
                // ✅ FIX: Update activeOrderState
                if (activeOrderState && activeOrderState.id === data.id) {
                    activeOrderState = activeOrders[orderIndex];
                    localStorage.setItem('bellgo_active_order', JSON.stringify(activeOrderState));
                }
                
                localStorage.setItem('bellgo_active_orders', JSON.stringify(activeOrders));
                App.updateStatusUI();
            }
        });
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
                        box.addEventListener('dblclick', (e) => { 
                            e.preventDefault(); 
                            // Μετατροπή σε string για το textarea
                            const val = (typeof item === 'object') ? `${item.name}:${item.price}` : item.trim();
                            App.addToOrder(val); 
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
        txt.focus(); txt.classList.add('flash'); setTimeout(() => txt.classList.remove('flash'), 200);
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
        if (validForCard && total > 0) {
            btnCard.disabled = false;
            btnCard.innerHTML = "💳 ΚΑΡΤΑ";
        } else {
            btnCard.disabled = true;
            btnCard.innerHTML = "💳 ΚΑΡΤΑ (Μη διαθέσιμη)";
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
        // ✅ FIX: Έλεγχος σύνδεσης πριν την αποστολή
        if (!window.socket) App.connectSocket();

        if (!window.socket || !window.socket.connected) {
             console.log("⚠️ Socket disconnected. Attempting reconnect...");
             if(window.socket) window.socket.connect();
             
             // ✅ FIX: Περιμένουμε λίγο να συνδεθεί και ξαναδοκιμάζουμε αυτόματα
             setTimeout(() => {
                 if (window.socket && window.socket.connected) {
                     App.sendOrder(items, method); // Ξανακαλούμε τη συνάρτηση
                 } else {
                     alert("⚠️ Αδυναμία σύνδεσης με το κατάστημα. Ελέγξτε το internet σας ή ανανεώστε τη σελίδα.");
                 }
             }, 1500);
             return;
        }

        const fullText = `[DELIVERY 🛵]\n👤 ${customerDetails.name}\n📍 ${customerDetails.address}\n🏢 ${customerDetails.floor}\n📞 ${customerDetails.phone}\n${method}\n---\n${items}`;
        activeOrderState = { id: Date.now(), status: 'pending', timestamp: Date.now() };
        localStorage.setItem('bellgo_active_order', JSON.stringify(activeOrderState));
        window.socket.emit('new-order', fullText);
        App.updateStatusUI('pending'); // ✅ Χρήση της updateStatusUI για συνέπεια
        document.getElementById('orderText').value = ''; 
        document.getElementById('liveTotal').innerText = "ΣΥΝΟΛΟ: 0.00€";
    },

    minimizeStatus: () => { 
        document.getElementById('statusOverlay').style.height = '0'; 
        document.getElementById('btnStatusMini').style.display = 'flex'; // Εμφάνιση μικρού κουμπιού
    },

    maximizeStatus: () => { document.getElementById('statusOverlay').style.height = '100%'; },

    showStatus: (status) => {
        const overlay = document.getElementById('statusOverlay');
        const icon = document.getElementById('statusIcon');
        const text = document.getElementById('statusText');
        const sub = document.getElementById('statusSub');
        const btnNew = document.getElementById('btnNewOrder');

        overlay.style.height = '100%'; 
        btnNew.style.display = 'none'; 
        document.getElementById('btnStatusMini').style.display = 'none'; // Απόκρυψη μικρού κουμπιού όταν είναι ανοιχτό

        let timeString = "";
        // ✅ FIX: Έλεγχος αν υπάρχει activeOrderState
        const currentOrder = activeOrderState;
        const currentStatus = status || (currentOrder ? currentOrder.status : 'pending');

        // Χρήση readyTime αν υπάρχει, αλλιώς timestamp
        const timeRef = (currentOrder && currentOrder.readyTime) ? currentOrder.readyTime : Date.now();
        const date = new Date(timeRef);
        timeString = date.toLocaleTimeString('el-GR', {hour: '2-digit', minute:'2-digit'});

        const miniText = document.getElementById('miniStatusText');
        if (currentStatus === 'pending') {
            icon.innerText = '⏳'; text.innerText = 'Στάλθηκε! Αναμονή...'; sub.innerText = 'Το κατάστημα ελέγχει την παραγγελία';
            if(miniText) miniText.innerText = "Αναμονή...";
        } else if (currentStatus === 'cooking') {
            icon.innerText = '👨‍🍳'; text.innerText = 'Ετοιμάζεται!'; sub.innerText = 'Η παραγγελία έγινε αποδεκτή';
            if(miniText) miniText.innerText = "Ετοιμάζεται";
        } else if (currentStatus === 'ready') {
            icon.innerText = '🛵'; text.innerText = `Έρχεται! (Έφυγε ${timeString})`; sub.innerText = 'Ο διανομέας ξεκίνησε';
            btnNew.style.display = 'block'; 
            if(miniText) miniText.innerText = "Έρχεται!";
        }
    },

    updateStatusUI: (status) => { App.showStatus(status); },

    resetForNewOrder: () => {
        if(confirm("Θέλετε να κάνετε νέα παραγγελία;")) {
            localStorage.removeItem('bellgo_active_order');
            activeOrderState = null;
            document.getElementById('statusOverlay').style.height = '0';
            document.getElementById('orderText').value = '';
            document.getElementById('btnStatusMini').style.display = 'none';
        }
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
    const splash = document.getElementById('splashScreen');
    if(splash) splash.style.display = 'none';

    if (user) { currentUser = user; App.checkDetails(); } 
    else { document.getElementById('loginScreen').style.display = 'flex'; document.getElementById('appContent').style.display = 'none'; }
});


// PWA Lifecycle Fix: Reload page if URL changes on visibility.
let lastPath = window.location.pathname;
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && window.location.pathname !== lastPath) {
        // The URL has changed, likely from a QR scan focusing the existing PWA.
        // A full reload is the most robust way to re-initialize the app state.
        window.location.reload();
    }
});
