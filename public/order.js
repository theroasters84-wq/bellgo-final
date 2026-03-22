import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";
import { firebaseConfig, vapidKey } from './config.js';
import { ReserveTable } from './reserve-table.js?v=5';
import { I18n, PushNotifications } from './shared-utils.js';
import { initSockets } from './socket-client.js';

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
        const isTable = !!new URLSearchParams(window.location.search).get('table');
        if(btnHeader && !isTable) btnHeader.style.display = 'block';
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
            const isTable = !!new URLSearchParams(window.location.search).get('table');
            if(btnHeader && !isTable) btnHeader.style.display = 'block';
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
        // ✅ FIX: Καθαρίζουμε την επιλογή σε κάθε ανανέωση για να βγαίνει ΠΑΝΤΑ το αρχικό μενού
        sessionStorage.removeItem('bellgo_table_choice_made');

        // Αν είναι νέα καρτέλα (Scan) ή αν άλλαξε το τραπέζι -> Reset Covers
        if (isNewSession || (currentDetails && currentDetails.table !== TABLE_ID)) {
            sessionStorage.setItem('bellgo_session_active', 'true');
            
            if (currentDetails && currentDetails.table !== TABLE_ID) {
                console.log("🔄 Table Change Detected: Clearing old orders!");
                localStorage.removeItem('bellgo_active_orders');
            }
            
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
        
        console.log("🔄 Mode Change Detected: Clearing old orders!");
        localStorage.removeItem('bellgo_active_orders');
    }
}

let isDineIn = !!TABLE_ID;
window.tableNumber = TABLE_ID; // ✅ Expose for ReserveTable

// Auto-detect store from path
if (!TARGET_STORE) {
    const pathParts = window.location.pathname.split('/');
    let shopIndex = pathParts.indexOf('shop');
    if (shopIndex === -1) shopIndex = pathParts.indexOf('dinein'); // ✅ Support dinein route
    if (shopIndex !== -1 && pathParts[shopIndex + 1]) {
        TARGET_STORE = decodeURIComponent(pathParts[shopIndex + 1]); // ✅ FIX: Αποκωδικοποίηση ονόματος (π.χ. My%20Shop -> My Shop)
    }
}
window.TARGET_STORE = TARGET_STORE; // ✅ Expose for ReserveTable

const PRELOADED_NAME = params.get('name'); 

const parseItem = (str) => {
    // ✅ FIX: Υποστήριξη για αντικείμενα από το Premium
    if (typeof str === 'object' && str !== null) {
        return { name: str.name, price: str.price || 0, desc: str.desc || "", extras: str.extras || [] };
    }
    const parts = str.split(':');
    let name = parts[0];
    let price = 0;
    if (parts.length > 1) {
        name = parts.slice(0, -1).join(':').trim();
        price = parseFloat(parts[parts.length - 1]);
    } else { name = str.trim(); }
    return { name, price: isNaN(price) ? 0 : price, desc: "", extras: [] };
};

let currentUser = null;
let customerDetails = null;
try {
    customerDetails = JSON.parse(localStorage.getItem('bellgo_customer_info') || 'null');
} catch (e) {
    console.error("Error parsing customer details", e);
    localStorage.removeItem('bellgo_customer_info');
}

// ✅ FIX: Safe parsing for activeOrders (Prevent Crash on Re-entry)
let activeOrders = [];
try {
    activeOrders = JSON.parse(localStorage.getItem('bellgo_active_orders') || '[]');
    if (!Array.isArray(activeOrders)) activeOrders = [];
} catch (e) {
    console.error("Error parsing active orders", e);
    localStorage.removeItem('bellgo_active_orders');
    activeOrders = [];
}

// (ΑΦΑΙΡΕΘΗΚΕ Η ΑΥΤΟΜΑΤΗ ΕΠΑΝΑΦΟΡΑ ΤΡΑΠΕΖΙΟΥ ΓΙΑ ΝΑ ΛΕΙΤΟΥΡΓΕΙ ΤΟ DELIVERY QR)

let storeHasStripe = false;
window.storeHasStripe = false; // ✅ Expose for ReserveTable
const ORDER_TIMEOUT_MS = 30 * 60 * 1000; // ✅ 30 Minutes Timeout
let googleMapsUrl = "";
let hasCheckedStripe = false; // ✅ Flag για να μην ελέγχουμε διπλά

// --- I18N LOGIC (ΠΟΛΥΓΛΩΣΣΙΚΟΤΗΤΑ) ---
const t = (key) => I18n.t(key);


window.App = {
    t: t, // ✅ Expose translation function
    tMenu: (text) => I18n.tMenu(text), // ✅ Expose menu translator
    existingOrderId: null, // ✅ Αποθήκευση ID για συμπλήρωση

    // ✅ NEW: Όμορφο παράθυρο αντί για system alert
    showProductInfo: (desc) => {
        const modal = document.getElementById('productInfoModal');
        const text = document.getElementById('productInfoText');
        if (modal && text) {
            text.innerText = desc;
            modal.style.display = 'flex';
        }
    },

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
            alert(t('install_ios_prompt') || "Για εγκατάσταση σε iPhone:\n1. Πατήστε το κουμπί 'Share' (κάτω)\n2. Επιλέξτε 'Προσθήκη στην Οθόνη Αφετηρίας'");
        }
    },

    openReview: () => {
        if (googleMapsUrl) window.open(googleMapsUrl, '_blank');
    },

    loginGoogle: () => { signInWithPopup(auth, provider).catch(e => alert((t('error') || "Σφάλμα: ") + e.message)); },
    logout: () => { signOut(auth).then(() => location.reload()); },

    checkDetails: () => {
        document.getElementById('loginScreen').style.display = 'none';
        
        // ✅ NEW: Get Choice Early to validate cache
        const choice = sessionStorage.getItem('bellgo_choice_made');

        // ✅ AUTO-SWITCH FIX: Αν το Mode δεν ταιριάζει με τα αποθηκευμένα, καθαρισμός!
        if (customerDetails) {
            let modeChanged = false;
            if (isDineIn && customerDetails.type !== 'dinein') {
                modeChanged = true;
            } else if (!isDineIn && customerDetails.type === 'dinein') {
                modeChanged = true;
            } else if (!isDineIn && choice) {
                // ✅ FIX: Reset αν άλλαξε από Delivery σε Pickup ή αντίστροφα
                if (choice === 'pickup' && customerDetails.type !== 'pickup') modeChanged = true;
                if (choice === 'order' && customerDetails.type !== 'delivery') modeChanged = true;
            }
            
            if (modeChanged) {
                customerDetails = null;
                activeOrders = [];
                localStorage.removeItem('bellgo_active_orders');
                if (window.App && window.App.updateStatusUI) window.App.updateStatusUI(false);
            }
        }

        // ✅ 1. ΡΥΘΜΙΣΗ UI: Εμφάνιση σωστών πεδίων ανάλογα με το Mode
        if (isDineIn) {
            document.getElementById('detailsTitle').innerText = t('welcome') || 'Καλώς ήρθατε!';
            document.getElementById('deliveryFields').style.display = 'none';
            document.getElementById('dineInFields').style.display = 'block';
            document.getElementById('tableDisplay').innerText = `${t('table')}: ${window.tableNumber}`;
        } else {
            // ✅ NEW: Ερώτηση για Παραγγελία ή Κράτηση (Μόνο στο Delivery)
            if (!choice) {
                document.getElementById('choiceModal').style.display = 'flex';
                return; // Σταματάμε εδώ μέχρι να επιλέξει
            }

            // ✅ PICKUP LOGIC
            const isPickup = (choice === 'pickup');
            document.getElementById('detailsTitle').innerText = isPickup ? (t('pickup_title') || 'Παραλαβή από το κατάστημα') : (t('delivery_title') || 'Παράδοση στο χώρο σας');
            
            document.getElementById('deliveryFields').style.display = 'block';
            document.getElementById('dineInFields').style.display = 'none';

            // Hide/Show Address Fields
            const addrGroup = document.getElementById('divAddressGroup');
            if(addrGroup) addrGroup.style.display = isPickup ? 'none' : 'flex';
            document.getElementById('inpFloor').style.display = isPickup ? 'none' : 'block';
            document.getElementById('inpZip').style.display = isPickup ? 'none' : 'block';
        }

        // ✅ 2. ΕΛΕΓΧΟΣ ΔΕΔΟΜΕΝΩΝ: Αν αλλάξαμε Mode, ανοίγουμε τη φόρμα
        let shouldOpenForm = false;

        if (!customerDetails) {
            // ✅ FIX: Αν είναι DineIn, δεν ανοίγουμε φόρμα αμέσως.
            // Δημιουργούμε προσωρινό session και αφήνουμε το socket να αποφασίσει (Active/Inactive).
            if (isDineIn) {
                const defaultName = (currentUser && currentUser.displayName) ? currentUser.displayName : (t('customer_default') || "Πελάτης");
                customerDetails = { name: defaultName, table: window.tableNumber, type: 'dinein' };
                localStorage.setItem('bellgo_customer_info', JSON.stringify(customerDetails));
                shouldOpenForm = false;
            } else {
                shouldOpenForm = true;
            }
        } else {
            if (isDineIn) {
                // ✅ FIX: Δεν ζητάμε covers εδώ. Θα το ζητήσουμε ΜΟΝΟ αν το τραπέζι είναι ανενεργό (μέσω socket)
                if (customerDetails.table != window.tableNumber) {
                    customerDetails.table = window.tableNumber;
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
            
            // ✅ NEW: Εμφάνιση κουμπιού ΠΙΣΩ (Πάντα ορατό για αλλαγή επιλογής)
            const btnBack = document.getElementById('btnBackToChoice');
            if(btnBack) btnBack.style.display = 'block';
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
            if (!name) name = (currentUser && currentUser.displayName) ? currentUser.displayName : (t('customer_default') || "Πελάτης");
            customerDetails = { name, covers, table: window.tableNumber, type: 'dinein' };
        } else {
            const choice = sessionStorage.getItem('bellgo_choice_made');
            const isPickup = (choice === 'pickup');

            const name = document.getElementById('inpName').value.trim();
            const phone = document.getElementById('inpPhone').value.trim();
            
            if (isPickup) {
                if (!name || !phone) return alert(t('enter_details_error') || "Συμπληρώστε τα βασικά στοιχεία!");
                customerDetails = { name, phone, type: 'pickup' };
            } else {
                const address = document.getElementById('inpAddress').value.trim();
                const floor = document.getElementById('inpFloor').value.trim();
                const zip = document.getElementById('inpZip').value.trim();
                if (!name || !address || !phone) return alert(t('enter_details_error') || "Συμπληρώστε τα βασικά στοιχεία!");
                customerDetails = { name, address, floor, phone, zip, type: 'delivery' };
            }
        }

        localStorage.setItem('bellgo_customer_info', JSON.stringify(customerDetails));
        document.getElementById('detailsOverlay').style.display = 'none';
        App.startApp();
    },

    // ✅ NEW: Επιστροφή στην αρχική επιλογή
    goBackToChoice: () => {
        document.getElementById('detailsOverlay').style.display = 'none';
        
        // ✅ FIX: Σωστή επιστροφή στο μενού επιλογής αν είναι Τραπέζι
        if (isDineIn) {
             sessionStorage.removeItem('bellgo_table_choice_made');
             document.getElementById('tableChoiceModal').style.display = 'flex';
             document.getElementById('appContent').style.display = 'flex'; 
             return;
        }

        sessionStorage.removeItem('bellgo_choice_made');
        
        // ✅ NEW: Αν υπάρχει τραπέζι (URL), πρόσθεσε επιλογή για επιστροφή στο τραπέζι
        if (TABLE_ID) {
             let btnTable = document.getElementById('btnChoiceTable');
             if (!btnTable) {
                 const container = document.querySelector('#choiceModal .details-box');
                 const h3 = container.querySelector('h3');
                 btnTable = document.createElement('button');
                 btnTable.id = 'btnChoiceTable';
                 btnTable.className = 'btn-save-details';
                 btnTable.style.cssText = "margin-bottom:15px; background:#00E676; color:black;";
                 btnTable.innerHTML = `🍽️ ${t('table_order') || 'ΠΑΡΑΓΓΕΛΙΑ ΣΤΟ ΤΡΑΠΕΖΙ'} ${TABLE_ID}`;
                 btnTable.onclick = () => App.chooseAction('dinein');
                 h3.after(btnTable);
             }
             btnTable.style.display = 'block';
        }

        document.getElementById('choiceModal').style.display = 'flex';
    },

    // ✅ NEW: Εμφάνιση του κεντρικού μενού επιλογών (Hamburger)
    showMenuOptions: () => {
        const modal = document.getElementById('choiceModal');
        let closeBtn = document.getElementById('btnCloseChoiceModal');
        if (!closeBtn) {
            closeBtn = document.createElement('button');
            closeBtn.id = 'btnCloseChoiceModal';
            closeBtn.innerText = t('cancel') || "ΑΚΥΡΩΣΗ";
            closeBtn.style.cssText = "background:transparent; border:none; color:#aaa; margin-top:15px; cursor:pointer; font-size:14px; width:100%; font-weight:bold;";
            closeBtn.onclick = () => modal.style.display = 'none';
            modal.querySelector('.details-box').appendChild(closeBtn);
        }
        
        // Εμφανίζουμε το κουμπί Ακύρωσης ΜΟΝΟ αν έχει ήδη επιλέξει κάτι (για να μην το κλείσει αν μπαίνει για 1η φορά)
        if (sessionStorage.getItem('bellgo_choice_made') || isDineIn) {
            closeBtn.style.display = 'block';
        } else {
            closeBtn.style.display = 'none';
        }
        
        modal.style.display = 'flex';
    },

    // ✅ NEW: GPS Location for Delivery
    getGpsLocation: (btn) => {
        if (!navigator.geolocation) return alert(t('geolocation_unsupported') || "Η γεωθεσία δεν υποστηρίζεται.");
        
        const originalText = btn.innerText;
        btn.innerText = "⏳";
        btn.disabled = true;

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;
                // Google Maps Link
                const link = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
                document.getElementById('inpAddress').value = link;
                btn.innerText = "✅";
                setTimeout(() => { btn.innerText = originalText; btn.disabled = false; }, 2000);
            },
            (err) => { alert((t('gps_error') || "Σφάλμα GPS: ") + err.message); btn.innerText = originalText; btn.disabled = false; },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    },
    
    // ✅ NEW: Διαχείριση Αρχικής Επιλογής
    chooseAction: (action) => {
        // ✅ NEW: Play Silent Audio for KeepAlive (Pickup) - Keeps browser awake for alerts
        if (action === 'pickup') {
            const audio = new Audio('/tone19hz.wav');
            audio.loop = true;
            audio.volume = 0.01;
            audio.play().catch(e => console.log("KeepAlive Audio Error:", e));
            window.bellgoKeepAlive = audio;
        }

        sessionStorage.setItem('bellgo_choice_made', action);
        document.getElementById('choiceModal').style.display = 'none';
        
        if (action === 'order' || action === 'pickup' || action === 'dinein') {
            // ✅ FIX: Διαχείριση αλλαγής Mode (Τραπέζι <-> Delivery)
            if (action === 'dinein') {
                isDineIn = true;
            } else {
                isDineIn = false;
            }

            App.checkDetails(); 
        } else if (action === 'book') {
            // Αν δεν υπάρχουν στοιχεία, φτιάχνουμε προσωρινά για να συνδεθεί το socket
            if (!customerDetails) {
                const defaultName = (currentUser && currentUser.displayName) ? currentUser.displayName : (t('guest_default') || "Επισκέπτης");
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
        // ✅ FIX: Check Store ID to prevent hanging
        if (!TARGET_STORE) {
            alert(t('store_not_found_error') || "⚠️ Σφάλμα: Δεν βρέθηκε κατάστημα. Παρακαλώ σκανάρετε ξανά το QR.");
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

        if (PRELOADED_NAME) {
            const cleanName = decodeURIComponent(PRELOADED_NAME);
            document.getElementById('storeNameHeader').innerText = cleanName;
            document.title = cleanName;
            let maniUrl = `/manifest.json?name=${PRELOADED_NAME}&icon=shop`; // ✅ FIX: Βάλαμε / μπροστά για σωστό Path
            if (TARGET_STORE) maniUrl += `&store=${TARGET_STORE}`;
            document.getElementById('dynamicManifest').setAttribute('href', maniUrl);
        } else if(TARGET_STORE) {
            document.getElementById('storeNameHeader').innerText = TARGET_STORE.split('@')[0].toUpperCase();
        }
        
        // ✅ Εμφάνιση σωστής επικεφαλίδας (Τραπέζι ή Διεύθυνση)
        if (isDineIn) {
             document.getElementById('displayAddress').innerText = `🍽️ ${t('table') || 'Τραπέζι'} ${window.tableNumber} (${customerDetails.covers} ${t('people') || 'Άτομα'})`;
             const btnMenuToggle = document.getElementById('btnCustomerMenuToggle');
             if (btnMenuToggle) btnMenuToggle.style.display = 'none';
             const editSpan = document.getElementById('editDetailsText');
             if (editSpan) { editSpan.setAttribute('data-i18n', 'people'); editSpan.innerText = t('people') || 'Άτομα'; }
             const btnInstallHeader = document.getElementById('btnInstallHeader');
             if (btnInstallHeader) btnInstallHeader.style.display = 'none';
             const btnCall = document.getElementById('btnCallWaiterAdmin');
             if (btnCall) btnCall.style.display = 'inline-block';
             const btnBill = document.getElementById('btnMyBill');
             if (btnBill) btnBill.style.display = 'inline-block';

             // ✅ Εμφάνιση Initial Modal για Τραπέζι
             const tableChoice = sessionStorage.getItem('bellgo_table_choice_made');
             if (!tableChoice) {
                 const wTable = document.getElementById('welcomeTableNum');
                 if(wTable) wTable.innerText = window.tableNumber;
                 document.getElementById('tableChoiceModal').style.display = 'flex';
             } else if (tableChoice === 'menu') {
                 window.isMenuOnlyMode = true;
                 const panel = document.getElementById('orderPanel');
                 if (panel) panel.style.display = 'none';
                 const btnExit = document.getElementById('btnExitMenuOnly');
                 if (btnExit) btnExit.style.display = 'block';
             }
        } else {
             const btnMenuToggle = document.getElementById('btnCustomerMenuToggle');
             if (btnMenuToggle) btnMenuToggle.style.display = 'inline-block';
             const editSpan = document.getElementById('editDetailsText');
             if (editSpan) { editSpan.setAttribute('data-i18n', 'change'); editSpan.innerText = t('change') || 'Αλλαγή'; }
             const btnCall = document.getElementById('btnCallWaiterAdmin');
             if (btnCall) btnCall.style.display = 'none';
             const btnBill = document.getElementById('btnMyBill');
             if (btnBill) btnBill.style.display = 'inline-block'; // Το βλέπουν και στο Delivery
             
             if (customerDetails.type === 'pickup') {
                 document.getElementById('displayAddress').innerText = `🛍️ ${t('pickup_from_store') || 'Παραλαβή από Κατάστημα'}`;
             } else {
                 document.getElementById('displayAddress').innerText = `📍 ${customerDetails.address}, ${customerDetails.floor}`;
             }
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
        PushNotifications.checkPermission(messaging, (token) => {
            if(window.socket && window.socket.connected) {
                const mySocketUsername = (customerDetails && customerDetails.name ? customerDetails.name : "Πελάτης") + " (Πελάτης)";
                window.socket.emit('join-store', { 
                    storeName: TARGET_STORE, 
                    username: mySocketUsername, 
                    role: 'customer', 
                    token: token,
                    isNative: false 
                });
            }
        }, true);
    },

    checkActiveOrderStorage: () => {
        if (!Array.isArray(activeOrders)) activeOrders = [];
        const now = Date.now();
        const TWELVE_HOURS = 12 * 60 * 60 * 1000;
        
        // Filter out 'ready' orders older than 1 hour AND any order older than 12 hours
        activeOrders = activeOrders.filter(o => {
            if (!o || typeof o !== 'object') return false; // ✅ Safety Check for corrupted data
            if ((now - o.timestamp) > TWELVE_HOURS) return false; // Safety cleanup
            if (o.status === 'ready' || o.status === 'completed') { // ✅ Handle completed/closed orders
                const timeRef = o.readyTime || o.timestamp;
                return (now - timeRef) < ORDER_TIMEOUT_MS;
            }
            return true;
        });
        localStorage.setItem('bellgo_active_orders', JSON.stringify(activeOrders));
        
        if (activeOrders.length > 0) {
            try {
                App.updateStatusUI(false);
            } catch (e) {
                console.error("UI Update Error:", e);
            }
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

        const ctx = {
            getSafeName: () => (customerDetails && customerDetails.name) ? customerDetails.name : "Πελάτης",
            get TARGET_STORE() { return TARGET_STORE; },
            get isDineIn() { return isDineIn; },
            get tableNumber() { return window.tableNumber; },
            get customerDetails() { return customerDetails; },
            get activeOrders() { return activeOrders; },
            set activeOrders(val) { activeOrders = val; },
            get hasCheckedStripe() { return hasCheckedStripe; },
            set hasCheckedStripe(val) { hasCheckedStripe = val; },
            get storeHasStripe() { return storeHasStripe; },
            set storeHasStripe(val) { storeHasStripe = val; },
            get googleMapsUrl() { return googleMapsUrl; },
            set googleMapsUrl(val) { googleMapsUrl = val; },
            t: t,
            tMenu: (text) => I18n.tMenu(text),
            ReserveTable: ReserveTable
        };

        initSockets(App, ctx);
    },

    renderMenu: (data) => {
      try {
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
                title.innerText = I18n.tMenu(cat.name); // ✅ Translated Category
                const itemsDiv = document.createElement('div');
                itemsDiv.className = 'category-items';

                cat.items.forEach(item => {
                    // ✅ FIX: Έλεγχος αν είναι αντικείμενο ή κείμενο
                    if (item && (typeof item === 'object' || item.trim())) {
                        const { name, price, desc } = parseItem(item);
                        const box = document.createElement('div');
                        box.className = 'item-box';
                        // ✅ FIX iOS: touch-action: manipulation disables zoom delay
                        box.style.touchAction = 'manipulation';
                        box.style.cursor = 'pointer'; // ✅ Fix for iOS click registration
                        let displayItemName = I18n.tMenu(name); // ✅ Translated Item Name
                        
                        let descHtml = desc ? `<span class="item-info-icon" onclick="event.stopPropagation(); App.showProductInfo('${desc.replace(/'/g, "\\'").replace(/"/g, "&quot;")}');" title="Πληροφορίες / Αλλεργιογόνα">ℹ️</span>` : '';
                        box.innerHTML = `<div style="display:flex; align-items:center; gap:8px;"><span class="item-name">${displayItemName}</span>${descHtml}</div>${price > 0 ? `<span class="item-price">${price}€</span>` : ''}`;
                        
                        // ✅ CUSTOM DOUBLE TAP: Λειτουργεί παντού (και iPhone) και προστατεύει από τυχαία κλικ
                        let lastTap = 0;
                        box.addEventListener('click', (e) => { 
                            e.preventDefault(); 
                            
                            if (window.isMenuOnlyMode) {
                                alert(t('menu_only_alert') || "Για να παραγγείλετε, πατήστε 'ΕΠΙΣΤΡΟΦΗ' και επιλέξτε 'ΠΑΡΑΓΓΕΙΛΕ ΤΩΡΑ'.");
                                return;
                            }

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
      } catch (e) {
          console.error("Menu Render Error:", e);
          document.getElementById('menuContainer').innerHTML = `<div style="text-align:center; padding:20px; color:red;">Σφάλμα εμφάνισης μενού.<br><button onclick="location.reload()">Ανανέωση</button></div>`;
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

    openItemOptionsModal: (name, basePrice, extras) => {
        let modal = document.getElementById('itemOptionsModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'itemOptionsModal';
            modal.className = 'modal-overlay';
            modal.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:25000; display:flex; align-items:center; justify-content:center;";
            document.body.appendChild(modal);
        }

        let extrasHtml = '';
        extras.forEach((ex) => {
            const exPrice = parseFloat(ex.price) || 0;
            extrasHtml += `
                <label style="display:flex; justify-content:space-between; align-items:center; background:#f9fafb; padding:15px; border-radius:8px; border:1px solid #e5e7eb; margin-bottom:8px; cursor:pointer;">
                    <span style="font-weight:500; color:#1f2937; font-size:15px;">${ex.name}</span>
                    <div style="display:flex; align-items:center; gap:10px;">
                        ${exPrice > 0 ? `<span style="color:#10B981; font-weight:bold; font-size:15px;">+${exPrice.toFixed(2)}€</span>` : ''}
                        <input type="checkbox" class="extra-checkbox" data-name="${ex.name}" data-price="${exPrice}" style="width:24px; height:24px; cursor:pointer;">
                    </div>
                </label>
            `;
        });

        const displayItemName = I18n.tMenu(name);
        modal.innerHTML = `
            <div class="modal-box" style="background:white; padding:20px; border-radius:15px; width:90%; max-width:400px; box-shadow:0 10px 30px rgba(0,0,0,0.3); max-height:85vh; display:flex; flex-direction:column;">
                <h3 style="margin-top:0; color:#2196F3; border-bottom:1px solid #e5e7eb; padding-bottom:10px; font-size:20px; text-align:center;">${displayItemName}</h3>
                <div style="flex:1; overflow-y:auto; margin-bottom:15px; padding-right:5px;">
                    <div style="font-size:13px; color:#6b7280; margin-bottom:10px; text-align:center;">Επιλέξτε μεγέθη / υλικά:</div>
                    ${extrasHtml}
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #e5e7eb; padding-top:15px; margin-bottom:15px;">
                    <span style="font-weight:bold; color:#1f2937; font-size:16px;">Σύνολο:</span>
                    <span id="itemOptionsTotal" style="font-size:24px; font-weight:bold; color:#10B981;">${basePrice.toFixed(2)}€</span>
                </div>
                <div style="display:flex; gap:10px;">
                    <button id="btnConfirmItemOptions" style="flex:2; background:#10B981; color:white; border:none; padding:15px; border-radius:10px; font-weight:bold; font-size:16px; cursor:pointer; box-shadow:0 4px 10px rgba(16,185,129,0.3);">ΠΡΟΣΘΗΚΗ</button>
                    <button onclick="document.getElementById('itemOptionsModal').style.display='none'" style="flex:1; background:#f3f4f6; color:#1f2937; border:1px solid #d1d5db; padding:15px; border-radius:10px; font-weight:bold; font-size:14px; cursor:pointer;">ΑΚΥΡΟ</button>
                </div>
            </div>
        `;

        const checkboxes = modal.querySelectorAll('.extra-checkbox');
        const totalEl = document.getElementById('itemOptionsTotal');

        const updateTotal = () => {
            let currentTotal = basePrice;
            checkboxes.forEach(cb => {
                if (cb.checked) currentTotal += parseFloat(cb.dataset.price);
            });
            totalEl.innerText = `${currentTotal.toFixed(2)}€`;
        };

        checkboxes.forEach(cb => cb.addEventListener('change', updateTotal));

        document.getElementById('btnConfirmItemOptions').onclick = () => {
            let finalPrice = basePrice;
            let selectedExtras = [];
            checkboxes.forEach(cb => {
                if (cb.checked) {
                    finalPrice += parseFloat(cb.dataset.price);
                    selectedExtras.push(cb.dataset.name);
                }
            });

            let finalName = name;
            if (selectedExtras.length > 0) {
                finalName += ` (+ ${selectedExtras.join(', ')})`;
            }

            App.addToOrder(`${finalName}:${finalPrice}`);
            modal.style.display = 'none';
        };

        modal.style.display = 'flex';
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
        
        if(!date || !time || !pax || !name || !phone) return alert(t('fill_all_fields') || "Συμπληρώστε όλα τα πεδία!");
        
        window.socket.emit('create-reservation', { date, time, pax, name, phone, customerToken: token });
    },

    // ✅ NEW: MY RESERVATIONS LOGIC
    openMyReservations: () => {
        // Αν δεν είναι συνδεδεμένο, κάνε connect (για την περίπτωση που πατάει από το αρχικό modal)
        if (!window.socket || !window.socket.connected) {
             if (!customerDetails) {
                const defaultName = (currentUser && currentUser.displayName) ? currentUser.displayName : (t('guest_default') || "Επισκέπτης");
                customerDetails = { name: defaultName, type: 'delivery' };
            }
            App.startApp();
        }

        const myResIds = JSON.parse(localStorage.getItem('bellgo_my_reservations') || '[]');
        if (myResIds.length === 0) {
            alert(t('no_local_reservations') || "Δεν βρέθηκαν κρατήσεις σε αυτή τη συσκευή.");
            return;
        }
        
        // ✅ FIX: Κρύβουμε το αρχικό παράθυρο επιλογής για να φανεί η λίστα
        document.getElementById('choiceModal').style.display = 'none';
        
        document.getElementById('myReservationsModal').style.display = 'flex';
        document.getElementById('myReservationsList').innerHTML = `<p style="text-align:center; color:#aaa;">${t('loading') || 'Φόρτωση...'}</p>`;
        
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
            container.innerHTML = `<p style="text-align:center; color:#aaa;">${t('no_active_reservations') || 'Δεν υπάρχουν ενεργές κρατήσεις.'}</p>`;
            return;
        }

        activeList.sort((a,b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`));

        activeList.forEach(r => {
            const div = document.createElement('div');
            div.style.cssText = "background:#ffffff; padding:10px; border-radius:8px; margin-bottom:10px; border:1px solid #e5e7eb; box-shadow:0 2px 5px rgba(0,0,0,0.05);";
            
            let statusColor = '#F59E0B'; // Pending
            let statusText = t('status_pending_res') || 'ΑΝΑΜΟΝΗ';
            if (r.status === 'confirmed') { statusColor = '#10B981'; statusText = t('status_confirmed_res') || 'ΕΠΙΒΕΒΑΙΩΜΕΝΗ'; }

            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                    <span style="font-weight:bold; color:#1f2937;">${r.date} - ${r.time}</span>
                    <span style="font-size:10px; padding:2px 5px; border-radius:4px; background:${statusColor}; color:white; font-weight:bold;">${statusText}</span>
                </div>
                <div style="color:#6b7280; font-size:14px;">${r.pax} ${t('people') || 'Άτομα'} • ${r.name}</div>
                <button onclick="App.cancelMyReservation(${r.id})" style="width:100%; margin-top:10px; background:#EF4444; color:white; border:none; padding:8px; border-radius:5px; cursor:pointer; font-weight:bold;">${t('cancel') || 'ΑΚΥΡΩΣΗ'}</button>
            `;
            container.appendChild(div);
        });
    },

    cancelMyReservation: (id) => {
        if(confirm(t('cancel_reservation_confirm') || "Είστε σίγουροι ότι θέλετε να ακυρώσετε την κράτηση;")) {
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
            // ✅ FIX: Κλείσιμο παραθύρου ΠΡΙΝ την αποστολή για να μην κολλάει
            document.getElementById('paymentOverlay').style.display = 'none';
            App.sendOrder(items, method);
        }
    },

    payWithCard: async (items) => {
        const totalAmount = App.handleInput();
        if(totalAmount <= 0) return alert(t('amount_error') || "Σφάλμα ποσού.");
        
        // ✅ FIX: Αποθήκευση κατάστασης (Τραπέζι/Delivery) πριν την πληρωμή
        if (isDineIn) {
            localStorage.setItem('bellgo_return_mode', 'dinein');
            localStorage.setItem('bellgo_return_table', window.tableNumber);
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
        // ✅ FIX: Safety Check for Customer Details
        if (!customerDetails) {
            alert(t('missing_customer_details_error') || "⚠️ Σφάλμα: Λείπουν τα στοιχεία πελάτη. Η σελίδα θα ανανεωθεί.");
            window.location.reload();
            return;
        }

        let fullText = "";
        if (isDineIn) {
            // ✅ Μορφή για Τραπέζι
            const payIcon = method.includes('ΚΑΡΤΑ') ? '💳' : '💵';
            const header = `[ΤΡ: ${window.tableNumber} | AT: ${customerDetails.covers} | ${payIcon}]`;
            fullText = `${header}\n👤 ${customerDetails.name}\n${method}\n---\n${items}`;
        } else if (customerDetails && customerDetails.type === 'pickup') {
            // ✅ Μορφή για Pickup
            fullText = `[PICKUP 🛍️]\n👤 ${customerDetails.name}\n📞 ${customerDetails.phone}\n${method}\n---\n${items}`;
        } 
        else {
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

        // ✅ FIX: Save text locally immediately (Critical for Pickup check)
        const newOrder = { id: Date.now(), status: 'pending', timestamp: Date.now(), text: fullText };
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
                let subText = t('status_pending_desc') || 'ΑΝΑΜΟΝΗ ΓΙΑ ΑΠΟΔΟΧΗ'; // ✅ Changed Text
                let color = '#FF9800'; // Orange
                
                if (order.status === 'cooking') {
                    icon = '👨‍🍳'; statusText = t('status_cooking') || 'Ετοιμάζεται'; subText = t('status_cooking_desc') || 'Η κουζίνα το ανέλαβε!'; color = '#2196F3'; // Blue
                } else if (order.status === 'ready') {
                    if (order.text.includes('[PICKUP')) {
                        icon = '🛍️'; statusText = t('status_ready_pickup') || 'Έτοιμο για Παραλαβή!'; subText = t('status_ready_pickup_desc') || 'Περάστε από το κατάστημα.';
                    } else {
                        icon = '🛵'; statusText = t('status_ready') || 'Έρχεται!'; subText = t('status_ready_desc') || 'Πατήστε για απόκρυψη';
                    }
                    color = '#00E676'; // Green
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
    },

    // ✅ NEW: Εμφάνιση του Λογαριασμού Πελάτη
    openMyBill: () => {
        const list = document.getElementById('myBillList');
        const totalEl = document.getElementById('myBillTotal');
        if (!list || !totalEl) return;
        
        list.innerHTML = '';
        let grandTotal = 0;
        let hasItems = false;

        if (!activeOrders || activeOrders.length === 0) {
            list.innerHTML = `<div style="text-align:center; color:#aaa; padding:20px;">${t('no_orders') || 'Καμία παραγγελία'}</div>`;
            totalEl.innerText = `${t('total') || 'ΣΥΝΟΛΟ'}: 0.00€`;
            document.getElementById('myBillModal').style.display = 'flex';
            return;
        }

        activeOrders.forEach(o => {
            const lines = o.text.split('\n');
            let orderHtml = `<div style="margin-bottom:15px; padding-bottom:10px; border-bottom:1px solid #e5e7eb;">`;
            orderHtml += `<div style="font-size:12px; color:#6b7280; margin-bottom:8px; font-weight:bold;">🕒 ${new Date(o.timestamp).toLocaleTimeString('el-GR', {hour: '2-digit', minute:'2-digit'})}</div>`;
            
            let orderTotal = 0;
            lines.forEach(line => {
                const trimmed = line.trim();
                if (trimmed.startsWith('[') || trimmed.startsWith('👤') || trimmed.startsWith('📍') || trimmed.startsWith('📞') || trimmed.startsWith('🏢') || trimmed.startsWith('📮') || trimmed === '---' || trimmed.includes('💵 ΜΕΤΡΗΤΑ') || trimmed.includes('💳 ΚΑΡΤΑ')) return;
                
                let isPaid = trimmed.includes('✅');
                let cleanLine = trimmed.replace(/✅ 💶|✅ 💳|✅/g, '').replace('++', '').trim();
                if (!cleanLine) return;

                const match = cleanLine.match(/^(\d+)\s+(.*)/);
                if (match) {
                    let qty = parseInt(match[1]);
                    let rest = match[2];
                    if (rest.includes(':')) {
                        const parts = rest.split(':');
                        const price = parseFloat(parts[parts.length-1]);
                        const name = parts.slice(0, -1).join(':').trim();
                        if (!isNaN(price)) {
                            orderTotal += qty * price;
                            orderHtml += `<div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:15px; ${isPaid ? 'text-decoration:line-through; color:#10B981;' : 'color:#1f2937;'}"><span><b>${qty}x</b> ${name}</span><span style="font-weight:bold;">${(qty * price).toFixed(2)}€</span></div>`;
                            hasItems = true;
                        }
                    } else { orderHtml += `<div style="color:#6b7280; font-size:13px; margin-left:20px;">- ${cleanLine}</div>`; }
                } else { orderHtml += `<div style="color:#6b7280; font-size:13px; margin-left:20px;">- ${cleanLine}</div>`; }
            });
            orderHtml += `</div>`;
            list.innerHTML += orderHtml;
            grandTotal += orderTotal;
        });

        if (!hasItems && grandTotal === 0) list.innerHTML = `<div style="text-align:center; color:#aaa; padding:20px;">Δεν βρέθηκαν χρεώσιμα είδη.</div>`;
        totalEl.innerText = `${t('total') || 'ΣΥΝΟΛΟ'}: ${grandTotal.toFixed(2)}€`;
        document.getElementById('myBillModal').style.display = 'flex';
    },

    // ✅ NEW: Η χαμένη λειτουργία της κλήσης προστέθηκε ξανά!
    callWaiterAdmin: () => {
        if (!isDineIn) return;
        if (!window.socket || !window.socket.connected) {
            alert("⚠️ Αποσύνδεση! Η εφαρμογή προσπαθεί να επανασυνδεθεί στον Server...");
            return;
        }

        if (confirm(t('confirm_call_waiter') || 'Θέλετε να καλέσετε τον σερβιτόρο;')) {
            console.log("🛎️ Emitting admin-only-call for Table:", window.tableNumber);
            let responded = false;
            window.socket.emit('admin-only-call', { table: window.tableNumber, msg: 'Ζητάει εξυπηρέτηση' }, (res) => {
                responded = true;
                console.log("✅ Server Callback:", res);
            });
            
            setTimeout(() => {
                if (!responded) {
                    console.warn("⚠️ Server uses old handler, but call was likely delivered via fallback.");
                }
            }, 3000);
            alert(t('waiter_called_success') || 'Η κλήση εστάλη! Ο υπεύθυνος θα στείλει τον σερβιτόρο σας.');
        }
    },

    // ✅ NEW: Διαχείριση αρχικής επιλογής στο Τραπέζι
    tableAction: (action) => {
        document.getElementById('tableChoiceModal').style.display = 'none';
        
        if (action === 'menu') {
            sessionStorage.setItem('bellgo_table_choice_made', 'menu');
            window.isMenuOnlyMode = true;
            const panel = document.getElementById('orderPanel');
            if (panel) panel.style.display = 'none';
            const btnExit = document.getElementById('btnExitMenuOnly');
            if (btnExit) btnExit.style.display = 'block';
        } else if (action === 'order') {
            sessionStorage.setItem('bellgo_table_choice_made', 'order');
            window.isMenuOnlyMode = false;
            const panel = document.getElementById('orderPanel');
            if (panel) {
                panel.style.display = 'flex';
                if (panel.classList.contains('minimized')) App.toggleOrderPanel();
            }
            
            // ✅ Ελέγχουμε την κατάσταση του τραπεζιού ΜΟΝΟ τώρα που το ζήτησε ο πελάτης
            if (window.currentTableStatusData) {
                if (window.App.ReserveTable && window.App.ReserveTable.processTableStatus) {
                    window.App.ReserveTable.processTableStatus(window.currentTableStatusData);
                }
            } else if (window.socket && window.socket.connected) {
                window.socket.emit('check-table-status', { table: window.tableNumber });
            }
        } else if (action === 'call') {
            sessionStorage.setItem('bellgo_table_choice_made', 'order');
            window.isMenuOnlyMode = false;
            const panel = document.getElementById('orderPanel');
            if (panel) panel.style.display = 'flex';
            App.callWaiterAdmin();
        }
    },

    // ✅ NEW: Έξοδος από το View-Only Menu
    exitMenuOnly: () => {
        window.isMenuOnlyMode = false;
        sessionStorage.removeItem('bellgo_table_choice_made');
        document.getElementById('btnExitMenuOnly').style.display = 'none';
        const panel = document.getElementById('orderPanel');
        if (panel) panel.style.display = 'flex';
        document.getElementById('tableChoiceModal').style.display = 'flex';
    }
};

onAuthStateChanged(auth, (user) => {
    if (user) { currentUser = user; App.checkDetails(); } 
    else { document.getElementById('loginScreen').style.display = 'flex'; document.getElementById('appContent').style.display = 'none'; }
});

// --- INITIALIZE LANGUAGE ---
(async () => {
    const savedLang = localStorage.getItem('bellgo_lang') || 'el';
    await I18n.setLanguage(savedLang);
})();
