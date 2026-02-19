import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";
import { firebaseConfig, vapidKey } from './config.js';

if ('serviceWorker' in navigator) {
    // ✅ FIX: Καθαρισμός παλιού Root Service Worker (που μπλόκαρε το Dine-In)
    navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(reg => {
            if (reg.scope === window.location.origin + '/') {
                console.log("🧹 Removing old Root SW to fix Dine-In:", reg.scope);
                reg.unregister();
            }
        });
    });

    // ✅ FIX: Register SW ΜΟΝΟ αν είμαστε σε Shop ή Admin (όχι στο Dine-In)
    const path = window.location.pathname;
    let swScope = null;

    if (path.includes('/shop/')) swScope = '/shop/';
    else if (path.includes('/manage/') || path.includes('premium')) swScope = '/manage/';

    if (swScope) {
        navigator.serviceWorker.register('/sw.js', { scope: swScope })
            .then(reg => console.log("✅ SW Registered with scope:", reg.scope))
            .catch(e => console.log("❌ SW Error:", e));
    } else {
        console.log("ℹ️ Dine-In Mode: Pure Web (No SW)");
    }
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
const isIos = () => {
    const ua = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) || (ua.includes("mac") && "ontouchend" in document);
};
if (isIos() && !window.navigator.standalone) {
        const btnLogin = document.getElementById('btnInstallLogin');
        if(btnLogin) btnLogin.style.display = 'block';
        const btnHeader = document.getElementById('btnInstallHeader');
        if(btnHeader) btnHeader.style.display = 'block';
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const messaging = getMessaging(app);

// URL PARAMS
const params = new URLSearchParams(window.location.search);
let TARGET_STORE = params.get('store');
let TABLE_ID = params.get('table'); // ✅ Get Table ID

// ✅ Check if returning from payment (restore table mode)
if (params.get('payment_status')) {
    const savedMode = localStorage.getItem('bellgo_return_mode');
    if (savedMode === 'dinein') {
        TABLE_ID = localStorage.getItem('bellgo_return_table');
    }
}

// ✅ ΑΥΤΟΝΟΜΙΑ QR: Το URL καθορίζει την κατάσταση
if (TABLE_ID) {
    // 1. Αν το URL έχει τραπέζι, επιβάλλουμε Dine-In
    
    // ✅ FIX: Ανίχνευση νέας σάρωσης (Scan) vs Refresh vs Payment Return
    const isPaymentReturn = params.get('payment_status');
    const isNewSession = !sessionStorage.getItem('bellgo_session_active');

    let currentDetails = JSON.parse(localStorage.getItem('bellgo_customer_info') || 'null');
    
    if (!isPaymentReturn) {
        // Αν είναι νέα καρτέλα (Scan) ή αν άλλαξε το τραπέζι -> Reset Covers
        if (isNewSession || (currentDetails && currentDetails.table !== TABLE_ID)) {
            sessionStorage.setItem('bellgo_session_active', 'true');
            if (currentDetails) {
                console.log("🔄 New Scan or Table Change: Resetting Covers");
                delete currentDetails.covers; // Force ask for covers
                currentDetails.table = TABLE_ID;
                currentDetails.type = 'dinein';
                localStorage.setItem('bellgo_customer_info', JSON.stringify(currentDetails));
            }
        }
    }
} else {
    // 2. Αν το URL ΔΕΝ έχει τραπέζι (και δεν επιστρέφουμε από πληρωμή)
    // Τότε θεωρούμε ότι είναι Delivery/Takeaway QR και ΚΑΘΑΡΙΖΟΥΜΕ το τραπέζι
    let currentDetails = JSON.parse(localStorage.getItem('bellgo_customer_info') || 'null');
    if (!params.get('payment_status') && currentDetails && currentDetails.type === 'dinein') {
        console.log("🔄 Delivery QR Detected: Clearing Table Session");
        currentDetails.type = 'delivery';
        delete currentDetails.table;
        localStorage.setItem('bellgo_customer_info', JSON.stringify(currentDetails));
    }
}

let isDineIn = !!TABLE_ID;
let tableNumber = TABLE_ID;

// Auto-detect store from path
if (!TARGET_STORE) {
    const pathParts = window.location.pathname.split('/');
    let shopIndex = pathParts.indexOf('shop');
    if (shopIndex === -1) shopIndex = pathParts.indexOf('dinein'); // ✅ Support dinein route
    if (shopIndex !== -1 && pathParts[shopIndex + 1]) {
        TARGET_STORE = decodeURIComponent(pathParts[shopIndex + 1]); // ✅ FIX: Αποκωδικοποίηση ονόματος (π.χ. My%20Shop -> My Shop)
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

// (ΑΦΑΙΡΕΘΗΚΕ Η ΑΥΤΟΜΑΤΗ ΕΠΑΝΑΦΟΡΑ ΤΡΑΠΕΖΙΟΥ ΓΙΑ ΝΑ ΛΕΙΤΟΥΡΓΕΙ ΤΟ DELIVERY QR)

let storeHasStripe = false;
const ORDER_TIMEOUT_MS = 30 * 60 * 1000; // ✅ 30 Minutes Timeout
let googleMapsUrl = "";
let hasCheckedStripe = false; // ✅ Flag για να μην ελέγχουμε διπλά

// --- I18N LOGIC (ΠΟΛΥΓΛΩΣΣΙΚΟΤΗΤΑ) ---
let translations = {};

// Function to set the language
async function setLanguage(lang) {
    localStorage.setItem('bellgo_lang', lang);
    
    try {
        const response = await fetch(`/i18n/${lang}.json`);
        translations = await response.json();
        applyTranslations();
        
        // Update active class on switcher
        document.getElementById('lang-el').classList.toggle('active', lang === 'el');
        document.getElementById('lang-en').classList.toggle('active', lang === 'en');
        document.documentElement.lang = lang;

    } catch (error) {
        console.error(`Could not load language file: ${lang}.json`, error);
    }
}

// Function to apply translations to the page
function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (translations[key]) {
            // Check if the element has children, if so, we only want to translate the text node
            if(element.children.length > 0) {
                // Find the text node that is a direct child of the element
                for (let i = 0; i < element.childNodes.length; i++) {
                    if (element.childNodes[i].nodeType === 3) { // Node.TEXT_NODE
                        element.childNodes[i].nodeValue = translations[key];
                        break;
                    }
                }
            } else if (element.tagName === 'INPUT' && element.type === 'button' || element.type === 'submit') {
                // ✅ FIX: Support for Input Buttons (value attribute)
                element.value = translations[key];
            } else {
                element.innerText = translations[key];
            }
        }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
        const key = element.getAttribute('data-i18n-placeholder');
        if (translations[key]) {
            element.placeholder = translations[key];
        }
    });
}

// ✅ FIX: Return undefined if missing, so || fallback works
const t = (key) => translations[key];


window.App = {
    setLanguage, // Make it accessible from HTML
    existingOrderId: null, // ✅ Αποθήκευση ID για συμπλήρωση

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

    openReview: () => {
        if (googleMapsUrl) window.open(googleMapsUrl, '_blank');
    },

    loginGoogle: () => { signInWithPopup(auth, provider).catch(e => alert("Login Error: " + e.message)); },
    logout: () => { signOut(auth).then(() => location.reload()); },

    checkDetails: () => {
        document.getElementById('loginScreen').style.display = 'none';
        
        // ✅ AUTO-SWITCH FIX: Αν το Mode δεν ταιριάζει με τα αποθηκευμένα, καθαρισμός!
        if (customerDetails) {
            if (isDineIn && customerDetails.type !== 'dinein') {
                customerDetails = null; // Ήταν Delivery, τώρα είναι Τραπέζι -> Reset
            } else if (!isDineIn && customerDetails.type === 'dinein') {
                customerDetails = null; // Ήταν Τραπέζι, τώρα είναι Delivery -> Reset
            }
        }

        // ✅ 1. ΡΥΘΜΙΣΗ UI: Εμφάνιση σωστών πεδίων ανάλογα με το Mode
        if (isDineIn) {
            document.getElementById('detailsTitle').innerText = t('welcome') || 'Καλώς ήρθατε!';
            document.getElementById('deliveryFields').style.display = 'none';
            document.getElementById('dineInFields').style.display = 'block';
            document.getElementById('tableDisplay').innerText = `${t('table')}: ${tableNumber}`;
        } else {
            document.getElementById('detailsTitle').innerText = t('delivery_title') || 'Παράδοση στο χώρο σας';
            document.getElementById('deliveryFields').style.display = 'block';
            document.getElementById('dineInFields').style.display = 'none';
            
            // ✅ NEW: Ερώτηση για Παραγγελία ή Κράτηση (Μόνο στο Delivery)
            if (!sessionStorage.getItem('bellgo_choice_made')) {
                document.getElementById('choiceModal').style.display = 'flex';
                return; // Σταματάμε εδώ μέχρι να επιλέξει
            }
        }

        // ✅ 2. ΕΛΕΓΧΟΣ ΔΕΔΟΜΕΝΩΝ: Αν αλλάξαμε Mode, ανοίγουμε τη φόρμα
        let shouldOpenForm = false;

        if (!customerDetails) {
            // ✅ FIX: Αν είναι DineIn, δεν ανοίγουμε φόρμα αμέσως.
            // Δημιουργούμε προσωρινό session και αφήνουμε το socket να αποφασίσει (Active/Inactive).
            if (isDineIn) {
                const defaultName = (currentUser && currentUser.displayName) ? currentUser.displayName : "Πελάτης";
                customerDetails = { name: defaultName, table: tableNumber, type: 'dinein' };
                localStorage.setItem('bellgo_customer_info', JSON.stringify(customerDetails));
                shouldOpenForm = false;
            } else {
                shouldOpenForm = true;
            }
        } else {
            if (isDineIn) {
                // ✅ FIX: Δεν ζητάμε covers εδώ. Θα το ζητήσουμε ΜΟΝΟ αν το τραπέζι είναι ανενεργό (μέσω socket)
                if (customerDetails.table != tableNumber) {
                    customerDetails.table = tableNumber;
                    localStorage.setItem('bellgo_customer_info', JSON.stringify(customerDetails));
                }
            }
        }

        if (shouldOpenForm) {
            document.getElementById('detailsOverlay').style.display = 'flex';
            // Προ-συμπλήρωση ονόματος αν υπάρχει
            if (currentUser && currentUser.displayName && !document.getElementById('inpName').value) {
                document.getElementById('inpName').value = currentUser.displayName;
            }
        } else {
             App.startApp();
        }
    },

    saveDetails: () => {
        if (isDineIn) {
            const covers = document.getElementById('inpCovers').value;
            // ✅ FIX: Επιτρέπουμε κενά covers αν υπάρχει ήδη ενεργή παραγγελία (για να μην κολλάει στο Edit)
            if (!covers && !App.existingOrderId) return alert(t('enter_covers_error') || "Παρακαλώ εισάγετε αριθμό ατόμων!");
            // ✅ FIX: Allow name input if available, otherwise default
            let name = document.getElementById('inpName').value.trim();
            if (!name) name = (currentUser && currentUser.displayName) ? currentUser.displayName : t('customer_default') || "Πελάτης";
            customerDetails = { name, covers, table: tableNumber, type: 'dinein' };
        } else {
            const name = document.getElementById('inpName').value.trim();
            const address = document.getElementById('inpAddress').value.trim();
            const floor = document.getElementById('inpFloor').value.trim();
            const phone = document.getElementById('inpPhone').value.trim();
            const zip = document.getElementById('inpZip').value.trim();
            if (!name || !address || !phone) return alert(t('enter_details_error') || "Συμπληρώστε τα βασικά στοιχεία!");
            customerDetails = { name, address, floor, phone, zip, type: 'delivery' };
        }

        localStorage.setItem('bellgo_customer_info', JSON.stringify(customerDetails));
        document.getElementById('detailsOverlay').style.display = 'none';
        App.startApp();
    },
    
    // ✅ NEW: Διαχείριση Αρχικής Επιλογής
    chooseAction: (action) => {
        sessionStorage.setItem('bellgo_choice_made', action);
        document.getElementById('choiceModal').style.display = 'none';
        
        if (action === 'order') {
            App.checkDetails(); // Συνεχίζει κανονικά για παραγγελία
        } else if (action === 'book') {
            // Αν δεν υπάρχουν στοιχεία, φτιάχνουμε προσωρινά για να συνδεθεί το socket
            if (!customerDetails) {
                const defaultName = (currentUser && currentUser.displayName) ? currentUser.displayName : "Επισκέπτης";
                customerDetails = { name: defaultName, type: 'delivery' };
            }
            App.startApp(); // Εκκίνηση εφαρμογής (Socket connection)
            setTimeout(App.openBookingModal, 100); // Άνοιγμα Κράτησης
        }
    },

    editDetails: () => {
        document.getElementById('appContent').style.display = 'none'; 
        document.getElementById('detailsOverlay').style.display = 'flex';
        document.getElementById('inpName').value = customerDetails.name;
        document.getElementById('inpAddress').value = customerDetails.address;
        document.getElementById('inpFloor').value = customerDetails.floor;
        document.getElementById('inpPhone').value = customerDetails.phone;
        document.getElementById('inpZip').value = customerDetails.zip || '';
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
        
        // ✅ Εμφάνιση σωστής επικεφαλίδας (Τραπέζι ή Διεύθυνση)
        if (isDineIn) {
             document.getElementById('displayAddress').innerText = `🍽️ ${t('table')} ${tableNumber} (${customerDetails.covers} ${t('pax')})`;
        } else {
             document.getElementById('displayAddress').innerText = `📍 ${customerDetails.address}, ${customerDetails.floor}`;
        }

        App.checkActiveOrderStorage();
        setInterval(App.checkActiveOrderStorage, 60000); // ✅ Check every minute to auto-hide old orders
        App.handleInput(); // ✅ Προσθήκη: Ενημέρωση καλαθιού/badge κατά την εκκίνηση

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
        // App.requestNotifyPermission(); // ΑΦΑΙΡΕΣΗ ΑΥΤΟΜΑΤΗΣ ΚΛΗΣΗΣ (Μπλοκάρεται)
        App.checkNotificationPermission(); // ✅ ΝΕΑ ΚΛΗΣΗ ΜΕ UI
    },

    // ✅✅✅ NEW: REQUEST PERMISSION & GET TOKEN ✅✅✅
    requestNotifyPermission: async () => {
        try {
            // ✅ FIX: Αποφυγή "Unwanted Notifications" - Ζητάμε άδεια ΜΟΝΟ αν είναι 'default'
            if (Notification.permission === 'default') {
                await Notification.requestPermission();
                const result = await Notification.requestPermission();
                if (result !== 'granted') {
                    alert(t('notifications_blocked_msg') || '⚠️ Ο Browser μπλόκαρε τις ειδοποιήσεις.\n\nΠατήστε το εικονίδιο 🔒 ή 🔔 στη γραμμή διευθύνσεων (πάνω αριστερά) και επιλέξτε "Allow/Επιτρέπεται".');
                    return;
                }
            }
            
            if (Notification.permission === "granted") {
                const registration = await navigator.serviceWorker.ready;
                // 👇 ΕΔΩ ΒΑΖΕΙΣ ΤΟ VAPID KEY ΣΟΥ 👇
                const token = await getToken(messaging, { 
                    vapidKey: vapidKey, 
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

    // ✅ NEW: ΕΛΕΓΧΟΣ ΑΔΕΙΑΣ & UI
    checkNotificationPermission: () => {
        if (Notification.permission === 'default') {
            const div = document.createElement('div');
            div.id = 'notifPermRequest';
            div.style.cssText = "position:fixed; bottom:0; left:0; width:100%; background:#222; border-top:2px solid #FFD700; padding:20px; z-index:10000; text-align:center; box-shadow:0 -5px 20px rgba(0,0,0,0.5);";
            div.innerHTML = `
                <div style="color:white; font-weight:bold; margin-bottom:10px; font-size:16px;">🔔 ${t('enable_notifications_title') || 'Ενεργοποίηση Ειδοποιήσεων'}</div>
                <div style="color:#ccc; font-size:12px; margin-bottom:15px;">${t('enable_notifications_desc') || 'Για να ενημερωθείτε όταν έρθει η παραγγελία σας!'}</div>
                <button id="btnAllowNotif" style="background:#00E676; color:black; border:none; padding:10px 25px; border-radius:20px; font-weight:bold; font-size:14px; cursor:pointer;">${t('enable_btn') || 'ΕΝΕΡΓΟΠΟΙΗΣΗ'}</button>
                <button onclick="document.getElementById('notifPermRequest').remove()" style="background:none; border:none; color:#777; margin-left:10px; cursor:pointer;">${t('not_now') || 'Όχι τώρα'}</button>
            `;
            document.body.appendChild(div);
            
            document.getElementById('btnAllowNotif').onclick = async () => {
                await App.requestNotifyPermission();
                document.getElementById('notifPermRequest').remove();
            };
        } else if (Notification.permission === 'granted') {
            App.requestNotifyPermission(); // Αν έχει ήδη άδεια, απλά ανανεώνουμε το token
        }
    },

    checkActiveOrderStorage: () => {
        if (!Array.isArray(activeOrders)) activeOrders = [];
        const now = Date.now();
        const TWELVE_HOURS = 12 * 60 * 60 * 1000;
        
        // Filter out 'ready' orders older than 1 hour AND any order older than 12 hours
        activeOrders = activeOrders.filter(o => {
            if ((now - o.timestamp) > TWELVE_HOURS) return false; // Safety cleanup
            if (o.status === 'ready' || o.status === 'completed') { // ✅ Handle completed/closed orders
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
        const dataParam = urlP.get('data'); // ✅ ΝΕΟ: Ανάκτηση δεδομένων από το URL (για iOS PWA fix)

        if (status === 'success') {
            let itemsToSend = null;
            
            // 1. Πρώτα ελέγχουμε το URL (Ασφαλές για PWA -> Browser redirect)
            if (dataParam) {
                itemsToSend = decodeURIComponent(dataParam);
            } 
            // 2. Αν δεν υπάρχει στο URL, ελέγχουμε το LocalStorage (Fallback)
            else {
                const saved = localStorage.getItem('bellgo_temp_card_order');
                if (saved) itemsToSend = JSON.parse(saved).items;
            }

            if (itemsToSend) {
                // ✅ SEND ORDER ONLY IF SOCKET IS CONNECTED
                App.sendOrder(itemsToSend, '💳 ΚΑΡΤΑ [ΠΛΗΡΩΘΗΚΕ ✅]');
                localStorage.removeItem('bellgo_temp_card_order');
                
                alert(t('payment_success_msg') || "Η πληρωμή ολοκληρώθηκε και η παραγγελία εστάλη!\nΜπορείτε να επιστρέψετε στην εφαρμογή.");
                
                // Clear URL
                const newParams = new URLSearchParams(window.location.search);
                newParams.delete('payment_status');
                newParams.delete('data');
                const newSearch = newParams.toString();
                const cleanUrl = window.location.pathname + (newSearch ? '?' + newSearch : '');
                window.history.replaceState({}, document.title, cleanUrl);
            }
        } else if (status === 'cancel') {
            alert(t('payment_cancelled_msg') || "Η πληρωμή ακυρώθηκε.");
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

            // ✅ NEW: Έλεγχος αν το τραπέζι είναι ήδη ανοιχτό
            if (isDineIn) {
                socket.emit('check-table-status', { table: tableNumber });
            }
            
            // ✅ NEW: Έλεγχος για ενεργές κρατήσεις (για το Badge)
            const myResIds = JSON.parse(localStorage.getItem('bellgo_my_reservations') || '[]');
            if (myResIds.length > 0) {
                socket.emit('get-customer-reservations', myResIds);
            }
            
            // Αφαιρέθηκε το setTimeout. Ο έλεγχος γίνεται πλέον στο 'menu-update'
        });

        socket.on('menu-update', (data) => { 
            App.renderMenu(data); 
            
            // ✅ FIX: Ελέγχουμε για πληρωμή ΜΟΝΟ αφού έχουμε συνδεθεί επιτυχώς (πήραμε μενού)
            if (!hasCheckedStripe) {
                hasCheckedStripe = true;
                App.checkStripeReturn();
            }
        });

        // ✅ NEW: Απάντηση για το αν υπάρχει ενεργό τραπέζι
        socket.on('table-status', (data) => {
            if (data.active) {
                // ✅ AUTOMATICALLY LINK TO EXISTING ORDER (DEFAULT)
                App.existingOrderId = data.orderId;
                App.showTableOptionsModal(data);
            } else {
                // ✅ FIX: Αν το τραπέζι είναι ΝΕΟ (ανενεργό) και δεν έχουμε δηλώσει άτομα -> Ζητάμε τώρα
                if (!customerDetails.covers) {
                    App.editDetails();
                }
            }
        });

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

                // ✅ Ενημέρωση Ωραρίου Διανομής (Header)
                if (settings.hours) {
                    const el = document.getElementById('todayHours');
                    if(el) el.innerText = settings.hours;
                }
                
                storeHasStripe = !!settings.stripeConnectId;
                
                // ✅ Google Maps Review Button Logic
                if (settings.googleMapsUrl) {
                    googleMapsUrl = settings.googleMapsUrl;
                    const btn = document.getElementById('btnReview');
                    if(btn) btn.style.display = 'block';
                } else {
                    const btn = document.getElementById('btnReview');
                    if(btn) btn.style.display = 'none';
                }
                
                // ✅ NEW: Show/Hide Reservation Buttons
                const btnBook = document.getElementById('btnBookTable');
                if(btnBook) btnBook.style.display = settings.reservationsEnabled ? 'inline-block' : 'none';

                const btnMyRes = document.getElementById('btnMyRes');
                if(btnMyRes) btnMyRes.style.display = settings.reservationsEnabled ? 'inline-block' : 'none';
                
                const btnHeaderMyRes = document.getElementById('btnHeaderMyRes');
                if(btnHeaderMyRes) btnHeaderMyRes.style.display = settings.reservationsEnabled ? 'inline-flex' : 'none';

                App.handleInput();
                
                const closedOverlay = document.getElementById('closedOverlay');
                const btnSend = document.getElementById('btnSendOrder');
                
                if (settings.statusCustomer === false) {
                    closedOverlay.style.display = 'flex';
                    if(btnSend) { 
                        btnSend.disabled = true; 
                        btnSend.innerText = t('store_closed') || 'Το κατάστημα είναι κλειστό'; 
                    }
                } else {
                    closedOverlay.style.display = 'none';
                    if(btnSend) { 
                        btnSend.disabled = false; 
                        btnSend.innerText = t('send_order') || 'ΑΠΟΣΤΟΛΗ ΠΑΡΑΓΓΕΛΙΑΣ'; 
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
                } else {
                    // ✅ NEW: Αν η παραγγελία κλείσει (διαγραφεί) από το κατάστημα (π.χ. Τραπέζι)
                    if (localOrder.status !== 'completed' && localOrder.status !== 'ready') {
                        localOrder.status = 'completed';
                        localOrder.readyTime = Date.now(); // Start 30min timer
                        changed = true;
                    }
                }
            });

            // ✅ FIX: Συγχρονισμός παραγγελιών από Server (για PWA/Browser Isolation)
            myServerOrders.forEach(serverOrder => {
                const exists = activeOrders.find(lo => lo.id === serverOrder.id);
                if (!exists) {
                    activeOrders.push({
                        id: serverOrder.id,
                        status: serverOrder.status,
                        timestamp: serverOrder.id,
                        text: serverOrder.text,
                        readyTime: serverOrder.readyTime
                    });
                    changed = true;
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
        
        // ✅ NEW: Reservation Result
        socket.on('reservation-result', (res) => {
            if(res.success) { 
                // ✅ Show Waiting State
                const btn = document.querySelector('#bookingModal button.btn-save-details');
                if(btn) {
                    btn.innerText = "⏳ ΑΝΑΜΟΝΗ ΕΠΙΒΕΒΑΙΩΣΗΣ...";
                    btn.disabled = true;
                    btn.style.background = "#555";
                }
                App.pendingReservationId = res.reservationId;
                
                // ✅ NEW: Save ID to LocalStorage
                let myRes = JSON.parse(localStorage.getItem('bellgo_my_reservations') || '[]');
                if(!myRes.includes(res.reservationId)) myRes.push(res.reservationId);
                localStorage.setItem('bellgo_my_reservations', JSON.stringify(myRes));
                
                // ✅ NEW: Ανανέωση Badge άμεσα
                window.socket.emit('get-customer-reservations', myRes);
            }
            else { alert("Σφάλμα: " + res.error); }
        });

        // ✅ NEW: Reservation Confirmed
        socket.on('reservation-confirmed', (data) => {
            if (App.pendingReservationId && data.id === App.pendingReservationId) {
                alert("✅ Η κράτηση σας ΕΓΙΝΕ ΔΕΚΤΗ!");
                document.getElementById('bookingModal').style.display='none';
                App.pendingReservationId = null;
                // Reset Button
                const btn = document.querySelector('#bookingModal button.btn-save-details');
                if(btn) { btn.innerText = "ΚΡΑΤΗΣΗ"; btn.disabled = false; btn.style.background = "#9C27B0"; }
            }
        });

        // ✅ NEW: Receive My Reservations Data
        socket.on('my-reservations-data', (list) => {
            App.renderMyReservations(list);
        });

        // ✅ NEW: Cancel Success
        socket.on('reservation-cancelled-success', (id) => {
            alert("Η κράτηση ακυρώθηκε.");
            // Remove from local storage
            let myRes = JSON.parse(localStorage.getItem('bellgo_my_reservations') || '[]');
            myRes = myRes.filter(rid => rid !== id);
            localStorage.setItem('bellgo_my_reservations', JSON.stringify(myRes));
            App.openMyReservations(); // Refresh list
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

        if (!menu || menu.length === 0) { container.innerHTML = `<div style="text-align:center; color:#555; margin-top:50px;">${t('menu_empty') || 'Ο κατάλογος είναι κενός.'}</div>`; return; }

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
                        // ✅ FIX iOS: touch-action: manipulation disables zoom delay
                        box.style.touchAction = 'manipulation';
                        box.style.cursor = 'pointer'; // ✅ Fix for iOS click registration
                        box.innerHTML = `<span class="item-name">${name}</span>${price > 0 ? `<span class="item-price">${price}€</span>` : ''}`;
                        
                        // ✅ CUSTOM DOUBLE TAP: Λειτουργεί παντού (και iPhone) και προστατεύει από τυχαία κλικ
                        let lastTap = 0;
                        box.addEventListener('click', (e) => { 
                            e.preventDefault(); 
                            
                            // ✅ FIX: Στα iPhone το Double Tap δυσκολεύει, οπότε το κάνουμε Single Tap
                            if (isIos()) {
                                const val = (typeof item === 'object') ? `${item.name}:${item.price}` : item.trim();
                                App.addToOrder(val);
                                box.style.opacity = '0.5';
                                setTimeout(() => box.style.opacity = '1', 100);
                                return;
                            }

                            const currentTime = new Date().getTime();
                            const tapLength = currentTime - lastTap;
                            if (tapLength < 500 && tapLength > 0) { 
                                const val = (typeof item === 'object') ? `${item.name}:${item.price}` : item.trim();
                                App.addToOrder(val); 
                                lastTap = 0;
                                // ✅ Visual Feedback
                                box.style.opacity = '0.5';
                                setTimeout(() => box.style.opacity = '1', 100);
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

    // ✅ NEW: Modal Επιλογών Τραπεζιού (Συμπλήρωση / Νέα / Πληρωμή)
    showTableOptionsModal: (data) => {
        // Υπολογισμός συνόλου υπάρχουσας παραγγελίας
        let total = 0;
        const lines = data.text.split('\n');
        lines.forEach(line => {
            const parts = line.split(':');
            const price = parseFloat(parts[parts.length-1]);
            const qtyMatch = line.match(/^(\d+)\s+/);
            const qty = qtyMatch ? parseInt(qtyMatch[1]) : 1;
            if(!isNaN(price)) total += price * qty;
        });

        const modal = document.createElement('div');
        modal.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); z-index:10000; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px;";
        
        // --- STEP 1: EXISTING OR NEW ---
        const step1Html = `
            <div id="step1" style="background:#222; padding:25px; border-radius:15px; width:100%; max-width:350px; text-align:center; border:1px solid #444;">
                <h2 style="color:#FFD700; margin-top:0;">🍽️ ${t('table') || 'Τραπέζι'} ${tableNumber}</h2>
                <p style="color:#ccc;">${t('table_active') || 'Το τραπέζι είναι ενεργό.'}<br>${t('total') || 'Σύνολο'}: <b>${total.toFixed(2)}€</b></p>
                <button id="btnExisting" style="width:100%; padding:15px; margin-bottom:10px; background:#2196F3; color:white; border:none; border-radius:8px; font-size:16px; font-weight:bold;">📂 ${t('btn_existing_order') || 'ΥΠΑΡΧΟΥΣΑ ΠΑΡΑΓΓΕΛΙΑ'}</button>
                <button id="btnNewOrder" style="width:100%; padding:15px; background:#555; color:white; border:none; border-radius:8px; font-size:14px;">🆕 ${t('btn_new_order_reset') || 'ΝΕΑ ΠΑΡΑΓΓΕΛΙΑ (Reset)'}</button>
            </div>
        `;

        // --- STEP 2: PAY OR SUPPLEMENT ---
        const step2Html = `
            <div id="step2" style="display:none; background:#222; padding:25px; border-radius:15px; width:100%; max-width:350px; text-align:center; border:1px solid #444;">
                <h3 style="color:#2196F3;">${t('options') || 'Επιλογές'}</h3>
                <button id="btnSupplement" style="width:100%; padding:15px; margin-bottom:10px; background:#FFD700; color:black; border:none; border-radius:8px; font-size:16px; font-weight:bold;">➕ ${t('btn_supplement') || 'ΣΥΜΠΛΗΡΩΣΗ'}</button>
                <button id="btnPayExisting" style="width:100%; padding:15px; margin-bottom:10px; background:#00E676; color:black; border:none; border-radius:8px; font-size:16px; font-weight:bold;">💳 / 💶 ${t('btn_pay_full') || 'ΠΛΗΡΩΜΗ'}</button>
                <button id="btnBack1" style="background:none; border:none; color:#aaa; margin-top:10px;">🔙 ${t('back') || 'ΠΙΣΩ'}</button>
            </div>
        `;

        // --- STEP 3: NEW PEOPLE ---
        const step3Html = `
            <div id="step3" style="display:none; background:#222; padding:25px; border-radius:15px; width:100%; max-width:350px; text-align:center; border:1px solid #444;">
                <h3 style="color:#FFD700;">${t('new_people_question') || 'Ήρθαν νέα άτομα;'}</h3>
                <p style="color:#ccc; font-size:12px;">${t('new_people_hint') || 'Αν ναι, συμπληρώστε τον αριθμό.'}</p>
                <input type="number" id="inpNewPeople" placeholder="${t('placeholder_people') || 'Αρ. ατόμων (προαιρετικό)'}" style="width:100%; padding:12px; margin-bottom:15px; border-radius:8px; border:1px solid #555; background:#333; color:white; text-align:center; font-size:16px;">
                <button id="btnGoToMenu" style="width:100%; padding:15px; background:#2196F3; color:white; border:none; border-radius:8px; font-size:16px; font-weight:bold;">${t('btn_continue_menu') || 'ΣΥΝΕΧΕΙΑ ΣΤΟ MENU ▶'}</button>
                <button id="btnBack2" style="background:none; border:none; color:#aaa; margin-top:10px;">🔙 ${t('back') || 'ΠΙΣΩ'}</button>
            </div>
        `;

        // --- STEP 4: PAYMENT METHOD ---
        const step4Html = `
            <div id="step4" style="display:none; background:#222; padding:25px; border-radius:15px; width:100%; max-width:350px; text-align:center; border:1px solid #444;">
                <h3 style="color:#00E676;">${t('payment_method') || 'Τρόπος Πληρωμής'}</h3>
                <button id="btnCallWaiter" style="width:100%; padding:15px; margin-bottom:10px; background:#FF9800; color:black; border:none; border-radius:8px; font-size:16px; font-weight:bold;">🛎️ ${t('btn_call_waiter') || 'ΚΛΗΣΗ ΣΕΡΒΙΤΟΡΟΥ'}</button>
                <button id="btnPayStripe" style="width:100%; padding:15px; margin-bottom:10px; background:#635BFF; color:white; border:none; border-radius:8px; font-size:16px; font-weight:bold;">💳 ${t('btn_pay_stripe') || 'ONLINE (Stripe)'}</button>
                <button id="btnBack3" style="background:none; border:none; color:#aaa; margin-top:10px;">🔙 ${t('back') || 'ΠΙΣΩ'}</button>
            </div>
        `;

        modal.innerHTML = step1Html + step2Html + step3Html + step4Html;
        document.body.appendChild(modal);

        // --- HANDLERS ---
        const s1 = document.getElementById('step1');
        const s2 = document.getElementById('step2');
        const s3 = document.getElementById('step3');
        const s4 = document.getElementById('step4');

        // Step 1 Logic
        document.getElementById('btnExisting').onclick = () => {
            s1.style.display = 'none';
            s2.style.display = 'block';
            App.existingOrderId = data.orderId;
        };
        document.getElementById('btnNewOrder').onclick = () => {
            App.existingOrderId = null;
            modal.remove();
        };

        // Step 2 Logic
        document.getElementById('btnSupplement').onclick = () => {
            s2.style.display = 'none';
            s3.style.display = 'block';
        };
        document.getElementById('btnPayExisting').onclick = () => {
            s2.style.display = 'none';
            s4.style.display = 'block';
        };
        document.getElementById('btnBack1').onclick = () => {
            s2.style.display = 'none';
            s1.style.display = 'block';
        };

        // Step 3 Logic
        document.getElementById('btnGoToMenu').onclick = () => {
            const extra = document.getElementById('inpNewPeople').value;
            if(extra && parseInt(extra) > 0) {
                App.addToOrder(`(+ ${extra} ${t('people') || 'ΑΤΟΜΑ'})`);
            }
            modal.remove();
        };
        document.getElementById('btnBack2').onclick = () => {
            s3.style.display = 'none';
            s2.style.display = 'block';
        };

        // Step 4 Logic
        document.getElementById('btnCallWaiter').onclick = () => {
            if (App.existingOrderId) {
                window.socket.emit('add-items', { id: App.existingOrderId, items: "❗ ΖΗΤΑΕΙ ΛΟΓΑΡΙΑΣΜΟ (ΚΛΗΣΗ)" });
                alert(t('waiter_notified') || "Ειδοποιήσαμε τον σερβιτόρο!");
                modal.remove();
            }
        };
        document.getElementById('btnPayStripe').onclick = () => {
            if(!storeHasStripe) return alert(t('card_unavailable') || "Η πληρωμή με κάρτα δεν είναι διαθέσιμη.");
            App.payExistingOrder(data.orderId, total);
            modal.remove();
        };
        document.getElementById('btnBack3').onclick = () => {
            s4.style.display = 'none';
            s2.style.display = 'block';
        };
    },

    payExistingOrder: async (orderId, amount) => {
        const isNative = !!window.Capacitor || /Android.*wv/.test(window.navigator.userAgent); // ✅ Detect Native
        try {
            const res = await fetch('/create-qr-payment', { // Χρησιμοποιούμε το QR endpoint που δέχεται orderId
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ amount: amount, storeName: TARGET_STORE, orderId: orderId })
            });
            const data = await res.json();
            if(data.url) window.location.href = data.url;
            else alert((t('error') || "Σφάλμα: ") + (data.error || "Άγνωστο"));
        } catch(e) { alert(t('connection_error') || "Σφάλμα σύνδεσης."); }
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
        let totalItems = 0;
        if (text.length === 0) validForCard = false;

        for (const line of lines) {
            if (!line.trim()) continue;
            let qty = 1; let rest = line;
            const qtyMatch = line.match(/^(\d+)\s+(.*)/);
            if(qtyMatch) { qty = parseInt(qtyMatch[1]); rest = qtyMatch[2]; }
            
            totalItems += qty;

            if(rest.includes(':')) {
                const parts = rest.split(':');
                const priceVal = parseFloat(parts[parts.length-1]);
                if(!isNaN(priceVal)) { total += qty * priceVal; } 
                else { validForCard = false; }
            } else { validForCard = false; }
        }
        
        // ✅ ΕΛΕΓΧΟΣ BADGE (ΣΗΜΑΤΑΚΙ)
        const badge = document.getElementById('cartBadge');
        if (badge) {
            if (totalItems > 0) {
                badge.style.display = 'inline-block';
                badge.innerText = totalItems;
            } else {
                badge.style.display = 'none';
            }
        }

        document.getElementById('liveTotal').innerText = `${t('total')}: ${total.toFixed(2)}€`;
        const btnCard = document.getElementById('payCard');
        if (validForCard && total > 0 && storeHasStripe) {
            btnCard.disabled = false;
            btnCard.innerHTML = t('card') || '💳 ΚΑΡΤΑ';
        } else {
            btnCard.disabled = true;
            if (!storeHasStripe) {
                btnCard.innerHTML = t('card_inactive') || '💳 ΚΑΡΤΑ (ΕΛΑΧΙΣΤΗ)';
            } else {
                btnCard.innerHTML = t('card_unavailable') || '💳 ΜΗ ΔΙΑΘΕΣΙΜΗ';
            }
        }
        return total;
    },
    
    // ✅ NEW: BOOKING LOGIC
    openBookingModal: () => {
        document.getElementById('bookingModal').style.display = 'flex';
        // Pre-fill name/phone if available
        if(customerDetails) {
            if(customerDetails.name) document.getElementById('inpBookName').value = customerDetails.name;
            if(customerDetails.phone) document.getElementById('inpBookPhone').value = customerDetails.phone;
        }
    },
    
    submitReservation: () => {
        const date = document.getElementById('inpBookDate').value;
        const time = document.getElementById('inpBookTime').value;
        const pax = document.getElementById('inpBookPax').value;
        const name = document.getElementById('inpBookName').value;
        const phone = document.getElementById('inpBookPhone').value;
        const token = localStorage.getItem('fcm_token'); // ✅ Send Token
        
        if(!date || !time || !pax || !name || !phone) return alert("Συμπληρώστε όλα τα πεδία!");
        
        window.socket.emit('create-reservation', { date, time, pax, name, phone, customerToken: token });
    },

    // ✅ NEW: MY RESERVATIONS LOGIC
    openMyReservations: () => {
        // Αν δεν είναι συνδεδεμένο, κάνε connect (για την περίπτωση που πατάει από το αρχικό modal)
        if (!window.socket || !window.socket.connected) {
             if (!customerDetails) {
                const defaultName = (currentUser && currentUser.displayName) ? currentUser.displayName : "Επισκέπτης";
                customerDetails = { name: defaultName, type: 'delivery' };
            }
            App.startApp();
        }

        const myResIds = JSON.parse(localStorage.getItem('bellgo_my_reservations') || '[]');
        if (myResIds.length === 0) {
            alert("Δεν βρέθηκαν κρατήσεις σε αυτή τη συσκευή.");
            return;
        }
        
        // ✅ FIX: Κρύβουμε το αρχικό παράθυρο επιλογής για να φανεί η λίστα
        document.getElementById('choiceModal').style.display = 'none';
        
        document.getElementById('myReservationsModal').style.display = 'flex';
        document.getElementById('myReservationsList').innerHTML = '<p style="text-align:center; color:#aaa;">Φόρτωση...</p>';
        
        window.socket.emit('get-customer-reservations', myResIds);
    },

    closeMyReservations: () => {
        document.getElementById('myReservationsModal').style.display = 'none';
        // Αν δεν έχει επιλέξει ακόμα ενέργεια (είναι στην αρχική οθόνη), επαναφορά του Choice Modal
        if (!sessionStorage.getItem('bellgo_choice_made')) {
            document.getElementById('choiceModal').style.display = 'flex';
        }
    },

    renderMyReservations: (list) => {
        const container = document.getElementById('myReservationsList');
        container.innerHTML = '';
        
        // ✅ NEW: Φιλτράρισμα ολοκληρωμένων κρατήσεων (να μην φαίνονται)
        const activeList = list.filter(r => r.status !== 'completed');

        // ✅ NEW: Ενημέρωση Badge (Αριθμός Κρατήσεων)
        const count = activeList.length;
        const b1 = document.getElementById('resBadgeHeader');
        const b2 = document.getElementById('resBadge');
        if(b1) { b1.innerText = count; b1.style.display = count > 0 ? 'inline-block' : 'none'; }
        if(b2) { b2.innerText = count; b2.style.display = count > 0 ? 'inline-block' : 'none'; }

        if (activeList.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#aaa;">Δεν υπάρχουν ενεργές κρατήσεις.</p>';
            return;
        }

        activeList.sort((a,b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`));

        activeList.forEach(r => {
            const div = document.createElement('div');
            div.style.cssText = "background:#222; padding:10px; border-radius:8px; margin-bottom:10px; border:1px solid #444;";
            
            let statusColor = '#FF9800'; // Pending
            let statusText = 'ΑΝΑΜΟΝΗ';
            if (r.status === 'confirmed') { statusColor = '#00E676'; statusText = 'ΕΠΙΒΕΒΑΙΩΜΕΝΗ'; }

            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                    <span style="font-weight:bold; color:white;">${r.date} - ${r.time}</span>
                    <span style="font-size:10px; padding:2px 5px; border-radius:4px; background:${statusColor}; color:black; font-weight:bold;">${statusText}</span>
                </div>
                <div style="color:#ccc; font-size:14px;">${r.pax} Άτομα • ${r.name}</div>
                <button onclick="App.cancelMyReservation(${r.id})" style="width:100%; margin-top:10px; background:#D32F2F; color:white; border:none; padding:8px; border-radius:5px; cursor:pointer;">ΑΚΥΡΩΣΗ</button>
            `;
            container.appendChild(div);
        });
    },

    cancelMyReservation: (id) => {
        if(confirm("Είστε σίγουροι ότι θέλετε να ακυρώσετε την κράτηση;")) {
            window.socket.emit('cancel-reservation-customer', id);
        }
    },

    requestPayment: () => {
        const items = document.getElementById('orderText').value.trim();
        if (!items) return alert(t('empty_cart') || 'Το καλάθι είναι άδειο!');
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
        if(totalAmount <= 0) return alert(t('amount_error') || "Σφάλμα ποσού.");
        
        // ✅ FIX: Αποθήκευση κατάστασης (Τραπέζι/Delivery) πριν την πληρωμή
        if (isDineIn) {
            localStorage.setItem('bellgo_return_mode', 'dinein');
            localStorage.setItem('bellgo_return_table', tableNumber);
        } else {
            localStorage.setItem('bellgo_return_mode', 'delivery');
        }

        localStorage.setItem('bellgo_temp_card_order', JSON.stringify({ items: items, amount: totalAmount }));
        const isNative = !!window.Capacitor || /Android.*wv/.test(window.navigator.userAgent); // ✅ Detect Native
        try {
            const res = await fetch('/create-order-payment', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ amount: totalAmount, storeName: TARGET_STORE })
            });
            const data = await res.json();
            if(data.url) { window.location.href = data.url; } 
            else { alert((t('payment_error') || "Σφάλμα πληρωμής: ") + (data.error || "Άγνωστο")); }
        } catch(e) { alert(t('server_connection_error') || "Σφάλμα σύνδεσης με τον Server."); }
    },

    sendOrder: (items, method) => {
        let fullText = "";
        if (isDineIn) {
            // ✅ Μορφή για Τραπέζι
            const payIcon = method.includes('ΚΑΡΤΑ') ? '💳' : '💵';
            const header = `[ΤΡ: ${tableNumber} | AT: ${customerDetails.covers} | ${payIcon}]`;
            fullText = `${header}\n👤 ${customerDetails.name}\n${method}\n---\n${items}`;
        } else {
            // ✅ Μορφή για Delivery
            fullText = `[DELIVERY 🛵]\n👤 ${customerDetails.name}\n📍 ${customerDetails.address}\n📮 T.K.: ${customerDetails.zip || '-'}\n🏢 ${customerDetails.floor}\n📞 ${customerDetails.phone}\n${method}\n---\n${items}`;
        }

        // ✅ LOGIC: Αν είναι συμπλήρωση, στέλνουμε add-items
        if (App.existingOrderId) {
            window.socket.emit('add-items', { id: App.existingOrderId, items: items });
            alert(t('order_sent') || 'Η παραγγελία εστάλη!');
            App.existingOrderId = null; // Reset
            document.getElementById('orderText').value = ''; 
            document.getElementById('liveTotal').innerText = `${t('total')}: 0.00€`;
            return;
        }

        const newOrder = { id: Date.now(), status: 'pending', timestamp: Date.now() };
        activeOrders.push(newOrder);
        localStorage.setItem('bellgo_active_orders', JSON.stringify(activeOrders));
        window.socket.emit('new-order', { text: fullText, id: newOrder.id });
        App.updateStatusUI(true); 
        document.getElementById('orderText').value = ''; 
        document.getElementById('liveTotal').innerText = `${t('total')}: 0.00€`;
    },

    minimizeStatus: () => { 
        document.getElementById('statusOverlay').style.height = '0';
        const btn = document.getElementById('btnStatusMini');
        if(btn) {
            btn.style.display = 'flex'; 
            // ✅ FIX: Force Top-Left Position
            btn.style.position = 'fixed';
            btn.style.top = '50px';
            btn.style.left = '10px';
            btn.style.right = 'auto';
            btn.style.bottom = 'auto';
        }
    },

    maximizeStatus: () => { document.getElementById('statusOverlay').style.height = '100%'; },

    updateStatusUI: (shouldOpen) => {
        const list = document.getElementById('orderStatusList');
        if (!list) return;
        list.innerHTML = '';
        
        // ✅ FIX: Hide mini button ONLY if overlay is open
        if (shouldOpen || document.getElementById('statusOverlay').style.height === '100%') {
            document.getElementById('btnStatusMini').style.display = 'none';
        } else if (activeOrders.length > 0) {
            App.minimizeStatus(); // Ensure it's visible and positioned
        }

        // Sort: Newest first
        activeOrders.sort((a,b) => b.timestamp - a.timestamp);

        if (activeOrders.length === 0) {
            list.innerHTML = `<div style="color:#aaa; text-align:center; margin-top:20px;">${t('no_active_orders') || 'Δεν υπάρχουν ενεργές παραγγελίες.'}</div>`;
        } else {
            activeOrders.forEach(order => {
                const el = document.createElement('div');
                
                let icon = '⏳';
                let statusText = t('status_sent') || 'Στάλθηκε';
                let subText = t('status_pending_desc') || 'Αναμονή για αποδοχή...';
                let color = '#FF9800'; // Orange
                
                if (order.status === 'cooking') {
                    icon = '👨‍🍳'; statusText = t('status_cooking') || 'Ετοιμάζεται'; subText = t('status_cooking_desc') || 'Η κουζίνα το ανέλαβε!'; color = '#2196F3'; // Blue
                } else if (order.status === 'ready') {
                    icon = '🛵'; statusText = t('status_ready') || 'Έρχεται!'; subText = t('status_ready_desc') || 'Πατήστε για απόκρυψη'; color = '#00E676'; // Green
                } else if (order.status === 'completed') {
                    icon = '✅'; statusText = t('status_completed') || 'Ολοκληρώθηκε'; subText = t('status_completed_desc') || 'Η παραγγελία έκλεισε.'; color = '#888'; // Grey
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
                    if (order.status !== 'ready' && order.status !== 'completed' && !confirm(t('hide_order_confirm') || "Απόκρυψη παραγγελίας;")) return;
                    App.dismissOrder(order.id);
                };
                
                list.appendChild(el);
            });
        }

        // Mini Status Update
        const miniText = document.getElementById('miniStatusText');
        if (miniText && activeOrders.length > 0) {
            const latest = activeOrders[0];
            if (latest.status === 'ready') miniText.innerText = t('status_ready');
            else if (latest.status === 'cooking') miniText.innerText = t('status_cooking');
            else if (latest.status === 'completed') miniText.innerText = "✅";
            else miniText.innerText = "...";
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

// --- INITIALIZE LANGUAGE ---
(async () => {
    const savedLang = localStorage.getItem('bellgo_lang') || 'el';
    await setLanguage(savedLang);
})();
