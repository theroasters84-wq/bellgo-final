const Logic = require('../logic');

module.exports = function(socket, context, getMyStore) {
    const { io, storesData, activeUsers, db, admin, YOUR_DOMAIN } = context;

    socket.on('create-reservation', (data) => {
        const store = getMyStore();
        if (!store) return;
        const { name, phone, date, time, pax, customerToken } = data;
        const totalTables = parseInt(store.settings.totalTables) || 0;
        
        if (!store.settings.reservationsEnabled || totalTables === 0) {
            socket.emit('reservation-result', { success: false, error: "Οι κρατήσεις είναι κλειστές." });
            return;
        }
        
        const reqDate = new Date(`${date}T${time}`);
        const reqTime = reqDate.getTime();
        const conflicting = (store.reservations || []).filter(r => {
            const rTime = new Date(`${r.date}T${r.time}`).getTime();
            return Math.abs(rTime - reqTime) < 7200000;
        });
        
        let occupied = 0;
        const now = Date.now();
        if (reqTime > now && reqTime - now < 7200000) {
            const activeTables = new Set();
            store.orders.forEach(o => {
                if (o.status !== 'completed' && !o.text.includes('PAID')) {
                    const m = o.text.match(/\[ΤΡ:\s*([^|\]]+)/);
                    if (m) activeTables.add(m[1]);
                }
            });
            occupied = activeTables.size;
        }
        
        if (conflicting.length + occupied >= totalTables) {
            socket.emit('reservation-result', { success: false, error: "Δεν υπάρχει διαθεσιμότητα για αυτή την ώρα." });
            return;
        }
        
        const newRes = {
            id: Date.now(), name, phone, date, time, pax,
            status: 'pending', notified: false, customerToken: customerToken || null, notifiedCustomer3h: false
        };
        
        if (!store.reservations) store.reservations = [];
        store.reservations.push(newRes);
        Logic.saveStoreToFirebase(socket.store, db, storesData);
        socket.emit('reservation-result', { success: true, reservationId: newRes.id }); 
        Logic.notifyAdmin(socket.store, "ΝΕΑ ΚΡΑΤΗΣΗ (ΑΝΑΜΟΝΗ) 📅", `${name} (${pax} άτ.)\n${date} ${time}`, null, "", null, storesData, activeUsers, io, YOUR_DOMAIN, admin);
        io.to(socket.store).emit('reservations-update', store.reservations);
    });

    socket.on('accept-reservation', (id) => {
        const store = getMyStore();
        if (store && store.reservations) {
            const r = store.reservations.find(x => x.id === id);
            if (r) {
                r.status = 'confirmed';
                Logic.saveStoreToFirebase(socket.store, db, storesData);
                io.to(socket.store).emit('reservations-update', store.reservations);
                io.to(socket.store).emit('reservation-confirmed', { id: id });
            }
        }
    });

    socket.on('complete-reservation', (id) => {
        const store = getMyStore();
        if (store && store.reservations) {
            const r = store.reservations.find(x => x.id === id);
            if (r) {
                r.status = 'completed';
                Logic.saveStoreToFirebase(socket.store, db, storesData);
                io.to(socket.store).emit('reservations-update', store.reservations);
            }
        }
    });

    socket.on('get-reservations', () => {
        const store = getMyStore();
        if (store) {
            socket.emit('reservations-update', store.reservations || []);
        }
    });

    socket.on('get-customer-reservations', (ids) => {
        const store = getMyStore();
        if (store && store.reservations && Array.isArray(ids)) {
            const myRes = store.reservations.filter(r => ids.includes(r.id));
            socket.emit('my-reservations-data', myRes);
        } else {
            socket.emit('my-reservations-data', []);
        }
    });

    socket.on('cancel-reservation-customer', (id) => {
        const store = getMyStore();
        if (store && store.reservations) {
            const r = store.reservations.find(x => x.id === id);
            if (r) {
                Logic.notifyAdmin(socket.store, "ΑΚΥΡΩΣΗ ΚΡΑΤΗΣΗΣ ❌", `Ο πελάτης ${r.name} ακύρωσε την κράτηση (${r.date} ${r.time}).`, null, "", null, storesData, activeUsers, io, YOUR_DOMAIN, admin);
                store.reservations = store.reservations.filter(x => x.id !== id);
                r.status = 'cancelled';
                Logic.saveStoreToFirebase(socket.store, db, storesData);
                io.to(socket.store).emit('reservations-update', store.reservations);
                socket.emit('reservation-cancelled-success', id);
            }
        }
    });

    socket.on('delete-reservation', (id) => {
        const store = getMyStore();
        if (store && store.reservations) {
            const rIndex = store.reservations.findIndex(r => r.id === id);
            if (rIndex > -1) {
                const r = store.reservations[rIndex];
                if (r.customerToken) {
                    Logic.sendPushNotification({ fcmToken: r.customerToken, role: 'customer' }, "ΑΚΥΡΩΣΗ ΚΡΑΤΗΣΗΣ ❌", `Η κράτησή σας για ${r.date} ${r.time} ακυρώθηκε από το κατάστημα.`, { type: "info" }, YOUR_DOMAIN, admin);
                    Logic.sendPushNotification({ fcmToken: r.customerToken, role: 'customer', store: socket.store }, "ΑΚΥΡΩΣΗ ΚΡΑΤΗΣΗΣ ❌", `Η κράτησή σας για ${r.date} ${r.time} ακυρώθηκε από το κατάστημα.`, { type: "info" }, YOUR_DOMAIN, admin);
                }
                store.reservations.splice(rIndex, 1);
                Logic.saveStoreToFirebase(socket.store, db, storesData);
                io.to(socket.store).emit('reservations-update', store.reservations);
            }
        }
    });
};