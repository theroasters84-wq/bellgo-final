export const Sundromes = {
    packages: [
        { 
            key: 'pack_chat', 
            name: '1. 💬 Chat & Κλήση Προσωπικού', 
            price: 4, 
            year: 1992,
            desc: 'Κλήση σε διανομέα ή σερβιτόρο και ομαδικό chat.',
            ui_ids: ['chatWrapper', 'staffContainer', 'btnFakeLock', 'btnSettings']
        },
        { 
            key: 'pack_manager', 
            name: '2. 👨‍🍳 Manager & Παραγγελιοληψία', 
            price: 10, 
            year: 1993,
            desc: 'Παραγγελιοληψία, Έξοδα, Στατιστικά (Tζίροι/Άτομο), Εκτυπωτές.',
            ui_ids: ['desktopArea', 'btnNewOrderSidebar', 'btnExpenses', 'btnMenuToggle', 'btnSettings', 'btnWallet', 'btnFakeLock', 'rowSwitchStaff', 'rowStaffCharge', 'rowPrinterEnabled', 'btnSettingsStore', 'btnSettingsPrint', 'btnSettingsBot', 'rowTotalTables'] // ✅ Staff & Charge controlled here
        },
        { 
            key: 'pack_delivery', 
            name: '3. 🛵 Delivery QR & Κρατήσεις', 
            price: 15, 
            year: 1994,
            desc: 'QR για παραγγελίες delivery και διαχείριση κρατήσεων.',
            ui_ids: ['desktopArea', 'btnNewOrderSidebar', 'resWrapper', 'btnShowLink', 'btnSettings', 'btnFakeLock', 'btnSettingsQr', 'btnMenuToggle', 'btnSettingsStore', 'rowSwitchCust', 'secSchedule', 'btnSettingsPrint', 'rowPrinterEnabled', 'rowReservations'] // ✅ Added Printer Settings & Reservations
        },
        { 
            key: 'pack_tables', 
            name: '4. 🍽️ Παραγγελία Τραπεζιού', 
            price: 15, 
            year: 1995,
            desc: 'Δυνατότητα παραγγελίας από τον πελάτη στο τραπέζι.',
            ui_ids: ['desktopArea', 'btnModeTable', 'btnSettings', 'btnFakeLock', 'btnSettingsQr', 'btnQrTables']
        },
        { 
            key: 'pack_pos', 
            name: '5. 💳 POS & E-Invoicing', 
            price: 20, 
            year: 1996,
            desc: 'Ηλ. Τιμολόγηση, Σύνδεση POS και SoftPOS στο κινητό.',
            ui_ids: ['desktopArea', 'btnCashRegister', 'softPosSettingsContainer', 'physicalPosSettingsContainer', 'btnSettings', 'btnWallet', 'btnFakeLock', 'btnSettingsGeneral', 'btnSettingsEinvoicing'] // ✅ Added physicalPosSettingsContainer
        },
        { 
            key: 'pack_loyalty', 
            name: '6. 🎁 Επιβράβευση (Loyalty)', 
            price: 5, 
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
        const match = storeEmail.match(/(\d{4})$/);
        if (match) {
            const year = parseInt(match[1]);
            
            // ✅ 1998: Όλα ενεργά (Full Package)
            if (year === 1998) return true;

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
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; background:black; color:white; font-family:sans-serif; text-align:center;">
                    <h1 style="color:red;">⛔ Καμία Ενεργή Συνδρομή</h1>
                    <p style="color:#ccc;">Ο λογαριασμός δεν έχει ενεργά πακέτα.</p>
                    <button onclick="localStorage.removeItem('bellgo_session'); window.location.href='login.html'" style="padding:15px 30px; background:#333; color:white; border:1px solid #555; border-radius:8px; font-size:18px; margin-top:20px; cursor:pointer;">🚪 ΕΞΟΔΟΣ</button>
                </div>
            `;
            return false;
        }
        return true;
    },

    // ✅ NEW: Subscriptions Modal Logic (Moved from premium.js)
    openSubscriptionsModal: () => {
        let modal = document.getElementById('subscriptionsModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'subscriptionsModal';
            modal.className = 'modal-overlay';
            // ✅ FIX: Inline styles to ensure it works in login.html without external CSS
            modal.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.95); z-index:10000; display:flex; align-items:center; justify-content:center;";
            
            modal.innerHTML = `
                <div class="modal-box" style="width:90%; max-width:400px; max-height:80vh; overflow-y:auto; background:#1e1e1e; padding:20px; border-radius:12px; border:1px solid #333; text-align:center;">
                    <h2 style="color:#FFD700; text-align:center; margin-bottom:20px; margin-top:0;">💎 Διαχείριση Συνδρομών</h2>
                    <div id="subsList" style="text-align:left;"></div>
                    <div style="text-align:right; font-size:18px; font-weight:bold; color:#00E676; margin-top:10px; border-top:1px solid #333; padding-top:10px;">
                        ΣΥΝΟΛΟ: <span id="subsTotal">0.00€</span> / μήνα
                    </div>
                    <div style="margin-top:20px; display:flex; flex-direction:column; gap:10px;">
                        <button onclick="Sundromes.proceedToLogin()" style="background:#2196F3; color:white; font-weight:bold; padding:12px; border:none; border-radius:8px; cursor:pointer; font-size:14px; width:100%;">📧 ΕΙΣΟΔΟΣ EMAIL & ΑΓΟΡΑ</button>
                        <button onclick="document.getElementById('subscriptionsModal').style.display='none';" style="background:transparent; border:1px solid #555; color:#aaa; padding:10px; border-radius:8px; cursor:pointer; width:100%;">ΚΛΕΙΣΙΜΟ</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
        const list = document.getElementById('subsList');
        list.innerHTML = '';
        window.App.tempFeatures = { ...window.App.features };
        Sundromes.packages.forEach((feat) => {
            const isActive = window.App.tempFeatures[feat.key];
            const row = document.createElement('div');
            row.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:15px; background:#2a2a2a; margin-bottom:10px; border-radius:8px; border:1px solid #444;";
            row.innerHTML = `<div><div style="color:white; font-weight:bold; font-size:16px;">${feat.name}</div><div style="color:#aaa; font-size:12px;">${feat.desc}</div></div><label class="switch"><input type="checkbox" ${isActive ? 'checked' : ''} onchange="window.App.tempFeatures['${feat.key}'] = this.checked; Sundromes.calcTotal();"><span class="slider round"></span></label>`;
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
    proceedToLogin: async () => {
        // 1. Collect Selected Features
        const selectedFeatures = [];
        if (window.App.tempFeatures) {
            for (const [key, active] of Object.entries(window.App.tempFeatures)) {
                if (active) selectedFeatures.push(key);
            }
        }

        if (selectedFeatures.length === 0) {
            return alert("Παρακαλώ επιλέξτε τουλάχιστον ένα πακέτο.");
        }

        // 2. Get Email (From Input or Prompt)
        let email = document.getElementById('adminEmailInp')?.value.trim();
        if (!email) {
            email = prompt("Παρακαλώ εισάγετε το Email σας για την αγορά:");
        }
        if (!email) return;
        
        // 3. Redirect to Stripe
        try {
            const res = await fetch('/create-checkout-session', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ email: email, features: selectedFeatures, isNative: !!window.Capacitor })
            });
            const data = await res.json();
            if(data.url) window.location.href = data.url;
            else alert("Σφάλμα: " + (data.error || "Άγνωστο"));
        } catch(e) {
            alert("Σφάλμα σύνδεσης.");
        }
    }
};
window.Sundromes = Sundromes;