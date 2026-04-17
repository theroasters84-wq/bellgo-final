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

    addManualCharge: () => {
        const name = document.getElementById('inpManualWalletName').value.trim();
        const amount = parseFloat(document.getElementById('inpManualWalletAmount').value);
        
        if (!name || isNaN(amount) || amount === 0) {
            return alert("Παρακαλώ συμπληρώστε σωστό όνομα και ποσό (θετικό για χρέωση, αρνητικό για αφαίρεση).");
        }
        
        window.socket.emit('charge-order-to-staff', {
            orderId: Date.now(), // Fake order ID ώστε να μην επηρεάσει υπάρχουσα παραγγελία
            staffName: name,
            amount: amount,
            method: 'cash' // Always cash for manual debt
        });
        
        document.getElementById('inpManualWalletName').value = '';
        document.getElementById('inpManualWalletAmount').value = '';
        
        const form = document.getElementById('manualChargeForm');
        const btn = document.getElementById('btnShowManualCharge');
        if (form && btn) { form.style.display = 'none'; btn.style.display = 'block'; }
    },

    // ✅ NEW: SoftPOS Logic (Moved from premium.js)
    updateSoftPosUI: () => {
        const selProv = document.getElementById('selSoftPosProvider');
        if (!selProv) return; // ✅ FIX: Ασφαλής έξοδος αν δεν υπάρχει το UI (π.χ. στους σερβιτόρους)
        
        const provider = selProv.value;
        const linkDiv = document.getElementById('softPosLinks');
        const linkA = document.getElementById('linkSoftPosReg');
        const setupBanner = document.getElementById('softPosSetupBanner');
        const downloadBanner = document.getElementById('softPosDownloadBanner');
        const inpMerchant = document.getElementById('inpSoftPosMerchantId');
        const merchantId = inpMerchant ? inpMerchant.value : '';
        const switchEnabled = document.getElementById('switchSoftPosEnabled');
        const isEnabled = switchEnabled ? switchEnabled.checked : false;

        const urls = {
            'viva': 'https://www.vivawallet.com/gr_el',
            'alpha': 'https://www.alpha.gr/el/epixeiriseis/myalpha-pos/softpos',
            'eurobank': 'https://www.eurobank.gr/el/epixeiriseis/proionta-upiresies/eisprakseis-pliromes/eisprakseis/pos/smart-pos',
            'piraeus': 'https://www.piraeusbank.gr/el/epixeiriseis/eisprakseis-pliromes/eisprakseis/epay-pos/softpos'
        };

        if (provider && urls[provider] && linkDiv && linkA) {
            linkDiv.style.display = 'block';
            linkA.href = urls[provider];
        } else if (linkDiv) { linkDiv.style.display = 'none'; }

        if (setupBanner && downloadBanner) {
            if (isEnabled && !merchantId) { setupBanner.style.display = 'block'; downloadBanner.style.display = 'none'; }
            else if (isEnabled && merchantId) { setupBanner.style.display = 'none'; downloadBanner.style.display = 'block'; }
            else { setupBanner.style.display = 'none'; downloadBanner.style.display = 'none'; }
        }
    },

    openSoftPosDownload: () => {
        const provider = document.getElementById('selSoftPosProvider').value;
        let url = "https://play.google.com/store/search?q=softpos&c=apps";
        if (provider === 'viva') url = "https://play.google.com/store/apps/details?id=com.vivawallet.terminal";
        else if (provider === 'alpha') url = "https://play.google.com/store/search?q=Nexi+SoftPOS&c=apps";
        else if (provider === 'eurobank') url = "https://play.google.com/store/search?q=Worldline+Smart+POS&c=apps";
        else if (provider === 'piraeus') url = "https://play.google.com/store/search?q=epay+SoftPOS&c=apps";
        window.open(url, '_blank');
    },
    
    triggerSoftPosPayment: (amount, context) => {
        const s = window.App ? window.App.softPosSettings : null;
        if (!s || !s.enabled) return alert("Το SoftPOS δεν είναι ενεργοποιημένο.");
        const returnUrl = window.location.origin + window.location.pathname + `?softpos_status=success&amount=${amount}&context=${context}`;
        
        const amountCents = (amount * 100).toFixed(0);
        let intentUrl = "";

        // ✅ Bypasses KeepAlive protection temporarily to allow external app launch
        window.allowSoftPosExit = true;
        setTimeout(() => { window.allowSoftPosExit = false; }, 3000);

        if (s.provider === 'viva') {
            let params = `?action=sale&clientTransactionId=${context}_${Date.now()}&amount=${amountCents}&callback=${encodeURIComponent(returnUrl)}`;
            if (s.merchantId) params += `&sourceCode=${s.merchantId}`;
            if (s.apiKey) params += `&appId=${s.apiKey}`;
            intentUrl = `intent://pay/v1${params}#Intent;scheme=vivapay;package=com.vivawallet.terminal;end;`;
            
            const link = document.createElement('a');
            link.href = intentUrl;
            link.target = '_top';
            document.body.appendChild(link);
            link.click();
            link.remove();
        } else {
            let appName = "";
            if (s.provider === 'alpha') { appName = "Nexi SoftPOS"; }
            else if (s.provider === 'eurobank') { appName = "Worldline Smart POS"; }
            else if (s.provider === 'piraeus') { appName = "epay SoftPOS"; }
            else { alert("Άγνωστος πάροχος."); return; }

            try { navigator.clipboard.writeText(amount.toString()); } catch(e){}
            

            // ✅ Εμφάνιση παραθύρου επιβεβαίωσης
            setTimeout(() => {
                const div = document.createElement('div');
                div.className = 'modal-overlay';
                div.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:99999; display:flex; align-items:center; justify-content:center;";
                div.innerHTML = `
                    <div class="modal-box" style="background:#fff; padding:20px; border-radius:12px; text-align:center; max-width:320px; box-shadow:0 10px 30px rgba(0,0,0,0.5);">
                        <div style="font-size:40px; margin-bottom:10px;">📱</div>
                        <h3 style="color:#10B981; margin:0 0 10px 0;">SoftPOS (${appName})</h3>
                        <p style="color:#1f2937; font-size:16px; margin-bottom:5px;">Ποσό: <b style="font-size:20px;">${amount}€</b></p>
                        <p style="color:#EF4444; font-size:13px; font-weight:bold; margin-bottom:15px; border: 1px dashed #EF4444; padding:5px;">⚠️ Το ποσό αντιγράφηκε!<br><br>👉 Βγείτε για λίγο από το BellGo, ανοίξτε το <b>${appName}</b> από το κινητό σας και κάντε Επικόλληση (Paste).</p>
                        
                        <span style="font-size:13px; color:#6b7280; display:block; margin-bottom:10px;">Αφού χτυπήσετε την κάρτα, επιστρέψτε εδώ και πατήστε:</span>
                        <button onclick="window.location.href='${returnUrl}'" style="background:#10B981; color:white; border:none; padding:15px; width:100%; border-radius:8px; font-weight:bold; font-size:16px; margin-bottom:10px; cursor:pointer;">✅ ΕΠΙΒΕΒΑΙΩΣΗ ΠΛΗΡΩΜΗΣ</button>
                        <button onclick="this.parentElement.parentElement.remove()" style="background:#f3f4f6; color:#1f2937; border:1px solid #d1d5db; padding:10px; width:100%; border-radius:8px; font-weight:bold; cursor:pointer;">ΑΚΥΡΩΣΗ</button>
                    </div>
                `;
                document.body.appendChild(div);
            }, 100);
        }
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
        
        const isSoftPos = window.App.softPosSettings && window.App.softPosSettings.enabled;
        const hasPhysicalPos = window.App.posSettings && window.App.posSettings.provider && window.App.posSettings.id;
        
        const btnSEinv = document.getElementById('btnPasoSoftPosEinv');
        const btnSSimple = document.getElementById('btnPasoSoftPosSimple');
        if (btnSEinv) btnSEinv.style.display = isSoftPos ? 'block' : 'none';
        if (btnSSimple) btnSSimple.style.display = isSoftPos ? 'block' : 'none';
        
        const btnPhys = document.getElementById('btnPasoPhysicalPos');
        const btnCardEinv = document.getElementById('btnPasoCardEinv');
        if (btnPhys) {
            if (hasPhysicalPos) { btnPhys.style.display = 'block'; btnPhys.innerText = '💳 POS (ΣΥΝΔΕΔΕΜΕΝΟ)'; }
            else if (!isSoftPos) { btnPhys.style.display = 'block'; btnPhys.innerText = '💳 ΚΑΡΤΑ (ΑΠΛΟ)'; }
            else { btnPhys.style.display = 'none'; } // Ήδη έχει το SoftPOS, κρύψτο
        }
        if (btnCardEinv) {
            btnCardEinv.style.display = (hasPhysicalPos || !isSoftPos) ? 'block' : 'none';
        }

        if (window.App.einvoicingEnabled) { divEinv.style.display = 'grid'; divSimple.style.display = 'none'; } 
        else { divEinv.style.display = 'none'; divSimple.style.display = 'flex'; }
        document.getElementById('pasoCheckoutModal').style.display = 'flex';
    },

    processPasoOrder: (method, type) => { 
        const text = window.App.tempPasoText;
        const total = calculateTotal(text);
        if (method === 'softpos') {
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
            const forceLive = localStorage.getItem('use_live_backend') === 'true';
            const isLocal = window.location.hostname !== 'bellgo.onrender.com';
            const baseUrl = (isLocal && !forceLive) ? "" : "https://bellgo.onrender.com";

            const res = await fetch(`${baseUrl}/create-qr-payment`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ amount: total, storeName: window.App.userData.store, orderId: id }) });
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
        const url = `${baseUrl}/loyalty.html?store=${storeParam}&order=${orderId}`;
        document.getElementById('qrPaymentCode').innerHTML = "";
        new QRCode(document.getElementById('qrPaymentCode'), { text: url, width: 200, height: 200 });
        const modal = document.getElementById('qrPaymentModal');
        modal.querySelector('h3').innerText = "🎁 QR Επιβράβευσης";
        modal.style.display = 'flex';
    },
    openManualRewardQr: () => { PaySystem.openRewardQr(Date.now()); },

    completeOrder: (id, method = 'cash') => {
        const order = window.App.activeOrders.find(o => o.id == id);
        if (window.App.einvoicingEnabled && order && !order.text.includes('[🧾 ΑΠΟΔΕΙΞΗ]')) { window.App.showReceiptDialog(id, method); return; }
        PaySystem.forceCompleteOrder(id, method);
    },
    forceCompleteOrder: (id, method = 'cash') => {
        const order = window.App.activeOrders.find(o => o.id == id);
        const isDelivery = order && order.text.includes('[DELIVERY');
        window.socket.emit('pay-order', { id: id, method: method }); 
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
