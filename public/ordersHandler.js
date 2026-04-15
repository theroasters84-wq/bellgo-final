const Logic = require('../logic');

module.exports = function(socket, context, getMyStore) {
    const { io, storesData, activeUsers, db, admin, stripe, YOUR_DOMAIN } = context;

    // ✅ ΝΕΟΣ ΚΕΝΤΡΙΚΟΣ ΜΗΧΑΝΙΣΜΟΣ ΜΕΙΩΣΗΣ ΑΠΟΘΕΜΑΤΟΣ
    const reduceStock = (store, text, actionName) => {
        if (!store || !store.menu || !Array.isArray(store.menu)) return false;
        let menuChanged = false;
        const cleanStr = (s) => s ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9α-ωΑ-Ω]/g, "").toLowerCase() : "";
        console.log(`\n[STOCK DEBUG] === CHECKING STOCK FOR ${actionName} ===`);
        
        const lines = text.split('\n');
        lines.forEach(line => {
            let cleanLine = line.replace(/✅/g, '').replace(/💶/g, '').replace(/💳/g, '').replace(/\+\+/g, '').replace(/PAID/gi, '').replace(/[\r\n\t]/g, '').trim();
            if (!cleanLine || cleanLine.startsWith('[') || cleanLine === '---') return;

            let qty = 1;
            let restLine = cleanLine;
            const qtyMatch = cleanLine.match(/^(\d+)(?:x|X)?\s+(.*)$/);
            if (qtyMatch) { qty = parseInt(qtyMatch[1], 10); restLine = qtyMatch[2].trim(); }

            let itemName = restLine;
            const lastColonIdx = restLine.lastIndexOf(':');
            if (lastColonIdx !== -1) {
                const possiblePrice = restLine.substring(lastColonIdx + 1).trim();
                if (/^[\d.,]+$/.test(possiblePrice)) { itemName = restLine.substring(0, lastColonIdx).trim(); }
            }

            let baseName = itemName.replace(/\s*\(\+.*?\)$/, '').trim();
            let safeItemName = cleanStr(itemName);
            let safeBaseName = cleanStr(baseName);
            
            console.log(`[STOCK DEBUG] Line: "${cleanLine}" | Qty: ${qty} | Item: "${itemName}"`);

            let itemFound = false;
            for (let cat of store.menu) {
                if (!cat.items || !Array.isArray(cat.items)) continue;
                let item = cat.items.find(i => {
                    if (typeof i !== 'object' || !i.name) return false;
                    let dbName = cleanStr(i.name);
                    return dbName === safeItemName || dbName === safeBaseName;
                });
                if (item) {
                    itemFound = true;
                    if (item.useStock) {
                        console.log(`[STOCK DEBUG] MATCH: "${item.name}" (Stock: ${item.stock}) - Reducing by ${qty}`);
                        item.stock = (parseInt(item.stock) || 0) - qty;
                        if (item.stock <= 0) {
                            item.stock = 0;
                            item.enabled = false;
                            console.log(`[STOCK DEBUG] 🚫 OUT OF STOCK! Disabled "${item.name}"`);
                        }
                        menuChanged = true;
                    }
                }
            }
            if (!itemFound) console.log(`[STOCK DEBUG] ⚠️ NOT FOUND in DB!`);
        });
        
        if (menuChanged) {
            console.log(`[STOCK DEBUG] Saving menu changes to DB...`);
            if (Logic.saveStoreToFirebase) Logic.saveStoreToFirebase(socket.store, db, storesData);
            io.to(socket.store).emit('menu-update', store.menu);
        }
        console.log(`[STOCK DEBUG] === END STOCK CHECK ===\n`);
        return menuChanged;
    };

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
                        if (line.trim().startsWith('[')) {
                            return line;
                        }
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
                    if (treatedItems.length > 0) {
                        Logic.logTreatStats(store, `${socket.username} (LATHOS)`, treatedItems);
                    }
                    orderText = newLines.join('\n');
                }
            }

            let initialStatus = 'pending';
            let startTime = null;
            if (socket.role === 'admin') {
                initialStatus = 'cooking';
                startTime = Date.now();
            }
            const newOrder = { id: orderId, text: orderText, from: socket.username, status: initialStatus, store: socket.store };
            if (startTime) newOrder.startTime = startTime;
            store.orders.push(newOrder);
            
            reduceStock(store, orderText, 'NEW-ORDER');

            let locationInfo = "";
            const addrMatch = orderText.match(/📍\s*(.+)/);
            if (addrMatch) locationInfo = addrMatch[1].trim();
            let notifTitle = orderText.includes('[PICKUP') ? "NEO PICKUP 🛍️" : "ΝΕΑ ΠΑΡΑΓΓΕΛΙΑ 🍕";
            Logic.notifyAdmin(socket.store, notifTitle, `Από: ${socket.username}`, socket.id, locationInfo, orderId, storesData, activeUsers, io, YOUR_DOMAIN, admin, false);
        }
        Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
      } catch (e) {
          console.error("❌ New Order Error:", e);
      }
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

            reduceStock(store, items, 'ADD-ITEMS');

            // ✅ Αφαιρέθηκε η ειδοποίηση "ΠΡΟΣΘΗΚΗ ΠΡΟΪΟΝΤΩΝ +" (ώστε να μην πετάγεται το καμπανάκι στον Admin)
            Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
        }
    });

    socket.on('admin-only-call', (data, callback) => {
        try {
            console.log(`[SERVER] 🛎️ Κλήση τραπεζιού: ${data.table} για το κατάστημα ${socket.store}`);
            const store = getMyStore();
            if (!store) {
                console.log(`[SERVER] ❌ Δεν βρέθηκε το κατάστημα ${socket.store}`);
                if (callback) callback({ success: false, error: 'Store not found' });
                return;
            }
            const table = data.table || '?';
            const msg = data.msg || 'Ζητάει εξυπηρέτηση';
            
            let foundOrder = false;
            // Ψάχνουμε τον ενεργό φάκελο του τραπεζιού
            store.orders.forEach(o => {
                if (o.text) { // ✅ Ασφάλεια αποφυγής κρασαρίσματος
                    const textMatch = o.text.match(/\[ΤΡ:\s*([^|\]]+)/);
                    if (textMatch && textMatch[1].trim() === String(table).trim() && o.status !== 'completed') {
                        o.isCalling = true;
                        foundOrder = true;
                    }
                }
            });

            // Αν δεν έχει παραγγείλει ακόμα, δημιουργούμε προσωρινό φάκελο Κλήσης
            if (!foundOrder) {
                const orderId = Date.now();
                const newOrder = { id: orderId, text: `[ΤΡ: ${table} | AT: - | 🛎️]\n👤 Πελάτης\n---\n❗ ΖΗΤΑΕΙ ΕΞΥΠΗΡΕΤΗΣΗ`, from: "ΚΛΗΣΗ ΤΡΑΠΕΖΙΟΥ", status: "pending", store: socket.store, isCalling: true };
                store.orders.push(newOrder);
            }

            Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);

            // ✅ FIX: Broadcast κατευθείαν σε όλο το κατάστημα
            io.to(socket.store).emit('ring-bell', { source: `🛎️ ΤΡΑΠΕΖΙ ${table}`, location: msg, roleTarget: 'admin' });

            if (store.staffTokens) {
                Object.entries(store.staffTokens).forEach(([username, tData]) => {
                    if (tData.role === 'admin') {
                        const key = `${socket.store}_${username}`;
                        if (activeUsers[key] && activeUsers[key].status === 'online') return;
                        Logic.sendPushNotification({ fcmToken: tData.token, role: tData.role, isNative: tData.isNative }, `🛎️ ΚΛΗΣΗ: ΤΡΑΠΕΖΙ ${table}`, msg, { type: "alarm" }, YOUR_DOMAIN, admin);
                    }
                });
            }
            if (callback) callback({ success: true });
        } catch (e) {
            console.error("❌ Admin Only Call Error:", e);
            if (callback) callback({ success: false, error: e.message });
        }
    });

    // ✅ NEW: Καθαρισμός Καμπάνας μόλις το ανοίξει ο Admin
    socket.on('clear-call', (orderId) => {
        const store = getMyStore();
        if (!store) return;
        const o = store.orders.find(x => x.id == orderId);
        if (o && o.isCalling) {
            o.isCalling = false;
            
            // ✅ Αν ήταν απλή κλήση χωρίς παραγγελία, διαγράφουμε τον φάκελο εντελώς αφού τον είδε
            if (o.from === "ΚΛΗΣΗ ΤΡΑΠΕΖΙΟΥ") {
                store.orders = store.orders.filter(x => x.id != orderId);
            }
            
            Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
        }
    });

    socket.on('accept-order', (id) => {
        const store = getMyStore();
        if (store) {
            const o = store.orders.find(x => x.id == id);
            if (o) {
                o.status = 'cooking';
                o.startTime = Date.now();
                io.to(socket.store).emit('order-changed', { id: o.id, status: 'cooking', startTime: o.startTime });
                Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
            }
        }
    });
    
    socket.on('pos-pay', async (data) => {
        const store = getMyStore();
        if (!store) return;
        const pos = store.settings.pos || {};
        if (!pos.provider || !pos.id) {
            return socket.emit('pos-result', { success: false, error: "Δεν έχουν οριστεί ρυθμίσεις POS." });
        }
        try {
            await new Promise(r => setTimeout(r, 3000));
            socket.emit('pos-result', { success: true });
        } catch (e) {
            socket.emit('pos-result', { success: false, error: e.message || "Σφάλμα επικοινωνίας" });
        }
    });

    socket.on('quick-order', async (data) => {
        const store = getMyStore();
        if (!store) return;
        if (data.method === 'card' && data.stripeId) {
            try {
                let stripeOptions = store.settings.stripeConnectId ? { stripeAccount: store.settings.stripeConnectId } : undefined;
                const paymentIntent = await stripe.paymentIntents.retrieve(data.stripeId, stripeOptions);
            } catch (e) {
                console.error("❌ Stripe verification failed:", e.message);
            }
        }
        const tempOrder = { id: data.id || Date.now(), text: data.text, from: data.source || 'Admin (Paso)', status: 'completed' };
        if (data.method === 'card') {
            tempOrder.text += '\n💳 PAID';
        } else {
            tempOrder.text += '\n💵 PAID';
        }
        if (data.issueReceipt) {
            tempOrder.text += '\n[🧾 ΑΠΟΔΕΙΞΗ]';
            tempOrder.aadeQr = "https://www1.aade.gr/tarl/myDATA/timologio/qrcode?mark=mock";
        }
        Logic.updateStoreStats(store, tempOrder);

        reduceStock(store, tempOrder.text, 'QUICK-ORDER');

        Logic.saveStoreToFirebase(socket.store, db, storesData);
        socket.emit('print-quick-order', { text: tempOrder.text, id: tempOrder.id, signature: null });
    });

    socket.on('issue-receipt', (id) => {
        const store = getMyStore();
        if (store) {
            const o = store.orders.find(x => x.id == id);
            if (o && !o.text.includes('[🧾 ΑΠΟΔΕΙΞΗ]')) {
                const einv = store.settings.einvoicing || {};
                o.text += '\n[🧾 ΑΠΟΔΕΙΞΗ]';
                if (einv.enabled) {
                    o.aadeQr = "https://www1.aade.gr/tarl/myDATA/timologio/qrcode?mark=mock";
                }
                Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
            }
        }
    });
    
    socket.on('charge-order-to-staff', (data) => {
        const store = getMyStore();
        if (!store) return;
        const { orderId, staffName, amount, method } = data;
        if (!store.wallets) store.wallets = {};
        const targetWallet = method === 'card' ? 'BANK_CARD' : (staffName || 'Admin');
        if (!store.wallets[targetWallet]) store.wallets[targetWallet] = 0;
        store.wallets[targetWallet] += parseFloat(amount);
        if (staffName && socket.username !== staffName) {
            const key = `${socket.store}_${staffName}`;
            const staffUser = activeUsers[key];
            if (staffUser && staffUser.socketId) {
                io.to(staffUser.socketId).emit('ring-bell', { source: "ΤΑΜΕΙΟ 💸", location: "ΝΕΑ ΑΝΑΘΕΣΗ" });
            }
        }
        const o = store.orders.find(x => x.id == orderId);
        if (o) {
            o.text += `\n✅ PAID (${method === 'card' ? '💳' : '💵'} ${staffName})`;
            Logic.updateStoreStats(store, o);
            store.orders = store.orders.filter(x => x.id != orderId);
        }
        Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
    });

    socket.on('ready-order', (id, silent = false) => {
        const store = getMyStore();
        if (store) {
            const o = store.orders.find(x => x.id == id);
            if (o) {
                o.status = 'ready';
                o.readyTime = Date.now();
                io.to(socket.store).emit('order-changed', { id: o.id, status: 'ready', readyTime: o.readyTime });
                Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
                
                if (!silent) {
                    const tKey = `${socket.store}_${o.from}`;
                    const tUser = activeUsers[tKey];
                    let notifTitle = o.text.includes('[PICKUP') ? "ΕΤΟΙΜΟ ΓΙΑ ΠΑΡΑΛΑΒΗ! 🛍️" : "ΕΤΟΙΜΟ! 🛵";
                    let notifBody = o.text.includes('[PICKUP') ? "Μπορείτε να περάσετε από το κατάστημα." : "Η παραγγελία έρχεται!";
                    
                    if (tUser) {
                        Logic.sendPushNotification(tUser, notifTitle, notifBody, { type: "alarm" }, YOUR_DOMAIN, admin, 3600);
                    }
                    
                }
            }
        }
    });
    
    socket.on('assign-delivery', (data) => {
        const store = getMyStore();
        if(!store) return;
        const { orderId, targetDriver } = data;
        const order = store.orders.find(o => o.id == orderId);
        if(order) {
            if (targetDriver === 'ALL') {
                Object.values(activeUsers).filter(u => u.store === socket.store && u.role === 'driver').forEach(u => {
                    u.isRinging = true;
                    if (u.socketId) {
                        io.to(u.socketId).emit('ring-bell', { source: "ΑΝΑΘΕΣΗ 🛵", location: "ΝΕΑ ΠΑΡΑΓΓΕΛΙΑ" });
                    }
                });
                if (store.staffTokens) {
                    Object.entries(store.staffTokens).forEach(([username, tokenData]) => {
                        if (tokenData.role === 'driver') {
                            Logic.sendPushNotification({ fcmToken: tokenData.token, role: 'driver', isNative: tokenData.isNative }, "ΝΕΑ ΔΙΑΝΟΜΗ 🛵", "Έτοιμη παραγγελία για διανομή!", { type: "alarm" }, YOUR_DOMAIN, admin);
                        }
                    });
                }
            } else {
                if (!order.text.includes(`[DRIVER: ${targetDriver}]`)) {
                    order.text += `\n[DRIVER: ${targetDriver}]`;
                }
                const key = `${socket.store}_${targetDriver}`;
                const t = activeUsers[key];
                if (t && t.socketId) {
                    io.to(t.socketId).emit('ring-bell', { source: "ΑΝΑΘΕΣΗ 🛵", location: "ΝΕΑ ΠΑΡΑΓΓΕΛΙΑ" });
                }
                if (store.staffTokens && store.staffTokens[targetDriver]) {
                    const tokenData = store.staffTokens[targetDriver];
                    Logic.sendPushNotification({ fcmToken: tokenData.token, role: 'driver', isNative: tokenData.isNative }, "ΝΕΑ ΔΙΑΝΟΜΗ 🛵", "Σου ανατέθηκε μια παραγγελία!", { type: "alarm" }, YOUR_DOMAIN, admin);
                }
                Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
            } 
        } 
    });

    socket.on('driver-take-order', (data) => {
        const store = getMyStore();
        if (!store) return;
        const { orderId } = data;
        const order = store.orders.find(o => o.id == orderId);
        if (order) {
            if (order.text.includes('[DRIVER:')) return;
            order.text += `\n[DRIVER: ${socket.username}]`;
            Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
        }
    });
    
    socket.on('pay-order', async (data) => { 
        const store = getMyStore(); 
        if(store) { 
            const orderId = typeof data === 'object' ? data.id : data;
            const method = data.method || 'cash';
            const stripeId = data.stripeId || null;
            let issueReceipt = data.issueReceipt || false;
            const o = store.orders.find(x => x.id == orderId);
            
            if (o) {
                if (store.settings.einvoicing && store.settings.einvoicing.enabled) {
                    issueReceipt = true;
                }
                if (method === 'card') {
                    o.text += `\n💳 PAID (CARD${stripeId ? ': ' + stripeId : ''})`;
                } else {
                    o.text += '\n💵 PAID (CASH)';
                }
                if (issueReceipt) {
                    o.text += '\n[🧾 ΑΠΟΔΕΙΞΗ]';
                    o.aadeQr = "https://www1.aade.gr/tarl/myDATA/timologio/qrcode?mark=mock";
                }
                Logic.updateStoreStats(store, o);
                store.orders = store.orders.filter(x => x.id != orderId);
                Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
                socket.emit('print-order', { text: o.text, aadeQr: o.aadeQr });
            }
        } 
    });

    socket.on('treat-order', (data) => {
        const store = getMyStore();
        if (store) {
            const o = store.orders.find(x => x.id == data.id);
            if (o) {
                const lines = o.text.split('\n');
                let treatedItems = [];
                const treatLine = (line) => {
                    if (line.includes('(KERASMA)')) return line;
                    const lastColonIndex = line.lastIndexOf(':');
                    if (lastColonIndex !== -1) {
                        const before = line.substring(0, lastColonIndex);
                        const after = line.substring(lastColonIndex + 1);
                        if (/^\d/.test(after.trim())) {
                            const price = parseFloat(after) || 0;
                            if (price > 0) treatedItems.push({ name: before.trim(), price: price });
                            return `${before}:0 (KERASMA)`;
                        }
                    }
                    return line;
                };
                
                if (data.type === 'full') {
                    o.text = lines.map(treatLine).join('\n');
                } else if (data.type === 'partial' && typeof data.index === 'number') {
                    if (lines[data.index]) {
                        lines[data.index] = treatLine(lines[data.index]);
                        o.text = lines.join('\n');
                    }
                }
                if (treatedItems.length > 0) {
                    Logic.logTreatStats(store, socket.username, treatedItems);
                }
                Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db);
            }
        }
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
                    if (data.method === 'cash') {
                        if (!line.includes('✅ 💶')) newTag = ' ✅ 💶';
                    } else if (data.method === 'card') {
                        if (!line.includes('✅ 💳')) newTag = ' ✅ 💳';
                    } else {
                        if (!line.includes('✅')) newTag = ' ✅';
                    }
                    lines[data.index] = clean + newTag;
  trexw local hoast                   o.text = lines.join('\n'); 
                    Logic.updateStoreClients(socket.store, io, storesData, activeUsers, db); 
                } 
            } 
        } 
    });
};