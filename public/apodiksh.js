export const Apodiksh = {
    // ✅ URLs Παρόχων για εγγραφή
    providerUrls: {
        'epsilon': 'https://myaccount.epsilonnet.gr/registration', // Ή η σελίδα του Epsilon Smart
        'softone': 'https://www.softone.gr/cloud-services/',
        'aade': 'https://www.aade.gr/mydata'
    },

    cashRegButtons: [], // ✅ Local state for buttons
    settingsCache: null, // ✅ NEW: Cache settings to avoid race conditions

    init: async () => {
        // ✅ FIX: Register Listener IMMEDIATELY (Before Fetch)
        if (window.socket) {
            window.socket.on('store-settings-update', (settings) => {
                Apodiksh.settingsCache = settings; // Save to cache
                Apodiksh.populateUI(); // Try to update UI if ready
            });
        }

        // 1. Φόρτωση του HTML αρχείου δυναμικά
        try {
            const res = await fetch('apodiksh.html');
            if (res.ok) {
                const html = await res.text();
                document.body.insertAdjacentHTML('beforeend', html);
                console.log("✅ E-Invoicing Module Loaded");
                Apodiksh.populateUI(); // ✅ Update UI once HTML is loaded
            }
        } catch (e) { console.error("Failed to load apodiksh.html", e); }
    },

    // ✅ NEW: Separate Populate Function
    populateUI: () => {
        const settings = Apodiksh.settingsCache;
        if (!settings || !document.getElementById('inpEinvProvider')) return; // Wait for HTML & Data

        if (settings.einvoicing) {
            const e = settings.einvoicing;
            const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val || ''; };
            
            setVal('inpEinvProvider', e.provider);
            setVal('inpEinvApiKey', e.apiKey);
            setVal('inpEinvUserId', e.userId);
            setVal('inpEinvDomain', e.domain);
            
            const sw = document.getElementById('switchEinvEnabled');
            if(sw) sw.checked = e.enabled || false;
            
            Apodiksh.updateProviderInfo();
        }

        // ✅ Load Buttons (Always load, even if einvoicing is empty/new)
        Apodiksh.cashRegButtons = settings.cashRegButtons || [];
        Apodiksh.renderCashRegButtons();
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
        const inpDomain = document.getElementById('inpEinvDomain'); // ✅ Get domain input
        
        if (provider && Apodiksh.providerUrls[provider]) {
            btn.style.display = 'block';
            
            // ✅ NEW: Auto-hint for Domain based on provider
            if (provider === 'epsilon') {
                inpDomain.placeholder = "Π.χ. https://api.epsilonnet.gr (Κενό για Default)";
            } else if (provider === 'softone') {
                inpDomain.placeholder = "Π.χ. https://s1.cloud.gr/s1services";
            }
        } else {
            btn.style.display = 'none';
            inpDomain.placeholder = "Domain / URL (Optional)";
        }
    },

    openProviderPage: () => {
        const provider = document.getElementById('inpEinvProvider').value;
        const url = Apodiksh.providerUrls[provider];
        if(url) window.open(url, '_blank');
    },

    // ✅ NEW: Button Management Logic
    renderCashRegButtons: () => {
        const list = document.getElementById('cashRegButtonsList');
        if(!list) return;
        list.innerHTML = '';
        Apodiksh.cashRegButtons.forEach((btn, idx) => {
            const div = document.createElement('div');
            div.style.cssText = "display:flex; justify-content:space-between; align-items:center; background:#333; padding:5px; margin-bottom:2px; border-radius:3px; font-size:12px;";
            div.innerHTML = `
                <span>${btn.label} (${btn.vat}%) ${btn.price ? `- ${btn.price}€` : ''}</span>
                <button onclick="Apodiksh.removeCashRegButton(${idx})" style="background:#D32F2F; color:white; border:none; cursor:pointer; padding:2px 6px; border-radius:3px;">X</button>
            `;
            list.appendChild(div);
        });
    },

    addCashRegButton: () => {
        const label = document.getElementById('inpCrLabel').value.trim();
        const vat = parseInt(document.getElementById('inpCrVat').value);
        const price = parseFloat(document.getElementById('inpCrPrice').value) || null;

        if(!label || isNaN(vat)) return alert("Συμπληρώστε Όνομα και ΦΠΑ.");
        Apodiksh.cashRegButtons.push({ label, vat, price });
        Apodiksh.renderCashRegButtons();
        
        document.getElementById('inpCrLabel').value = '';
        document.getElementById('inpCrVat').value = '';
        document.getElementById('inpCrPrice').value = '';
    },

    removeCashRegButton: (idx) => {
        Apodiksh.cashRegButtons.splice(idx, 1);
        Apodiksh.renderCashRegButtons();
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
        
        window.socket.emit('save-store-settings', { einvoicing: data, cashRegButtons: Apodiksh.cashRegButtons });
        Apodiksh.closeSettings();
        alert("Οι ρυθμίσεις E-Invoicing αποθηκεύτηκαν!");
    }
};

// Auto-init & Expose Global
Apodiksh.init();
window.Apodiksh = Apodiksh;