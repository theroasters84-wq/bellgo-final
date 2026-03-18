import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { firebaseConfig } from './config.js';
import { Sundromes } from './sundromes.js'; // ✅ Import Sundromes

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
let adminUser = null; 
let adminPlan = 'basic';

// --- I18N LOGIC ---
let translations = {};
const t = (key) => translations[key] || key;

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
    setLanguage(savedLang);
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
        if (pinValue.length < 4) return alert("Το PIN πρέπει να είναι 4 ψηφία");
        if (currentPinMode === 'enter') {
            socket.emit('verify-pin', { pin: pinValue, email: adminUser.email });
        } else if (currentPinMode === 'create') {
            tempPin = pinValue; pinValue = ''; PIN.updateDisplay();
            currentPinMode = 'confirm';
            document.getElementById('pinTitle').innerText = t('confirm') || "ΕΠΙΒΕΒΑΙΩΣΗ";
            document.getElementById('pinSub').innerText = t('type_again') || "Πληκτρολογήστε το ξανά";
        } else if (currentPinMode === 'confirm') {
            if (pinValue === tempPin) {
                socket.emit('set-new-pin', { pin: pinValue, email: adminUser.email });
            } else { alert("Οι κωδικοί δεν ταιριάζουν."); currentPinMode = 'create'; pinValue = ''; PIN.updateDisplay(); }
        }
    }
};

window.Staff = {
    login: () => {
        const name = document.getElementById('stName').value.trim();
        const pin = document.getElementById('stPin').value.trim();
        const role = document.getElementById('stRole').value;
        const adminEmail = document.getElementById('stStore').value.trim(); 

        if (!name || !pin || !adminEmail) return alert("Συμπληρώστε τα πεδία!");
        
        const btn = document.getElementById('btnStaffLogin');
        btn.innerText = "ΕΛΕΓΧΟΣ..."; btn.disabled = true;

        socket.emit('verify-pin', { pin: pin, email: adminEmail });
        
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
                        const sessionData = { name: name, store: subData.storeId || adminEmail, role: role, plan: plan, features: features };
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
                        alert("Δεν βρέθηκε ενεργή συνδρομή για αυτό το κατάστημα.");
                        btn.innerText = "ΕΙΣΟΔΟΣ"; btn.disabled = false;
                    }
                } catch (e) { 
                    alert("Σφάλμα δικτύου."); 
                    btn.innerText = "ΕΙΣΟΔΟΣ"; btn.disabled = false;
                }
            } else {
                alert("Λάθος PIN!");
                PIN.clear();
                btn.innerText = "ΕΙΣΟΔΟΣ"; btn.disabled = false;
            }
        });
    }
};

window.Admin = {
    manualLogin: async () => {
        const email = document.getElementById('adminEmailInp').value.trim();
        const name = document.getElementById('adminNameInp').value.trim(); // ✅ Λήψη Ονόματος
        if(!email) return alert("Παρακαλώ εισάγετε email.");
        localStorage.setItem('bellgo_last_email', email); // ✅ Save email for next time
        
        const btn = document.getElementById('btnAdminLogin');
        btn.innerText = "ΕΛΕΓΧΟΣ..."; btn.disabled = true;

        // ✅ HACK: Παράκαμψη Stripe για Demo Emails (που τελειώνουν σε 1992+)
        // Αν το email έχει έτος >= 1992, το θεωρούμε Premium και μπαίνουμε.
        const match = email.match(/(\d{4})$/);
        if (match) {
            const year = parseInt(match[1]);
            if (year >= 1992) {
                adminUser = { email: email, displayName: name || "Admin", features: {} }; // Hack features handled in premium.js
                adminPlan = 'premium'; // Force premium για να μπει στο dashboard
                socket.emit('check-pin-status', { email: email });
                btn.innerText = "ΕΙΣΟΔΟΣ"; btn.disabled = false;
                return; // Σταματάμε εδώ, δεν καλούμε το Stripe
            }
        }

        // ✅ FIX: Αυστηρός έλεγχος συνδρομής μέσω Sundromes.checkLogin
        // Αν δεν έχει συνδρομή, το checkLogin εμφανίζει Alert & Modal και επιστρέφει null.
        const data = await Sundromes.checkLogin(email);
        
        if (data) {
            adminUser = { email: email, displayName: name || "Admin" };
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
        
        btn.innerText = "ΕΙΣΟΔΟΣ"; btn.disabled = false;
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
    document.getElementById('pinModal').style.display = 'flex';
    if (data.hasPin) {
        currentPinMode = 'enter';
        document.getElementById('pinTitle').innerText = t('enter_pin') || "ΕΙΣΑΓΩΓΗ PIN";
        document.getElementById('pinSub').innerText = t('enter_your_pin') || "Βάλτε τον κωδικό σας";
        document.getElementById('btnForgot').style.display = 'block';
    } else {
        currentPinMode = 'create';
        document.getElementById('pinTitle').innerText = t('create_pin') || "ΔΗΜΙΟΥΡΓΙΑ PIN";
        document.getElementById('pinSub').innerText = t('set_new_pin') || "Ορίστε έναν νέο 4-ψήφιο κωδικό";
        document.getElementById('btnForgot').style.display = 'none';
    }
});

socket.on('pin-success', (data) => {
    const sessionData = { name: adminUser.displayName, store: adminUser.email, role: 'admin', email: adminUser.email, plan: adminPlan, features: adminUser.features };
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
    // 🔥 FIXED: Only run if Modal is OPEN (Admin Flow)
    if (document.getElementById('pinModal').style.display === 'flex' && currentPinMode === 'enter') {
        if (res.success) {
            const sessionData = { name: adminUser.displayName, store: adminUser.email, role: 'admin', email: adminUser.email, plan: adminPlan, features: adminUser.features };
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
            alert("Λάθος PIN!");
            PIN.clear();
        }
    }
});

onAuthStateChanged(auth, async (user) => {
    if (user && !localStorage.getItem('bellgo_session')) {
        document.getElementById('adminEmailInp').value = user.email;
    }
});

window.setLanguage = async (lang) => {
    localStorage.setItem('bellgo_lang', lang);
    try {
        const response = await fetch(`/i18n/${lang}.json`);
        translations = await response.json();
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (translations[key]) el.innerText = translations[key];
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (translations[key]) el.placeholder = translations[key];
        });
    } catch (error) { console.error(`Lang Error: ${lang}`, error); }
};