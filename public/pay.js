/* -----------------------------------------------------------
   PAY.JS - LOGIC FOR STAFF WALLETS & CHARGES
----------------------------------------------------------- */
const calculateTotal = (text) => {
    let total = 0;
    if (!text) return 0;
    const lines = text.split('\n');
    lines.forEach(line => {
        const match = line.match(/^(\d+)?\s*(.+):(\d+(?:\.\d+)?)$/);
        if (match) {
            let qty = parseInt(match[1] || '1');
            let price = parseFloat(match[3]);
            total += qty * price;
        }
    });
    return total;
};

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
            row.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:12px; border:1px solid #e5e7eb; background:#f9fafb; margin-bottom:8px; border-radius:8px;";
            
            row.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:20px;">👤</span>
                    <span style="font-weight:bold; color:#1f2937;">${name}</span>
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
        const msg = (window.App && window.App.t) ? window.App.t('reset_wallet_confirm') : "Μηδενισμός ταμείου για:";
        if(confirm(`${msg} ${name}?`)) {
            window.socket.emit('reset-wallet', name);
        }
    },

    resetAll: () => {
        const msg = (window.App && window.App.t) ? window.App.t('reset_all_confirm') : "ΠΡΟΣΟΧΗ: Μηδενισμός ΟΛΩΝ των ταμείων;";
        if(confirm(msg)) {
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
    },

    // --- PASO & CHECKOUT ---
    openPasoCheckout: (text) => {
        window.App.tempPasoText = text;
        const total = calculateTotal(text);
        document.getElementById('pasoTotal').innerText = total.toFixed(2) + '€';
        const divEinv = document.getElementById('pasoEinvoicingOptions');
        const divSimple = document.getElementById('pasoSimpleOptions');
        const btnClose = document.getElementById('btnPasoClosePrint');
        if(btnClose) { btnClose.innerText = window.App.printerEnabled ? "💵 ΚΛΕΙΣΙΜΟ & ΕΚΤΥΠΩΣΗ" : "💵 ΚΛΕΙΣΙΜΟ"; }
        if (window.App.einvoicingEnabled) { divEinv.style.display = 'grid'; divSimple.style.display = 'none'; } 
        else { divEinv.style.display = 'none'; divSimple.style.display = 'flex'; }
        document.getElementById('pasoCheckoutModal').style.display = 'flex';
    },

    processPasoOrder: (method, type) => { 
        const text = window.App.tempPasoText;
        const total = calculateTotal(text);
        if (method === 'card' && window.App.softPosSettings && window.App.softPosSettings.enabled) {
            PaySystem.triggerSoftPosPayment(total, 'paso');
            return;
        }
        if (type === 'qr') {
             const tempId = Date.now();
             window.App.openQrPayment(tempId, true);
             return;
        }
        const pasoId = Date.now();
        window.socket.emit('quick-order', { id: pasoId, text: text, total: total, method: method, issueReceipt: (type === 'receipt') });
        document.getElementById('pasoCheckoutModal').style.display = 'none';
        window.App.toggleOrderSidebar();
        document.getElementById('sidebarOrderText').value = '';
        if (window.App.rewardSettings && window.App.rewardSettings.enabled) {
            const mode = window.App.rewardSettings.mode || 'manual';
            if (mode === 'all' || mode === 'paso') {
                setTimeout(() => { if(!window.App.printerEnabled || confirm("🎁 Εμφάνιση QR Επιβράβευσης;")) { window.App.openRewardQr(pasoId); } }, 500);
            }
        }
    },

    payWithSoftPos: (id) => {
        if (window.App.posMode === 'ask') {
            if (!confirm("Αποστολή ποσού στο τερματικό;")) {
                if(confirm("Να καταγραφεί ως πληρωμένο με ΚΑΡΤΑ (Χωρίς τερματικό);")) { window.socket.emit('pay-order', { id: id, method: 'card' }); }
                return;
            }
        }
        const order = window.App.activeOrders.find(o => o.id == id);
        const total = calculateTotal(order.text);
        PaySystem.triggerSoftPosPayment(total, id);
    },

    payItemPartial: (id, index, method) => { window.socket.emit('pay-partial', { id: id, index: index, method: method }); },

    openQrPayment: async (id, isPaso = false) => {
        window.App.currentQrOrderId = id;
        window.App.currentQrIsPaso = isPaso;
        let total = 0;
        if (isPaso) { total = calculateTotal(window.App.tempPasoText); } 
        else { const order = window.App.activeOrders.find(o => o.id == id); if(!order) return; total = calculateTotal(order.text); }
        if(total <= 0) return alert("Το ποσό είναι μηδενικό.");
        try {
            const res = await fetch('/create-qr-payment', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ amount: total, storeName: window.App.userData.store, orderId: id }) });
            const data = await res.json();
            if(data.url) {
                document.getElementById('qrPaymentCode').innerHTML = "";
                new QRCode(document.getElementById('qrPaymentCode'), { text: data.url, width: 200, height: 200 });
                const linkContainer = document.getElementById('qrLinkContainer');
                if(linkContainer) {
                    linkContainer.innerHTML = `<button onclick="window.open('${data.url}', '_blank')" style="background:#2196F3; color:white; border:none; padding:10px; border-radius:6px; cursor:pointer; width:100%; font-weight:bold;">🔗 ΠΛΗΡΩΜΗ ΕΔΩ (MANUAL)</button>`;
                }
                if (isPaso) {
                    linkContainer.innerHTML += `<button onclick="App.processPasoOrder('card', 'receipt')" style="background:#00E676; color:black; border:none; padding:10px; border-radius:6px; cursor:pointer; width:100%; font-weight:bold; margin-top:10px;">✅ ΟΛΟΚΛΗΡΩΣΗ (ΕΚΤΥΠΩΣΗ)</button>`;
                    document.getElementById('pasoCheckoutModal').style.display = 'none';
                }
                document.getElementById('qrPaymentModal').style.display = 'flex';
            } else { alert("Σφάλμα: " + (data.error || "Άγνωστο")); }
        } catch(e) { alert("Σφάλμα σύνδεσης."); }
    },

    openRewardQr: (orderId) => {
        const baseUrl = window.location.origin;
        const storeParam = encodeURIComponent(window.App.userData.store);
        const url = `${baseUrl}/epivraveush.html?store=${storeParam}&order=${orderId}`;
        document.getElementById('qrPaymentCode').innerHTML = "";
        new QRCode(document.getElementById('qrPaymentCode'), { text: url, width: 200, height: 200 });
        const modal = document.getElementById('qrPaymentModal');
        modal.querySelector('h3').innerText = "🎁 QR Επιβράβευσης";
        modal.style.display = 'flex';
    },
    openManualRewardQr: () => { PaySystem.openRewardQr(Date.now()); },

    completeOrder: (id) => {
        const order = window.App.activeOrders.find(o => o.id == id);
        if (window.App.einvoicingEnabled && order && !order.text.includes('[🧾 ΑΠΟΔΕΙΞΗ]')) { window.App.showReceiptDialog(id); return; }
        PaySystem.forceCompleteOrder(id);
    },
    forceCompleteOrder: (id) => {
        const order = window.App.activeOrders.find(o => o.id == id);
        const isDelivery = order && order.text.includes('[DELIVERY');
        window.socket.emit('pay-order', id); 
        const win = document.getElementById(`win-${id}`);
        if(win) win.remove();
        if (window.App.rewardSettings && window.App.rewardSettings.enabled) {
            const mode = window.App.rewardSettings.mode || 'manual';
            let shouldShow = false;
            if (mode === 'all') shouldShow = true;
            else if (mode === 'delivery' && isDelivery) shouldShow = true;
            else if (mode === 'table' && !isDelivery) shouldShow = true;
            if (shouldShow) { setTimeout(() => { if(!window.App.printerEnabled || confirm("🎁 Εμφάνιση QR Επιβράβευσης;")) { window.App.openRewardQr(id); } }, 500); }
        }
    },
};

// Make it global for HTML access
window.PaySystem = PaySystem;
