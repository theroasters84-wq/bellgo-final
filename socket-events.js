// Entry point για τα WebSockets
const Logic = require('./logic');
const authHandler = require('./socket-authHandler');
const ordersHandler = require('./socket-ordersHandler');
const reservationsHandler = require('./socket-reservationsHandler');

module.exports = function(context) {
    const { io, storesData, activeUsers, tempBlacklist, db, admin, stripe, YOUR_DOMAIN, transporter } = context;

    io.on('connection', (socket) => {
        // ✅ ΠΑΝΤΟΔΥΝΑΜΟΣ LOGGER - Καταγράφει ΟΛΑ τα εισερχόμενα σήματα
        socket.onAny((eventName, ...args) => {
            if (eventName === 'heartbeat' || eventName === 'get-stats' || eventName === 'get-wallet-data' || eventName === 'get-reservations') return;
            console.log(`[⚡ EVENT LOG] Πήρα σήμα: '${eventName}' από: ${socket.username || socket.id}`);
        });

        const getMyStore = () => {
            if (!socket.store) return null;
            return storesData[socket.store];
        };

        // --- Handlers ---
        authHandler(socket, context, getMyStore);
        ordersHandler(socket, context, getMyStore);
        reservationsHandler(socket, context, getMyStore);

        socket.on('join-store', async (data) => {
          try {
            let rawStore = data.storeName || '';
            if ((!rawStore || rawStore === 'null') && data.role === 'customer') {
                console.log("⚠️ Customer tried to join without storeName");
                return;
            }
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
            console.log(`[🚀 JOIN] Ο ${username} (Role: ${socket.role}) μπήκε στο κατάστημα: ${storeName}`); 

            const key = `${storeName}_${username}`;
            const wasRinging = activeUsers[key]?.isRinging || false;
            const existingToken = activeUsers[key]?.fcmToken;

            activeUsers[key] = {
                store: storeName, username, role: socket.role, socketId: socket.id,
                fcmToken: data.token || existingToken, 
                status: data.status || "online", lastSeen: Date.now(),
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
            if (wasRinging) {
                socket.emit('ring-bell');
            }
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

        socket.on('update-token', (data) => {
            const safeUsername = (data.username || '').trim();
            const key = `${socket.store}_${safeUsername}`;
            let currentRole = data.role || 'waiter';
            let currentIsNative = data.isNative || false;

            if (activeUsers[key]) {
                activeUsers[key].fcmToken = data.token;
                currentRole = activeUsers[key].role;
                currentIsNative = activeUsers[key].isNative;
            }
            if (storesData[socket.store]) {
                if (!storesData[socket.store].staffTokens) {
                    storesData[socket.store].staffTokens = {};
                }
                const existing = storesData[socket.store].staffTokens[safeUsername];
                if (!activeUsers[key] && existing) {
                    currentRole = existing.role;
                    currentIsNative = existing.isNative;
                }
                if (data.role) currentRole = data.role; // ✅ Force role from client
                storesData[socket.store].staffTokens[safeUsername] = {
                    token: data.token,
                    role: currentRole,
                    isNative: currentIsNative
                };
                Logic.saveStoreToFirebase(socket.store, db, storesData);
            }
        });

        socket.on('save-menu', (data) => {
            const store = getMyStore();
            if (store) {
                try {
                    let newMenuData = [];
                    let mode = 'permanent';
                    if (Array.isArray(data)) {
                        newMenuData = data;
                    } else if (data.menu) {
                        newMenuData = data.menu;
                        mode = data.mode || 'permanent';
                    }
                    store.menu = JSON.parse(JSON.stringify(newMenuData));
                    if (mode === 'permanent') {
                        store.permanentMenu = JSON.parse(JSON.stringify(newMenuData));
                    }
                    Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
                } catch (e) {
                    console.error(e);
                }
            }
        });

        socket.on('chat-message', (data) => {
            if (socket.store) {
                io.to(socket.store).emit('chat-message', { sender: socket.username, text: data.text });
            }
        });

        socket.on('reset-wallet', (targetName) => {
            const store = getMyStore();
            if (store && store.wallets) {
                if (targetName === 'ALL') {
                    store.wallets = {};
                } else if (store.wallets[targetName] !== undefined) {
                    delete store.wallets[targetName];
                }
                Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
            }
        });

        socket.on('get-wallet-data', () => {
            const store = getMyStore();
            if (store) {
                socket.emit('wallet-update', store.wallets || {});
            }
        });

        socket.on('save-expenses', (data) => {
            const store = getMyStore();
            if (store) {
                const now = new Date();
                const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });
                const [year, month, day] = dateStr.split('-');
                const monthKey = `${year}-${month}`;
                if (!store.stats) store.stats = {};
                if (!store.stats[monthKey]) store.stats[monthKey] = { orders: 0, turnover: 0, days: {} };
                if (!store.stats[monthKey].days[day]) store.stats[monthKey].days[day] = { orders: 0, turnover: 0 };
                store.stats[monthKey].days[day].expenses = { text: data.text, total: data.total, wages: data.wages, wagesList: data.wagesList || [] };
                Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
            }
        });

        socket.on('get-stats', () => {
            const store = getMyStore();
            if (store && store.stats && socket.role === 'admin') {
                socket.emit('stats-data', store.stats);
            } else {
                socket.emit('stats-data', {});
            }
        });
        
        socket.on('get-dev-analytics', async () => {
            const packagePrices = { pack_chat: 4, pack_manager: 10, pack_delivery: 15, pack_tables: 15, pack_pos: 20, pack_loyalty: 5 };
            let allStores = Object.values(storesData).map(s => ({ name: s.settings.name, email: s.settings.adminEmail, plan: s.settings.plan || 'basic', features: s.settings.features || {} }));
            if (db) { try { const snapshot = await db.collection('stores').get(); const dbStores = []; snapshot.forEach(doc => { const d = doc.data(); dbStores.push({ name: d.settings?.name || doc.id, email: d.settings?.adminEmail || doc.id, plan: d.settings?.plan || 'basic', features: d.settings?.features || {} }); }); if (dbStores.length > 0) allStores = dbStores; } catch(e) { console.log("Analytics DB Error", e.message); } }
            const uniqueEmails = [...new Set(allStores.map(s => s.email).filter(e => e && e.includes('@')))];
            
            let totalRevenue = 0;
            const validStores = allStores.filter(s => s.email !== 'debug_room').map(s => {
                let storeRev = 0;
                if (s.features) {
                    for (const [key, price] of Object.entries(packagePrices)) {
                        if (s.features[key] === true) storeRev += price;
                    }
                }
                s.realRevenue = storeRev;
                totalRevenue += storeRev;
                return s;
            });

            socket.emit('dev-analytics-data', { stores: validStores, emails: uniqueEmails, revenue: totalRevenue });
        });

        // ✅ NEW: Reset all test subscriptions in Firebase
        socket.on('dev-reset-subscriptions', async () => {
            if (db) {
                try {
                    const snapshot = await db.collection('stores').get();
                    const batch = db.batch();
                    snapshot.forEach(doc => {
                        const storeRef = db.collection('stores').doc(doc.id);
                        batch.update(storeRef, { 'settings.features': {}, 'settings.plan': 'basic' });
                    });
                    await batch.commit();
                    for (let key in storesData) {
                        if (storesData[key].settings) { storesData[key].settings.features = {}; storesData[key].settings.plan = 'basic'; }
                    }
                    socket.emit('dev-reset-success');
                } catch(e) {
                    console.log("Reset DB Error", e.message);
                }
            }
        });

        socket.on('trigger-alarm', (data) => { 
            const tName = (typeof data === 'object') ? data.target : data;
            const source = (typeof data === 'object') ? data.source : "Admin";
            const key = `${socket.store}_${tName}`; 
            let t = activeUsers[key];
            
            if (!t) {
                const store = getMyStore();
                if (store && store.staffTokens && store.staffTokens[tName]) {
                    const tokenData = store.staffTokens[tName];
                    activeUsers[key] = {
                        store: socket.store, username: tName, role: tokenData.role, socketId: null,
                        fcmToken: tokenData.token, status: 'offline', lastSeen: Date.now(),
                        isRinging: false, isNative: tokenData.isNative
                    };
                    t = activeUsers[key];
                }
            }
            
            if (t) {
                t.isRinging = true;
                t.ringStartTime = Date.now();
                t.alarmReceived = false;
                t.alarmFailed = false;
                Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
                if (t.socketId) io.to(t.socketId).emit('ring-bell', { source: source, location: source });
            } 
            const store = getMyStore();
            if (store && store.staffTokens && store.staffTokens[tName]) {
                const tokenData = store.staffTokens[tName];
                Logic.sendPushNotification({ fcmToken: tokenData.token, role: tokenData.role, isNative: tokenData.isNative }, "📞 ΣΕ ΚΑΛΟΥΝ!", `Ο ${source} σε ζητάει!`, { type: "alarm", location: source, targetUser: tName, targetStore: socket.store }, YOUR_DOMAIN, admin, 10);
            } 
        });
        
        socket.on('alarm-received', () => {
            if (!socket.store || !socket.username) return;
            const key = `${socket.store}_${socket.username}`;
            const t = activeUsers[key];
            if (t) {
                t.alarmReceived = true;
                t.alarmFailed = false;
                Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
            }
        });

        socket.on('admin-stop-ringing', () => { 
            const store = getMyStore(); 
            if(store) {
                 Object.values(activeUsers).filter(u => u.store === socket.store && (u.role === 'admin' || u.role === 'kitchen' || u.role === 'waiter' || u.role === 'driver')).forEach(u => {
                     u.isRinging = false;
                     u.alarmFailed = false;
                     u.alarmReceived = false;
                     if (u.socketId) {
                         io.to(u.socketId).emit('stop-bell');
                     }
                 });
                 Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
            }
        });

        socket.on('alarm-accepted', (data) => {
            let userKey = null;
            if (data && data.store && data.username) {
                const directKey = `${data.store}_${data.username}`;
                if (activeUsers[directKey]) userKey = directKey;
            }
            if (!userKey) {
                for (const [key, user] of Object.entries(activeUsers)) {
                    if (user.socketId === socket.id) {
                        userKey = key;
                        break;
                    }
                }
            }
            if (userKey) {
                const user = activeUsers[userKey];
                user.isRinging = false;
                user.alarmFailed = false;
                user.alarmReceived = false;
                io.to(user.store).emit('staff-accepted-alarm', { username: user.username });
                Logic.updateStoreClients(user.store, io, storesData, activeUsers, db);
            }
        });
        
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
                    if (targetSocket) {
                        setTimeout(() => targetSocket.disconnect(true), 1000);
                    }
                }
                delete activeUsers[tKey];
            }
            if (storesData[socket.store] && storesData[socket.store].staffTokens) { 
                const tokenData = storesData[socket.store].staffTokens[tUser];
                if (tokenData && tokenData.token) {
                    Logic.sendPushNotification( { fcmToken: tokenData.token, role: tokenData.role, isNative: tokenData.isNative }, "LOGOUT", "Αποσύνδεση από διαχειριστή", { type: "logout" }, YOUR_DOMAIN, admin );
                }
                delete storesData[socket.store].staffTokens[tUser];
                if (db) {
                    db.collection('stores').doc(socket.store).update({ [`staffTokens.${tUser}`]: admin.firestore.FieldValue.delete() }).catch(e => console.log("Firestore delete error (ignored):", e.message));
                }
                Logic.saveStoreToFirebase(socket.store, db, storesData); 
            }
            Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
        });
        
        socket.on('client-closing', () => {
            if (!socket.store || !socket.username) return;
            const key = `${socket.store}_${socket.username}`;
            if (activeUsers[key]) {
                console.log(`[🚪 TAB CLOSED] Ο ${socket.username} έκλεισε την καρτέλα.`);
                activeUsers[key].status = 'offline';
                Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
            }
        });

        socket.on('disconnect', () => { 
            let user = null;
            const key = `${socket.store}_${socket.username}`;
            if (activeUsers[key] && activeUsers[key].socketId === socket.id) {
                user = activeUsers[key];
            } else {
                for (const k in activeUsers) {
                    if (activeUsers[k].socketId === socket.id) {
                        user = activeUsers[k];
                        break;
                    }
                }
            }
            if (user) {
                const prevStatus = user.status;
                // Αν έκλεισε σκόπιμα την καρτέλα, είναι ήδη offline. Αλλιώς, μπαίνει σε Αναμονή (Purple).
                if (user.status !== 'offline') {
                    user.status = 'sleeping';
                }
                console.log(`[🔌 DISCONNECT] Ο ${user.username} αποσυνδέθηκε! Status: ${prevStatus} -> ${user.status}`);
                Logic.updateStoreClients(user.store, io, storesData, activeUsers, db);
            } 
        });

        socket.on('heartbeat', (data) => {
            if (!socket.store || !socket.username) return;
            const key = `${socket.store}_${socket.username}`; 
            
            // Αν το client στέλνει την κατάστασή του (online/background), την παίρνουμε. Αλλιώς υποθέτουμε online.
            const clientStatus = (data && data.status) ? data.status : 'online';

            if (!activeUsers[key]) {
                // BUG FIX: Ο server ξέχασε τον χρήστη αλλά το κινητό στέλνει ακόμα heartbeat!
                console.log(`[⚠️ GHOST RECOVERY] Ο ${socket.username} έστελνε heartbeat αλλά έλειπε από τη μνήμη! Επαναφορά σε: ${clientStatus.toUpperCase()}`);
                activeUsers[key] = {
                    store: socket.store, username: socket.username, role: socket.role, socketId: socket.id,
                    fcmToken: (storesData[socket.store]?.staffTokens?.[socket.username]?.token) || null,
                    status: clientStatus, lastSeen: Date.now(),
                    isRinging: false, isNative: false 
                };
                Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
                return;
            }
            
            activeUsers[key].lastSeen = Date.now(); 
            if (activeUsers[key].status === 'offline' || activeUsers[key].status === 'sleeping') {
                console.log(`[🟢 ΕΠΑΝΑΦΟΡΑ] Ο ${socket.username} επανήλθε μέσω Heartbeat σε: ${clientStatus.toUpperCase()}`);
                activeUsers[key].status = clientStatus;
                Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
            } else if (activeUsers[key].status !== clientStatus) {
                activeUsers[key].status = clientStatus;
                Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
            }
        });
        
        socket.on('set-user-status', (status) => {
            if (!socket.store || !socket.username) return;
            const key = `${socket.store}_${socket.username}`;
            if (activeUsers[key] && activeUsers[key].status !== status) {
                console.log(`[🔄 STATUS CHANGE] Ο ${socket.username} άλλαξε κατάσταση σε: ${status.toUpperCase()}`);
                activeUsers[key].status = status;
                activeUsers[key].lastSeen = Date.now(); // Ανανέωση χρόνου για να μην πέσει σε timeout
                Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
            }
        });
    });
};