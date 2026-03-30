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
const messaging = getMessaging(app);

const t = (key) => I18n.t(key) || key;

window.App = {
    t: t, // ✅ Expose for dynamic UI
    activeOrders: [],
    currentQrOrderId: null, // ✅ NEW: Track open QR
    isChatOpen: false, // ✅ NEW: Chat State
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
                window.socket.emit('update-token', { token: token, username: userData.name });
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
        const chatWrapper = document.getElementById('chatWrapper');
        if (chatWrapper) {
            chatWrapper.style.display = hasChat ? 'flex' : 'none';
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

            // 2. Αν ΔΕΝ είναι ανατεθειμένη σε εμένα (είτε είναι σε άλλον, είτε σε κανέναν), την κρύβουμε
            if (assignedDriver !== userData.name) return;

            const isReady = order.status === 'ready';
            const isPaid = cument.createElement('div');
            card.className = 'order-card';
            card.style.cssText = `background:#ffffff; border:2px solid ${isPaid ? '#10B981' : (isReady ? '#F59E0B' : '#e5e7eb')}; border-radius:12px; padding:15px; position:relative; opacity:${isReady ? 1 : 0.7}; box-shadow:0 4px 15px rgba(0,0,0,0.05); color:#1f2937;`;
            
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
                <div style="font-size:20px; color:#2196F3; margin-bottom:5px; font-weight:bold; line-height:1.3;">📍 ${address}</div>
                ${zip ? `<div style="font-size:14px; color:#6b7280; margin-bottom:2px;">📮 ${zip}</div>` : ''}
                ${floor ? `<div style="font-size:16px; color:#1f2937; font-weight:bold; margin-bottom:5px; background:#f3f4f6; border:1px solid #d1d5db; display:inline-block; padding:2px 8px; border-radius:4px;">🏢 ${floor}</div>` : ''}
                <div style="font-size:16px; color:#6b7280; margin-bottom:15px;">📞 <a href="tel:${phone}" style="color:#2196F3; text-decoration:none; font-weight:bold;">${phone}</a></div>
                <div style="background:#f9fafb; border:1px solid #e5e7eb; padding:10px; border-radius:8px; margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
                    <div style="font-weight:bold; color:#1f2937; font-size:14px;">${paymentMethod}</div>
                    <div style="font-size:22px; font-weight:bold; color:${isPaid ? '#10B981' : '#1f2937'};">${total.toFixed(2)}€ ${isPaid ? '✅' : ''}</div>
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
        if (App.isChatOpen) { el.style.display = 'none'; App.isChatOpen = false; } 
        else { el.style.display = 'flex'; App.isChatOpen = true; document.getElementById('chatBadge').style.display = 'none'; }
    },
    sendChat: () => {
        const inp = document.getElementById('adminChatInp');
        if (inp && inp.value.trim()) { window.socket.emit('chat-message', { text: inp.value }); inp.value = ''; }
    },
    appendChat: (data) => {
        if (data.sender !== userData.name && !App.isChatOpen) { 
            const badge = document.getElementById('chatBadge');
            if(badge) badge.style.display = 'block'; 
        }
        const box = document.getElementById('adminChatBox');
        if(box) {
            box.innerHTML += `<div class="chat-msg ${data.sender === userData.name ? 'me' : 'other'}"><b>${data.sender}:</b> ${data.text}</div>`;
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
            window.location.href = intentUrl;
        } else {
            let pkg = "";
            if (s.provider === 'alpha') pkg = "gr.alpha.nexi.softpos";
            else if (s.provider === 'eurobank') pkg = "com.worldline.smartpos";
            else if (s.provider === 'piraeus') pkg = "gr.epay.softpos";
            else { alert("Άγνωστος πάροχος."); return; }

            let playStoreUrl = `https://play.google.com/store/apps/details?id=${pkg}`;
            let intentUrl = `intent://#Intent;package=${pkg};action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;S.browser_fallback_url=${encodeURIComponent(playStoreUrl)};end;`;

            try { navigator.clipboard.writeText(amount.toString()); } catch(e){}
            
            // Δοκιμάζουμε το intent σε iframe για να μην "σκάσει" η σελίδα αν αποτύχει (Silent Fail)
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.src = intentUrl;
            document.body.appendChild(iframe);
            setTimeout(() => iframe.remove(), 2000);

            setTimeout(() => {
                const div = document.createElement('div');
                div.className = 'modal-overlay';
                div.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:99999; display:flex; align-items:center; justify-content:center;";
                div.innerHTML = `
                    <div class="modal-box" style="background:#fff; padding:20px; border-radius:12px; text-align:center; max-width:320px; box-shadow:0 10px 30px rgba(0,0,0,0.5);">
                        <div style="font-size:40px; margin-bottom:10px;">📱</div>
                        <h3 style="color:#10B981; margin:0 0 10px 0;">SoftPOS</h3>
                        <p style="color:#1f2937; font-size:16px; margin-bottom:15px;">Ποσό: <b style="font-size:20px;">${amount}€</b></p>
                        
                        <button onclick="window.location.href='${playStoreUrl}'" style="display:block; width:100%; background:#0095f6; color:white; border:none; padding:15px; border-radius:8px; font-weight:bold; font-size:15px; margin-bottom:20px; box-shadow:0 4px 10px rgba(0,149,246,0.3); cursor:pointer;">👉 ΑΝΟΙΓΜΑ ΕΦΑΡΜΟΓΗΣ POS 👈</button>
                        
                        <span style="font-size:13px; color:#6b7280; display:block; margin-bottom:10px;">Αφού χτυπήσετε την κάρτα, επιστρέψτε εδώ και πατήστε:</span>
                        <button onclick="window.location.href='${returnUrl}'" style="background:#10B981; color:white; border:none; padding:15px; width:100%; border-radius:8px; font-weight:bold; font-size:16px; margin-bottom:10px; cursor:pointer;">✅ ΕΠΙΒΕΒΑΙΩΣΗ ΠΛΗΡΩΜΗΣ</button>
                        <button onclick="this.parentElement.parentElement.remove()" style="background:#f3f4f6; color:#1f2937; border:1px solid #d1d5db; padding:10px; width:100%; border-radius:8px; font-weight:bold; cursor:pointer;">ΑΚΥΡΩΣΗ</button>
                    </div>
                `;
                document.body.appendChild(div);
            }, 500);
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