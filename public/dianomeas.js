import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";
import { firebaseConfig, vapidKey } from './config.js';
import { Sundromes } from './sundromes.js';
import { PushNotifications, I18n } from './shared-utils.js';
import { initDriverSockets } from './driver-sockets.js'; // ✅ Import Sockets Logic

// --- AUTH CHECK ---
const savedSession = localStorage.getItem('bellgo_session');
if (!savedSession) window.location.replace("login.html");
let userData = {};
try { userData = JSON.parse(savedSession || '{}'); } catch(e) { 
    console.error("Session Error", e); window.location.replace("login.html"); 
}

if (userData.role !== 'driver' && userData.role !== 'admin') { 
    alert(I18n.t('driver_access_only') || "Πρόσβαση μόνο για Διανομείς."); 
    window.location.replace("login.html"); 
}

const app = initializeApp(firebaseConfig);
let messaging = null;
try {
    messaging = getMessaging(app);
} catch(e) { console.warn("Firebase Messaging not supported (needs HTTPS):", e); }

const t = (key) => I18n.t(key) || key;

window.App = {
    t: t, // ✅ Expose for dynamic UI
    activeOrders: [],
    currentQrOrderId: null, // ✅ NEW: Track open QR
    isChatOpen: false, // ✅ NEW: Chat State
    unreadChatCount: 0, // ✅ NEW: Unread messages count
    softPosSettings: {}, // ✅ NEW: SoftPOS Settings
    features: {}, // ✅ NEW: Local Features

    init: () => {
        // ✅ FIX: Άμεση εμφάνιση ονόματος (Cache) για να μην φαίνεται το email
        const cachedName = localStorage.getItem('bellgo_store_name');
        const displayName = cachedName || userData.store || "Store";
        document.getElementById('storeNameHeader').innerText = displayName + " 🛵";

        // ✅ FIX: Initialize features
        if (userData.features) {
            App.features = { ...userData.features };
        }

        App.connectSocket(); // ✅ Connect first

        // ✅ NEW: Enforce Subscription for Driver too
        Sundromes.checkSubscriptionAndEnforce({ ...userData, features: App.features });

        App.setupChatUI();
        App.applyFeatureVisibility();

        // ✅ FIX: Κρύβουμε την "Πόρτα" (ΕΞΟΔΟΣ) από την κεντρική οθόνη μόνιμα με CSS
        if (!document.getElementById('hideDoorStyle')) {
            const hideDoorStyle = document.createElement('style');
            hideDoorStyle.id = 'hideDoorStyle';
            hideDoorStyle.innerHTML = `button[onclick*="logout"]:not(#btnSettingsLogoutDynamic), button[onclick*="Logout"]:not(#btnSettingsLogoutDynamic) { display: none !important; }`;
            document.head.appendChild(hideDoorStyle);
        }

        // ✅ Ελέγχουμε αν υπάρχει το settings modal και προσθέτουμε ΕΞΟΔΟ
        App.setupDriverSettingsExit();

        PushNotifications.requestPermission(messaging, (token) => {
            if(window.socket && window.socket.connected) {
                window.socket.emit('update-token', { token: token, username: userData.name, role: userData.role, isNative: !!window.Capacitor });
            }
        });
        
        // ✅ NEW: Start Shift Screen (Audio Unlock)
        if (!document.getElementById('startScreen')) {
            const div = document.createElement('div');
            div.id = 'startScreen';
            div.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:#f4f6f8; z-index:9999; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center;";
            div.innerHTML = `
                <h1 style="color:#1f2937; margin-bottom:20px; font-size:32px;">BellGo Driver 🛵</h1>
                <button id="btnStartShift" style="background:#10B981; color:white; border:none; padding:15px 30px; font-size:18px; font-weight:bold; border-radius:30px; cursor:pointer; box-shadow:0 4px 10px rgba(16,185,129,0.3);" data-i18n="start_shift">${App.t('start_shift') || 'ΕΝΑΡΞΗ ΒΑΡΔΙΑΣ'}</button>
            `;
            document.body.appendChild(div);
            document.getElementById('btnStartShift').onclick = () => App.unlockAudio();
        }
        
        App.checkSoftPosReturn();

        const savedLang = localStorage.getItem('bellgo_lang') || 'el';
        I18n.setLanguage(savedLang);

        if(window.KeepAlive) window.KeepAlive.init();
    },

    unlockAudio: () => {
        if(window.AudioEngine) {
            window.AudioEngine.init();
            // ✅ WARM UP ALARM SOUND (Fix for iOS/Android)
            if(window.AudioEngine.alarmPlayer) {
                window.AudioEngine.alarmPlayer.play().then(() => {
                    window.AudioEngine.alarmPlayer.pause();
                    window.AudioEngine.alarmPlayer.currentTime = 0;
                }).catch(e => console.log("Warmup error", e));
            }
        }
        const sc = document.getElementById('startScreen');
        if(sc) sc.style.display = 'none';
    },

    // ✅ NEW: Feature Check Logic
    hasFeature: (key) => {
        const userContext = { ...userData, features: { ...userData.features, ...App.features } };
        return Sundromes.hasAccess(userContext, key);
    },

    // ✅ NEW: Apply Visibility based on Features
    applyFeatureVisibility: () => {
        const hasChat = App.hasFeature('pack_chat');
        const hasManager = App.hasFeature('pack_manager');
        const hasDelivery = App.hasFeature('pack_delivery');

        // 1. Orders List (Manager or Delivery required)
        const ordersList = document.getElementById('ordersList');
        if (ordersList) {
             ordersList.style.display = (hasManager || hasDelivery) ? 'block' : 'none';
        }

        // 2. Chat & Fake Lock (Chat Pack required)
        const headerChatBtn = document.getElementById('driverHeaderChatBtn');
        if (headerChatBtn) {
            headerChatBtn.style.display = hasChat ? 'flex' : 'none';
        }
        
        const btnFakeLock = document.getElementById('btnFakeLock');
        if (btnFakeLock) {
            btnFakeLock.style.display = hasChat ? 'flex' : 'none';
        }
        
        const btnSettings = document.getElementById('btnSettings');
        if (btnSettings) {
            btnSettings.style.display = hasChat ? 'flex' : 'none';
        }
        
        // Αν έχουμε ΜΟΝΟ Chat (Συνδρομή 1), κρύβουμε τυχόν άλλα στοιχεία αν υπάρχουν
        if (hasChat && !hasManager && !hasDelivery) {
            // Εδώ θα μπορούσαμε να κρύψουμε κι άλλα αν υπήρχαν
        }
    },

    // ✅ NEW: Προσθήκη Εξόδου στις Ρυθμίσεις του Διανομέα
    setupDriverSettingsExit: () => {
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) {
            const box = settingsModal.querySelector('.modal-box') || settingsModal.firstElementChild;
            if (box) {
                const hasLogout = Array.from(box.querySelectorAll('button')).some(b => (b.getAttribute('onclick') || '').includes('logout'));
                if (!hasLogout && !document.getElementById('btnSettingsLogoutDynamic')) {
                    const logoutBtn = document.createElement('button');
                    logoutBtn.id = 'btnSettingsLogoutDynamic';
                    logoutBtn.setAttribute('data-i18n', 'exit');
                    logoutBtn.innerHTML = '🚪 ΕΞΟΔΟΣ';
                    logoutBtn.style.cssText = 'width:100%; padding:15px; margin-top:20px; background:#EF4444; color:white; border:none; border-radius:8px; font-weight:bold; font-size:16px; cursor:pointer; box-shadow:0 4px 10px rgba(239,68,68,0.3); display:block !important;';
                    logoutBtn.onclick = () => { if(confirm(App.t('logout_confirm') || "Είστε σίγουροι ότι θέλετε να αποσυνδεθείτε;")) App.logout(); };
                    const existingCloseBtn = Array.from(box.children).find(el => (el.innerText || '').includes('ΚΛΕΙΣΙΜΟ') || el.getAttribute('data-i18n') === 'close');
                    if (existingCloseBtn) {
                        box.insertBefore(logoutBtn, existingCloseBtn);
                    } else {
                        box.appendChild(logoutBtn);
                    }
                }
            }
        }
    },

    // ✅ NEW: Δυναμική δημιουργία του Chat για τον διανομέα
    setupChatUI: () => {
        let chatOverlay = document.getElementById('adminChatOverlay');
        if (!chatOverlay) {
            chatOverlay = document.createElement('div');
            chatOverlay.id = 'adminChatOverlay';
            chatOverlay.className = 'modal-overlay';
            chatOverlay.style.cssText = 'position:fixed; bottom:90px; right:20px; width:300px; height:400px; max-height:60vh; background:#ffffff; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,0.3); z-index:25000; display:none; flex-direction:column; overflow:hidden; border:1px solid #e5e7eb;';
            chatOverlay.innerHTML = `
                <div style="background:#10B981; color:white; padding:15px; font-weight:bold; display:flex; justify-content:space-between; align-items:center;">
                    <span>💬 Ομαδικό Chat</span>
                    <button onclick="App.toggleAdminChat()" style="background:none; border:none; color:white; font-size:18px; cursor:pointer;">✖</button>
                </div>
                <div id="adminChatBox" style="flex:1; padding:15px; overflow-y:auto; display:flex; flex-direction:column; background:#f9fafb;"></div>
                <div style="padding:10px; border-top:1px solid #e5e7eb; background:white; display:flex; gap:5px;">
                    <input type="text" id="adminChatInp" placeholder="Μήνυμα..." style="flex:1; padding:10px; border:1px solid #d1d5db; border-radius:20px; outline:none; font-size:14px;" onkeypress="if(event.key==='Enter') App.sendChat()">
                    <button onclick="App.sendChat()" style="background:#2196F3; color:white; border:none; width:40px; height:40px; border-radius:50%; cursor:pointer; font-weight:bold; display:flex; align-items:center; justify-content:center;">➤</button>
                </div>
            `;
            document.body.appendChild(chatOverlay);
        }

        let headerChatBtn = document.getElementById('driverHeaderChatBtn');
        if (!headerChatBtn) {
            headerChatBtn = document.createElement('button');
            headerChatBtn.id = 'driverHeaderChatBtn';
            headerChatBtn.title = 'Ομαδικό Chat';
            headerChatBtn.style.cssText = 'background:transparent; border:none; color:#1f2937; font-size:22px; cursor:pointer; position:relative; display:none; align-items:center; justify-content:center; margin-right:15px; padding:5px;';
            headerChatBtn.innerHTML = `
                💬
                <div id="chatBadge" style="display:none; position:absolute; top:-2px; right:-5px; background:#EF4444; color:white; font-size:10px; font-weight:bold; width:16px; height:16px; border-radius:50%; align-items:center; justify-content:center; border:2px solid white;">0</div>
            `;
            headerChatBtn.onclick = () => App.toggleAdminChat();
            
            const targetBtn = document.getElementById('btnFakeLock') || document.getElementById('btnSettings');
            if (targetBtn && targetBtn.parentNode) {
                targetBtn.parentNode.insertBefore(headerChatBtn, targetBtn);
            } else {
                document.body.appendChild(headerChatBtn);
                headerChatBtn.style.cssText += 'position:fixed; top:15px; right:80px; z-index:20000;';
            }
        }
    },

    connectSocket: () => {
        initDriverSockets(window.App, userData);
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
            container.innerHTML = `<div style="text-align:center; color:#555; margin-top:50px; font-size:18px;">${App.t('no_active_deliveries') || 'Δεν υπάρχουν ενεργές διανομές.'}</div>`;
            return;
        }

        deliveryOrders.forEach(order => {
            if (order.status === 'completed') return;

            // ✅ NEW: Φιλτράρισμα Παραγγελιών
            // 1. Βρίσκουμε αν έχει ανατεθεί σε κάποιον
            const driverMatch = order.text.match(/\[DRIVER:\s*(.+?)\]/);
            const assignedDriver = driverMatch ? driverMatch[1] : null;

            // 2. Αν είναι ανατεθειμένη σε ΑΛΛΟΝ διανομέα, την κρύβουμε. (Αν είναι κενό, τη βλέπουν όλοι για να κάνουν Ανάληψη).
            if (assignedDriver && assignedDriver !== userData.name) return;

            const isReady = order.status === 'ready';
            const isPaid = order.text.includes('PAID') || order.text.includes('✅');
            
            const card = document.createElement('div');
            card.className = 'order-card';
            card.style.cssText = `background:#ffffff; border:2px solid ${isPaid ? '#10B981' : (isReady ? '#F59E0B' : '#e5e7eb')}; border-radius:12px; padding:15px; margin-bottom:15px; position:relative; opacity:${isReady ? 1 : 0.7}; box-shadow:0 4px 15px rgba(0,0,0,0.05); color:#1f2937;`;
            
            let name = App.t('customer') || "Πελάτης", address = "", phone = "", paymentMethod = "❓", floor = "", zip = "";
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
                actionButtons = `<button onclick="App.takeOrder(${order.id})" style="width:100%; margin-top:10px; padding:15px; background:#F59E0B; color:white; border:none; border-radius:10px; font-weight:bold; font-size:16px; cursor:pointer; box-shadow:0 4px 10px rgba(245,158,11,0.3);">🖐 ΑΝΑΛΗΨΗ</button>`;
            } else {
                // Αν είναι δική μου -> Κουμπί ΠΑΡΑΔΟΘΗΚΕ (Κλείσιμο)
                actionButtons = `<button onclick="App.completeOrder(${order.id})" style="width:100%; margin-top:10px; padding:15px; background:#10B981; color:white; border:none; border-radius:10px; font-weight:bold; font-size:16px; cursor:pointer; box-shadow:0 4px 10px rgba(16,185,129,0.3);">✅ ΠΑΡΑΔΟΘΗΚΕ</button>`;
            }

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid #e5e7eb; padding-bottom:5px;">
                    <span style="font-weight:bold; color:${isReady ? '#10B981' : '#F59E0B'}; font-size:16px;">${isReady ? '🚀 ΕΤΟΙΜΟ' : '⏳ ΕΤΟΙΜΑΖΕΤΑΙ...'}</span>
                    <span style="color:#6b7280; font-size:12px;">${time}</span>
                </div>
                <div style="font-size:18px; font-weight:bold; color:#1f2937; margin-bottom:5px;">${name}</div>
                <div style="font-size:20px; color:#2196F3; margin-bottom:5px; font-weight:bold; line-height:1.3; cursor:pointer;" onclick="App.openMap('${address}')">📍 ${address} <span style="font-size:12px; color:#6b7280;">(Χάρτης)</span></div>
                ${zip ? `<div style="font-size:14px; color:#6b7280; margin-bottom:2px;">📮 ${zip}</div>` : ''}
                ${floor ? `<div style="font-size:16px; color:#1f2937; font-weight:bold; margin-bottom:5px; background:#f3f4f6; border:1px solid #d1d5db; display:inline-block; padding:2px 8px; border-radius:4px;">🏢 ${floor}</div>` : ''}
                <div style="font-size:16px; color:#6b7280; margin-bottom:15px;">📞 <a href="tel:${phone.replace(/[^0-9+]/g, '')}" style="color:#2196F3; text-decoration:none; font-weight:bold;">${phone}</a></div>
                <div style="background:#f9fafb; border:1px solid #e5e7eb; padding:10px; border-radius:8px; margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
                    <div style="font-weight:bold; color:#1f2937; font-size:14px;">Πληρωμή: ${paymentMethod}</div>
                    <div style="font-size:22px; font-weight:bold; color:${isPaid ? '#10B981' : '#1f2937'};">${total.toFixed(2)}€ ${isPaid ? '✅ (PAID)' : ''}</div>
                </div>
                
                ${assignedDriver ? `
                    <div style="display:flex; gap:10px;">
                        <button onclick="App.openMap('${address}')" style="flex:1; padding:15px; background:#2196F3; color:white; border:none; border-radius:10px; font-weight:bold; font-size:16px; cursor:pointer;">${App.t('map') || '🗺️ ΧΑΡΤΗΣ'}</button>
                        <button onclick="App.openQrPayment('${order.id}')" style="flex:1; padding:15px; background:#635BFF; color:white; border:none; border-radius:10px; font-weight:bold; font-size:16px; cursor:pointer;">${App.t('qr') || '💳 QR'}</button>
                    </div>
                ` : ''}

                ${actionButtons}
            `;
            container.appendChild(card);
        });
    },

    calculateTotal: (text) => { let t=0; if(!text)return 0; text.split('\n').forEach(l=>{ const m=l.match(/^(\d+)?\s*(.+):(\d+(?:\.\d+)?)$/); if(m) t+=(parseInt(m[1]||'1')*parseFloat(m[3])); }); return t; },
    openMap: (addr) => { if(!addr) return alert(App.t('no_address') || "Δεν υπάρχει διεύθυνση."); window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`, '_blank'); },
    
    // ✅ NEW: Take Order Function
    takeOrder: (id) => {
        window.socket.emit('driver-take-order', { orderId: id });
    },

    // ✅ FIX: Complete Order now charges the staff wallet
    completeOrder: (id) => { 
        const order = App.activeOrders.find(o => o.id == id);
        if (!order) return;
        const total = App.calculateTotal(order.text);
        const isPaid = order.text.includes('PAID') || order.text.includes('✅');

        // ✅ NEW: If order is already paid, just confirm delivery and close.
        if (isPaid) {
            if (confirm(App.t('order_delivered_prompt') || 'Η παραγγελία παραδόθηκε;')) {
                // Use the existing event but with 0 amount to just remove the order.
                // The server will update the wallets with +0, and then remove the order from the list.
                window.socket.emit('charge-order-to-staff', { orderId: id, staffName: userData.name, amount: 0, method: 'paid' });
            }
            return;
        }

        const hasSoftPos = App.softPosSettings && App.softPosSettings.enabled;
        const hasPhysicalPos = App.posSettings && App.posSettings.provider && App.posSettings.id;
        
        let promptTxt = "";
        if (hasSoftPos && hasPhysicalPos) {
            promptTxt = App.t('pay_method_prompt') || "Τρόπος Πληρωμής:\n1. 💵 ΜΕΤΡΗΤΑ\n2. 📱 ΚΑΡΤΑ (SoftPOS)\n3. 💳 ΚΑΡΤΑ (Απλό Τερματικό)\n\n*(Για Stripe QR πατήστε Άκυρο)*";
        } else if (hasSoftPos) {
            promptTxt = App.t('pay_method_prompt') || "Τρόπος Πληρωμής:\n1. 💵 ΜΕΤΡΗΤΑ\n2. 📱 ΚΑΡΤΑ (SoftPOS)\n\n*(Για Stripe QR πατήστε Άκυρο)*";
        } else {
            promptTxt = App.t('pay_method_prompt') || "Τρόπος Πληρωμής:\n1. 💵 ΜΕΤΡΗΤΑ\n2. 💳 ΚΑΡΤΑ (Απλό)";
        }
            
        const choice = prompt(promptTxt, "1");
        
        if (choice === null) return;
        
        if (hasSoftPos && choice === '2') {
            App.triggerSoftPosPayment(total, id);
            return;
        }

        const method = (choice === '2' || choice === '3') ? 'card' : 'cash';
        
        // Χρέωση στο πορτοφόλι του διανομέα και κλείσιμο
        window.socket.emit('charge-order-to-staff', { orderId: id, staffName: userData.name, amount: total, method: method });
    },
    
    logout: () => { localStorage.removeItem('bellgo_session'); window.location.replace("login.html"); },

    // --- CHAT LOGIC ---
    toggleAdminChat: () => { 
        const el = document.getElementById('adminChatOverlay');
        if(!el) return;
        App.isChatOpen = (el.style.display === 'flex');
        if (App.isChatOpen) { 
            el.style.display = 'none'; 
            App.isChatOpen = false; 
        } else { 
            el.style.display = 'flex'; 
            App.isChatOpen = true; 
            App.unreadChatCount = 0;
            const b = document.getElementById('chatBadge'); 
            if(b) { b.style.display = 'none'; b.innerText = '0'; }
        }
    },
    sendChat: () => {
        const inp = document.getElementById('adminChatInp');
        if (inp && inp.value.trim()) { window.socket.emit('chat-message', { text: inp.value }); inp.value = ''; }
    },
    appendChat: (data) => {
        if (data.sender !== userData.name && !App.isChatOpen) { 
            App.unreadChatCount = (App.unreadChatCount || 0) + 1;
            const badge = document.getElementById('chatBadge');
            if(badge) {
                badge.style.display = 'flex'; 
                badge.innerText = App.unreadChatCount;
            }
        }
        const box = document.getElementById('adminChatBox');
        if(box) {
            const isMe = data.sender === userData.name;
            box.innerHTML += `
                <div style="align-self:${isMe ? 'flex-end' : 'flex-start'}; background:${isMe ? '#DCF8C6' : '#ffffff'}; border:1px solid ${isMe ? '#DCF8C6' : '#e5e7eb'}; color:#1f2937; padding:8px 12px; border-radius:12px; max-width:80%; font-size:14px; margin-bottom:8px; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                    <b style="font-size:11px; color:#6b7280; display:block; margin-bottom:2px;">${data.sender}</b>
                    ${data.text}
                </div>
            `;
            box.scrollTop = box.scrollHeight;
        }
    },

    // --- FAKE LOCK LOGIC ---
    toggleFakeLock: () => { 
        const el = document.getElementById('fakeLockOverlay');
        if(!el) return;
        el.style.display = 'flex';
    },
    
    openUnlockPin: () => {
        document.getElementById('pinUnlockModal').style.display = 'flex';
        if(window.UnlockPIN) window.UnlockPIN.clear();
    },

    openQrPayment: async (id) => {
        App.currentQrOrderId = id; // ✅ Save ID
        const order = App.activeOrders.find(o => o.id == id);
        if(!order) return;
        const total = App.calculateTotal(order.text);
        if(total <= 0) return alert(App.t('zero_amount') || "Μηδενικό ποσό.");
        try {
            const res = await fetch('/create-qr-payment', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ amount: total, storeName: userData.store, orderId: id }) });
            const data = await res.json();
            if(data.url) { const c = document.getElementById('qrcode'); c.innerHTML = ""; new QRCode(c, { text: data.url, width: 200, height: 200 }); document.getElementById('qrModal').style.display = 'flex'; } 
            else { alert((App.t('error') || "Σφάλμα: ") + (data.error || "Άγνωστο")); }
        } catch(e) { alert(App.t('connection_error') || "Σφάλμα σύνδεσης."); }
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
        if (!s || !s.enabled) return alert(App.t('softpos_disabled') || "Το SoftPOS δεν είναι ενεργοποιημένο.");

        const returnUrl = window.location.origin + window.location.pathname + `?softpos_status=success&amount=${amount}&context=${context}`;
        
        const amountCents = (amount * 100).toFixed(0);
        let intentUrl = "";

        // ✅ Bypasses KeepAlive protection temporarily to allow external app launch
        window.allowSoftPosExit = true;
        setTimeout(() => { window.allowSoftPosExit = false; }, 3000);

        if (s.provider === 'viva') {
            let params = `?action=sale&clientTransactionId=${context}_${Date.now()}&amount=${amountCents}&callback=${encodeURIComponent(returnUrl)}`;
            if (s.merchantId) params += `&sourceCode=${s.merchantId}`;
            if (s.apiKey) params += `&appId=${s.apiKey}`;
            intentUrl = `intent://pay/v1${params}#Intent;scheme=vivapay;package=com.vivawallet.terminal;end;`;
            
            const link = document.createElement('a');
            link.href = intentUrl;
            link.target = '_top';
            document.body.appendChild(link);
            link.click();
            link.remove();
        } else {
            let appName = "";
            if (s.provider === 'alpha') { appName = "Nexi SoftPOS"; }
            else if (s.provider === 'eurobank') { appName = "Worldline Smart POS"; }
            else if (s.provider === 'piraeus') { pkg = "gr.epay.softpos"; appName = "epay SoftPOS"; }
            else { alert("Άγνωστος πάροχος."); return; }

            try { navigator.clipboard.writeText(amount.toString()); } catch(e){}

            setTimeout(() => {
                const div = document.createElement('div');
                div.className = 'modal-overlay';
                div.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:99999; display:flex; align-items:center; justify-content:center;";
                div.innerHTML = `
                    <div class="modal-box" style="background:#fff; padding:20px; border-radius:12px; text-align:center; max-width:320px; box-shadow:0 10px 30px rgba(0,0,0,0.5);">
                        <div style="font-size:40px; margin-bottom:10px;">📱</div>
                        <h3 style="color:#10B981; margin:0 0 10px 0;">SoftPOS (${appName})</h3>
                        <p style="color:#1f2937; font-size:16px; margin-bottom:5px;">Ποσό: <b style="font-size:20px;">${amount}€</b></p>
                        <p style="color:#EF4444; font-size:13px; font-weight:bold; margin-bottom:15px; border: 1px dashed #EF4444; padding:5px;">⚠️ Το ποσό αντιγράφηκε!<br><br>👉 Βγείτε για λίγο από το BellGo, ανοίξτε το <b>${appName}</b> από το κινητό σας και κάντε Επικόλληση (Paste).</p>
                        
                        <span style="font-size:13px; color:#6b7280; display:block; margin-bottom:10px;">Αφού χτυπήσετε την κάρτα, επιστρέψτε εδώ και πατήστε:</span>
                        <button onclick="window.location.href='${returnUrl}'" style="background:#10B981; color:white; border:none; padding:15px; width:100%; border-radius:8px; font-weight:bold; font-size:16px; margin-bottom:10px; cursor:pointer;">✅ ΕΠΙΒΕΒΑΙΩΣΗ ΠΛΗΡΩΜΗΣ</button>
                        <button onclick="this.parentElement.parentElement.remove()" style="background:#f3f4f6; color:#1f2937; border:1px solid #d1d5db; padding:10px; width:100%; border-radius:8px; font-weight:bold; cursor:pointer;">ΑΚΥΡΩΣΗ</button>
                    </div>
                `;
                document.body.appendChild(div);
            }, 100);
        }
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
            
            alert(`✅ ${App.t('payment_completed') || 'Η πληρωμή ολοκληρώθηκε!'} (${amount}€)`);
            
            if (context) {
                App.pendingSoftPosCompletion = { id: context, amount: amount };
            }
            window.history.replaceState({}, document.title, window.location.pathname);
        } else if (status === 'cancel') {
            alert(`❌ ${App.t('payment_cancelled') || 'Ακυρώθηκε.'}`);
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
};
window.onload = App.init;

let pinValueUnlock = '';
window.UnlockPIN = {
    add: (n) => { if(pinValueUnlock.length < 4) { pinValueUnlock += n; document.getElementById('unlockPinDisplay').innerText = '*'.repeat(pinValueUnlock.length); } },
    clear: () => { pinValueUnlock = ''; document.getElementById('unlockPinDisplay').innerText = ''; },
    submit: () => {
        if(pinValueUnlock.length < 4) return alert(App.t('pin_4_digits') || "Το PIN πρέπει να είναι 4 ψηφία");
        window.socket.emit('verify-pin', { pin: pinValueUnlock, email: userData.store });
        window.socket.once('pin-verified', (data) => {
            if(data.success) {
                document.getElementById('pinUnlockModal').style.display = 'none';
                document.getElementById('fakeLockOverlay').style.display = 'none';
                if(window.socket) window.socket.emit('set-user-status', 'online');
                UnlockPIN.clear();
            } else {
                alert(App.t('wrong_pin') || "❌ Λάθος PIN!");
                UnlockPIN.clear();
            }
        });
    },
    close: () => { document.getElementById('pinUnlockModal').style.display = 'none'; UnlockPIN.clear(); },
    forgot: () => {
        if (confirm(App.t('forgot_pin_confirm') || "Να σταλεί email επαναφοράς PIN στο κατάστημα;")) {
            if(window.socket) window.socket.emit('forgot-pin', { email: userData.store });
            alert(App.t('email_sent_inform') || "Το email εστάλη! Ενημερώστε τον διαχειριστή.");
        }
    }
};