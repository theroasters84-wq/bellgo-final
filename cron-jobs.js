const Logic = require('./logic');

module.exports = function(context) {
    const { io, storesData, activeUsers, db, transporter, YOUR_DOMAIN, admin } = context;

    // 1. ΗΜΕΡΗΣΙΟ RESET & ΥΠΕΝΘΥΜΙΣΕΙΣ ΚΡΑΤΗΣΕΩΝ (Κάθε 1 λεπτό)
    setInterval(() => { 
        try { 
            const nowInGreece = new Date().toLocaleTimeString('el-GR', { timeZone: 'Europe/Athens', hour: '2-digit', minute: '2-digit', hour12: false }); 
            Object.keys(storesData).forEach(storeName => { 
                const store = storesData[storeName]; 
                
                // --- A. Daily Reset & Emails ---
                if (store.settings.resetTime && nowInGreece === store.settings.resetTime) { 
                    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });
                    if (store.lastResetDate !== today) {
                        store.lastResetDate = today;
                        if (store.permanentMenu) {
                            store.menu = JSON.parse(JSON.stringify(store.permanentMenu));
                            io.to(storeName).emit('menu-update', store.menu); 
                            console.log(`🔄 Menu reset for ${storeName}`);
                        }
                        Logic.sendDailyReport(store, transporter);
                        Logic.saveStoreToFirebase(storeName, db, storesData);
                    }
                } 
                
                // --- B. Reservation Notifications ---
                if (store.reservations) {
                    const now = Date.now();
                    store.reservations.forEach(r => {
                        const rTime = new Date(`${r.date}T${r.time}`).getTime();
                        
                        if (rTime > now && rTime - now <= 10800000 && !r.notifiedCustomer3h && r.customerToken) {
                            r.notifiedCustomer3h = true;
                            Logic.sendPushNotification({ fcmToken: r.customerToken, role: 'customer' }, "ΥΠΕΝΘΥΜΙΣΗ ΚΡΑΤΗΣΗΣ 📅", `Έχετε κράτηση σε 3 ώρες (${r.time})!`, { type: "info" }, YOUR_DOMAIN, admin);
                            Logic.sendPushNotification({ fcmToken: r.customerToken, role: 'customer', store: storeName }, "ΥΠΕΝΘΥΜΙΣΗ ΚΡΑΤΗΣΗΣ 📅", `Έχετε κράτηση σε 3 ώρες (${r.time})!`, { type: "info" }, YOUR_DOMAIN, admin);
                            Logic.saveStoreToFirebase(storeName, db, storesData);
                        }

                        if (r.status !== 'completed' && rTime > now && rTime - now <= 3600000 && !r.notified) {
                            r.notified = true;
                            const title = "ΥΠΕΝΘΥΜΙΣΗ ΚΡΑΤΗΣΗΣ ⏰";
                            const body = `Σε 1 ώρα:\n${r.name} (${r.pax} άτ.)`;

                            Object.values(activeUsers).filter(u => u.store === storeName && u.role === 'admin').forEach(u => {
                                u.isRinging = true;
                                if (u.socketId) io.to(u.socketId).emit('ring-bell', { source: "ΚΡΑΤΗΣΗ", location: "Σε 1 ώρα" });
                            });

                            if (store.staffTokens) {
                                Object.entries(store.staffTokens).forEach(([username, data]) => {
                                    if (data.role === 'admin') {
                                        Logic.sendPushNotification({ fcmToken: data.token, role: data.role, isNative: data.isNative }, title, body, { type: "alarm", location: "Σε 1 ώρα" }, YOUR_DOMAIN, admin, 3600);
                                    }
                                });
                            }

                            if (r.status === 'confirmed') {
                                Object.values(activeUsers).filter(u => u.store === storeName && u.role === 'waiter').forEach(u => {
                                    u.isRinging = true;
                                    if (u.socketId) io.to(u.socketId).emit('ring-bell', { source: "ΚΡΑΤΗΣΗ", location: "Σε 1 ώρα" });
                                });
                                if (store.staffTokens) {
                                    Object.entries(store.staffTokens).forEach(([username, data]) => {
                                        if (data.role === 'waiter') {
                                            Logic.sendPushNotification({ fcmToken: data.token, role: data.role, isNative: data.isNative }, title, body, { type: "alarm", location: "Σε 1 ώρα" }, YOUR_DOMAIN, admin, 3600);
                                        }
                                    });
                                }
                            }
                            Logic.saveStoreToFirebase(storeName, db, storesData);
                        }
                    });
                }
            }); 
        } catch (e) { console.error("Cron Error (Daily Check):", e); } 
    }, 60000); 

    // 2. ΔΙΑΓΡΑΦΗ ΑΝΕΝΕΡΓΩΝ ΧΡΗΣΤΩΝ (Κάθε 1 λεπτό)
    setInterval(() => { const now = Date.now(); for (const key in activeUsers) { if (now - activeUsers[key].lastSeen > 3600000) { const store = activeUsers[key].store; delete activeUsers[key]; Logic.updateStoreClients(store, io, storesData, activeUsers, db); } } }, 60000);

    // 3. PUSH NOTIFICATION LOOP (ANTI-SPAM - Κάθε 1 δευτερόλεπτο)
    setInterval(() => { 
        const now = Date.now(); 
        for (const key in activeUsers) { 
            const user = activeUsers[key]; 
            if (user.isRinging && user.fcmToken) { 
                if (user.status === 'online') continue;
                const interval = 15000;
                if (!user.lastPushTime || (now - user.lastPushTime >= interval)) {
                    user.lastPushTime = now;
                    const uniqueId = Math.floor(Math.random() * 10000);
                    const bells = "🔔".repeat((Math.floor(now / 1000) % 3) + 1);
                    const title = user.role === 'admin' ? `ΝΕΑ ΠΑΡΑΓΓΕΛΙΑ 🍕 #${uniqueId}` : `📞 ΣΕ ΚΑΛΟΥΝ! #${uniqueId}`;
                    const baseBody = user.role === 'admin' ? "Πατήστε για προβολή" : "ΑΠΑΝΤΗΣΕ ΤΩΡΑ!"; 
                    const body = `${baseBody} ${bells} [${uniqueId}]`;
                    Logic.sendPushNotification(user, title, body, { type: "alarm" }, YOUR_DOMAIN, admin); 
                }
            } 
        } 
    }, 1000);

    // 4. HEARTBEAT CHECK (Κάθε 10 δευτερόλεπτα)
    setInterval(() => {
        const now = Date.now();
        for (const key in activeUsers) {
            const user = activeUsers[key];
            if (user.status !== 'offline' && (now - user.lastSeen > 60000)) {
                user.status = 'offline';
                Logic.updateStoreClients(user.store, io, storesData, activeUsers, db);
            }
        }
    }, 10000);
};