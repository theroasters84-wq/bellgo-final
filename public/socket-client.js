export function initSockets(App, ctx) {
    if (!window.socket) {
        const forceLive = localStorage.getItem('use_live_backend') === 'true';
        const isLocal = window.location.hostname !== 'bellgo-final.onrender.com';
        const serverUrl = (isLocal && !forceLive) ? "" : "https://bellgo-final.onrender.com";
        console.log("🔌 Πελάτης συνδέεται στο:", serverUrl || "Local Network", "| Live Forced:", forceLive);
        window.socket = io(serverUrl, { transports: ['polling', 'websocket'], reconnection: true });
    }
    window.socket.removeAllListeners();

    const socket = window.socket;

    socket.on('connect', () => {
        const mySocketUsername = ctx.getSafeName() + " (" + (ctx.t('customer_default') || "Πελάτης") + ")";
        socket.emit('join-store', { 
            storeName: ctx.TARGET_STORE, 
            username: mySocketUsername, 
            role: 'customer', 
            token: localStorage.getItem('fcm_token'), // 👈 Token here
            isNative: false 
        });

        // ✅ NEW: Έλεγχος αν το τραπέζι είναι ήδη ανοιχτό
        if (ctx.isDineIn) {
            socket.emit('check-table-status', { table: ctx.tableNumber });
        }
        
        // ✅ NEW: Έλεγχος για ενεργές κρατήσεις (για το Badge)
        const myResIds = JSON.parse(localStorage.getItem('bellgo_my_reservations') || '[]');
        if (myResIds.length > 0) {
            socket.emit('get-customer-reservations', myResIds);
        }
    });

    socket.on('menu-update', (data) => { 
        App.renderMenu(data); 
        
        // ✅ FIX: Ελέγχουμε για πληρωμή ΜΟΝΟ αφού έχουμε συνδεθεί επιτυχώς (πήραμε μενού)
        if (!ctx.hasCheckedStripe) {
            ctx.hasCheckedStripe = true;
            App.checkStripeReturn();
        }
    });

    // ✅ NEW: Απάντηση για το αν υπάρχει ενεργό τραπέζι
    socket.on('table-status', (data) => {
        ctx.ReserveTable.handleTableStatus(data);
    });

    // ✅✅✅ ΕΛΕΓΧΟΣ ΚΛΕΙΣΤΟΥ ΚΑΤΑΣΤΗΜΑΤΟΣ (Status Customer) ✅✅✅
    socket.on('store-settings-update', (settings) => {
        if (settings) {
            if (settings.name) {
                const newName = settings.name;
                document.getElementById('storeNameHeader').innerText = newName;
                document.title = newName;
                if (!new URLSearchParams(window.location.search).get('name')) {
                    const currentParams = new URLSearchParams(window.location.search);
                    currentParams.set('name', newName);
                    window.history.replaceState({}, '', `${window.location.pathname}?${currentParams.toString()}`);
                }
            }

            // ✅ Ενημέρωση Ωραρίου Διανομής (Header)
            if (settings.hours) {
                const el = document.getElementById('todayHours');
                if(el) el.innerText = settings.hours;
            }
            
            ctx.storeHasStripe = !!settings.stripeConnectId;
            window.storeHasStripe = ctx.storeHasStripe; // ✅ Update global
            
            // ✅ Google Maps Review Button Logic
            if (settings.googleMapsUrl) {
                ctx.googleMapsUrl = settings.googleMapsUrl;
                const btn = document.getElementById('btnReview');
                if(btn) btn.style.display = 'block';
            } else {
                const btn = document.getElementById('btnReview');
                if(btn) btn.style.display = 'none';
            }
            
            // ✅ NEW: Show/Hide Reservation Buttons
            const btnBook = document.getElementById('btnBookTable');
            if(btnBook) btnBook.style.display = settings.reservationsEnabled ? 'inline-block' : 'none';

            const btnMyRes = document.getElementById('btnMyRes');
            if(btnMyRes) btnMyRes.style.display = settings.reservationsEnabled ? 'inline-block' : 'none';
            
            const btnHeaderMyRes = document.getElementById('btnHeaderMyRes');
            if(btnHeaderMyRes) btnHeaderMyRes.style.display = settings.reservationsEnabled ? 'inline-flex' : 'none';

            App.handleInput();
            
            const closedOverlay = document.getElementById('closedOverlay');
            const btnSend = document.getElementById('btnSendOrder');
            
            if (settings.statusCustomer === false) {
                closedOverlay.style.display = 'flex';
                if(btnSend) { 
                    btnSend.disabled = true; 
                    btnSend.innerText = ctx.t('store_closed') || 'Το κατάστημα είναι κλειστό'; 
                }
            } else {
                closedOverlay.style.display = 'none';
                if(btnSend) { 
                    btnSend.disabled = false; 
                    btnSend.innerText = ctx.t('send_order') || 'ΑΠΟΣΤΟΛΗ ΠΑΡΑΓΓΕΛΙΑΣ'; 
                }
            }
        }
    });

    socket.on('orders-update', (orders) => {
        const customerDetails = ctx.customerDetails;
        let activeOrders = ctx.activeOrders;
        const mySocketUsername = customerDetails.name + " (" + (ctx.t('customer_default') || "Πελάτης") + ")";
        
        const myServerOrders = orders.filter(o => {
            if (o.from !== mySocketUsername) return false;
            // ✅ FIX: Strict filtering by Table/Mode to avoid mixing orders from different tables
            if (ctx.isDineIn) {
                const match = o.text ? o.text.match(/\[ΤΡ:\s*([^|\]]+)/) : null;
                return match && match[1].trim() === String(ctx.tableNumber).trim();
            } else {
                return o.text && !o.text.includes('[ΤΡ:');
            }
        });
        let changed = false;
        
        // Update existing local orders
        activeOrders.forEach(localOrder => {
            const serverOrder = myServerOrders.find(so => so.id === localOrder.id);
            if (serverOrder) {
                if (localOrder.status !== serverOrder.status) {
                    localOrder.status = serverOrder.status;
                    if (serverOrder.readyTime) localOrder.readyTime = serverOrder.readyTime;
                    changed = true;
                }
                // ✅ FIX: Sync Text (ώστε να υπάρχει για τον έλεγχο Pickup)
                if (serverOrder.text && localOrder.text !== serverOrder.text) {
                    localOrder.text = serverOrder.text;
                    changed = true;
                }
            } else {
                // ✅ NEW: Αν η παραγγελία κλείσει (διαγραφεί) από το κατάστημα (π.χ. Τραπέζι)
                if (localOrder.status !== 'completed' && localOrder.status !== 'ready') {
                    localOrder.status = 'completed';
                    localOrder.readyTime = Date.now(); // Start 30min timer
                    changed = true;
                }
            }
        });

        // ✅ FIX: Συγχρονισμός παραγγελιών από Server (για PWA/Browser Isolation)
        myServerOrders.forEach(serverOrder => {
            const exists = activeOrders.find(lo => lo.id === serverOrder.id);
            if (!exists) {
                activeOrders.push({
                    id: serverOrder.id,
                    status: serverOrder.status,
                    timestamp: serverOrder.id,
                    text: serverOrder.text,
                    readyTime: serverOrder.readyTime
                });
                changed = true;
            }
        });
        
        if (changed) {
            localStorage.setItem('bellgo_active_orders', JSON.stringify(activeOrders));
            ctx.activeOrders = activeOrders; // trigger setter
            App.updateStatusUI(false);
        }
    });

    // ✅ IMMEDIATE UPDATE (Fixes "den vlepw stadiaka")
    socket.on('order-changed', (data) => {
        const activeOrders = ctx.activeOrders;
        const order = activeOrders.find(o => o.id === data.id);
        if (order) {
            // ✅ NEW: Play Alert on Ready (Όταν ο Admin πατήσει ΕΤΟΙΜΟ)
            if (order.status !== 'ready' && data.status === 'ready') {
                // ✅ FIX: Stop Silent KeepAlive Audio
                if (window.bellgoKeepAlive) {
                    window.bellgoKeepAlive.pause();
                    window.bellgoKeepAlive = null;
                    console.log("🛑 KeepAlive Stopped (Order Ready)");
                }

                // ✅ FIX: Alarm ONLY for Pickup (Not for Dine-In/Table)
                if (order.text && order.text.includes('[PICKUP')) {
                    if (window.pickupAudio) {
                        window.pickupAudio.pause();
                        window.pickupAudio.currentTime = 0;
                    }
                    window.pickupAudio = new Audio('/alert.mp3');
                    const playAlert = () => {
                        window.pickupAudio.currentTime = 0;
                        window.pickupAudio.play().catch(e => console.log("Audio play error:", e));
                        if (navigator.vibrate) navigator.vibrate([1000, 500, 1000]);
                    };
                    playAlert();
                    if (window.pickupInterval) clearInterval(window.pickupInterval);
                    window.pickupInterval = setInterval(playAlert, 5000);
                        
                        let modal = document.getElementById('readyPickupModal');
                        if (!modal) {
                            modal = document.createElement('div');
                            modal.id = 'readyPickupModal';
                            modal.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:99999; display:flex; align-items:center; justify-content:center; padding:20px;";
                            document.body.appendChild(modal);
                        }
                        
                        // Πάντα ανανεώνουμε το περιεχόμενο για να είμαστε 100% σίγουροι ότι υπάρχει το κουμπί
                        modal.innerHTML = `
                            <div style="background:#ffffff; color:#1f2937; border-radius:20px; padding:30px; text-align:center; width:100%; max-width:350px; box-shadow:0 10px 30px rgba(0,0,0,0.5);">
                                <div style="font-size:70px; margin-bottom:15px;">🛍️</div>
                                <h2 style="color:#10B981; margin:0 0 15px 0; font-size:24px;">ΕΤΟΙΜΟ!</h2>
                                <p style="color:#6b7280; margin-bottom:25px; font-size:16px;">Η παραγγελία σας είναι έτοιμη για παραλαβή από το κατάστημα.</p>
                                <button id="btnAcceptPickup" style="background:#10B981; color:white; border:none; padding:15px; width:100%; border-radius:30px; font-weight:bold; font-size:18px; cursor:pointer; box-shadow:0 4px 15px rgba(16,185,129,0.4);">✅ ΤΟ ΕΙΔΑ</button>
                            </div>
                        `;
                        modal.style.display = 'flex';
                        
                        const acceptBtn = modal.querySelector('#btnAcceptPickup');
                        if (acceptBtn) {
                            acceptBtn.onclick = () => {
                                if (window.pickupInterval) {
                                    clearInterval(window.pickupInterval);
                                    window.pickupInterval = null;
                                }
                                if (window.pickupAudio) {
                                    window.pickupAudio.pause();
                                    window.pickupAudio.currentTime = 0;
                                }
                                modal.style.display = 'none';
                            };
                        }
                }
            }

            order.status = data.status;
            if (data.readyTime) order.readyTime = data.readyTime;
            
            localStorage.setItem('bellgo_active_orders', JSON.stringify(activeOrders));
            ctx.activeOrders = activeOrders; // trigger setter
            App.updateStatusUI(false);
        }
    });
    
    // ✅ NEW: Reservation Result
    socket.on('reservation-result', (res) => {
        if(res.success) { 
            // ✅ Show Waiting State
            const btn = document.querySelector('#bookingModal button.btn-save-details');
            if(btn) {
                btn.innerText = "⏳ " + (ctx.t('waiting_confirmation') || "ΑΝΑΜΟΝΗ ΕΠΙΒΕΒΑΙΩΣΗΣ...");
                btn.disabled = true;
                btn.style.background = "#555";
            }
            App.pendingReservationId = res.reservationId;
            
            // ✅ NEW: Save ID to LocalStorage
            let myRes = JSON.parse(localStorage.getItem('bellgo_my_reservations') || '[]');
            if(!myRes.includes(res.reservationId)) myRes.push(res.reservationId);
            localStorage.setItem('bellgo_my_reservations', JSON.stringify(myRes));
            
            // ✅ NEW: Ανανέωση Badge άμεσα
            window.socket.emit('get-customer-reservations', myRes);
        }
        else { alert("Σφάλμα: " + res.error); }
    });

    // ✅ NEW: Reservation Confirmed
    socket.on('reservation-confirmed', (data) => {
        if (App.pendingReservationId && data.id === App.pendingReservationId) {
            alert("✅ " + (ctx.t('reservation_accepted') || "Η κράτηση σας ΕΓΙΝΕ ΔΕΚΤΗ!"));
            document.getElementById('bookingModal').style.display='none';
            App.pendingReservationId = null;
            const btn = document.querySelector('#bookingModal button.btn-save-details');
            if(btn) { btn.innerText = ctx.t('book_btn') || "ΚΡΑΤΗΣΗ"; btn.disabled = false; btn.style.background = "#9C27B0"; }
        }
    });

    socket.on('my-reservations-data', (list) => {
        App.renderMyReservations(list);
    });

    // ✅ NEW: Cancel Success
    socket.on('reservation-cancelled-success', (id) => {
        alert(ctx.t('reservation_cancelled') || "Η κράτηση ακυρώθηκε.");
        // Remove from local storage
        let myRes = JSON.parse(localStorage.getItem('bellgo_my_reservations') || '[]');
        myRes = myRes.filter(rid => rid !== id);
        localStorage.setItem('bellgo_my_reservations', JSON.stringify(myRes));
        App.openMyReservations();
    });

    // ✅ Force Connect / Re-Join if needed
    if (!socket.connected) {
        socket.connect();
    } else {
        // Αν είναι ήδη συνδεδεμένο, ξαναστέλνουμε join για σιγουριά
        const mySocketUsername = ctx.getSafeName() + " (" + (ctx.t('customer_default') || "Πελάτης") + ")";
        socket.emit('join-store', { 
            storeName: ctx.TARGET_STORE, 
            username: mySocketUsername, 
            role: 'customer', 
            token: localStorage.getItem('fcm_token'),
        });
    }
}