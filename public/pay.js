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
    }
};

// Make it global for HTML access
window.PaySystem = PaySystem;
