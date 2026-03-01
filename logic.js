const path = require('path');

const defaultSettings = { 
    name: "BellGo Delivery", 
    pin: null, 
    adminEmail: "", 
    adminPin: null, // ✅ NEW: Admin Lock PIN
    statusCustomer: true, 
    statusStaff: true,
    resetTime: "04:00",
    stripeConnectId: "",
    coverPrice: 0, 
    googleMapsUrl: "", 
    autoPrint: false, 
    printerEnabled: true, 
    autoClosePrint: false, 
    plan: 'basic', 
    visibility: 'public', 
    staffCharge: false, 
    reservationsEnabled: false, 
    totalTables: 0, 
    einvoicing: {}, 
    pos: { provider: '', id: '', key: '' }, 
    cashRegButtons: [], 
    reward: { enabled: false, gift: "Δωρεάν Προϊόν", target: 5 }, 
    features: {
        pack_chat: false,
        pack_manager: false,
        pack_delivery: false,
        pack_tables: false,
        pack_pos: false,
        pack_loyalty: false
    }
}; 

module.exports = {
    defaultSettings,

    async getStoreData(storeName, db, storesData) {
        if (storesData[storeName]) return storesData[storeName];
        console.log(`📥 Loading data for: ${storeName}`);
        let data = { settings: { ...defaultSettings }, menu: [], orders: [], staffTokens: {}, wallets: {}, reservations: [] };

        try {
            if (db) {
                const doc = await db.collection('stores').doc(storeName).get();
                if (doc.exists) {
                    const firebaseData = doc.data();
                    if (firebaseData.settings) data.settings = { ...defaultSettings, ...firebaseData.settings };
                    if (firebaseData.menu) data.menu = firebaseData.menu;
                    if (firebaseData.staffTokens) data.staffTokens = firebaseData.staffTokens;
                    if (firebaseData.stats) data.stats = firebaseData.stats;
                    if (firebaseData.wallets) data.wallets = firebaseData.wallets;
                    if (firebaseData.rewards) data.rewards = firebaseData.rewards;
                    if (firebaseData.reservations) data.reservations = firebaseData.reservations;
                    data.permanentMenu = firebaseData.permanentMenu || JSON.parse(JSON.stringify(data.menu || []));
                    if (firebaseData.orders) {
                        const yesterday = Date.now() - (24 * 60 * 60 * 1000);
                        data.orders = (firebaseData.orders || []).filter(o => o.id > yesterday);
                    }
                } else {
                    await db.collection('stores').doc(storeName).set(data);
                }
            }
        } catch (e) {
            console.error(`❌ Error loading store ${storeName}:`, e.message);
        }
        storesData[storeName] = data;
        return data;
    },

    async saveStoreToFirebase(storeName, db, storesData) {
        if (!storesData[storeName] || !db) return;
        try { 
            await db.collection('stores').doc(storeName).set(storesData[storeName], { merge: true }); 
        } catch(e){ console.error(`❌ Save Error (${storeName}):`, e.message); }
    },

    async updateStoreClients(storeName, io, storesData, activeUsers, db) {
        if (!storeName || !storesData[storeName]) return;
        const store = storesData[storeName];
        
        let activeList = Object.values(activeUsers)
            .filter(u => u.store === storeName && u.role !== 'customer');

        let list = [];
        const seenUsers = new Set();

        activeList.forEach(u => {
            const lower = u.username.toLowerCase();
            if (!seenUsers.has(lower)) {
                seenUsers.add(lower);
                list.push({ name: u.username, username: u.username, role: u.role, status: u.status, isRinging: u.isRinging });
            }
        });

        if (store.staffTokens) {
            Object.keys(store.staffTokens).forEach(username => {
                if (!seenUsers.has(username.toLowerCase())) {
                    const tokenData = store.staffTokens[username];
                    if (tokenData.role !== 'admin' && tokenData.role !== 'customer') {
                        list.push({
                            name: username, username: username, 
                            role: tokenData.role || 'waiter', 
                            status: 'offline', isRinging: false 
                        });
                        seenUsers.add(username.toLowerCase());
                    }
                }
            });
        }

        io.to(storeName).emit('staff-list-update', list);
        io.to(storeName).emit('orders-update', store.orders);
        io.to(storeName).emit('menu-update', store.menu || []); 
        io.to(storeName).emit('store-settings-update', store.settings);
        io.to(storeName).emit('wallet-update', store.wallets || {});
        
        await this.saveStoreToFirebase(storeName, db, storesData);
    },

    updateStoreStats(store, order) {
        if (!store.stats) store.stats = {};
        
        let total = 0;
        let items = {};
        const lines = (order.text || "").split('\n');
        
        lines.forEach(line => {
            let cleanLine = line.replace('++ ', '').replace('✅ ', '').trim();
            if (cleanLine.startsWith('[')) return;

            const match = cleanLine.match(/^(\d+)\s+(.*)/);
            if (match) {
                let qty = parseInt(match[1]);
                let rest = match[2];
                let price = 0;
                let name = rest;

                if (rest.includes(':')) {
                    const parts = rest.split(':');
                    const priceStr = parts[parts.length - 1];
                    price = parseFloat(priceStr) || 0;
                    name = parts.slice(0, -1).join(':').trim();
                }

                if (name) {
                    if (!items[name]) items[name] = 0;
                    items[name] += qty;
                    total += qty * price;
                }
            }
        });

        const now = new Date();
        const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });
        const [year, month, day] = dateStr.split('-');
        const monthKey = `${year}-${month}`;
        const hourStr = now.toLocaleTimeString('en-US', { timeZone: 'Europe/Athens', hour: '2-digit', hour12: false });
        const hour = hourStr.padStart(2, '0');

        if (!store.stats[monthKey]) store.stats[monthKey] = { orders: 0, turnover: 0, days: {}, products: {} };
        const mStats = store.stats[monthKey];

        mStats.orders++;
        mStats.turnover += total;

        if (!mStats.hours) mStats.hours = {};
        if (!mStats.hours[hour]) mStats.hours[hour] = 0;
        mStats.hours[hour]++;

        if (!mStats.days) mStats.days = {};
        if (!mStats.days[day]) mStats.days[day] = { orders: 0, turnover: 0, products: {}, staff: {} };
        mStats.days[day].orders++;
        mStats.days[day].turnover += total;

        if (!mStats.days[day].hours) mStats.days[day].hours = {};
        if (!mStats.days[day].hours[hour]) mStats.days[day].hours[hour] = 0;
        mStats.days[day].hours[hour]++;

        const isQr = (order.from && order.from.includes('(Πελάτης)'));
        if (isQr) {
            let qrType = null;
            if (order.text.includes('[ΤΡ:') || order.text.includes('[ΤΡ')) qrType = 'dineIn';
            else if (order.text.includes('[DELIVERY')) qrType = 'delivery';

            if (qrType) {
                if (!mStats.qrStats) mStats.qrStats = { dineIn: { turnover: 0, orders: 0 }, delivery: { turnover: 0, orders: 0 } };
                if (!mStats.qrStats[qrType]) mStats.qrStats[qrType] = { turnover: 0, orders: 0 };
                mStats.qrStats[qrType].turnover += total;
                mStats.qrStats[qrType].orders++;

                if (!mStats.days[day].qrStats) mStats.days[day].qrStats = { dineIn: { turnover: 0, orders: 0 }, delivery: { turnover: 0, orders: 0 } };
                if (!mStats.days[day].qrStats[qrType]) mStats.days[day].qrStats[qrType] = { turnover: 0, orders: 0 };
                mStats.days[day].qrStats[qrType].turnover += total;
                mStats.days[day].qrStats[qrType].orders++;
            }
        }

        const staffName = (order.from && order.from.trim()) ? order.from : "Άγνωστος";
        if (!mStats.days[day].staff) mStats.days[day].staff = {};
        if (!mStats.days[day].staff[staffName]) mStats.days[day].staff[staffName] = { orders: 0, turnover: 0, products: {} };
        
        const sStats = mStats.days[day].staff[staffName];
        sStats.orders++;
        sStats.turnover += total;

        if (!mStats.products) mStats.products = {};
        for (const [prodName, qty] of Object.entries(items)) {
            if (!mStats.products[prodName]) mStats.products[prodName] = 0;
            mStats.products[prodName] += qty;
            
            if (!mStats.days[day].products) mStats.days[day].products = {};
            if (!mStats.days[day].products[prodName]) mStats.days[day].products[prodName] = 0;
            mStats.days[day].products[prodName] += qty;
            
            if (!sStats.products[prodName]) sStats.products[prodName] = 0;
            sStats.products[prodName] += qty;
        }
    },

    logTreatStats(store, staffName, items) {
        if (!store.stats) store.stats = {};
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });
        const [year, month, day] = dateStr.split('-');
        const monthKey = `${year}-${month}`;

        if (!store.stats[monthKey]) store.stats[monthKey] = { orders: 0, turnover: 0, days: {}, products: {}, treats: [] };
        if (!store.stats[monthKey].treats) store.stats[monthKey].treats = [];

        items.forEach(item => {
            store.stats[monthKey].treats.push({
                date: now.toISOString(),
                staff: staffName,
                item: item.name,
                price: item.price
            });
        });
    },

    sendPushNotification(target, title, body, dataPayload = { type: "alarm" }, YOUR_DOMAIN, admin) {
        if (target && target.fcmToken) { 
            let targetUrl = "/stafpremium.html";
            if (target.role === 'admin') targetUrl = "/premium.html";
            if (target.role === 'customer') {
                targetUrl = target.store ? `/shop/${encodeURIComponent(target.store)}/` : "/order.html";
            }

            const msg = {
                token: target.fcmToken,
                notification: { title: title, body: body },
                
                android: { 
                    priority: "high", 
                    notification: { channelId: "bellgo_alarm_channel" } 
                },
                webpush: { 
                    headers: { "Urgency": "high" }, 
                    fcm_options: { link: `${YOUR_DOMAIN}${targetUrl}` },
                },
                apns: {
                    headers: {
                        'apns-priority': '10',
                        'apns-push-type': 'alert',
                    },
                    payload: {
                        aps: {
                            'content-available': 1,
                            badge: 1,
                            sound: 'alert.mp3'
                        }
                    }
                },
                data: { type: "alarm", ...dataPayload, title: title, body: body, url: targetUrl }
            };
            admin.messaging().send(msg).catch(e => console.log("Push Error:", e.message));
        }
    },

    notifyAdmin(storeName, title, body, excludeSocketId = null, location = "", storesData, activeUsers, io, YOUR_DOMAIN, admin) {
        const store = storesData[storeName];
        if (!store) return;

        Object.values(activeUsers).filter(u => u.store === storeName && (u.role === 'admin' || u.role === 'kitchen')).forEach(u => {
            if (excludeSocketId && u.socketId === excludeSocketId) return;
            u.isRinging = true;
            if (u.socketId) io.to(u.socketId).emit('ring-bell', { source: title, location: location });
        });

        if (!store.staffTokens) store.staffTokens = {};
        Object.entries(store.staffTokens).forEach(([username, data]) => {
            if (data.role === 'admin' || data.role === 'kitchen') {
                // ✅ FIX: Αν είναι Online (ανοιχτή οθόνη), μην στέλνεις Push
                const key = `${storeName}_${username}`;
                if (activeUsers[key] && activeUsers[key].status === 'online') return;

                this.sendPushNotification({ fcmToken: data.token, role: data.role }, title, body, { type: "alarm", location: location }, YOUR_DOMAIN, admin);
            }
        });
    },

    async sendDailyReport(store, transporter) {
        const email = store.settings.adminEmail;
        if (!email) return;

        const now = new Date();
        const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });
        
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });

        const getStats = (d) => {
            const [y, m, day] = d.split('-');
            return store.stats?.[`${y}-${m}`]?.days?.[day];
        };

        const sToday = getStats(todayStr);
        const sYesterday = getStats(yesterdayStr);

        if (!sToday && !sYesterday) return;

        let html = `<h1>📊 BellGo Report: ${store.settings.name}</h1>`;
        
        if (sYesterday) {
            html += `<h3>📅 Χθες (${yesterdayStr})</h3><p>💰 Τζίρος: <b>${sYesterday.turnover.toFixed(2)}€</b></p><p>📦 Παραγγελίες: ${sYesterday.orders}</p><hr>`;
        }
        if (sToday) {
            html += `<h3>📅 Σήμερα (${todayStr}) - Έως τώρα</h3><p>💰 Τζίρος: <b>${sToday.turnover.toFixed(2)}€</b></p><p>📦 Παραγγελίες: ${sToday.orders}</p><hr>`;
        }

        try {
            await transporter.sendMail({
                from: '"BellGo Bot" <noreply@bellgo.com>',
                to: email,
                subject: `📊 Ημερήσια Αναφορά - ${store.settings.name}`,
                html: html
            });
            console.log(`📧 Report sent to ${email}`);
        } catch (e) { console.error("Email Error:", e.message); }
    }
};