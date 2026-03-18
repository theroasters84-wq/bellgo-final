import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { firebaseConfig } from './config.js';
import { Sundromes } from './sundromes.js'; // ✅ Import Sundromes
import { I18n } from './shared-utils.js'; // ✅ Import I18n

if ('serviceWorker' in navigator) {
    // ✅ FIX: Καθαρισμός παλιού Root Service Worker που προκαλεί προβλήματα
    navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(reg => {
            if (reg.scope === window.location.origin + '/') {
                reg.unregister().then(() => console.log('🧹 Old Root SW Removed'));
            }
        });
    });
    // ✅ FIX: Εγγραφή με Scope /manage/ για απομόνωση
    navigator.serviceWorker.register('/sw.js', { scope: '/manage/' }).then(() => console.log("✅ Login SW Registered"));
}

let deferredPrompt;
const btnInstall = document.getElementById('btnInstall');
const isAndroid = /Android/i.test(navigator.userAgent);

if (isAndroid) {
    btnInstall.innerText = "🤖 APP (APK)";
    btnInstall.style.display = "block";
    btnInstall.style.background = "#fff3e0";
    btnInstall.style.color = "#FF9800";
    btnInstall.style.border = "1px solid #FF9800";
} else {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        btnInstall.style.display = 'block';
    });
}

window.handleInstall = async () => {
    if (isAndroid) {
        window.location.href = "https://github.com/theroasters84-wq/bellgo-final/releases/download/v.1.5.0/app-release.apk";
    } else if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') btnInstall.style.display = 'none';
        deferredPrompt = null;
    }
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

const forceLive = localStorage.getItem('use_live_backend') === 'true';
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const serverUrl = (isLocal && !forceLive) ? "" : "https://bellgo-final.onrender.com";
const socket = io(serverUrl, { transports: ['polling', 'websocket'] });
window.socket = socket; // ✅ Expose for Sundromes

// ✅ DEV TOOLS (BACKEND SWITCH) - Προσθήκη και στο Login
window.toggleBackend = function() {
    const current = localStorage.getItem('use_live_backend') === 'true';
    localStorage.setItem('use_live_backend', !current);
    alert("⚙️ Dev Switch:\n\nΤο σύστημα πλέον συνδέεται στο:\n" + (!current ? "🌍 LIVE (Onrender)" : "💻 LOCAL (Localhost)") + "\n\nΗ σελίδα θα ανανεωθεί.");
    location.reload();
};

// ✅ NEW: Mock App object for Sundromes compatibility in Login
window.App = {
    features: {},
    tempFeatures: {},
    isLoginScreen: true, // Flag for Sundromes
    applyFeatureVisibility: () => {} 
};
try {
    const savedFeats = localStorage.getItem('bellgo_temp_features');
    if(savedFeats) window.App.features = JSON.parse(savedFeats);
} catch(e){}

let currentPinMode = 'enter'; 
let tempPin = '';
let pinValue = '';
let storePinToSave = '';
let adminUser = null; 
let adminPlan = 'basic';

// --- I18N LOGIC ---
const t = (key) => I18n.t(key) || key;

window.onload = function() {
    const urlParams = new URLSearchParams(window.location.search);
    const emailParam = urlParams.get('email');
    
    // ✅ NEW: Αυτόματη Είσοδος (Αν υπάρχει αποθηκευμένο session και δεν επιστρέφουμε από Stripe)
    if (!emailParam) {
        const savedSession = localStorage.getItem('bellgo_session');
        if (savedSession) {
            try {
                const session = JSON.parse(savedSession);
                if (session && session.role) {
                    // Έλεγχος Ρόλου και ανακατεύθυνση
                    if (session.role === 'admin') {
                        if (session.plan === 'premium') {
                            const adminMode = localStorage.getItem('bellgo_admin_mode');
                            window.location.replace(adminMode === 'kitchen' ? "/manage/kitchen.html" : "/manage/premium.html");
                        } else {
                            window.location.replace("/manage/index.html");
                        }
                    } else {
                        // Staff (waiter/driver)
                        if (session.role === 'driver') {
                            window.location.replace("/staff/driver");
                        } else {
                            window.location.replace(session.plan === 'premium' ? "/staff/app" : "/manage/index.html");
                        }
                    }
                    return; // Σταματάμε εδώ για να μην φορτώσει η φόρμα
                }
            } catch (e) { localStorage.removeItem('bellgo_session'); }
        }
    }

    if (emailParam) {
        document.getElementById('adminEmailInp').value = emailParam;
        // Admin.manualLogin(); // ❌ Removed to allow manual login flow
    } else {
        const savedEmail = localStorage.getItem('bellgo_last_email');
        if(savedEmail) document.getElementById('adminEmailInp').value = savedEmail;
    }

    // Load Language
    const savedLang = localStorage.getItem('bellgo_lang') || 'el';
    I18n.setLanguage(savedLang);
};

window.setLanguage = (lang) => {
    console.log("🌍 Switching language to:", lang);
    I18n.setLanguage(lang);
};

// --- UI NAVIGATION ---
window.UI = {
    showRoles: () => {
        document.querySelectorAll('.form-section').forEach(el => el.classList.remove('active'));
        document.getElementById('roleSelection').classList.add('active');
    },
    showAdminLogin: (mode) => {
        if(mode) { localStorage.setItem('bellgo_admin_mode', mode); } // ✅ Αποθήκευση Mode (cashier/kitchen)
        document.querySelectorAll('.form-section').forEach(el => el.classList.remove('active'));
        document.getElementById('adminForm').classList.add('active');
        
        if (mode === 'kitchen') {
            document.getElementById('adminOnlyExtras').style.display = 'none';
            document.getElementById('adminFormTitle').innerText = "Είσοδος Κουζίνας";
        } else {
            document.getElementById('adminOnlyExtras').style.display = 'block';
            document.getElementById('adminFormTitle').innerText = "Διαχείριση (Admin)";
        }
    },
    toggleAdminPinVisibility: () => {
        const inp = document.getElementById('adminPinInp');
        if(inp) inp.type = inp.type === 'password' ? 'text' : 'password';
    },
    showStaffLogin: (role) => {
        document.querySelectorAll('.form-section').forEach(el => el.classList.remove('active'));
        document.getElementById('staffForm').classList.add('active');
        const sel = document.getElementById('stRole');
        if(sel) sel.value = role;
    },
    togglePinVisibility: () => {
        const inp = document.getElementById('stPin');
        inp.type = inp.type === 'password' ? 'text' : 'password';
    },
    goToBuy: (plan) => {
        // Πρέπει να πάει στο Admin Form για να βάλει email
        UI.showAdminLogin();
        alert("Παρακαλώ εισάγετε το Email σας και πατήστε Είσοδος. Αν δεν έχετε συνδρομή, θα σας ζητηθεί να αγοράσετε.");
        // Σημείωση: Η λογική αγοράς είναι ενσωματωμένη στο Admin.manualLogin ή Admin.buyPackage
        // Εδώ απλά τον στέλνουμε εκεί, ή μπορούμε να καλέσουμε απευθείας αν έχει συμπληρώσει email.
        const email = document.getElementById('adminEmailInp').value.trim();
        if(email) Admin.buyPackage(plan);
    },
};

window.PIN = {
    add: (n) => { if (pinValue.length < 4) { pinValue += n; PIN.updateDisplay(); } },
    clear: () => { pinValue = ''; PIN.updateDisplay(); },
    updateDisplay: () => { document.getElementById('pinDisplay').innerText = '*'.repeat(pinValue.length); },
    forgotPin: () => {
        let defaultEmail = "";
        if (adminUser && adminUser.email) defaultEmail = adminUser.email;
        else {
            const stStore = document.getElementById('stStore');
            const adminInp = document.getElementById('adminEmailInp');
            if (stStore && stStore.value) defaultEmail = stStore.value;
            else if (adminInp && adminInp.value) defaultEmail = adminInp.value;
        }
        const email = prompt("Εισάγετε το Email για επαναφορά PIN:", defaultEmail);
        if (email) {
            socket.emit('forgot-pin', { email: email.trim() });
            // ✅ FIX: Περιμένουμε απάντηση από τον server (forgot-pin-response)
        }
    },
    submit: () => {
        if (pinValue.length < 4) return alert(t('pin_4_digits') || "Το PIN πρέπει να είναι 4 ψηφία");
        if (currentPinMode === 'enter') {
            socket.emit('verify-pin', { pin: pinValue, email: adminUser.email, personalEmail: adminUser.personalEmail || adminUser.email });
        } else if (currentPinMode === 'create') {
            tempPin = pinValue; pinValue = ''; PIN.updateDisplay();
            currentPinMode = 'confirm';
            document.getElementById('pinTitle').innerText = t('new_pin_title') || "ΕΠΙΒΕΒΑΙΩΣΗ PIN";
            document.getElementById('pinSub').innerText = t('new_pin_sub') || "Πληκτρολογήστε το ξανά";
        } else if (currentPinMode === 'confirm') {
            if (pinValue === tempPin) {
                storePinToSave = pinValue;
                tempPin = ''; pinValue = ''; PIN.updateDisplay();
                currentPinMode = 'create_admin';
                document.getElementById('pinTitle').innerText = t('admin_pin_title') || "ΚΩΔΙΚΟΣ ΔΙΑΧΕΙΡΙΣΤΗ";
                document.getElementById('pinSub').innerText = t('admin_pin_sub') || "Ορίστε το Admin PIN (Μόνο για εσάς)";
            } else { alert(t('pins_not_match') || "Οι κωδικοί δεν ταιριάζουν."); currentPinMode = 'create'; pinValue = ''; PIN.updateDisplay(); document.getElementById('pinTitle').innerText = t('staff_pin_title') || "PIN ΠΡΟΣΩΠΙΚΟΥ"; document.getElementById('pinSub').innerText = t('staff_pin_sub') || "Ορίστε κωδικό για τους υπαλλήλους"; }
        } else if (currentPinMode === 'create_admin') {
            tempPin = pinValue; pinValue = ''; PIN.updateDisplay();
            currentPinMode = 'confirm_admin';
            document.getElementById('pinTitle').innerText = t('admin_pin_confirm_title') || "ΕΠΙΒΕΒΑΙΩΣΗ ADMIN PIN";
            document.getElementById('pinSub').innerText = t('admin_pin_confirm_sub') || "Πληκτρολογήστε ξανά το Admin PIN";
        } else if (currentPinMode === 'confirm_admin') {
            if (pinValue === tempPin) {
                socket.emit('set-new-pin', { pin: storePinToSave, adminPin: pinValue, email: adminUser.email });
            } else { alert(t('pins_not_match') || "Οι κωδικοί δεν ταιριάζουν."); currentPinMode = 'create_admin'; pinValue = ''; PIN.updateDisplay(); document.getElementById('pinTitle').innerText = t('admin_pin_title') || "ΚΩΔΙΚΟΣ ΔΙΑΧΕΙΡΙΣΤΗ"; document.getElementById('pinSub').innerText = t('admin_pin_sub') || "Ορίστε το Admin PIN (Μόνο για εσάς)"; }
        }
    }
};

window.Staff = {
    login: () => {
        const name = document.getElementById('stName').value.trim();
        const pin = document.getElementById('stPin').value.trim();
        const role = document.getElementById('stRole').value;
        const adminEmail = document.getElementById('stStore').value.trim(); 
        const userEmail = document.getElementById('stUserEmail').value.trim();

        if (!name || !pin || !adminEmail || !userEmail) return alert(t('fill_all_fields') || "Συμπληρώστε όλα τα πεδία!");
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(userEmail)) {
            return alert(t('invalid_personal_email') || "Παρακαλώ εισάγετε ένα έγκυρο Προσωπικό Email!");
        }

        if (userEmail.toLowerCase() === adminEmail.toLowerCase()) {
            return alert(t('same_email_error') || "Το Προσωπικό Email δεν μπορεί να είναι ίδιο με το Email της Επιχείρησης!");
        }
        
        const btn = document.getElementById('btnStaffLogin');
        btn.innerText = t('checking') || "ΕΛΕΓΧΟΣ..."; btn.disabled = true;

        socket.emit('verify-pin', { pin: pin, email: adminEmail, personalEmail: userEmail });
        
        socket.once('pin-verified', async (res) => {
            if (res.success) {
                try {
                    const subRes = await fetch('/check-subscription', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: adminEmail })
                    });
                    const subData = await subRes.json();
                    
                    let isActive = subData.active;
                    let features = subData.features || {};
                    let plan = subData.plan;

                    // ✅ NEW: Merge Temp Features (Simulation)
                    const tempFeatures = localStorage.getItem('bellgo_temp_features');
                    if (tempFeatures) {
                        isActive = true; // Force active for simulation
                        try { features = { ...features, ...JSON.parse(tempFeatures) }; } catch(e){}
                        plan = 'custom'; // ✅ Force custom plan to respect features
                    }

                    if (isActive) {
                        const sessionData = { name: name, email: userEmail, store: subData.storeId || adminEmail, role: role, plan: plan, features: features };
                        // ✅ FIX: Clear any temp features from simulation to ensure clean state
                        localStorage.removeItem('bellgo_temp_features');
                        
                        localStorage.setItem('bellgo_session', JSON.stringify(sessionData));

                        if (plan === 'premium' || plan === 'custom') {
                            if (role === 'driver') {
                                window.location.replace("/staff/driver");
                            } else {
                                window.location.replace("/staff/app");
                            }
                        } else {
                            window.location.replace("/manage/index.html"); 
                        }
                    } else {
                        alert(t('no_sub_found') || "Δεν βρέθηκε ενεργή συνδρομή για αυτό το κατάστημα.");
                        btn.innerText = t('login_btn') || "ΕΙΣΟΔΟΣ"; btn.disabled = false;
                    }
                } catch (e) { 
                    alert(t('network_error') || "Σφάλμα δικτύου."); 
                    btn.innerText = t('login_btn') || "ΕΙΣΟΔΟΣ"; btn.disabled = false;
                }
            } else {
                if (res.reason === 'whitelist_rejected') {
                    alert(t('whitelist_rejected') || "⛔ Δεν έχετε άδεια πρόσβασης!\nΤο email σας δεν βρίσκεται στη λίστα εγκεκριμένων υπαλλήλων (Whitelist).");
                } else {
                    alert(t('wrong_pin') || "❌ Λάθος PIN!");
                }
                PIN.clear();
                btn.innerText = t('login_btn') || "ΕΙΣΟΔΟΣ"; btn.disabled = false;
            }
        });
    }
};

window.Admin = {
    manualLogin: async () => {
        const email = document.getElementById('adminEmailInp').value.trim();
        const name = document.getElementById('adminNameInp').value.trim(); // ✅ Λήψη Ονόματος
        const personalEmail = document.getElementById('adminPersonalEmailInp').value.trim();
        const mode = localStorage.getItem('bellgo_admin_mode');

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(personalEmail)) {
            return alert(t('invalid_personal_email') || "Παρακαλώ εισάγετε ένα έγκυρο Προσωπικό Email!");
        }

        if(!email) return alert(t('enter_email_alert') || "Παρακαλώ εισάγετε email.");
        localStorage.setItem('bellgo_last_email', email); // ✅ Save email for next time
        
        const btn = document.getElementById('btnAdminLogin');
        btn.innerText = t('checking') || "ΕΛΕΓΧΟΣ..."; btn.disabled = true;

        // ✅ HACK: Παράκαμψη Stripe για Demo Emails (που τελειώνουν σε 1992+)
        // Αν το email έχει έτος >= 1992, το θεωρούμε Premium και μπαίνουμε.
        const match = email.match(/(\d{4})$/);
        if (match) {
            const year = parseInt(match[1]);
            if (year >= 1992) {
                adminUser = { email: email, personalEmail: personalEmail, displayName: name || "Admin", features: {} }; 
                adminPlan = 'premium'; // Force premium για να μπει στο dashboard
                socket.emit('check-pin-status', { email: email });
                btn.innerText = t('login_btn') || "ΕΙΣΟΔΟΣ"; btn.disabled = false;
                return; // Σταματάμε εδώ, δεν καλούμε το Stripe
            }
        }

        // ✅ FIX: Αυστηρός έλεγχος συνδρομής μέσω Sundromes.checkLogin
        // Αν δεν έχει συνδρομή, το checkLogin εμφανίζει Alert & Modal και επιστρέφει null.
        const data = await Sundromes.checkLogin(email);
        
        if (data) {
            adminUser = { email: email, personalEmail: personalEmail, displayName: name || "Admin" };
            adminPlan = data.plan; 
            adminUser.features = data.features || {}; 
            
            // ✅ NEW: Merge Temp Features (Simulation)
            const tempFeatures = localStorage.getItem('bellgo_temp_features');
            if (tempFeatures) { 
                try { adminUser.features = { ...adminUser.features, ...JSON.parse(tempFeatures) }; } catch(e){} 
                adminPlan = 'custom'; 
            }

            socket.emit('check-pin-status', { email: email });
        }
        
        btn.innerText = t('login_btn') || "ΕΙΣΟΔΟΣ"; btn.disabled = false;
    },

    googleLogin: () => {
        signInWithPopup(auth, provider).then(async (result) => {
            const email = result.user.email;
            
            // ✅ FIX: Αυστηρός έλεγχος και για Google Login
            const data = await Sundromes.checkLogin(email);

            if (data) {
                adminUser = result.user;
                adminPlan = data.plan;
                adminUser.features = data.features || {};

                // ✅ NEW: Merge Temp Features (Simulation)
                const tempFeatures = localStorage.getItem('bellgo_temp_features');
                if (tempFeatures) { 
                    try { adminUser.features = { ...adminUser.features, ...JSON.parse(tempFeatures) }; } catch(e){} 
                    adminPlan = 'custom'; 
                }

                socket.emit('check-pin-status', { email: email });
            }

        }).catch((error) => alert(error.message));
    },

    buyPackage: async (plan) => {
        const email = document.getElementById('adminEmailInp').value.trim();
        if(!email) return alert("Βάλτε το email σας στο πεδίο από πάνω!");

        const res = await fetch('/create-checkout-session', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email: email, plan: plan })
        });
        const data = await res.json();
        if(data.url) window.location.href = data.url;
        else alert("Σφάλμα σύνδεσης με Stripe");
    }
};

// --- SOCKET LISTENERS ---
// ✅ NEW: Απάντηση για το Forgot PIN
socket.on('forgot-pin-response', (res) => {
    alert(res.message);
});

socket.on('pin-status', (data) => {
    if (!document.getElementById('adminForm').classList.contains('active')) return;

    const pinInp = document.getElementById('adminPinInp');
    const enteredPin = pinInp ? pinInp.value.trim() : '';

    if (data.hasPin) {
        if (enteredPin) {
            currentPinMode = 'direct';
            socket.emit('verify-pin', { pin: enteredPin, email: adminUser.email, personalEmail: adminUser.personalEmail || adminUser.email });
        } else {
            alert(t('fill_pin_alert') || "Παρακαλώ συμπληρώστε τον Κωδικό Καταστήματος (PIN) στο πεδίο για να συνδεθείτε.");
            if (pinInp) pinInp.focus();
        }
    } else {
        document.getElementById('pinModal').style.display = 'flex';
        currentPinMode = 'create';
        document.getElementById('pinTitle').innerText = t('staff_pin_title') || "PIN ΠΡΟΣΩΠΙΚΟΥ";
        document.getElementById('pinSub').innerText = t('staff_pin_sub') || "Ορίστε κωδικό για τους υπαλλήλους";
        document.getElementById('btnForgot').style.display = 'none';
        if (pinInp) pinInp.value = ''; 
    }
});

socket.on('pin-success', (data) => {
    const sessionData = { name: adminUser.displayName, store: adminUser.email, role: 'admin', email: adminUser.personalEmail || adminUser.email, plan: adminPlan, features: adminUser.features };
    localStorage.setItem('bellgo_session', JSON.stringify(sessionData));
    
    if(adminPlan === 'premium' || adminPlan === 'custom') {
        const adminMode = localStorage.getItem('bellgo_admin_mode');
        if (adminMode === 'kitchen') {
            window.location.replace("/manage/kitchen.html");
        } else {
            window.location.replace("/manage/premium.html");
        }
    }
    else window.location.replace("/manage/index.html");
});

socket.on('pin-verified', (res) => {
    // 🔥 FIXED: Run for Admin Flow (Modal or Direct)
    if (document.getElementById('adminForm').classList.contains('active') && (currentPinMode === 'enter' || currentPinMode === 'direct')) {
        if (res.success) {
            const sessionData = { name: adminUser.displayName, store: adminUser.email, role: 'admin', email: adminUser.personalEmail || adminUser.email, plan: adminPlan, features: adminUser.features };
            localStorage.setItem('bellgo_session', JSON.stringify(sessionData));
            
            if(adminPlan === 'premium' || adminPlan === 'custom') {
                const adminMode = localStorage.getItem('bellgo_admin_mode');
                if (adminMode === 'kitchen') {
                    window.location.replace("/manage/kitchen.html");
                } else {
                    window.location.replace("/manage/premium.html");
                }
            }
            else window.location.replace("/manage/index.html");
        } else {
            if (res.reason === 'whitelist_rejected') {
                alert(t('whitelist_rejected') || "⛔ Δεν έχετε άδεια πρόσβασης!\nΤο email σας δεν βρίσκεται στη λίστα εγκεκριμένων υπαλλήλων (Whitelist).");
            } else {
                alert(t('wrong_pin') || "❌ Λάθος PIN!");
            }
            if (currentPinMode === 'enter') {
                PIN.clear();
            } else {
                document.getElementById('adminPinInp').value = '';
                document.getElementById('adminPinInp').focus();
            }
        }
    }
});

onAuthStateChanged(auth, async (user) => {
    if (user && !localStorage.getItem('bellgo_session')) {
        document.getElementById('adminEmailInp').value = user.email;
    }
});