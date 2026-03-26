import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { firebaseConfig } from './config.js';
import { I18n } from './shared-utils.js'; // ✅ Import I18n for translations

export const Sundromes = {
    packages: [
        { 
            key: 'pack_chat', 
            name: '1. 💬 Chat & Κλήση Προσωπικού', 
            price: 4, 
            stripeId: 'ΕΔΩ_ΒΑΖΕΙΣ_ΤΟ_PRICE_BASIC', // π.χ. price_1Qxxxxxxxxxxxxxxxxxxx
            year: 1992,
            desc: 'Κλήση σε διανομέα ή σερβιτόρο και ομαδικό chat.',
            ui_ids: ['chatWrapper', 'staffContainer', 'btnFakeLock', 'btnSettings']
        },
        { 
            key: 'pack_manager', 
            name: '2. 👨‍🍳 Manager & Παραγγελιοληψία', 
            price: 10, 
            stripeId: 'ΕΔΩ_ΒΑΖΕΙΣ_ΤΟ_PRICE_PREMIUM', // π.χ. price_1Qxxxxxxxxxxxxxxxxxxx
            year: 1993,
            desc: 'Παραγγελιοληψία, Έξοδα, Στατιστικά (Tζίροι/Άτομο), Εκτυπωτές.',
            ui_ids: ['desktopArea', 'btnNewOrderSidebar', 'btnExpenses', 'btnMenuToggle', 'btnSettings', 'btnWallet', 'btnFakeLock', 'rowSwitchStaff', 'rowSwitchCust', 'rowStaffCharge', 'rowPrinterEnabled', 'btnSettingsStore', 'btnSettingsPrint', 'btnSettingsBot', 'rowTotalTables'] // ✅ Staff & Charge controlled here
        },
        { 
            key: 'pack_delivery', 
            name: '3. 🛵 Delivery QR & Κρατήσεις', 
            price: 15, 
            stripeId: 'ΕΔΩ_ΒΑΖΕΙΣ_ΤΟ_PRICE_DELIVERY', // π.χ. price_1Qxxxxxxxxxxxxxxxxxxx
            year: 1994,
            desc: 'QR για παραγγελίες delivery και διαχείριση κρατήσεων.',
            ui_ids: ['desktopArea', 'resWrapper', 'btnShowLink', 'btnSettings', 'btnFakeLock', 'btnSettingsQr', 'btnMenuToggle', 'btnSettingsStore', 'rowSwitchCust', 'secSchedule', 'btnSettingsPrint', 'rowPrinterEnabled', 'rowReservations', 'btnSettingsGeneral'] // ✅ Added btnSettingsGeneral for Stripe
        },
        { 
            key: 'pack_tables', 
            name: '4. 🍽️ Παραγγελία Τραπεζιού', 
            price: 15, 
            stripeId: 'ΕΔΩ_ΒΑΖΕΙΣ_ΤΟ_PRICE_TABLES', // π.χ. price_1Qxxxxxxxxxxxxxxxxxxx
            year: 1995,
            desc: 'Δυνατότητα παραγγελίας από τον πελάτη στο τραπέζι.',
            ui_ids: ['desktopArea', 'btnModeTable', 'btnSettings', 'btnFakeLock', 'btnSettingsQr', 'btnQrTables', 'btnMenuToggle', 'btnSettingsStore', 'btnSettingsGeneral'] // ✅ Added btnSettingsGeneral for Stripe
        },
        { 
            key: 'pack_pos', 
            name: '5. 💳 POS & E-Invoicing', 
            price: 20, 
            stripeId: 'ΕΔΩ_ΒΑΖΕΙΣ_ΤΟ_PRICE_POS', // π.χ. price_1Qxxxxxxxxxxxxxxxxxxx
            year: 1996,
            desc: 'Ηλ. Τιμολόγηση, Σύνδεση POS και SoftPOS στο κινητό.',
            ui_ids: ['desktopArea', 'btnCashRegister', 'softPosSettingsContainer', 'physicalPosSettingsContainer', 'btnSettings', 'btnFakeLock', 'btnSettingsGeneral', 'btnSettingsEinvoicing'] // ✅ Added physicalPosSettingsContainer
        },
        { 
            key: 'pack_loyalty', 
            name: '6. 🎁 Επιβράβευση (Loyalty)', 
            price: 5, 
            stripeId: 'ΕΔΩ_ΒΑΖΕΙΣ_ΤΟ_PRICE_LOYALTY', // π.χ. price_1Qxxxxxxxxxxxxxxxxxxx
            year: 1997,
            desc: 'QR επιβράβευσης σε κάθε απόδειξη.',
            ui_ids: ['btnManualReward', 'btnSettingsLoyalty', 'btnSettings', 'btnFakeLock', 'btnSettingsPrint', 'rowPrinterEnabled']
        }
    ],

    // ✅ Helper: Έλεγχος Πρόσβασης (Συνδρομή ή Hack Έτους)
    hasAccess: (user, key) => {
        if (!user) return false;

        // 0. Legacy Premium (Παλιοί χρήστες τα έχουν όλα)
        // if (user.plan === 'premium') return true; // ❌ DISABLED FOR TESTING (Βεβαιώσου ότι είναι σχολιασμένο)

        // 1. Πραγματική Συνδρομή (Stripe)
        if (user.features && user.features[key]) return true;

        // 2. Hack (Έτος στο Email)
        const storeEmail = user.store || user.email || "";
        const match = storeEmail.match(/(\d{4})(?:@|$)/);
        if (match) {
            const year = parseInt(match[1]);
            
            // ✅ 1998: Όλα ενεργά (Full Package)
            if (year === 1998) return true;

            // ✅ 1999: Όλα ενεργά ΕΚΤΟΣ από το POS (Πακέτο 5)
            if (year === 1999) return key !== 'pack_pos';

            const pkg = Sundromes.packages.find(p => p.key === key);
            // ✅ Strict Matching: Μόνο το πακέτο του έτους (Ανεξάρτητη λειτουργία)
            if (pkg && year === pkg.year) return true;
        }

        return false;
    },

    // ✅ NEW: Enforce Subscription Rules (Black Screen if none)
    checkSubscriptionAndEnforce: (user) => {
        const hasAny = Sundromes.packages.some(p => Sundromes.hasAccess(user, p.key));
        
        if (!hasAny) {
            document.body.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; background:#f4f6f8; color:#1f2937; font-family:sans-serif; text-align:center;">
                    <h1 style="color:red;">⛔ ${I18n.t('no_active_sub') || 'Καμία Ενεργή Συνδρομή'}</h1>
                    <p style="color:#6b7280;">${I18n.t('no_active_packages') || 'Ο λογαριασμός δεν έχει ενεργά πακέτα.'}</p>
                    <button onclick="Sundromes.openSubscriptionsModal('${user.store || user.email || ''}')" style="padding:15px 30px; background:#2196F3; color:white; border:none; border-radius:8px; font-size:18px; margin-top:20px; cursor:pointer; font-weight:bold;">💎 ${I18n.t('buy_subscription') || 'ΑΓΟΡΑ ΣΥΝΔΡΟΜΗΣ'}</button>
                    <button onclick="localStorage.removeItem('bellgo_session'); window.location.href='login.html'" style="padding:15px 30px; background:#ffffff; color:#1f2937; border:1px solid #d1d5db; border-radius:8px; font-size:18px; margin-top:20px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.05);">🚪 ${I18n.t('exit') || 'ΕΞΟΔΟΣ'}</button>
                </div>
            `;
            return false;
        }
        return true;
    },

    // ✅ NEW: Subscriptions Modal Logic (Moved from premium.js)
    openSubscriptionsModal: (emailArg = null) => {
        let modal = document.getElementById('subscriptionsModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'subscriptionsModal';
            modal.className = 'modal-overlay';
            // ✅ FIX: Inline styles to ensure it works in login.html without external CSS
            modal.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.4); backdrop-filter:blur(8px); z-index:10000; display:flex; align-items:center; justify-content:center;";
            
            modal.innerHTML = `
                <div class="modal-box" style="width:90%; max-width:400px; max-height:80vh; overflow-y:auto; background:#ffffff; padding:20px; border-radius:12px; border:1px solid #e5e7eb; text-align:center; box-shadow:0 10px 30px rgba(0,0,0,0.1); color:#1f2937;">
                    <h2 style="color:#10B981; text-align:center; margin-bottom:20px; margin-top:0;">💎 ${I18n.t('manage_subs') || 'Διαχείριση Συνδρομών'}</h2>
                    <div id="subsList" style="text-align:left;"></div>
                    <div style="text-align:right; font-size:18px; font-weight:bold; color:#10B981; margin-top:10px; border-top:1px solid #e5e7eb; padding-top:10px;">
                        ${I18n.t('total') || 'ΣΥΝΟΛΟ'}: <span id="subsTotal">0.00€</span> / ${I18n.t('month') || 'μήνα'}
                    </div>
                    <div style="margin-top:15px; text-align:left;">
                        <label style="color:#6b7280; font-size:12px; font-weight:bold;">${I18n.t('stripe_email') || 'Email Λογαριασμού (Stripe)'}</label>
                        <div style="display:flex; gap:5px;">
                            <input type="email" id="subsEmailInp" placeholder="example@email.com" style="flex:1; padding:10px; margin-top:5px; background:#f9fafb; border:1px solid #d1d5db; color:#1f2937; border-radius:6px; box-sizing:border-box; text-align:center;">
                            <button onclick="Sundromes.verifyGoogle()" title="Επαλήθευση με Google" style="margin-top:5px; background:#DB4437; color:white; border:none; border-radius:6px; padding:0 15px; cursor:pointer; font-weight:bold; font-size:14px;">G</button>
                        </div>
                    </div>
                    <div style="margin-top:20px; display:flex; flex-direction:column; gap:10px;">
                        <button onclick="Sundromes.proceedToLogin()" style="background:#2196F3; color:white; font-weight:bold; padding:12px; border:none; border-radius:8px; cursor:pointer; font-size:14px; width:100%; box-shadow:0 4px 10px rgba(33,150,243,0.3);">📧 ${I18n.t('email_login_buy') || 'ΕΙΣΟΔΟΣ EMAIL & ΑΓΟΡΑ'}</button>
                        <button onclick="document.getElementById('subscriptionsModal').style.display='none';" style="background:#f3f4f6; border:1px solid #d1d5db; color:#6b7280; padding:10px; border-radius:8px; cursor:pointer; width:100%; font-weight:bold;">${I18n.t('close') || 'ΚΛΕΙΣΙΜΟ'}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
        const list = document.getElementById('subsList');
        list.innerHTML = '';
        
        // ✅ Pre-fill Email if available
        let preFill = emailArg || document.getElementById('adminEmailInp')?.value.trim();
        if (!preFill && window.App && window.App.userData && window.App.userData.email) preFill = window.App.userData.email;
        const subsEmail = document.getElementById('subsEmailInp');
        if (subsEmail && preFill) subsEmail.value = preFill;

        window.App.tempFeatures = { ...window.App.features };
        Sundromes.packages.forEach((feat) => {
            const isActive = window.App.tempFeatures[feat.key];
            const isDisabled = feat.key === 'pack_pos'; // ✅ Απενεργοποίηση Πακέτου 5
            const row = document.createElement('div');            
            row.style.cssText = `display:flex; justify-content:space-between; align-items:center; padding:15px; background:${isDisabled ? '#e5e7eb' : '#f9fafb'}; margin-bottom:10px; border-radius:8px; border:1px solid #d1d5db; opacity:${isDisabled ? '0.5' : '1'}; cursor:${isDisabled ? 'not-allowed' : 'default'};`;
            row.innerHTML = `<div><div style="color:#1f2937; font-weight:bold; font-size:16px;">${feat.name}</div><div style="color:#6b7280; font-size:12px;">${feat.desc}</div></div><label class="switch"><input type="checkbox" ${isActive ? 'checked' : ''} ${isDisabled ? 'disabled' : ''} onchange="window.App.tempFeatures['${feat.key}'] = this.checked; Sundromes.calcTotal();" ${isDisabled ? 'title="Coming Soon"' : ''}><span class="slider round"></span></label>`;
            list.appendChild(row);
        });
        Sundromes.calcTotal(); // ✅ Calculate initial total
        modal.style.display = 'flex';
    },

    calcTotal: () => {
        let total = 0;
        Sundromes.packages.forEach(p => {
            if (window.App.tempFeatures[p.key]) total += p.price;
        });
        const el = document.getElementById('subsTotal');
        if(el) el.innerText = total.toFixed(2) + '€';
    },
    verifyGoogle: async () => {
        try {
            let app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
            const auth = getAuth(app);
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            const user = result.user;
            if (user && user.email) {
                const inp = document.getElementById('subsEmailInp');
                if (inp) {
                    inp.value = user.email;
                    inp.style.border = "1px solid #00E676"; // Green border
                    alert(`✅ ${I18n.t('verify_success') || 'Επιτυχής επαλήθευση'}: ${user.email}`);
                }
            }
        } catch (error) {
            alert((I18n.t('google_verify_error') || "Σφάλμα επαλήθευσης Google: ") + error.message);
        }
    },
    proceedToLogin: async () => {
        // 1. Collect Selected Features
        const selectedPriceIds = [];
        if (window.App.tempFeatures) {
            for (const [key, active] of Object.entries(window.App.tempFeatures)) {
                if (active) {
                    const pkg = Sundromes.packages.find(p => p.key === key);
                    if (pkg && pkg.stripeId) selectedPriceIds.push(pkg.stripeId);
                }
            }
        }

        if (selectedPriceIds.length === 0) {
            return alert(I18n.t('select_package_alert') || "Παρακαλώ επιλέξτε τουλάχιστον ένα πακέτο για αγορά.");
        }

        // 2. Get Email (From Input or Prompt)
        const emailInp = document.getElementById('subsEmailInp');
        let email = emailInp?.value.trim();

        if (!email) {
            alert(I18n.t('enter_email_buy_alert') || "Παρακαλώ συμπληρώστε το Email σας για την αγορά.");
            if(emailInp) { emailInp.style.border = "1px solid red"; emailInp.focus(); }
            return;
        }
        
        // 3. Redirect to Stripe
        try {
            const forceLive = localStorage.getItem('use_live_backend') === 'true';
            const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.') || window.location.hostname.startsWith('10.');
            const baseUrl = (isLocal && !forceLive) ? "" : "https://bellgo-final.onrender.com";

            const res = await fetch(`${baseUrl}/create-checkout-session`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ email: email, priceIds: selectedPriceIds, isNative: !!window.Capacitor })
            });
            const data = await res.json();
            if(data.url) window.location.href = data.url;
            else alert((I18n.t('error') || "Σφάλμα: ") + (data.error || "Άγνωστο"));
        } catch(e) {
            alert(I18n.t('connection_error') || "Σφάλμα σύνδεσης.");
        }
    },

    // ✅ NEW: Login Check (Existence & Subscription)
    checkLogin: async (email) => {
        if (!email) { alert(I18n.t('enter_email_alert') || "Παρακαλώ εισάγετε Email."); return null; }
        try {
            const forceLive = localStorage.getItem('use_live_backend') === 'true';
            const isLocal = window.location.hostname !== 'bellgo-final.onrender.com';
            const baseUrl = (isLocal && !forceLive) ? "" : "https://bellgo-final.onrender.com";

            const res = await fetch(`${baseUrl}/check-subscription`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ email: email })
            });
            const data = await res.json();
            
            if (data.active) {
                return data; // Success: Επιστρέφει τα δεδομένα για login
            } else {
                // ✅ FIX: Είτε υπάρχει το email είτε όχι, αν δεν είναι active, ανοίγουμε τις συνδρομές
                if (data.status === 'past_due' || data.status === 'unpaid') {
                    alert(I18n.t('sub_past_due') || "⚠️ Η συνδρομή σας είναι ληξιπρόθεσμη (Αποτυχία Πληρωμής).\nΠαρακαλώ τακτοποιήστε την οφειλή για να συνεχίσετε.");
                } else {
                    alert(I18n.t('no_active_sub_alert') || "Δεν βρέθηκε ενεργή συνδρομή.");
                }
                Sundromes.openSubscriptionsModal(email);
                return null;
            }
        } catch (e) { console.error(e); alert(I18n.t('connection_error') || "Σφάλμα σύνδεσης."); return null; }
    }
};
window.Sundromes = Sundromes;