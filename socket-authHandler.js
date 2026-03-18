const Logic = require('./logic');

module.exports = function(socket, context, getMyStore) {
    const { io, storesData, activeUsers, db, transporter, YOUR_DOMAIN } = context;

    socket.on('get-store-settings', async () => {
        if (!socket.store) return;
        const store = await Logic.getStoreData(socket.store, db, storesData);
        if (store) socket.emit('store-settings-update', store.settings);
    });

    socket.on('verify-pin', async (data) => {
        const pin = data.pin || data;
        let email = data.email || socket.store;
        if (email) {
            email = email.toLowerCase().trim();
            const store = await Logic.getStoreData(email, db, storesData);
            if (store.settings.pin === pin || store.settings.adminPin === pin) {
                socket.emit('pin-verified', { success: true, storeId: email });
            } else {
                socket.emit('pin-verified', { success: false });
            }
        }
    });

    socket.on('check-pin-status', async (data) => {
        const targetEmail = data.email;
        if (!targetEmail) return;
        const store = await Logic.getStoreData(targetEmail, db, storesData);
        const hasPin = !!(store.settings.pin || store.settings.adminPin);
        socket.emit('pin-status', { hasPin: hasPin });
    });

    socket.on('set-new-pin', async (data) => {
        const email = data.email;
        if (email) {
            const store = await Logic.getStoreData(email, db, storesData);
            store.settings.pin = data.pin;
            store.settings.adminEmail = email;
            socket.emit('pin-success', { msg: "Ο κωδικός ορίστηκε!" });
            Logic.updateStoreClients(email, io, storesData, activeUsers, db);
        }
    });
    
    socket.on('forgot-pin', async (data) => {
        const email = data.email || socket.store;
        
        if (!transporter.options.auth.pass || transporter.options.auth.pass.includes('xxxx')) {
            socket.emit('forgot-pin-response', { success: false, message: "Σφάλμα συστήματος (Email Config)." });
            return;
        }

        if (email) {
            const store = await Logic.getStoreData(email, db, storesData);
            const hasSub = store.settings.plan === 'premium' || store.settings.plan === 'custom';

            if (!hasSub) {
                socket.emit('forgot-pin-response', { success: false, message: "Δεν βρέθηκε ενεργή συνδρομή για αυτό το email." });
                return;
            }

            const link = `${YOUR_DOMAIN}/reset-pin?email=${encodeURIComponent(email)}`;
            const mailOptions = { from: 'BellGo System', to: email, subject: '🔑 Επαναφορά PIN', text: `Πατήστε εδώ για να ορίσετε νέο PIN: ${link}` };
            transporter.sendMail(mailOptions, (err, info) => {
                if (err) {
                    socket.emit('forgot-pin-response', { success: false, message: "Απέτυχε η αποστολή email." });
                } else {
                    socket.emit('forgot-pin-response', { success: true, message: "Το email εστάλη! Ελέγξτε τα εισερχόμενά σας." });
                }
            });
        }
    });
    
    socket.on('forgot-admin-pin', async (data) => {
        const email = data.email || socket.store;
        if (!transporter.options.auth.pass || transporter.options.auth.pass.includes('xxxx')) {
            socket.emit('forgot-pin-response', { success: false, message: "Σφάλμα συστήματος (Email Config)." });
            return;
        }
        if (email) {
            const link = `${YOUR_DOMAIN}/reset-admin-pin?email=${encodeURIComponent(email)}`;
            const mailOptions = { from: 'BellGo System', to: email, subject: '🛡️ Επαναφορά Admin PIN', text: `Πατήστε εδώ για να ορίσετε νέο Κωδικό Διαχειριστή: ${link}` };
            transporter.sendMail(mailOptions, (err, info) => {
                if (err) {
                    socket.emit('forgot-pin-response', { success: false, message: "Απέτυχε η αποστολή email." });
                } else {
                    socket.emit('forgot-pin-response', { success: true, message: "Το email εστάλη! Ελέγξτε τα εισερχόμενά σας." });
                }
            });
        }
    });

    socket.on('toggle-status', (data) => {
        const store = getMyStore();
        if (store) {
            if (data.type === 'customer') store.settings.statusCustomer = data.isOpen;
            if (data.type === 'staff') store.settings.statusStaff = data.isOpen;
            Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
        }
    });

    socket.on('save-store-name', (newName) => {
        const store = getMyStore();
        if (store) {
            store.settings.name = newName;
            Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
        }
    });

    socket.on('save-store-settings', (data) => {
        const store = getMyStore();
        if (store) {
            if (data.resetTime) store.settings.resetTime = data.resetTime;
            if (data.stripeConnectId) store.settings.stripeConnectId = data.stripeConnectId;
            if (data.schedule) store.settings.schedule = data.schedule;
            if (data.hours) store.settings.hours = data.hours;
            if (data.coverPrice !== undefined) store.settings.coverPrice = data.coverPrice;
            if (data.googleMapsUrl !== undefined) store.settings.googleMapsUrl = data.googleMapsUrl;
            if (data.autoPrint !== undefined) store.settings.autoPrint = data.autoPrint;
            if (data.printerEnabled !== undefined) store.settings.printerEnabled = data.printerEnabled;
            if (data.autoClosePrint !== undefined) store.settings.autoClosePrint = data.autoClosePrint;
            if (data.expensePresets) store.settings.expensePresets = data.expensePresets;
            if (data.fixedExpenses) store.settings.fixedExpenses = data.fixedExpenses;
            if (data.visibility) store.settings.visibility = data.visibility;
            if (data.staffCharge !== undefined) store.settings.staffCharge = data.staffCharge;
            if (data.reservationsEnabled !== undefined) store.settings.reservationsEnabled = data.reservationsEnabled;
            if (data.totalTables !== undefined) store.settings.totalTables = data.totalTables;
            if (data.einvoicing) store.settings.einvoicing = data.einvoicing;
            if (data.pos) store.settings.pos = data.pos;
            if (data.cashRegButtons) store.settings.cashRegButtons = data.cashRegButtons;
            if (data.reward) store.settings.reward = data.reward;
            if (data.features) store.settings.features = { ...store.settings.features, ...data.features };
            if (data.adminPin) store.settings.adminPin = data.adminPin;
            if (data.pin) store.settings.pin = data.pin;
            Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
        }
    });
};