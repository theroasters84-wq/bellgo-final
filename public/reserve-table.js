export const ReserveTable = {
    init: () => {
        console.log("🍽️ ReserveTable Module Loaded");
    },

    handleTableStatus: (data) => {
        if (data.active) {
            window.App.existingOrderId = data.orderId;
            ReserveTable.showTableOptionsModal(data);
        } else {
            let details = JSON.parse(localStorage.getItem('bellgo_customer_info') || 'null');
            if (!details || !details.covers) {
                window.App.editDetails();
            }
        }
    },

    showTableOptionsModal: (data) => {
        const t = window.App.t || ((k) => k);
        const tableNumber = window.tableNumber;
        
        let total = 0;
        const lines = data.text.split('\n');
        lines.forEach(line => {
            const parts = line.split(':');
            const price = parseFloat(parts[parts.length-1]);
            const qtyMatch = line.match(/^(\d+)\s+/);
            const qty = qtyMatch ? parseInt(qtyMatch[1]) : 1;
            if(!isNaN(price)) total += price * qty;
        });

        const modal = document.createElement('div');
        modal.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); z-index:10000; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px;";
        
        const step1Html = `
            <div id="step1" style="background:#222; padding:25px; border-radius:15px; width:100%; max-width:350px; text-align:center; border:1px solid #444;">
                <h2 style="color:#FFD700; margin-top:0;">🍽️ ${t('table') || 'Τραπέζι'} ${tableNumber}</h2>
                <p style="color:#ccc;">${t('table_active') || 'Το τραπέζι είναι ενεργό.'}<br>${t('total') || 'Σύνολο'}: <b>${total.toFixed(2)}€</b></p>
                <button id="btnExisting" style="width:100%; padding:15px; margin-bottom:10px; background:#2196F3; color:white; border:none; border-radius:8px; font-size:16px; font-weight:bold;">📂 ${t('btn_existing_order') || 'ΥΠΑΡΧΟΥΣΑ ΠΑΡΑΓΓΕΛΙΑ'}</button>
                <button id="btnNewOrder" style="width:100%; padding:15px; background:#555; color:white; border:none; border-radius:8px; font-size:14px;">🆕 ${t('btn_new_order_reset') || 'ΝΕΑ ΠΑΡΑΓΓΕΛΙΑ (Reset)'}</button>
            </div>
        `;

        const step2Html = `
            <div id="step2" style="display:none; background:#222; padding:25px; border-radius:15px; width:100%; max-width:350px; text-align:center; border:1px solid #444;">
                <h3 style="color:#2196F3;">${t('options') || 'Επιλογές'}</h3>
                <button id="btnSupplement" style="width:100%; padding:15px; margin-bottom:10px; background:#FFD700; color:black; border:none; border-radius:8px; font-size:16px; font-weight:bold;">➕ ${t('btn_supplement') || 'ΣΥΜΠΛΗΡΩΣΗ'}</button>
                <button id="btnPayExisting" style="width:100%; padding:15px; margin-bottom:10px; background:#00E676; color:black; border:none; border-radius:8px; font-size:16px; font-weight:bold;">💳 / 💶 ${t('btn_pay_full') || 'ΠΛΗΡΩΜΗ'}</button>
                <button id="btnBack1" style="background:none; border:none; color:#aaa; margin-top:10px;">🔙 ${t('back') || 'ΠΙΣΩ'}</button>
            </div>
        `;

        const step3Html = `
            <div id="step3" style="display:none; background:#222; padding:25px; border-radius:15px; width:100%; max-width:350px; text-align:center; border:1px solid #444;">
                <h3 style="color:#FFD700;">${t('new_people_question') || 'Ήρθαν νέα άτομα;'}</h3>
                <p style="color:#ccc; font-size:12px;">${t('new_people_hint') || 'Αν ναι, συμπληρώστε τον αριθμό.'}</p>
                <input type="number" id="inpNewPeople" placeholder="${t('placeholder_people') || 'Αρ. ατόμων (προαιρετικό)'}" style="width:100%; padding:12px; margin-bottom:15px; border-radius:8px; border:1px solid #555; background:#333; color:white; text-align:center; font-size:16px;">
                <button id="btnGoToMenu" style="width:100%; padding:15px; background:#2196F3; color:white; border:none; border-radius:8px; font-size:16px; font-weight:bold;">${t('btn_continue_menu') || 'ΣΥΝΕΧΕΙΑ ΣΤΟ MENU ▶'}</button>
                <button id="btnBack2" style="background:none; border:none; color:#aaa; margin-top:10px;">🔙 ${t('back') || 'ΠΙΣΩ'}</button>
            </div>
        `;

        const step4Html = `
            <div id="step4" style="display:none; background:#222; padding:25px; border-radius:15px; width:100%; max-width:350px; text-align:center; border:1px solid #444;">
                <h3 style="color:#00E676;">${t('payment_method') || 'Τρόπος Πληρωμής'}</h3>
                <button id="btnCallWaiter" style="width:100%; padding:15px; margin-bottom:10px; background:#FF9800; color:black; border:none; border-radius:8px; font-size:16px; font-weight:bold;">🛎️ ${t('btn_call_waiter') || 'ΚΛΗΣΗ ΣΕΡΒΙΤΟΡΟΥ'}</button>
                <button id="btnPayStripe" style="width:100%; padding:15px; margin-bottom:10px; background:#635BFF; color:white; border:none; border-radius:8px; font-size:16px; font-weight:bold;">💳 ${t('btn_pay_stripe') || 'ONLINE (Stripe)'}</button>
                <button id="btnBack3" style="background:none; border:none; color:#aaa; margin-top:10px;">🔙 ${t('back') || 'ΠΙΣΩ'}</button>
            </div>
        `;

        modal.innerHTML = step1Html + step2Html + step3Html + step4Html;
        document.body.appendChild(modal);

        const s1 = document.getElementById('step1');
        const s2 = document.getElementById('step2');
        const s3 = document.getElementById('step3');
        const s4 = document.getElementById('step4');

        document.getElementById('btnExisting').onclick = () => {
            s1.style.display = 'none';
            s2.style.display = 'block';
            window.App.existingOrderId = data.orderId;
        };
        document.getElementById('btnNewOrder').onclick = () => {
            window.App.existingOrderId = null;
            modal.remove();
        };

        document.getElementById('btnSupplement').onclick = () => {
            s2.style.display = 'none';
            s3.style.display = 'block';
        };
        document.getElementById('btnPayExisting').onclick = () => {
            s2.style.display = 'none';
            s4.style.display = 'block';
        };
        document.getElementById('btnBack1').onclick = () => {
            s2.style.display = 'none';
            s1.style.display = 'block';
        };

        document.getElementById('btnGoToMenu').onclick = () => {
            const extra = document.getElementById('inpNewPeople').value;
            if(extra && parseInt(extra) > 0) {
                window.App.addToOrder(`(+ ${extra} ${t('people') || 'ΑΤΟΜΑ'})`);
            }
            modal.remove();
        };
        document.getElementById('btnBack2').onclick = () => {
            s3.style.display = 'none';
            s2.style.display = 'block';
        };

        document.getElementById('btnCallWaiter').onclick = () => {
            if (window.App.existingOrderId) {
                window.socket.emit('add-items', { id: window.App.existingOrderId, items: "❗ ΖΗΤΑΕΙ ΛΟΓΑΡΙΑΣΜΟ (ΚΛΗΣΗ)" });
                alert(t('waiter_notified') || "Ειδοποιήσαμε τον σερβιτόρο!");
                modal.remove();
            }
        };
        document.getElementById('btnPayStripe').onclick = () => {
            if(!window.storeHasStripe) return alert(t('card_unavailable') || "Η πληρωμή με κάρτα δεν είναι διαθέσιμη.");
            ReserveTable.payExistingOrder(data.orderId, total);
            modal.remove();
        };
        document.getElementById('btnBack3').onclick = () => {
            s4.style.display = 'none';
            s2.style.display = 'block';
        };
    },

    payExistingOrder: async (orderId, amount) => {
        const t = window.App.t || ((k) => k);
        const TARGET_STORE = window.TARGET_STORE;
        
        try {
            const res = await fetch('/create-qr-payment', { 
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ amount: amount, storeName: TARGET_STORE, orderId: orderId })
            });
            const data = await res.json();
            if(data.url) window.location.href = data.url;
            else alert((t('error') || "Σφάλμα: ") + (data.error || "Άγνωστο"));
        } catch(e) { alert(t('connection_error') || "Σφάλμα σύνδεσης."); }
    },

    // --- ADMIN RESERVATION LOGIC (Moved from premium.js) ---
    openReservationsModal: () => {
        document.getElementById('reservationsModal').style.display = 'flex';
        window.socket.emit('get-reservations');
    },

    updateReservationsBadge: (list) => {
        if (!list) return;
        const badge = document.getElementById('resBadge');
        if (!badge) return;

        const pending = list.filter(r => r.status === 'pending');
        const confirmed = list.filter(r => r.status === 'confirmed');

        let count = 0;
        let color = '';

        // Check role from App.userData if available
        const role = window.App && window.App.userData ? window.App.userData.role : 'admin';

        if (role === 'admin') {
            if (pending.length > 0) { count = pending.length; color = '#FF5252'; } 
            else if (confirmed.length > 0) { count = confirmed.length; color = '#00E676'; }
        } else {
            if (confirmed.length > 0) { count = confirmed.length; color = '#00E676'; }
        }

        if (count > 0) {
            badge.style.display = 'flex';
            badge.innerText = count;
            badge.style.background = color;
            badge.style.animation = 'pulse 2s infinite';
        } else {
            badge.style.display = 'none';
            badge.style.animation = 'none';
        }
    },
    
    renderReservations: (list) => {
        const container = document.getElementById('reservationsList');
        if(!container) return;
        container.innerHTML = '';
        
        if(!list || list.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:#555;">Δεν υπάρχουν κρατήσεις.</div>';
            return;
        }
        list.sort((a,b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`));
        list.forEach(r => {
            if (r.status === 'completed') return;
            const isPending = r.status === 'pending';
            const div = document.createElement('div');
            div.style.cssText = `background:#222; padding:10px; border-radius:8px; border-left:4px solid ${isPending ? '#FF9800' : '#9C27B0'}; display:flex; justify-content:space-between; align-items:center;`;
            div.innerHTML = `
                <div onclick="ReserveTable.processReservation(${r.id}, ${r.pax})" style="cursor:pointer;">
                    <div style="font-weight:bold; color:white;">${r.name} (${r.pax} άτ.) ${isPending ? '<span style="color:#FF9800; font-size:12px;">(ΑΝΑΜΟΝΗ)</span>' : ''}</div>
                    <div style="color:#FFD700; font-size:14px;">📅 ${r.date} 🕒 ${r.time}</div>
                    <div style="color:#aaa; font-size:12px;">📞 ${r.phone}</div>
                </div>
                <div style="display:flex; gap:5px;">
                    <button onclick="ReserveTable.processReservation(${r.id}, ${r.pax})" style="background:#2196F3; color:white; border:none; padding:5px 10px; border-radius:5px; cursor:pointer; font-weight:bold;" title="Έναρξη & Ολοκλήρωση">🚀</button>
                    ${isPending ? `<button onclick="ReserveTable.acceptReservation(${r.id})" style="background:#00E676; color:black; border:none; padding:5px 10px; border-radius:5px; cursor:pointer; font-weight:bold;">✅</button>` : ''}
                    <button onclick="ReserveTable.deleteReservation(${r.id})" style="background:#D32F2F; color:white; border:none; padding:5px 10px; border-radius:5px; cursor:pointer;">✕</button>
                </div>`;
            container.appendChild(div);
        });
    },

    processReservation: (id, pax) => {
        const sb = document.getElementById('orderSidebar');
        if (sb.style.left !== '0px' && sb.style.left !== '0') window.App.toggleOrderSidebar();
        window.App.setSidebarMode('table');
        if(document.getElementById('sidebarCovers')) document.getElementById('sidebarCovers').value = pax;
        window.socket.emit('complete-reservation', id);
    },
    
    acceptReservation: (id) => {
        if(window.AudioEngine) window.AudioEngine.stopAlarm();
        window.socket.emit('admin-stop-ringing');
        window.socket.emit('accept-reservation', id);
    },
    
    deleteReservation: (id) => {
        if(confirm("Διαγραφή κράτησης;")) window.socket.emit('delete-reservation', id);
    },
};