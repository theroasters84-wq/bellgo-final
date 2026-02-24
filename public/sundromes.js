export const Sundromes = {
    packages: [
        { 
            key: 'pack_chat', 
            name: '💬 Chat & Κλήση Προσωπικού', 
            price: 5, 
            year: 1992,
            desc: 'Κλήση σε διανομέα ή σερβιτόρο και ομαδικό chat.'
        },
        { 
            key: 'pack_manager', 
            name: '👨‍🍳 Manager & Παραγγελιοληψία', 
            price: 15, 
            year: 1993,
            desc: 'Παραγγελιοληψία, Έξοδα, Στατιστικά (Tζίροι/Άτομο), Εκτυπωτές.'
        },
        { 
            key: 'pack_delivery', 
            name: '🛵 Delivery QR & Κρατήσεις', 
            price: 15, 
            year: 1994,
            desc: 'QR για παραγγελίες delivery και διαχείριση κρατήσεων.'
        },
        { 
            key: 'pack_tables', 
            name: '🍽️ Παραγγελία Τραπεζιού', 
            price: 15, 
            year: 1995,
            desc: 'Δυνατότητα παραγγελίας από τον πελάτη στο τραπέζι.'
        },
        { 
            key: 'pack_pos', 
            name: '💳 POS & E-Invoicing', 
            price: 20, 
            year: 1996,
            desc: 'Ηλ. Τιμολόγηση, Σύνδεση POS και SoftPOS στο κινητό.'
        },
        { 
            key: 'pack_loyalty', 
            name: '🎁 Επιβράβευση (Loyalty)', 
            price: 5, 
            year: 1997,
            desc: 'QR επιβράβευσης σε κάθε απόδειξη.'
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
            const pkg = Sundromes.packages.find(p => p.key === key);
            if (pkg && year >= pkg.year) return true;
        }

        return false;
    }
};