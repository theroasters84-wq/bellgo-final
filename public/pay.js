/* -----------------------------------------------------------
   PAY.JS - LOGIC FOR STAFF WALLETS & CHARGES
----------------------------------------------------------- */

export const PaySystem = {
    wallets: {},

    init: () => {
        // Αν το socket δεν είναι έτοιμο, δοκίμασε ξανά σε λίγο
        if(!window.socket) {
            setTimeout(PaySystem.init, 500);
            return;
        }

        window.socket.on('wallet-update', (data) => {
            PaySystem.wallets = data;
            PaySystem.renderWalletUI();
        });
        // Request initial data
        window.socket.emit('get-wallet-data');
    },

    openWalletModal: () => {
        document.getElementById('walletModal').style.display = 'flex';
        PaySystem.renderWalletUI();
    },

    renderWalletUI: () => {
        const container = document.getElementById('walletList');
        if(!container) return;
        container.innerHTML = '';

        let totalCash = 0;
        let totalCard = 0;

        // 1. Render Staff/Admin Wallets (Cash Debt)
        Object.entries(PaySystem.wallets).forEach(([name, amount]) => {
            if (name === 'BANK_CARD') {
                totalCard = amount;
                return;
            }
            totalCash += amount;

            const row = document.createElement('div');
            row.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #333; background:#222; margin-bottom:5px; border-radius:8px;";
            
            row.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:20px;">👤</span>
                    <span style="font-weight:bold; color:white;">${name}</span>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="color:#FFD700; font-weight:bold; font-size:18px;">${amount.toFixed(2)}€</span>
                    <button onclick="PaySystem.resetWallet('${name}')" style="background:#D32F2F; color:white; border:none; border-radius:5px; padding:5px 10px; cursor:pointer; font-size:12px;">X</button>
                </div>
            `;
            container.appendChild(row);
        });

        // 2. Update Totals Header
        const elCash = document.getElementById('walletTotalCash');
        const elCard = document.getElementById('walletTotalCard');
        if(elCash) elCash.innerText = totalCash.toFixed(2) + '€';
        if(elCard) elCard.innerText = totalCard.toFixed(2) + '€';
    },

    resetWallet: (name) => {
        if(confirm(`Μηδενισμός ταμείου για: ${name};`)) {
            window.socket.emit('reset-wallet', name);
        }
    },

    resetAll: () => {
        if(confirm("ΠΡΟΣΟΧΗ: Μηδενισμός ΟΛΩΝ των ταμείων;")) {
            window.socket.emit('reset-wallet', 'ALL');
        }
    },

    // ✅ NEW: SoftPOS Logic (Moved from premium.js)
    updateSoftPosUI: () => {
        const provider = document.getElementById('selSoftPosProvider').value;
        const linkDiv = document.getElementById('softPosLinks');
        const linkA = document.getElementById('linkSoftPosReg');
        const setupBanner = document.getElementById('softPosSetupBanner');
        const downloadBanner = document.getElementById('softPosDownloadBanner');
        const merchantId = document.getElementById('inpSoftPosMerchantId').value;
        const isEnabled = document.getElementById('switchSoftPosEnabled').checked;

        const urls = {
            'viva': 'https://www.vivawallet.com/gr_el',
            'alpha': 'https://www.alpha.gr/el/epixeiriseis/myalpha-pos/softpos',
            'eurobank': 'https://www.eurobank.gr/el/epixeiriseis/proionta-upiresies/eisprakseis-pliromes/eisprakseis/pos/smart-pos',
            'piraeus': 'https://www.piraeusbank.gr/el/epixeiriseis/eisprakseis-pliromes/eisprakseis/epay-pos/softpos'
        };

        if (provider && urls[provider]) {
            linkDiv.style.display = 'block';
            linkA.href = urls[provider];
        } else { linkDiv.style.display = 'none'; }

        if (isEnabled && !merchantId) { setupBanner.style.display = 'block'; downloadBanner.style.display = 'none'; }
        else if (isEnabled && merchantId) { setupBanner.style.display = 'none'; downloadBanner.style.display = 'block'; }
        else { setupBanner.style.display = 'none'; downloadBanner.style.display = 'none'; }
        
        if(window.App && window.App.autoSaveSettings) window.App.autoSaveSettings();
    },

    openSoftPosDownload: () => {
        const provider = document.getElementById('selSoftPosProvider').value;
        let url = "https://play.google.com/store/search?q=softpos&c=apps";
        if (provider === 'viva') url = "https://play.google.com/store/apps/details?id=com.vivawallet.terminal";
        else if (provider === 'alpha') url = "https://play.google.com/store/apps/details?id=gr.alpha.nexi.softpos";
        else if (provider === 'eurobank') url = "https://play.google.com/store/apps/details?id=com.worldline.smartpos";
        else if (provider === 'piraeus') url = "https://play.google.com/store/apps/details?id=gr.epay.softpos";
        window.open(url, '_blank');
    },
    
    triggerSoftPosPayment: (amount, context) => {
        const s = window.App ? window.App.softPosSettings : null;
        if (!s || !s.enabled) return alert("Το SoftPOS δεν είναι ενεργοποιημένο.");
        const returnUrl = window.location.origin + window.location.pathname + `?softpos_status=success&amount=${amount}&context=${context}`;
        let scheme = "intent://pay";
        if (s.provider === 'viva') scheme = "viva.smartcheckout://checkout";
        const params = `?amount=${(amount * 100).toFixed(0)}&currency=978&merchantKey=${s.apiKey || ''}&sourceCode=${s.merchantId || ''}&callback=${encodeURIComponent(returnUrl)}`;
        window.location.href = scheme + params;
    },

    checkSoftPosReturn: () => {
        const params = new URLSearchParams(window.location.search);
        const status = params.get('softpos_status');
        if (status === 'success') {
            const amount = params.get('amount');
            const context = params.get('context');
            const audio = new Audio('/alert.mp3'); audio.play().catch(e=>{});
            alert(`✅ Η πληρωμή ${amount}€ ολοκληρώθηκε!`);
            if (context && context !== 'paso' && context !== 'cashreg' && window.socket) {
                window.socket.emit('pay-order', { id: context, method: 'card' });
            }
            window.history.replaceState({}, document.title, window.location.pathname);
        } else if (status === 'cancel') {
            alert("❌ Ακυρώθηκε.");
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
};

// Make it global for HTML access
window.PaySystem = PaySystem;
