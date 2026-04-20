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
            const key = `${socket.store}_${data.username}`;
            let currentRole = 'waiter';
            let currentIsNative = false;

            if (activeUsers[key]) {
                activeUsers[key].fcmToken = data.token;
                currentRole = activeUsers[key].role;
                currentIsNative = activeUsers[key].isNative;
            }
            if (storesData[socket.store]) {
                if (!storesData[socket.store].staffTokens) {
                    storesData[socket.store].staffTokens = {};
                }
                const existing = storesData[socket.store].staffTokens[data.username];
                if (!activeUsers[key] && existing) {
                    currentRole = existing.role;
                    currentIsNative = existing.isNative;
                }
                storesData[socket.store].staffTokens[data.username] = {
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
                store.stats[monthKey].days[day].expenses = { text: data.text, total: data.total };
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
            let allStores = Object.values(storesData).map(s => ({ name: s.settings.name, email: s.settings.adminEmail, plan: s.settings.plan || 'basic' }));
            if (db) { try { const snapshot = await db.collection('stores').get(); const dbStores = []; snapshot.forEach(doc => { const d = doc.data(); dbStores.push({ name: d.settings?.name || doc.id, email: d.settings?.adminEmail || doc.id, plan: d.settings?.plan || 'basic' }); }); if (dbStores.length > 0) allStores = dbStores; } catch(e) { console.log("Analytics DB Error", e.message); } }
            const uniqueEmails = [...new Set(allStores.map(s => s.email).filter(e => e && e.includes('@')))];
            const revenue = allStores.reduce((sum, s) => sum + (s.plan === 'premium' ? 10 : 4), 0);
            socket.emit('dev-analytics-data', { stores: allStores, emails: uniqueEmails, revenue: revenue });
        });

        socket.on('trigger-alarm', (data) => { 
            const tName = (typeof data === 'object') ? data.target : data;
            const source = (typeof data === 'object') ? data.source : "Admin";
            const key = `${socket.store}_${tName}`; 
            const t = activeUsers[key];
            
            if (t) {
                t.isRinging = true;
                Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
                if (t.socketId) io.to(t.socketId).emit('ring-bell', { source: source, location: source });
            } 
            const store = getMyStore();
            if (store && store.staffTokens && store.staffTokens[tName]) {
                const tokenData = store.staffTokens[tName];
                Logic.sendPushNotification({ fcmToken: tokenData.token, role: tokenData.role, isNative: tokenData.isNative }, "📞 ΣΕ ΚΑΛΟΥΝ!", `Ο ${source} σε ζητάει!`, { type: "alarm", location: source }, YOUR_DOMAIN, admin, 10);
            } 
        });
        
        socket.on('admin-stop-ringing', () => { 
            const store = getMyStore(); 
            if(store) {
                 Object.values(activeUsers).filter(u => u.store === socket.store && (u.role === 'admin' || u.role === 'kitchen' || u.role === 'waiter')).forEach(u => {
                     u.isRinging = false;
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
                user.status = 'offline';
                Logic.updateStoreClients(user.store, io, storesData, activeUsers, db);
            } 
        });

        socket.on('heartbeat', () => { 
            const key = `${socket.store}_${socket.username}`; 
            if (activeUsers[key]) { 
                activeUsers[key].lastSeen = Date.now(); 
                if (activeUsers[key].status === 'away' || activeUsers[key].status === 'offline') {
                    activeUsers[key].status = 'online';
                    Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
                }
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