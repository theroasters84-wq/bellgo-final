export const Apodiksh = {
    // ✅ URLs Παρόχων για εγγραφή
    providerUrls: {
        'epsilon': 'https://myaccount.epsilonnet.gr/registration', // Ή η σελίδα του Epsilon Smart
        'softone': 'https://www.softone.gr/cloud-services/',
        'aade': 'https://www.aade.gr/mydata'
    },

    cashRegButtons: [], // ✅ Local state for buttons
    cashRegValue: "0", // ✅ NEW: Moved from App
    cashRegItems: [], // ✅ NEW: Moved from App
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
        const inpProv = document.getElementById('inpEinvProvider');
        if (!inpProv) return; // ✅ Safe exit
        
        const provider = inpProv.value;
        const btn = document.getElementById('btnProviderRegister');
        const inpDomain = document.getElementById('inpEinvDomain'); // ✅ Get domain input
        
        if (provider && Apodiksh.providerUrls[provider]) {
            if (btn) btn.style.display = 'block';
            
            // ✅ NEW: Auto-hint for Domain based on provider
            if (provider === 'epsilon' && inpDomain) {
                inpDomain.placeholder = "Π.χ. https://api.epsilonnet.gr (Κενό για Default)";
            } else if (provider === 'softone' && inpDomain) {
                inpDomain.placeholder = "Π.χ. https://s1.cloud.gr/s1services";
            }
        } else {
            if (btn) btn.style.display = 'none';
            if (inpDomain) inpDomain.placeholder = "Domain / URL (Optional)";
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
            div.style.cssText = "display:flex; justify-content:space-between; align-items:center; background:#f9fafb; color:#1f2937; border:1px solid #e5e7eb; padding:8px; margin-bottom:5px; border-radius:6px; font-size:13px; font-weight:500;";
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
        const isEnabled = document.getElementById('switchEinvEnabled').checked;

        const data = {
            provider: getVal('inpEinvProvider'),
            apiKey: getVal('inpEinvApiKey'),
            userId: getVal('inpEinvUserId'),
            domain: getVal('inpEinvDomain'),
            enabled: isEnabled
        };
        
        // ✅ Validation: Check required fields if enabled
        if (isEnabled && (!data.provider || !data.apiKey || !data.userId)) {
            return alert("Για ενεργοποίηση, πρέπει να συμπληρώσετε Πάροχο, API Key και User ID.");
        }

        window.socket.emit('save-store-settings', { einvoicing: data, cashRegButtons: Apodiksh.cashRegButtons });
        Apodiksh.closeSettings();
        alert("Οι ρυθμίσεις E-Invoicing αποθηκεύτηκαν!");
    },

    // ✅ NEW: CASH REGISTER LOGIC (Moved from premium.js)
    openCashRegister: () => {
        // ✅ Check if E-Invoicing is configured
        if (window.App && !window.App.einvoicingEnabled) {
            return alert("⚠️ Η Ταμειακή δεν είναι ενεργή!\n\nΠηγαίνετε: Ρυθμίσεις ⚙️ > E-Invoicing\nκαι συμπληρώστε Πάροχο & Στοιχεία.");
        }
        Apodiksh.cashRegValue = "0";
        Apodiksh.cashRegItems = [];
        Apodiksh.updateCashRegUI();
        Apodiksh.renderCashRegButtonsUI();
        document.getElementById('cashRegisterModal').style.display = 'flex';

        const isSoftPos = window.App && window.App.softPosSettings && window.App.softPosSettings.enabled;
        const hasPhysicalPos = window.App && window.App.posSettings && window.App.posSettings.provider && window.App.posSettings.id;
        const btnSP = document.getElementById('btnCashRegSoftPos');
        if (btnSP) btnSP.style.display = isSoftPos ? 'block' : 'none';
        
        const btnRegPos = document.getElementById('btnCashRegPos');
        if (btnRegPos) {
            if (hasPhysicalPos) { btnRegPos.style.display = 'block'; btnRegPos.innerText = '💳 POS'; }
            else if (!isSoftPos) { btnRegPos.style.display = 'block'; btnRegPos.innerText = '💳 ΚΑΡΤΑ'; }
            else { btnRegPos.style.display = 'none'; }
        }
    },

    cashRegInput: (val) => {
        if (Apodiksh.cashRegValue === "0" && val !== ".") Apodiksh.cashRegValue = val;
        else Apodiksh.cashRegValue += val;
        Apodiksh.updateCashRegUI();
    },

    cashRegClear: () => {
        if (Apodiksh.cashRegValue === "0") Apodiksh.cashRegItems = [];
        else Apodiksh.cashRegValue = "0";
        Apodiksh.updateCashRegUI();
    },

    renderCashRegButtonsUI: () => {
        const container = document.getElementById('cashRegButtonsContainer');
        container.innerHTML = '';
        const buttons = (Apodiksh.cashRegButtons && Apodiksh.cashRegButtons.length > 0) 
            ? Apodiksh.cashRegButtons 
            : [{label:'ΦΑΓΗΤΟ', vat:13}, {label:'ΠΟΤΟ', vat:24}, {label:'ΕΙΔΗ', vat:24}];

        buttons.forEach(btn => {
            const el = document.createElement('button');
            el.className = 'modal-btn';
            el.style.cssText = "background:#f9fafb; color:#1f2937; border:1px solid #e5e7eb; font-size:14px; margin:0; font-weight:bold; height:50px; border-radius:8px;";
            el.innerText = `${btn.label}\n${btn.vat}%${btn.price ? ` (${btn.price}€)` : ''}`;
            el.onclick = () => Apodiksh.cashRegAddItem(btn);
            container.appendChild(el);
        });
    },

    cashRegAddItem: (btn) => {
        let amount = (btn.price && btn.price > 0) ? btn.price : parseFloat(Apodiksh.cashRegValue);
        if (isNaN(amount) || amount <= 0) return;
        Apodiksh.cashRegItems.push({ name: btn.label, price: amount, vat: btn.vat });
        Apodiksh.cashRegValue = "0";
        Apodiksh.updateCashRegUI();
    },

    updateCashRegUI: () => {
        document.getElementById('cashRegScreen').innerText = Apodiksh.cashRegValue;
        const listEl = document.getElementById('cashRegList');
        listEl.innerHTML = '';
        let total = 0;
        Apodiksh.cashRegItems.forEach(item => {
            total += item.price;
            const div = document.createElement('div');
            div.innerText = `${item.name}: ${item.price.toFixed(2)}€`;
            listEl.appendChild(div);
        });
        document.getElementById('cashRegTotal').innerText = `ΣΥΝΟΛΟ: ${total.toFixed(2)}€`;
    },

    cashRegPay: (method) => {
        let total = Apodiksh.cashRegItems.reduce((sum, item) => sum + item.price, 0);
        if (total === 0) return alert("⚠️ Πρέπει να επιλέξετε Τμήμα/ΦΠΑ!");

        if (method === 'softpos' && window.PaySystem) {
             if (window.App && window.App.softPosSettings && window.App.softPosSettings.enabled) {
                 window.PaySystem.triggerSoftPosPayment(total, 'cashreg');
                 return;
             }
        }
        Apodiksh.finalizeCashRegOrder(total, method === 'card' ? '💳 ΚΑΡΤΑ' : '💵 ΜΕΤΡΗΤΑ');
    },

    finalizeCashRegOrder: (total, methodLabel) => {
        let orderText = `[ΤΑΜΕΙΑΚΗ 📠]\n${methodLabel}\n---\n`;
        Apodiksh.cashRegItems.forEach(item => orderText += `${item.name}: ${item.price.toFixed(2)}\n`);
        orderText += `✅ PAID`;
        window.socket.emit('quick-order', { text: orderText, total: total, method: methodLabel.includes('ΚΑΡΤΑ') ? 'card' : 'cash', issueReceipt: true, source: 'Admin (Ταμείο)' });
        document.getElementById('cashRegisterModal').style.display = 'none';
    },

    // --- RECEIPT LOGIC ---
    issueReceipt: (id) => {
        const order = window.App.activeOrders.find(o => o.id == id);
        if(order && order.text.includes('[🧾 ΑΠΟΔΕΙΞΗ]')) return alert("Η απόδειξη έχει ήδη εκδοθεί!");
        if(confirm("Έκδοση απόδειξης (myDATA);")) { window.socket.emit('issue-receipt', id); }
    },

    showReceiptDialog: (id, method = 'cash') => {
        const div = document.createElement('div');
        div.className = 'modal-overlay';
        div.style.display = 'flex'; div.style.zIndex = '10000';
        div.innerHTML = `<div class="modal-box" style="text-align:center; max-width:350px;"><h3 style="color:#FFD700;">Κλείσιμο Παραγγελίας</h3><p style="color:#ccc;">Δεν έχει εκδοθεί απόδειξη. Τι θέλετε να κάνετε;</p><button class="modal-btn" style="background:#00E676; color:black;" onclick="Apodiksh.issueAndClose(${id}, '${method}', this)">🧾 ΕΚΔΟΣΗ & ΚΛΕΙΣΙΜΟ</button><button class="modal-btn" style="background:#2196F3; color:white;" onclick="App.forceCompleteOrder(${id}, '${method}'); this.closest('.modal-overlay').remove();">🚪 ΜΟΝΟ ΚΛΕΙΣΙΜΟ</button><button class="modal-btn" style="background:#555;" onclick="this.closest('.modal-overlay').remove()">ΑΚΥΡΟ</button></div>`;
        document.body.appendChild(div);
    },

    issueAndClose: (id, method, btn) => {
        window.socket.emit('issue-receipt', id);
        btn.innerText = "⏳ ΕΚΔΟΣΗ...";
        setTimeout(() => { window.App.forceCompleteOrder(id, method); btn.closest('.modal-overlay').remove(); }, 1000);
    },
};

// Auto-init & Expose Global
Apodiksh.init();
window.Apodiksh = Apodiksh;