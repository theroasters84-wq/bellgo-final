import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";
import { firebaseConfig, vapidKey } from './config.js';

// --- AUTH CHECK ---
const savedSession = localStorage.getItem('bellgo_session');
if (!savedSession) window.location.replace("login.html");
const userData = JSON.parse(savedSession || '{}');

if (userData.role !== 'driver' && userData.role !== 'admin') { 
    alert("Πρόσβαση μόνο για Διανομείς."); 
    window.location.replace("login.html"); 
}

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

window.App = {
    activeOrders: [],
    currentQrOrderId: null, // ✅ NEW: Track open QR
    softPosSettings: {}, // ✅ NEW: SoftPOS Settings

    init: () => {
        // ✅ FIX: Άμεση εμφάνιση ονόματος (Cache) για να μην φαίνεται το email
        const cachedName = localStorage.getItem('bellgo_store_name');
        const displayName = cachedName || userData.store || "Store";
        document.getElementById('storeNameHeader').innerText = displayName + " 🛵";

        App.connectSocket();
        App.requestNotifyPermission();
        
        // ✅ Ενεργοποίηση Audio Engine (Silent Tone) με το πρώτο κλικ
        // Αυτό παίζει το 'tone19hz.wav' για να κρατάει το κινητό ξύπνιο
        document.body.addEventListener('click', () => { 
            if(window.AudioEngine) window.AudioEngine.init();
        }, {once:true});
        
        // ✅ Check SoftPOS Return
        App.checkSoftPosReturn();

        if(window.KeepAlive) window.KeepAlive.init();
    },

    requestNotifyPermission: async () => {
        try {
            if (Notification.permission === 'default') await Notification.requestPermission();
            if (Notification.permission === "granted") {
                const registration = await navigator.serviceWorker.ready;
                const token = await getToken(messaging, { vapidKey: vapidKey, serviceWorkerRegistration: registration }); 
                if (token) {
                    localStorage.setItem('fcm_token', token);
                    if(window.socket && window.socket.connected) {
                        window.socket.emit('update-token', { token: token, username: userData.name });
                    }
                }
            }
        } catch (error) { console.error("Notification Error:", error); }
    },

    connectSocket: () => {
        if (!window.socket) window.socket = io({ transports: ['polling', 'websocket'], reconnection: true });
        const socket = window.socket;

        socket.on('connect', () => {
            document.getElementById('connDot').style.background = '#00E676';
            socket.emit('join-store', { 
                storeName: userData.store, 
                username: userData.name, 
                role: 'driver', 
                token: localStorage.getItem('fcm_token'),
                isNative: !!window.Capacitor 
            });

            // ✅ NEW: Handle SoftPOS Completion after reload
            if (App.pendingSoftPosCompletion) {
                const { id, amount } = App.pendingSoftPosCompletion;
                window.socket.emit('charge-order-to-staff', { orderId: id, staffName: userData.name, amount: parseFloat(amount), method: 'card' });
                App.pendingSoftPosCompletion = null;
            }
        });

        socket.on('disconnect', () => { document.getElementById('connDot').style.background = 'red'; });

        socket.on('orders-update', (orders) => {
            App.activeOrders = orders;
            App.renderOrders();
        });
        
        socket.on('order-changed', (data) => {
            const o = App.activeOrders.find(x => x.id === data.id);
            if(o) { 
                o.status = data.status; 
                App.renderOrders(); 
            }
        });

        socket.on('force-logout', () => App.logout());

        // ✅ NEW: Listen for Settings (Name & SoftPOS)
        socket.on('store-settings-update', (settings) => {
            if(settings) {
                if(settings.name) {
                    document.getElementById('storeNameHeader').innerText = settings.name + " 🛵";
                    localStorage.setItem('bellgo_store_name', settings.name); // ✅ Cache Name
                }
                if(settings.softPos) App.softPosSettings = settings.softPos;
            }
        });

        // ✅ NEW: ALARM LISTENERS
        socket.on('ring-bell', (data) => {
            if(window.AudioEngine) window.AudioEngine.triggerAlarm(data ? data.source : null);
            
            // Εμφάνιση κουμπιού
            const bell = document.getElementById('driverBellBtn');
            if(bell) {
                bell.style.display = 'flex';
                bell.classList.add('ringing');
                bell.innerText = data && data.source ? `🔔 ${data.source}` : "🔔";
            }
        });

        socket.on('stop-bell', () => {
            if(window.AudioEngine) window.AudioEngine.stopAlarm();
            const bell = document.getElementById('driverBellBtn');
            if(bell) {
                bell.style.display = 'none';
                bell.classList.remove('ringing');
            }
        });

        // ✅ NEW: DELIVERY OFFER (BROADCAST)
        socket.on('delivery-offer', (data) => {
            if(window.AudioEngine) window.AudioEngine.triggerAlarm("ΝΕΑ ΔΙΑΝΟΜΗ");
            
            const modal = document.getElementById('offerModal');
            const btn = document.getElementById('btnAcceptOffer');
            
            btn.onclick = () => {
                // Ο Διανομέας αποδέχεται και χρεώνεται
                const order = App.activeOrders.find(o => o.id == data.orderId);
                if (order) {
                    // ✅ FIX: Αντί να χρεωθεί αμέσως, κάνουμε ΑΝΑΛΗΨΗ (Assign)
                    window.socket.emit('driver-take-order', { orderId: data.orderId });
                    alert("Την πήρες! 🚀");
                } else {
                    alert("Η παραγγελία δεν βρέθηκε (ίσως την πήρε άλλος).");
                }
                modal.style.display = 'none';
                if(window.AudioEngine) window.AudioEngine.stopAlarm();
            };
            
            modal.style.display = 'flex';
        });

        // ✅ NEW: Αυτόματο κλείσιμο QR
        socket.on('payment-confirmed', (data) => {
            if (App.currentQrOrderId && App.currentQrOrderId == data.orderId) {
                document.getElementById('qrModal').style.display = 'none';
                alert("Η πληρωμή έγινε δεκτή! ✅");
                App.currentQrOrderId = null;
            }
        });
    },

    renderOrders: () => {
        const container = document.getElementById('ordersList');
        container.innerHTML = '';

        const deliveryOrders = App.activeOrders.filter(o => o.text.includes('[DELIVERY'));
        
        deliveryOrders.sort((a,b) => {
            if (a.status === 'ready' && b.status !== 'ready') return -1;
            if (a.status !== 'ready' && b.status === 'ready') return 1;
            return a.id - b.id;
        });

        if (deliveryOrders.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:#555; margin-top:50px; font-size:18px;">Δεν υπάρχουν ενεργές διανομές.</div>';
            return;
        }

        deliveryOrders.forEach(order => {
            if (order.status === 'completed') return;

            // ✅ NEW: Φιλτράρισμα Παραγγελιών
            // 1. Βρίσκουμε αν έχει ανατεθεί σε κάποιον
            const driverMatch = order.text.match(/\[DRIVER:\s*(.+?)\]/);
            const assignedDriver = driverMatch ? driverMatch[1] : null;

            // 2. Αν ανήκει σε ΑΛΛΟΝ διανομέα, την κρύβουμε
            if (assignedDriver && assignedDriver !== userData.name) return;

            const isReady = order.status === 'ready';
            const isPaid = order.text.includes('PAID');
            const card = document.createElement('div');
            card.className = 'order-card';
            card.style.cssText = `background:#222; border:2px solid ${isPaid ? '#00E676' : (isReady ? '#FFD700' : '#444')}; border-radius:12px; padding:15px; position:relative; opacity:${isReady ? 1 : 0.7}; box-shadow:0 4px 10px rgba(0,0,0,0.3);`;

            let name = "Πελάτης", address = "", phone = "", paymentMethod = "❓", floor = "", zip = "";
            const lines = order.text.split('\n');
            lines.forEach(line => {
                if (line.includes('👤')) name = line.replace('👤', '').trim();
                if (line.includes('📍')) address = line.replace('📍', '').trim();
                if (line.includes('📞')) phone = line.replace('📞', '').trim();
                if (line.includes('💳') || line.includes('💵')) paymentMethod = line.trim();
                if (line.includes('🏢')) floor = line.replace('🏢', '').trim();
                if (line.includes('📮')) zip = line.replace('📮', '').trim();
            });
            
            const total = App.calculateTotal(order.text);
            const time = new Date(order.id).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

            // ✅ NEW: Κουμπιά Ανάλογα με την Κατάσταση
            let actionButtons = '';
            if (!assignedDriver) {
                // Αν είναι ελεύθερη -> Κουμπί ΑΝΑΛΗΨΗ
                actionButtons = `<button onclick="App.takeOrder(${order.id})" style="width:100%; margin-top:10px; padding:15px; background:#FF9800; color:black; border:none; border-radius:10px; font-weight:bold; font-size:16px; cursor:pointer;">🖐 ΑΝΑΛΗΨΗ</button>`;
            } else {
                // Αν είναι δική μου -> Κουμπί ΠΑΡΑΔΟΘΗΚΕ (Κλείσιμο)
                actionButtons = `<button onclick="App.completeOrder(${order.id})" style="width:100%; margin-top:10px; padding:15px; background:#00E676; color:black; border:none; border-radius:10px; font-weight:bold; font-size:16px; cursor:pointer;">✅ ΠΑΡΑΔΟΘΗΚΕ</button>`;
            }

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid #333; padding-bottom:5px;">
                    <span style="font-weight:bold; color:${isReady ? '#00E676' : '#FF9800'}; font-size:16px;">${isReady ? '🚀 ΕΤΟΙΜΟ' : '⏳ ΕΤΟΙΜΑΖΕΤΑΙ...'}</span>
                    <span style="color:#aaa; font-size:12px;">${time}</span>
                </div>
                <div style="font-size:18px; font-weight:bold; color:white; margin-bottom:5px;">${name}</div>
                <div style="font-size:20px; color:#FFD700; margin-bottom:5px; font-weight:bold; line-height:1.3;">📍 ${address}</div>
                ${zip ? `<div style="font-size:14px; color:#aaa; margin-bottom:2px;">📮 ${zip}</div>` : ''}
                ${floor ? `<div style="font-size:16px; color:white; font-weight:bold; margin-bottom:5px; background:#333; display:inline-block; padding:2px 8px; border-radius:4px;">🏢 ${floor}</div>` : ''}
                <div style="font-size:16px; color:#ccc; margin-bottom:15px;">📞 <a href="tel:${phone}" style="color:#2196F3; text-decoration:none; font-weight:bold;">${phone}</a></div>
                <div style="background:#333; padding:10px; border-radius:8px; margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
                    <div style="font-weight:bold; color:white; font-size:14px;">${paymentMethod}</div>
                    <div style="font-size:22px; font-weight:bold; color:${isPaid ? '#00E676' : 'white'};">${total.toFixed(2)}€ ${isPaid ? '✅' : ''}</div>
                </div>
                
                ${assignedDriver ? `
                    <div style="display:flex; gap:10px;">
                        <button onclick="App.openMap('${address}')" style="flex:1; padding:15px; background:#2196F3; color:white; border:none; border-radius:10px; font-weight:bold; font-size:16px; cursor:pointer;">🗺️ ΧΑΡΤΗΣ</button>
                        <button onclick="App.openQrPayment('${order.id}')" style="flex:1; padding:15px; background:#635BFF; color:white; border:none; border-radius:10px; font-weight:bold; font-size:16px; cursor:pointer;">💳 QR</button>
                    </div>
                ` : ''}

                ${actionButtons}
            `;
            container.appendChild(card);
        });
    },

    calculateTotal: (text) => { let t=0; if(!text)return 0; text.split('\n').forEach(l=>{ const m=l.match(/^(\d+)?\s*(.+):(\d+(?:\.\d+)?)$/); if(m) t+=(parseInt(m[1]||'1')*parseFloat(m[3])); }); return t; },
    openMap: (addr) => { if(!addr) return alert("Δεν υπάρχει διεύθυνση."); window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`, '_blank'); },
    
    // ✅ NEW: Take Order Function
    takeOrder: (id) => {
        window.socket.emit('driver-take-order', { orderId: id });
    },

    // ✅ FIX: Complete Order now charges the staff wallet
    completeOrder: (id) => { 
        // ✅ NEW: SoftPOS Choice
        if (App.softPosSettings && App.softPosSettings.enabled) {
            const choice = prompt("Τρόπος Πληρωμής:\n1. 💵 ΜΕΤΡΗΤΑ\n2. 💳 ΚΑΡΤΑ (SoftPOS)", "1");
            if (choice === '2') {
                const order = App.activeOrders.find(o => o.id == id);
                const total = App.calculateTotal(order.text);
                App.triggerSoftPosPayment(total, id);
                return;
            } else if (choice !== '1') {
                return; // Cancel
            }
        }

        if(confirm("Η παραγγελία παραδόθηκε και εισπράχθηκε;")) {
            const order = App.activeOrders.find(o => o.id == id);
            const total = App.calculateTotal(order.text);
            // Χρέωση στο πορτοφόλι του διανομέα και κλείσιμο
            window.socket.emit('charge-order-to-staff', { orderId: id, staffName: userData.name, amount: total, method: 'cash' });
        }
    },
    
    logout: () => { localStorage.removeItem('bellgo_session'); window.location.replace("login.html"); },

    openQrPayment: async (id) => {
        App.currentQrOrderId = id; // ✅ Save ID
        const order = App.activeOrders.find(o => o.id == id);
        if(!order) return;
        const total = App.calculateTotal(order.text);
        if(total <= 0) return alert("Μηδενικό ποσό.");
        try {
            const res = await fetch('/create-qr-payment', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ amount: total, storeName: userData.store, orderId: id }) });
            const data = await res.json();
            if(data.url) { const c = document.getElementById('qrcode'); c.innerHTML = ""; new QRCode(c, { text: data.url, width: 200, height: 200 }); document.getElementById('qrModal').style.display = 'flex'; } 
            else { alert("Σφάλμα: " + (data.error || "Άγνωστο")); }
        } catch(e) { alert("Σφάλμα σύνδεσης."); }
    },

    // ✅ NEW: ACCEPT ALARM FUNCTION
    acceptAlarm: () => {
        if(window.AudioEngine) window.AudioEngine.stopAlarm();
        const bell = document.getElementById('driverBellBtn');
        if(bell) {
            bell.style.display = 'none';
            bell.classList.remove('ringing');
        }
        window.socket.emit('alarm-accepted', { store: userData.store, username: userData.name });
    },

    // ✅ NEW: Trigger SoftPOS App
    triggerSoftPosPayment: (amount, context) => {
        const s = App.softPosSettings;
        if (!s || !s.enabled) return alert("Το SoftPOS δεν είναι ενεργοποιημένο.");

        const returnUrl = window.location.origin + window.location.pathname + `?softpos_status=success&amount=${amount}&context=${context}`;
        
        let scheme = "intent://pay";
        if (s.provider === 'viva') scheme = "viva.smartcheckout://checkout";
        
        const params = `?amount=${(amount * 100).toFixed(0)}&currency=978&merchantKey=${s.apiKey || ''}&sourceCode=${s.merchantId || ''}&callback=${encodeURIComponent(returnUrl)}`;
        
        window.location.href = scheme + params;
    },

    // ✅ NEW: Check Return from SoftPOS
    checkSoftPosReturn: () => {
        const params = new URLSearchParams(window.location.search);
        const status = params.get('softpos_status');
        
        if (status === 'success') {
            const amount = params.get('amount');
            const context = params.get('context'); // orderId
            
            const audio = new Audio('/alert.mp3');
            audio.play().catch(e=>{});
            
            alert(`✅ Η πληρωμή ${amount}€ ολοκληρώθηκε!`);
            
            if (context) {
                App.pendingSoftPosCompletion = { id: context, amount: amount };
            }
            window.history.replaceState({}, document.title, window.location.pathname);
        } else if (status === 'cancel') {
            alert("❌ Ακυρώθηκε.");
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
};
window.onload = App.init;