export const Apodiksh = {
    // ✅ URLs Παρόχων για εγγραφή
    providerUrls: {
        'epsilon': 'https://myaccount.epsilonnet.gr/registration', // Ή η σελίδα του Epsilon Smart
        'softone': 'https://www.softone.gr/cloud-services/',
        'aade': 'https://www.aade.gr/mydata'
    },

    init: async () => {
        // 1. Φόρτωση του HTML αρχείου δυναμικά
        try {
            const res = await fetch('apodiksh.html');
            if (res.ok) {
                const html = await res.text();
                document.body.insertAdjacentHTML('beforeend', html);
                console.log("✅ E-Invoicing Module Loaded");
            }
        } catch (e) { console.error("Failed to load apodiksh.html", e); }
        
        // 2. Ακρόαση για ρυθμίσεις από τον Server (για να γεμίσουν τα πεδία)
        if (window.socket) {
            window.socket.on('store-settings-update', (settings) => {
                if (settings.einvoicing) {
                    const e = settings.einvoicing;
                    const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val || ''; };
                    
                    setVal('inpEinvProvider', e.provider);
                    setVal('inpEinvApiKey', e.apiKey);
                    setVal('inpEinvUserId', e.userId);
                    setVal('inpEinvDomain', e.domain);
                    
                    const sw = document.getElementById('switchEinvEnabled');
                    if(sw) sw.checked = e.enabled || false;
                    
                    Apodiksh.updateProviderInfo(); // ✅ Ενημέρωση κουμπιού κατά τη φόρτωση
                }
            });
        }
    },

    openSettings: () => {
        document.getElementById('settingsModal').style.display = 'none';
        document.getElementById('einvoicingModal').style.display = 'flex';
    },

    closeSettings: () => {
        document.getElementById('einvoicingModal').style.display = 'none';
        document.getElementById('settingsModal').style.display = 'flex';
    },

    // ✅ NEW: Εμφάνιση κουμπιού εγγραφής ανάλογα με την επιλογή
    updateProviderInfo: () => {
        const provider = document.getElementById('inpEinvProvider').value;
        const btn = document.getElementById('btnProviderRegister');
        
        if (provider && Apodiksh.providerUrls[provider]) {
            btn.style.display = 'block';
        } else {
            btn.style.display = 'none';
        }
    },

    openProviderPage: () => {
        const provider = document.getElementById('inpEinvProvider').value;
        const url = Apodiksh.providerUrls[provider];
        if(url) window.open(url, '_blank');
    },

    saveSettings: () => {
        const getVal = (id) => document.getElementById(id).value.trim();
        const data = {
            provider: getVal('inpEinvProvider'),
            apiKey: getVal('inpEinvApiKey'),
            userId: getVal('inpEinvUserId'),
            domain: getVal('inpEinvDomain'),
            enabled: document.getElementById('switchEinvEnabled').checked
        };
        
        window.socket.emit('save-store-settings', { einvoicing: data });
        Apodiksh.closeSettings();
        alert("Οι ρυθμίσεις E-Invoicing αποθηκεύτηκαν!");
    }
};

// Auto-init & Expose Global
Apodiksh.init();
window.Apodiksh = Apodiksh;