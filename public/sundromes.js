export const Sundromes = {
    packages: [
        { 
            key: 'pack_chat', 
            name: '1. 💬 Chat & Κλήση Προσωπικού', 
            price: 5, 
            year: 1992,
            desc: 'Κλήση σε διανομέα ή σερβιτόρο και ομαδικό chat.',
            ui_ids: ['chatWrapper', 'staffContainer', 'btnFakeLock']
        },
        { 
            key: 'pack_manager', 
            name: '2. 👨‍🍳 Manager & Παραγγελιοληψία', 
            price: 15, 
            year: 1993,
            desc: 'Παραγγελιοληψία, Έξοδα, Στατιστικά (Tζίροι/Άτομο), Εκτυπωτές.',
            ui_ids: ['btnNewOrderSidebar', 'btnExpenses', 'btnMenuToggle', 'btnSettings', 'btnWallet', 'btnFakeLock', 'rowStaffCharge', 'rowPrinterEnabled']
        },
        { 
            key: 'pack_delivery', 
            name: '3. 🛵 Delivery QR & Κρατήσεις', 
            price: 15, 
            year: 1994,
            desc: 'QR για παραγγελίες delivery και διαχείριση κρατήσεων.',
            ui_ids: ['resWrapper', 'btnShowLink', 'btnSettings', 'btnWallet', 'btnFakeLock']
        },
        { 
            key: 'pack_tables', 
            name: '4. 🍽️ Παραγγελία Τραπεζιού', 
            price: 15, 
            year: 1995,
            desc: 'Δυνατότητα παραγγελίας από τον πελάτη στο τραπέζι.',
            ui_ids: ['btnModeTable', 'btnSettings', 'btnWallet', 'btnFakeLock']
        },
        { 
            key: 'pack_pos', 
            name: '5. 💳 POS & E-Invoicing', 
            price: 20, 
            year: 1996,
            desc: 'Ηλ. Τιμολόγηση, Σύνδεση POS και SoftPOS στο κινητό.',
            ui_ids: ['btnCashRegister', 'softPosSettingsContainer', 'btnSettings', 'btnWallet', 'btnFakeLock']
        },
        { 
            key: 'pack_loyalty', 
            name: '6. 🎁 Επιβράβευση (Loyalty)', 
            price: 5, 
            year: 1997,
            desc: 'QR επιβράβευσης σε κάθε απόδειξη.',
            ui_ids: ['rewardSettingsContainer', 'btnSettings', 'btnWallet', 'btnFakeLock']
        }
    ],

    // ✅ Helper: Έλεγχος Πρόσβασης (Συνδρομή ή Hack Έτους)
    hasAccess: (user, key) => {
        if (!user) return false;

        // 0. Legacy Premium (Παλιοί χρήστες τα έχουν όλα)
        if (user.plan === 'premium') return true;

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
    }
};