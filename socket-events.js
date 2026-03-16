const Logic = require('./logic');

module.exports = function(context) {
    const { io, storesData, activeUsers, tempBlacklist, db, admin, stripe, YOUR_DOMAIN } = context;

    io.on('connection', (socket) => {
        const getMyStore = () => { if (!socket.store) return null; return storesData[socket.store]; };

        socket.on('join-store', async (data) => {
          try {
            let rawStore = data.storeName || '';
            if ((!rawStore || rawStore === 'null') && data.role === 'customer') { console.log("⚠️ Customer tried to join without storeName"); return; }
            if (!rawStore) { return; } 

            if (rawStore.endsWith('premium')) rawStore = rawStore.replace('premium', '');
            const storeName = rawStore.toLowerCase().trim();
            const username = (data.username || '').trim();
            if (!storeName || !username) return;

            if (tempBlacklist.has(`${storeName}_${username}`)) {
                socket.emit('force-logout');
                socket.disconnect(true);
                return;
            }

            await Logic.getStoreData(storeName, db, storesData);

            socket.store = storeName;
            socket.username = username;
            socket.role = data.role || 'waiter'; 
            if (data.role === 'customer') socket.role = 'customer';

            socket.join(storeName); 
            console.log(`📡 User ${username} joined room: ${storeName}`); 

            const key = `${storeName}_${username}`;
            const wasRinging = activeUsers[key]?.isRinging || false;
            const existingToken = activeUsers[key]?.fcmToken;

            activeUsers[key] = {
                store: storeName, username, role: socket.role, socketId: socket.id,
                fcmToken: data.token || existingToken, 
                status: "online", lastSeen: Date.now(),
                isRinging: wasRinging, isNative: data.isNative 
            };

            if (storesData[storeName]) {
                if (!storesData[storeName].staffTokens) storesData[storeName].staffTokens = {};
                const existing = storesData[storeName].staffTokens[username];
                if (data.token || !existing) {
                    storesData[storeName].staffTokens[username] = { 
                        token: data.token || (existing ? existing.token : null), 
                        role: socket.role,
                        isNative: data.isNative 
                    };
                    Logic.saveStoreToFirebase(storeName, db, storesData);
                }
            }

            socket.emit('menu-update', storesData[storeName].menu || []); 
            Logic.updateStoreClients(storeName, io, storesData, activeUsers, db);
            if(wasRinging) { socket.emit('ring-bell'); }
          } catch (e) {
              console.error("❌ Join Store Error:", e);
          }
        });

        socket.on('check-table-status', (data) => {
            const store = getMyStore();
            if (!store || !data.table) return;
            
            const tableRegex = new RegExp(`\\[ΤΡ:\\s*${data.table}(?:\\s+|\\]|\\|)`);
            const activeOrder = store.orders.find(o => {
                return tableRegex.test(o.text) && !o.text.includes('💳 PAID');
            });

            if (activeOrder) {
                socket.emit('table-status', { active: true, orderId: activeOrder.id, text: activeOrder.text });
            } else {
                socket.emit('table-status', { active: false });
            }
        });

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

        socket.on('set-new-pin', async (data) => { const email = data.email; if(email) { const store = await Logic.getStoreData(email, db, storesData); store.settings.pin = data.pin; store.settings.adminEmail = email; socket.emit('pin-success', { msg: "Ο κωδικός ορίστηκε!" }); Logic.updateStoreClients(email, io, storesData, activeUsers, db); } });
        
        socket.on('forgot-pin', async (data) => {
            const email = data.email || socket.store;
            const transporter = require('nodemailer').createTransport({ service: 'gmail', auth: { user: 'theroasters84@gmail.com', pass: 'goit nsbk wsae awwc' } });
            
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
                    if (err) { socket.emit('forgot-pin-response', { success: false, message: "Απέτυχε η αποστολή email." }); }
                    else { socket.emit('forgot-pin-response', { success: true, message: "Το email εστάλη! Ελέγξτε τα εισερχόμενά σας." }); }
                });
            }
        });
        
        socket.on('forgot-admin-pin', async (data) => {
            const email = data.email || socket.store;
            const transporter = require('nodemailer').createTransport({ service: 'gmail', auth: { user: 'theroasters84@gmail.com', pass: 'goit nsbk wsae awwc' } });
            if (!transporter.options.auth.pass || transporter.options.auth.pass.includes('xxxx')) {
                socket.emit('forgot-pin-response', { success: false, message: "Σφάλμα συστήματος (Email Config)." });
                return;
            }
            if (email) {
                const link = `${YOUR_DOMAIN}/reset-admin-pin?email=${encodeURIComponent(email)}`;
                const mailOptions = { from: 'BellGo System', to: email, subject: '🛡️ Επαναφορά Admin PIN', text: `Πατήστε εδώ για να ορίσετε νέο Κωδικό Διαχειριστή: ${link}` };
                transporter.sendMail(mailOptions, (err, info) => {
                    if (err) { socket.emit('forgot-pin-response', { success: false, message: "Απέτυχε η αποστολή email." }); }
                    else { socket.emit('forgot-pin-response', { success: true, message: "Το email εστάλη! Ελέγξτε τα εισερχόμενά σας." }); }
                });
            }
        });

        socket.on('update-token', (data) => { 
            const key = `${socket.store}_${data.username}`; 
            if (activeUsers[key]) activeUsers[key].fcmToken = data.token; 
            if (storesData[socket.store]) { if(!storesData[socket.store].staffTokens) storesData[socket.store].staffTokens={}; storesData[socket.store].staffTokens[data.username] = { token: data.token, role: activeUsers[key].role }; Logic.saveStoreToFirebase(socket.store, db, storesData); }
        });

        socket.on('toggle-status', (data) => { const store = getMyStore(); if (store) { if (data.type === 'customer') store.settings.statusCustomer = data.isOpen; if (data.type === 'staff') store.settings.statusStaff = data.isOpen; Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db); } });
        socket.on('save-store-name', (newName) => { const store = getMyStore(); if (store) { store.settings.name = newName; Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db); } });
        socket.on('save-store-settings', (data) => { 
            const store = getMyStore(); 
            if (store) { 
                if(data.resetTime) store.settings.resetTime = data.resetTime; 
                if(data.stripeConnectId) store.settings.stripeConnectId = data.stripeConnectId; 
                if(data.schedule) store.settings.schedule = data.schedule; 
                if(data.hours) store.settings.hours = data.hours; 
                if(data.coverPrice !== undefined) store.settings.coverPrice = data.coverPrice; 
                if(data.googleMapsUrl !== undefined) store.settings.googleMapsUrl = data.googleMapsUrl; 
                if(data.autoPrint !== undefined) store.settings.autoPrint = data.autoPrint; 
                if(data.printerEnabled !== undefined) store.settings.printerEnabled = data.printerEnabled; 
                if(data.autoClosePrint !== undefined) store.settings.autoClosePrint = data.autoClosePrint; 
                if(data.expensePresets) store.settings.expensePresets = data.expensePresets; 
                if(data.fixedExpenses) store.settings.fixedExpenses = data.fixedExpenses; 
                if(data.visibility) store.settings.visibility = data.visibility; 
                if(data.staffCharge !== undefined) store.settings.staffCharge = data.staffCharge; 
                if(data.reservationsEnabled !== undefined) store.settings.reservationsEnabled = data.reservationsEnabled; 
                if(data.totalTables !== undefined) store.settings.totalTables = data.totalTables; 
                if(data.einvoicing) store.settings.einvoicing = data.einvoicing; 
                if(data.pos) store.settings.pos = data.pos; 
                if(data.cashRegButtons) store.settings.cashRegButtons = data.cashRegButtons; 
                if(data.reward) store.settings.reward = data.reward; 
                if(data.features) store.settings.features = { ...store.settings.features, ...data.features };
                if(data.adminPin) store.settings.adminPin = data.adminPin;
                if(data.pin) store.settings.pin = data.pin;
                Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db); 
            } 
        });
        socket.on('save-menu', (data) => { 
            const store = getMyStore(); 
            if (store) { 
                try { 
                    let newMenuData = []; 
                    let mode = 'permanent'; 
                    if (Array.isArray(data)) newMenuData = data; 
                    else if (data.menu) { newMenuData = data.menu; mode = data.mode || 'permanent'; } 
                    store.menu = JSON.parse(JSON.stringify(newMenuData));
                    if (mode === 'permanent') { store.permanentMenu = JSON.parse(JSON.stringify(newMenuData)); } 
                    Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db); 
                } catch (e) { console.error(e); } 
            } 
        });
        socket.on('chat-message', (data) => { if(socket.store) { io.to(socket.store).emit('chat-message', { sender: socket.username, text: data.text }); } });

        socket.on('new-order', (data) => {
          try {
            const store = getMyStore();
            if (!store || !data) return; 
            if (!store.settings.statusCustomer && activeUsers[`${socket.store}_${socket.username}`]?.role === 'customer') return;
            let orderText = data.text || data; 
            const orderId = data.id || Date.now(); 
            
            const existingOrder = store.orders.find(o => o.id == orderId);
            
            if (existingOrder) {
                existingOrder.text = orderText; 
                existingOrder.status = 'pending'; 
                Logic.notifyAdmin(socket.store, "ΤΡΟΠΟΠΟΙΗΣΗ 📝", `Αλλαγή στην παραγγελία: ${socket.username}`, null, "", orderId, storesData, activeUsers, io, YOUR_DOMAIN, admin);
            } else {
                const tableMatch = orderText.match(/\[ΤΡ:\s*([^|\]]+)/);
                if (tableMatch) {
                    const tVal = tableMatch[1].trim().toLowerCase();
                    if (tVal === 'la' || tVal === 'λα') {
                        const lines = orderText.split('\n');
                        let treatedItems = [];
                        const newLines = lines.map(line => {
                            if (line.trim().startsWith('[')) return line; 
                            const lastColon = line.lastIndexOf(':');
                            if (lastColon !== -1) {
                                const price = parseFloat(line.substring(lastColon + 1));
                                if (!isNaN(price) && price > 0) {
                                    treatedItems.push({ name: line.substring(0, lastColon).trim(), price: price });
                                    return `${line.substring(0, lastColon).trim()}:0 (LATHOS)`; 
                                }
                            }
                            return line;
                        });
                        if (treatedItems.length > 0) Logic.logTreatStats(store, `${socket.username} (LATHOS)`, treatedItems);
                        orderText = newLines.join('\n');
                    }
                }

                let initialStatus = 'pending';
                let startTime = null;
                if (socket.role === 'admin') { initialStatus = 'cooking'; startTime = Date.now(); }
                const newOrder = { id: orderId, text: orderText, from: socket.username, status: initialStatus, store: socket.store };
                if (startTime) newOrder.startTime = startTime;
                store.orders.push(newOrder);
                
                let locationInfo = "";
                const addrMatch = orderText.match(/📍\s*(.+)/);
                if (addrMatch) locationInfo = addrMatch[1].trim();
                let notifTitle = orderText.includes('[PICKUP') ? "NEO PICKUP 🛍️" : "ΝΕΑ ΠΑΡΑΓΓΕΛΙΑ 🍕";
                Logic.notifyAdmin(socket.store, notifTitle, `Από: ${socket.username}`, socket.id, locationInfo, orderId, storesData, activeUsers, io, YOUR_DOMAIN, admin, false);
            }
            Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
          } catch (e) { console.error("❌ New Order Error:", e); }
        });

        socket.on('add-items', (data) => {
            const store = getMyStore();
            if (!store) return;
            const { id, items } = data; 
            const existingOrder = store.orders.find(o => o.id == id);
            if (existingOrder) {
                const lines = (items || "").split('\n').filter(l => l.trim());
                const markedLines = lines.map(l => `++ ${l}`).join('\n');
                existingOrder.text += `\n${markedLines}`;
                existingOrder.status = 'pending';
                Logic.notifyAdmin(socket.store, "ΠΡΟΣΘΗΚΗ ΠΡΟΪΟΝΤΩΝ ➕", `Από: ${socket.username}`, null, "", id, storesData, activeUsers, io, YOUR_DOMAIN, admin);
                Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
            }
        });

        socket.on('accept-order', (id) => { const store = getMyStore(); if(store){ const o = store.orders.find(x => x.id == id); if(o){ o.status = 'cooking'; o.startTime = Date.now(); io.to(socket.store).emit('order-changed', { id: o.id, status: 'cooking', startTime: o.startTime }); Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db); } } });
        
        socket.on('pos-pay', async (data) => {
            const store = getMyStore();
            if (!store) return;
            const pos = store.settings.pos || {};
            if (!pos.provider || !pos.id) return socket.emit('pos-result', { success: false, error: "Δεν έχουν οριστεί ρυθμίσεις POS." });
            try { await new Promise(r => setTimeout(r, 3000)); socket.emit('pos-result', { success: true }); } catch (e) { socket.emit('pos-result', { success: false, error: e.message || "Σφάλμα επικοινωνίας" }); }
        });

        socket.on('quick-order', async (data) => {
            const store = getMyStore();
            if (!store) return;
            if (data.method === 'card' && data.stripeId) {
                try {
                    let stripeOptions = store.settings.stripeConnectId ? { stripeAccount: store.settings.stripeConnectId } : undefined;
                    const paymentIntent = await stripe.paymentIntents.retrieve(data.stripeId, stripeOptions);
                } catch (e) { console.error("❌ Stripe verification failed:", e.message); }
            }
            const tempOrder = { id: data.id || Date.now(), text: data.text, from: data.source || 'Admin (Paso)', status: 'completed' };
            if (data.method === 'card') tempOrder.text += '\n💳 PAID'; else tempOrder.text += '\n💵 PAID';
            if (data.issueReceipt) { tempOrder.text += '\n[🧾 ΑΠΟΔΕΙΞΗ]'; tempOrder.aadeQr = "https://www1.aade.gr/tarl/myDATA/timologio/qrcode?mark=mock"; }
            Logic.updateStoreStats(store, tempOrder);
            Logic.saveStoreToFirebase(socket.store, db, storesData);
            socket.emit('print-quick-order', { text: tempOrder.text, id: tempOrder.id, signature: null });
        });

        socket.on('issue-receipt', (id) => { const store = getMyStore(); if(store) { const o = store.orders.find(x => x.id == id); if(o && !o.text.includes('[🧾 ΑΠΟΔΕΙΞΗ]')) { const einv = store.settings.einvoicing || {}; o.text += '\n[🧾 ΑΠΟΔΕΙΞΗ]'; if (einv.enabled) { o.aadeQr = "https://www1.aade.gr/tarl/myDATA/timologio/qrcode?mark=mock"; } Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db); } } });
        
        socket.on('charge-order-to-staff', (data) => {
            const store = getMyStore();
            if (!store) return;
            const { orderId, staffName, amount, method } = data;
            if (!store.wallets) store.wallets = {};
            const targetWallet = method === 'card' ? 'BANK_CARD' : (staffName || 'Admin');
            if (!store.wallets[targetWallet]) store.wallets[targetWallet] = 0;
            store.wallets[targetWallet] += parseFloat(amount);
            if (staffName && socket.username !== staffName) { const key = `${socket.store}_${staffName}`; const staffUser = activeUsers[key]; if (staffUser && staffUser.socketId) { io.to(staffUser.socketId).emit('ring-bell', { source: "ΤΑΜΕΙΟ 💸", location: "ΝΕΑ ΑΝΑΘΕΣΗ" }); } }
            const o = store.orders.find(x => x.id == orderId);
            if (o) { o.text += `\n✅ PAID (${method === 'card' ? '💳' : '💵'} ${staffName})`; Logic.updateStoreStats(store, o); store.orders = store.orders.filter(x => x.id != orderId); }
            Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
        });

        socket.on('reset-wallet', (targetName) => { const store = getMyStore(); if (store && store.wallets) { if (targetName === 'ALL') { store.wallets = {}; } else if (store.wallets[targetName] !== undefined) { delete store.wallets[targetName]; } Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db); } });
        socket.on('get-wallet-data', () => { const store = getMyStore(); if(store) socket.emit('wallet-update', store.wallets || {}); });
        socket.on('ready-order', (id, silent = false) => { const store = getMyStore(); if(store){ const o = store.orders.find(x => x.id == id); if(o){ o.status = 'ready'; o.readyTime = Date.now(); io.to(socket.store).emit('order-changed', { id: o.id, status: 'ready', readyTime: o.readyTime }); Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db); if (!silent) { const tKey = `${socket.store}_${o.from}`; const tUser = activeUsers[tKey]; let notifTitle = o.text.includes('[PICKUP') ? "ΕΤΟΙΜΟ ΓΙΑ ΠΑΡΑΛΑΒΗ! 🛍️" : "ΕΤΟΙΜΟ! 🛵"; let notifBody = o.text.includes('[PICKUP') ? "Μπορείτε να περάσετε από το κατάστημα." : "Η παραγγελία έρχεται!"; if(tUser) Logic.sendPushNotification(tUser, notifTitle, notifBody, { type: "alarm" }, YOUR_DOMAIN, admin, 3600); Object.values(activeUsers).filter(u => u.store === socket.store && u.role === 'driver').forEach(u => { u.isRinging = true; if (u.socketId) io.to(u.socketId).emit('ring-bell', { source: "ΚΟΥΖΙΝΑ 🍳", location: "ΕΤΟΙΜΗ ΠΑΡΑΓΓΕΛΙΑ" }); }); } } } });
        
        socket.on('assign-delivery', (data) => {
            const store = getMyStore();
            if(!store) return;
            const { orderId, targetDriver } = data;
            const order = store.orders.find(o => o.id == orderId);
            if(order) {
                if (targetDriver === 'ALL') { io.to(socket.store).emit('delivery-offer', { orderId: orderId }); } else {
                    if (!order.text.includes(`[DRIVER: ${targetDriver}]`)) { order.text += `\n[DRIVER: ${targetDriver}]`; }
                    const key = `${socket.store}_${targetDriver}`; const t = activeUsers[key];
                    if (t && t.socketId) { io.to(t.socketId).emit('ring-bell', { source: "ΑΝΑΘΕΣΗ 🛵", location: "ΝΕΑ ΠΑΡΑΓΓΕΛΙΑ" }); }
                    if (store.staffTokens && store.staffTokens[targetDriver]) { const tokenData = store.staffTokens[targetDriver]; Logic.sendPushNotification({ fcmToken: tokenData.token, role: 'driver', isNative: tokenData.isNative }, "ΝΕΑ ΔΙΑΝΟΜΗ 🛵", "Σου ανατέθηκε μια παραγγελία!", { type: "alarm" }, YOUR_DOMAIN, admin); }
                    Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
                } 
            } 
        });

        socket.on('driver-take-order', (data) => { const store = getMyStore(); if(!store) return; const { orderId } = data; const order = store.orders.find(o => o.id == orderId); if(order) { if (order.text.includes('[DRIVER:')) return; order.text += `\n[DRIVER: ${socket.username}]`; Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db); } });
        
        socket.on('pay-order', async (data) => { 
            const store = getMyStore(); 
            if(store) { 
                const orderId = typeof data === 'object' ? data.id : data; const method = data.method || 'cash'; const stripeId = data.stripeId || null; let issueReceipt = data.issueReceipt || false;
                const o = store.orders.find(x => x.id == orderId);
                if (o) {
                    if (store.settings.einvoicing && store.settings.einvoicing.enabled) { issueReceipt = true; }
                    if (method === 'card') o.text += `\n💳 PAID (CARD${stripeId ? ': ' + stripeId : ''})`; else o.text += '\n💵 PAID (CASH)';
                    if (issueReceipt) { o.text += '\n[🧾 ΑΠΟΔΕΙΞΗ]'; o.aadeQr = "https://www1.aade.gr/tarl/myDATA/timologio/qrcode?mark=mock"; }
                    Logic.updateStoreStats(store, o); store.orders = store.orders.filter(x => x.id != orderId); Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db); 
                    socket.emit('print-order', { text: o.text, aadeQr: o.aadeQr });
                }
            } 
        });

        socket.on('treat-order', (data) => {
            const store = getMyStore();
            if (store) {
                const o = store.orders.find(x => x.id == data.id);
                if (o) {
                    const lines = o.text.split('\n'); let treatedItems = [];
                    const treatLine = (line) => { if (line.includes('(KERASMA)')) return line; const lastColonIndex = line.lastIndexOf(':'); if (lastColonIndex !== -1) { const before = line.substring(0, lastColonIndex); const after = line.substring(lastColonIndex + 1); if (/^\d/.test(after.trim())) { const price = parseFloat(after) || 0; if (price > 0) treatedItems.push({ name: before.trim(), price: price }); return `${before}:0 (KERASMA)`; } } return line; };
                    if (data.type === 'full') { o.text = lines.map(treatLine).join('\n'); } else if (data.type === 'partial' && typeof data.index === 'number') { if (lines[data.index]) { lines[data.index] = treatLine(lines[data.index]); o.text = lines.join('\n'); } }
                    if (treatedItems.length > 0) { Logic.logTreatStats(store, socket.username, treatedItems); }
                    Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
                }
            }
        });

        socket.on('save-expenses', (data) => { const store = getMyStore(); if (store) { const now = new Date(); const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' }); const [year, month, day] = dateStr.split('-'); const monthKey = `${year}-${month}`; if (!store.stats) store.stats = {}; if (!store.stats[monthKey]) store.stats[monthKey] = { orders: 0, turnover: 0, days: {} }; if (!store.stats[monthKey].days[day]) store.stats[monthKey].days[day] = { orders: 0, turnover: 0 }; store.stats[monthKey].days[day].expenses = { text: data.text, total: data.total }; Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db); } });
        socket.on('get-stats', () => { const store = getMyStore(); if (store && store.stats && socket.role === 'admin') { socket.emit('stats-data', store.stats); } else { socket.emit('stats-data', {}); } });
        
        socket.on('create-reservation', (data) => {
            const store = getMyStore();
            if (!store) return;
            const { name, phone, date, time, pax, customerToken } = data; const totalTables = parseInt(store.settings.totalTables) || 0;
            if (!store.settings.reservationsEnabled || totalTables === 0) { socket.emit('reservation-result', { success: false, error: "Οι κρατήσεις είναι κλειστές." }); return; }
            const reqDate = new Date(`${date}T${time}`); const reqTime = reqDate.getTime();
            const conflicting = (store.reservations || []).filter(r => { const rTime = new Date(`${r.date}T${r.time}`).getTime(); return Math.abs(rTime - reqTime) < 7200000; });
            let occupied = 0; const now = Date.now();
            if (reqTime > now && reqTime - now < 7200000) { const activeTables = new Set(); store.orders.forEach(o => { if (o.status !== 'completed' && !o.text.includes('PAID')) { const m = o.text.match(/\[ΤΡ:\s*([^|\]]+)/); if (m) activeTables.add(m[1]); } }); occupied = activeTables.size; }
            if (conflicting.length + occupied >= totalTables) { socket.emit('reservation-result', { success: false, error: "Δεν υπάρχει διαθεσιμότητα για αυτή την ώρα." }); return; }
            const newRes = { id: Date.now(), name, phone, date, time, pax, status: 'pending', notified: false, customerToken: customerToken || null, notifiedCustomer3h: false };
            if (!store.reservations) store.reservations = []; store.reservations.push(newRes);
            Logic.saveStoreToFirebase(socket.store, db, storesData);
            socket.emit('reservation-result', { success: true, reservationId: newRes.id }); 
            Logic.notifyAdmin(socket.store, "ΝΕΑ ΚΡΑΤΗΣΗ (ΑΝΑΜΟΝΗ) 📅", `${name} (${pax} άτ.)\n${date} ${time}`, null, "", null, storesData, activeUsers, io, YOUR_DOMAIN, admin);
            io.to(socket.store).emit('reservations-update', store.reservations);
        });

        socket.on('accept-reservation', (id) => { const store = getMyStore(); if(store && store.reservations) { const r = store.reservations.find(x => x.id === id); if(r) { r.status = 'confirmed'; Logic.saveStoreToFirebase(socket.store, db, storesData); io.to(socket.store).emit('reservations-update', store.reservations); io.to(socket.store).emit('reservation-confirmed', { id: id }); } } });
        socket.on('complete-reservation', (id) => { const store = getMyStore(); if(store && store.reservations) { const r = store.reservations.find(x => x.id === id); if(r) { r.status = 'completed'; Logic.saveStoreToFirebase(socket.store, db, storesData); io.to(socket.store).emit('reservations-update', store.reservations); } } });
        socket.on('get-reservations', () => { const store = getMyStore(); if(store) socket.emit('reservations-update', store.reservations || []); });
        socket.on('get-customer-reservations', (ids) => { const store = getMyStore(); if(store && store.reservations && Array.isArray(ids)) { const myRes = store.reservations.filter(r => ids.includes(r.id)); socket.emit('my-reservations-data', myRes); } else { socket.emit('my-reservations-data', []); } });
        socket.on('cancel-reservation-customer', (id) => { const store = getMyStore(); if(store && store.reservations) { const r = store.reservations.find(x => x.id === id); if(r) { Logic.notifyAdmin(socket.store, "ΑΚΥΡΩΣΗ ΚΡΑΤΗΣΗΣ ❌", `Ο πελάτης ${r.name} ακύρωσε την κράτηση (${r.date} ${r.time}).`, null, "", null, storesData, activeUsers, io, YOUR_DOMAIN, admin); store.reservations = store.reservations.filter(x => x.id !== id); Logic.saveStoreToFirebase(socket.store, db, storesData); io.to(socket.store).emit('reservations-update', store.reservations); socket.emit('reservation-cancelled-success', id); } } });
        socket.on('delete-reservation', (id) => { const store = getMyStore(); if(store && store.reservations) { const rIndex = store.reservations.findIndex(r => r.id === id); if (rIndex > -1) { const r = store.reservations[rIndex]; if (r.customerToken) { Logic.sendPushNotification({ fcmToken: r.customerToken, role: 'customer' }, "ΑΚΥΡΩΣΗ ΚΡΑΤΗΣΗΣ ❌", `Η κράτησή σας για ${r.date} ${r.time} ακυρώθηκε από το κατάστημα.`, { type: "info" }, YOUR_DOMAIN, admin); Logic.sendPushNotification({ fcmToken: r.customerToken, role: 'customer', store: socket.store }, "ΑΚΥΡΩΣΗ ΚΡΑΤΗΣΗΣ ❌", `Η κράτησή σας για ${r.date} ${r.time} ακυρώθηκε από το κατάστημα.`, { type: "info" }, YOUR_DOMAIN, admin); } store.reservations.splice(rIndex, 1); Logic.saveStoreToFirebase(socket.store, db, storesData); io.to(socket.store).emit('reservations-update', store.reservations); } } });
        
        socket.on('get-dev-analytics', async () => {
            let allStores = Object.values(storesData).map(s => ({ name: s.settings.name, email: s.settings.adminEmail, plan: s.settings.plan || 'basic' }));
            if (db) { try { const snapshot = await db.collection('stores').get(); const dbStores = []; snapshot.forEach(doc => { const d = doc.data(); dbStores.push({ name: d.settings?.name || doc.id, email: d.settings?.adminEmail || doc.id, plan: d.settings?.plan || 'basic' }); }); if (dbStores.length > 0) allStores = dbStores; } catch(e) { console.log("Analytics DB Error", e.message); } }
            const uniqueEmails = [...new Set(allStores.map(s => s.email).filter(e => e && e.includes('@')))];
            const revenue = allStores.reduce((sum, s) => sum + (s.plan === 'premium' ? 10 : 4), 0);
            socket.emit('dev-analytics-data', { stores: allStores, emails: uniqueEmails, revenue: revenue });
        });

        socket.on('pay-partial', (data) => { 
            const store = getMyStore(); 
            if(store){ 
                const o = store.orders.find(x => x.id == data.id); 
                if(o){ 
                    let lines = o.text.split('\n'); 
                    if(lines[data.index]) { 
                        let line = lines[data.index];
                        const clean = line.replace(/ ✅ 💶| ✅ 💳| ✅/g, '');
                        let newTag = '';
                        if (data.method === 'cash') { if (!line.includes('✅ 💶')) newTag = ' ✅ 💶'; } else if (data.method === 'card') { if (!line.includes('✅ 💳')) newTag = ' ✅ 💳'; } else { if (!line.includes('✅')) newTag = ' ✅'; }
                        lines[data.index] = clean + newTag;
                        o.text = lines.join('\n'); 
                        Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db); 
                    } 
                } 
            } 
        });
        
        socket.on('trigger-alarm', (data) => { 
            const tName = (typeof data === 'object') ? data.target : data;
            const source = (typeof data === 'object') ? data.source : "Admin";
            const key = `${socket.store}_${tName}`; 
            const t = activeUsers[key]; 
            if(t){ t.isRinging = true; Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db); if(t.socketId) io.to(t.socketId).emit('ring-bell', { source: source, location: source }); } 
            const store = getMyStore();
            if (store && store.staffTokens && store.staffTokens[tName]) {
                const tokenData = store.staffTokens[tName];
                Logic.sendPushNotification({ fcmToken: tokenData.token, role: tokenData.role, isNative: tokenData.isNative }, "📞 ΣΕ ΚΑΛΟΥΝ!", `Ο ${source} σε ζητάει!`, { type: "alarm", location: source }, YOUR_DOMAIN, admin, 10);
            } 
        });
        
        socket.on('admin-stop-ringing', () => { 
            const store = getMyStore(); 
            if(store) {
                 Object.values(activeUsers).filter(u => u.store === socket.store && (u.role === 'admin' || u.role === 'kitchen')).forEach(u => {
                     u.isRinging = false;
                     if(u.socketId) io.to(u.socketId).emit('stop-bell');
                 });
                 Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
            }
        });

        socket.on('alarm-accepted', (data) => { let userKey = null; if (data && data.store && data.username) { const directKey = `${data.store}_${data.username}`; if (activeUsers[directKey]) userKey = directKey; } if (!userKey) { for (const [key, user] of Object.entries(activeUsers)) { if (user.socketId === socket.id) { userKey = key; break; } } } if (userKey) { const user = activeUsers[userKey]; user.isRinging = false; io.to(user.store).emit('staff-accepted-alarm', { username: user.username }); Logic.updateStoreClients(user.store, io, storesData, activeUsers, db); } });
        
        socket.on('manual-logout', (data) => { 
            const tUser = data && data.targetUser ? data.targetUser : socket.username; 
            const tKey = `${socket.store}_${tUser}`; 
            const banKey = `${socket.store}_${tUser}`;
            tempBlacklist.add(banKey);
            setTimeout(() => tempBlacklist.delete(banKey), 15000);
            
            if (activeUsers[tKey]) { 
                if (activeUsers[tKey].socketId) {
                    io.to(activeUsers[tKey].socketId).emit('force-logout');
                    const targetSocket = io.sockets.sockets.get(activeUsers[tKey].socketId);
                    if (targetSocket) { setTimeout(() => targetSocket.disconnect(true), 1000); }
                }
                delete activeUsers[tKey]; 
            }
            if (storesData[socket.store] && storesData[socket.store].staffTokens) { 
                const tokenData = storesData[socket.store].staffTokens[tUser];
                if (tokenData && tokenData.token) { Logic.sendPushNotification( { fcmToken: tokenData.token, role: tokenData.role, isNative: tokenData.isNative }, "LOGOUT", "Αποσύνδεση από διαχειριστή", { type: "logout" }, YOUR_DOMAIN, admin ); }
                delete storesData[socket.store].staffTokens[tUser]; 
                if (db) { db.collection('stores').doc(socket.store).update({ [`staffTokens.${tUser}`]: admin.firestore.FieldValue.delete() }).catch(e => console.log("Firestore delete error (ignored):", e.message)); }
                Logic.saveStoreToFirebase(socket.store, db, storesData); 
            }
            Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
        });
        
        socket.on('disconnect', () => { 
            let user = null;
            const key = `${socket.store}_${socket.username}`;
            if (activeUsers[key] && activeUsers[key].socketId === socket.id) { user = activeUsers[key]; } else { for (const k in activeUsers) { if (activeUsers[k].socketId === socket.id) { user = activeUsers[k]; break; } } }
            if (user) { user.status = 'offline'; Logic.updateStoreClients(user.store, io, storesData, activeUsers, db); } 
        });

        socket.on('heartbeat', () => { 
            const key = `${socket.store}_${socket.username}`; 
            if (activeUsers[key]) { 
                activeUsers[key].lastSeen = Date.now(); 
                if (activeUsers[key].status === 'away' || activeUsers[key].status === 'offline') { activeUsers[key].status = 'online'; Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db); }
            } 
        });
        
        socket.on('set-user-status', (status) => {
            const key = `${socket.store}_${socket.username}`;
            if (activeUsers[key]) {
                activeUsers[key].status = status;
                Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
            }
        });
    });
};