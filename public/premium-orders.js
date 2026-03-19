/* -----------------------------------------------------------
   PREMIUM ORDERS UI - Διαχείριση Εμφάνισης Παραγγελιών
----------------------------------------------------------- */

const calculateTotal = (text) => {
    let total = 0;
    if (!text) return 0;
    const lines = text.split('\n');
    lines.forEach(line => {
        const match = line.match(/^(\d+)?\s*(.+):(\d+(?:\.\d+)?)$/);
        if (match) {
            let qty = parseInt(match[1] || '1');
            let price = parseFloat(match[3]);
            total += qty * price;
        }
    });
    return total;
};

export const OrdersUI = {
    // --- SIDEBAR ORDER LOGIC (CASHIER) ---
    toggleOrderSidebar: () => {
        const App = window.App;
        const sb = document.getElementById('orderSidebar');
        const currentLeft = sb.style.left;
        const isOpen = currentLeft === '0px' || currentLeft === '0';
        
        if (isOpen) {
            sb.style.left = '-100%';
        } else {
            sb.style.left = '0px';
            App.renderSidebarMenu();
        }
    },
    
    setSidebarMode: (mode) => {
        const App = window.App;
        App.sidebarMode = mode;
        
        const btnPaso = document.getElementById('btnModePaso');
        const btnTable = document.getElementById('btnModeTable');
        const btnDel = document.getElementById('btnModeDelivery');
        
        if(btnPaso) { btnPaso.style.background = '#333'; btnPaso.style.color = 'white'; }
        if(btnTable) { btnTable.style.background = '#333'; btnTable.style.color = 'white'; }
        if(btnDel) { btnDel.style.background = '#333'; btnDel.style.color = 'white'; }
        
        const divTable = document.getElementById('divTableInputs');
        const divDel = document.getElementById('divDeliveryInputs');
        if(divTable) divTable.style.display = 'none';
        if(divDel) divDel.style.display = 'none';

        const btnToggle = document.getElementById('btnToggleDeliveryDetails');
        if(btnToggle) btnToggle.style.display = 'none';

        const activeBtn = document.getElementById(mode === 'paso' ? 'btnModePaso' : mode === 'table' ? 'btnModeTable' : 'btnModeDelivery');
        if(activeBtn) {
            activeBtn.style.background = '#FFD700';
            activeBtn.style.color = 'black';
        }

        if (mode === 'table' && divTable) { 
            divTable.style.display = 'flex'; 
            setTimeout(()=> { const el = document.getElementById('sidebarTable'); if(el) el.focus(); }, 100); 
        }
        if (mode === 'delivery' && divDel) { 
            divDel.style.display = 'flex'; 
            setTimeout(()=> { const el = document.getElementById('sidebarDelName'); if(el) el.focus(); }, 100); 
            let btn = document.getElementById('btnToggleDeliveryDetails');
            if (!btn) {
                btn = document.createElement('button');
                btn.id = 'btnToggleDeliveryDetails';
                btn.className = 'sidebar-btn';
                btn.style.cssText = "background:#444; color:#FFD700; margin-bottom:10px; width:100%; padding:10px; border:1px solid #FFD700; border-radius:5px; font-weight:bold; cursor:pointer;";
                btn.innerHTML = App.t('customer_details_click') || "📝 ΣΤΟΙΧΕΙΑ ΠΕΛΑΤΗ (ΚΛΙΚ)";
                btn.onclick = () => {
                    divDel.style.display = 'flex';
                    btn.style.display = 'none';
                    const firstInp = document.getElementById('sidebarDelName');
                    if(firstInp) firstInp.focus();
                };
                divDel.parentNode.insertBefore(btn, divDel);
                
                const closeBtn = document.createElement('button');
                closeBtn.innerHTML = App.t('ok_close') || "OK (ΚΛΕΙΣΙΜΟ)";
                closeBtn.style.cssText = "background:#00E676; color:black; border:none; padding:8px; width:100%; margin-top:5px; border-radius:5px; font-weight:bold; cursor:pointer;";
                closeBtn.onclick = () => {
                    divDel.style.display = 'none';
                    btn.style.display = 'block';
                    const name = document.getElementById('sidebarDelName').value;
                    const phone = document.getElementById('sidebarDelPhone').value;
                    if(name || phone) {
                        btn.innerHTML = `📝 ${name || ''} ${phone ? '('+phone+')' : ''} <br><span style='font-size:10px; color:#aaa;'>(${App.t('click_to_change') || 'Πατήστε για αλλαγή'})</span>`;
                    } else {
                        btn.innerHTML = App.t('customer_details_click') || "📝 ΣΤΟΙΧΕΙΑ ΠΕΛΑΤΗ (ΚΛΙΚ)";
                    }
                };
                divDel.appendChild(closeBtn);
            }
            
            btn.style.display = 'block';
            divDel.style.display = 'none'; 
            const name = document.getElementById('sidebarDelName').value;
            if(name) btn.innerHTML = `📝 ${name} <span style='font-size:10px; color:#aaa;'>(${App.t('click_to_change') || 'Πατήστε για αλλαγή'})</span>`;
        }
    },
    
    renderSidebarMenu: () => {
        const App = window.App;
        const container = document.getElementById('sidebarMenuContainer');
        container.innerHTML = '';
        App.menuData.forEach(cat => {
            const title = document.createElement('div');
            title.className = 'category-title';
            title.innerText = App.tMenu ? App.tMenu(cat.name) : cat.name; // ✅ Translated Category
            const itemsDiv = document.createElement('div');
            itemsDiv.className = 'category-items';
            cat.items.forEach(item => {
                let name = item, price = 0;
                if(typeof item === 'object') { name = item.name; price = item.price; }
                else { const p = item.split(':'); name = p[0]; if(p.length>1) price=parseFloat(p[p.length-1]); }
                
                let displayItemName = App.tMenu ? App.tMenu(name) : name; // ✅ Translated Item
                const box = document.createElement('div');
                box.className = 'item-box';
                box.innerHTML = `<span class="item-name">${displayItemName}</span>${price>0?`<span class="item-price">${price}€</span>`:''}`;
                box.onclick = () => App.addToSidebarOrder(name, price);
                itemsDiv.appendChild(box);
            });
            container.appendChild(title);
            container.appendChild(itemsDiv);
        });
    },
    
    addToSidebarOrder: (name, price) => {
        const App = window.App;
        const txt = document.getElementById('sidebarOrderText');
        const line = price > 0 ? `${name}:${price}` : name;
        txt.value += (txt.value ? '\n' : '') + `1 ${line}`;
        App.calcSidebarTotal();
    },
    
    // ✅ NEW: Οπτικό Καλάθι (Visual Cart με κουμπιά διαγραφής ✖ αριστερά)
    renderVisualCart: (txtId, containerId) => {
        const txt = document.getElementById(txtId);
        if (!txt) return;
        let container = document.getElementById(containerId);
        if (!container) {
            container = document.createElement('div');
            container.id = containerId;
            container.style.cssText = "display:flex; flex-direction:column; gap:5px; margin-bottom:10px; overflow-y:auto; flex-shrink:0;";
            txt.parentNode.insertBefore(container, txt);
        }
        
        if (window.getComputedStyle(txt).display === 'none') {
            container.style.display = 'none';
            return;
        }

        container.innerHTML = '';
        const lines = txt.value.split('\n');
        let hasItems = false;
        
        lines.forEach((line, idx) => {
            if (!line.trim()) return;
            hasItems = true;
            const div = document.createElement('div');
            div.style.cssText = "display:flex; justify-content:space-between; align-items:center; background:#ffffff; padding:8px; border:1px solid #d1d5db; border-radius:6px; box-shadow:0 1px 3px rgba(0,0,0,0.05);";
            
            const textSpan = document.createElement('span');
            textSpan.style.cssText = "flex:1; font-size:14px; color:#1f2937; font-weight:600;";
            textSpan.innerText = line;

            const btnX = document.createElement('button');
            btnX.innerText = "✖";
            btnX.title = "Διαγραφή Προϊόντος";
            btnX.style.cssText = "background:#EF4444; color:white; border:none; border-radius:6px; width:30px; height:30px; cursor:pointer; margin-right:10px; font-size:14px; font-weight:bold; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 4px rgba(239,68,68,0.3); transition:0.2s;";
            btnX.onclick = (e) => {
                e.preventDefault();
                const currentLines = txt.value.split('\n');
                currentLines.splice(idx, 1);
                txt.value = currentLines.join('\n');
                if (window.App && window.App.calcSidebarTotal) window.App.calcSidebarTotal(); 
            };

            div.appendChild(btnX); // Μπαίνει πρώτο (αριστερά)
            div.appendChild(textSpan);
            container.appendChild(div);
        });
        
        container.style.display = hasItems ? 'flex' : 'none';
        txt.placeholder = hasItems ? '+ Προσθήκη Σημείωσης/Χειρόγραφου...' : 'Προϊόντα...';
    },

    calcSidebarTotal: () => {
        const txtEl = document.getElementById('sidebarOrderText');
        if (!txtEl) return;
        const txt = txtEl.value;
        const total = calculateTotal(txt);
        document.getElementById('sidebarTotal').innerText = `ΣΥΝΟΛΟ: ${total.toFixed(2)}€`;

        // ✅ Υπολογισμός τεμαχίων για το Badge (Συννεφάκι)
        let itemCount = 0;
        txt.split('\n').forEach(line => {
            if (!line.trim()) return;
            const match = line.match(/^(\d+)\s+/);
            if (match) itemCount += parseInt(match[1]);
            else itemCount += 1;
        });

        const badge = document.getElementById('cartBadgeAdmin');
        if (badge) {
            if (itemCount > 0) {
                badge.style.display = 'inline-block';
                badge.innerText = itemCount;
            } else {
                badge.style.display = 'none';
            }
        }
        
        if (window.App && window.App.renderVisualCart) {
            window.App.renderVisualCart('sidebarOrderText', 'sidebarVisualCart');
        }
    },
    
    sendSidebarOrder: () => {
        const App = window.App;
        const txt = document.getElementById('sidebarOrderText').value.trim();
        if(!txt) return alert("Κενή παραγγελία");
        
        if (App.sidebarMode === 'paso') {
            App.openPasoCheckout(txt);
            return;
        }
        
        let header = "";
        let finalBody = txt;
        const payMethodEl = document.getElementById('sidebarPaymentMethod');
        const payMethod = payMethodEl ? payMethodEl.value : '';

        if (App.sidebarMode === 'paso') {
            header = "[PASO]";
        } else if (App.sidebarMode === 'table') {
            const table = document.getElementById('sidebarTable').value;
            const covers = parseInt(document.getElementById('sidebarCovers').value) || 0;
            if (!table) return alert(App.t('alert_empty_table') || "Παρακαλώ βάλτε τραπέζι ή επιλέξτε PASO.");

            const existingOrder = App.activeOrders.find(o => {
                const match = o.text.match(/\[ΤΡ:\s*([^|\]]+)/);
                return match && match[1].trim() === table.trim() && o.status !== 'completed';
            });

            if (existingOrder) {
                if (covers > 0 && App.coverPrice > 0) {
                    finalBody += `\n${covers} ΚΟΥΒΕΡ:${(covers * App.coverPrice).toFixed(2)}`;
                }
                window.socket.emit('add-items', { id: existingOrder.id, items: finalBody });
                alert(`Προστέθηκε στο Τραπέζι ${table}!`);
                
                document.getElementById('sidebarOrderText').value = '';
                if(document.getElementById('sidebarTable')) document.getElementById('sidebarTable').value = '';
                if(document.getElementById('sidebarCovers')) document.getElementById('sidebarCovers').value = '';
                App.toggleOrderSidebar(); 
                return;
            }

            header = `[ΤΡ: ${table}]`;
            if (covers > 0) {
                header += ` [AT: ${covers}]`;
                if (App.coverPrice > 0) {
                    finalBody += `\n${covers} ΚΟΥΒΕΡ:${(covers * App.coverPrice).toFixed(2)}`;
                }
            }
            const payIcon = payMethod.includes('ΚΑΡΤΑ') ? '💳' : '💵';
            header += ` [${payIcon}]`;
        } else if (App.sidebarMode === 'delivery') {
            const name = document.getElementById('sidebarDelName').value.trim();
            const addr = document.getElementById('sidebarDelAddr').value.trim();
            const floor = document.getElementById('sidebarDelFloor').value.trim();
            const phone = document.getElementById('sidebarDelPhone').value.trim();
            const zip = document.getElementById('sidebarDelZip').value.trim();
            if(!name || !addr || !phone) return alert(App.t('alert_fill_delivery') || "Συμπληρώστε τα στοιχεία Delivery!");
            header = `[DELIVERY 🛵]\n👤 ${name}\n📍 ${addr}\n📮 T.K.: ${zip || '-'}\n🏢 ${floor || '-'}\n📞 ${phone}\n${payMethod}`;
        }
        
        const separator = App.sidebarMode === 'delivery' ? '\n---\n' : '\n';
        window.socket.emit('new-order', `${header}${separator}${finalBody}`);
        
        alert(App.t('alert_sent') || "Εστάλη!");
        document.getElementById('sidebarOrderText').value = '';
        if(document.getElementById('sidebarTable')) document.getElementById('sidebarTable').value = '';
        if(document.getElementById('sidebarCovers')) document.getElementById('sidebarCovers').value = '';
        if(document.getElementById('sidebarDelName')) document.getElementById('sidebarDelName').value = '';
        if(document.getElementById('sidebarDelAddr')) document.getElementById('sidebarDelAddr').value = '';
        if(document.getElementById('sidebarDelFloor')) document.getElementById('sidebarDelFloor').value = '';
        if(document.getElementById('sidebarDelPhone')) document.getElementById('sidebarDelPhone').value = '';
        if(document.getElementById('sidebarDelZip')) document.getElementById('sidebarDelZip').value = '';
        App.toggleOrderSidebar(); 
        App.calcSidebarTotal(); // ✅ Μηδενίζει το Badge μετά την αποστολή
    },

    // --- DESKTOP ORDERS LOGIC ---
    renderDesktopIcons: (orders) => {
        const App = window.App;
        const desktop = document.getElementById('desktopArea');
        desktop.innerHTML = '';
        orders.forEach(order => {
            if (App.adminMode === 'kitchen' && (order.status === 'ready' || order.status === 'completed')) return;
            if (App.userData.role === 'waiter' && order.text.includes('[DELIVERY')) return;

            const time = new Date(order.id).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            let style = '';
            const isPaid = order.text.includes('PAID');
            
            let displayLabel = order.from;
            const tableMatch = order.text.match(/\[ΤΡ:\s*([^|\]]+)/);
            if (tableMatch) {
                displayLabel = `Τραπέζι ${tableMatch[1]}`;
            } else if (order.text.includes('[PICKUP')) {
                displayLabel = `🛍️ PICKUP: ${order.from}`;
            } else if (order.text.includes('[DELIVERY')) {
                displayLabel = `🛵 ${order.from}`;
            }

            const icon = document.createElement('div');
            icon.className = `order-folder ${order.status === 'pending' ? 'ringing' : ''}`;
            icon.dataset.orderId = order.id; // ✅ Προσθήκη ID για 100% σίγουρο εντοπισμό
            // ✅ Apply Cooking style
            if (order.status === 'cooking') icon.classList.add('cooking');
            // ✅ Apply Paid style
            if (isPaid) icon.style.border = "2px solid #00E676";
            
            icon.innerHTML = `<div class="folder-icon">${isPaid ? '✅' : '📂'}</div><div class="folder-label">${displayLabel}</div><div class="folder-time">${time}</div>`;
            icon.onclick = () => App.openOrderWindow(order);
            desktop.appendChild(icon);
        });
    },

    openOrderWindow: (order) => {
        const App = window.App;
        if(window.AudioEngine) window.AudioEngine.stopAlarm();
        window.socket.emit('admin-stop-ringing'); 

        // ✅ NEW: Αυτόματη Αποδοχή (Auto-Accept) όταν η Κουζίνα ανοίγει τον φάκελο της νέας παραγγελίας
        if (App.adminMode === 'kitchen' && order.status === 'pending') {
            window.socket.emit('accept-order', order.id);
            order.status = 'cooking'; // Προσωρινή αλλαγή για να εμφανίσει απευθείας το "ΕΤΟΙΜΟ" στο παράθυρο
            if (App.renderDesktopIcons) App.renderDesktopIcons(App.activeOrders); // Άμεση ενημέρωση χρώματος εικονιδίου
        }

        let win = document.getElementById(`win-${order.id}`);
        if (!win) {
            win = document.createElement('div');
            win.className = 'order-window';
            win.id = `win-${order.id}`;
            document.getElementById('windowsContainer').appendChild(win);
        }
        
        let timeInfo = `<div style="font-size:12px; color:#aaa; margin-top:5px;">Λήψη: ${new Date(order.id).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>`;
        if(order.startTime) {
            timeInfo += `<div style="font-size:12px; color:#FFD700; font-weight:bold;">Έναρξη: ${new Date(order.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>`;
        }

        let infoText = "";
        const allLines = order.text.split('\n');
        let startIndex = 0;
        
        if (order.text.includes("---")) {
            const parts = order.text.split("---");
            infoText = parts[0].replace(/\n/g, '<br>').trim();
            startIndex = allLines.findIndex(l => l.includes("---")) + 1;
        }

        let displayItems = '';
        for (let i = startIndex; i < allLines.length; i++) {
            const line = allLines[i];
            if (!line.trim()) continue;
            
            const isPaidCash = line.includes('✅ 💶');
            const isPaidCard = line.includes('✅ 💳');
            const isPaid = line.includes('✅');
            
            const cleanLine = line.replace(/ ✅ 💶| ✅ 💳| ✅/g, '');
            
            let btnCash = `<button onclick="App.payItemPartial(${order.id}, ${i}, 'cash')" style="background:transparent; border:none; cursor:pointer; font-size:18px; margin-left:5px; opacity:${isPaidCard ? '0.3' : '1'}; filter:${isPaidCard ? 'grayscale(1)' : 'none'};" title="Μετρητά">💶</button>`;
            let btnCard = `<button onclick="App.payItemPartial(${order.id}, ${i}, 'card')" style="background:transparent; border:none; cursor:pointer; font-size:18px; margin-left:5px; opacity:${isPaidCash ? '0.3' : '1'}; filter:${isPaidCash ? 'grayscale(1)' : 'none'};" title="Κάρτα">💳</button>`;

            // Κρύβουμε τα εικονίδια πληρωμής από την κουζίνα
            if (App.adminMode === 'kitchen') {
                btnCash = '';
                btnCard = '';
            }

            displayItems += `<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #efefef; padding:10px 0;">
                                <span style="color:${isPaid ? '#0095f6' : '#262626'}; font-weight:500; font-size:15px;">${cleanLine}</span>
                                <div style="white-space:nowrap;">${btnCash}${btnCard}</div>
                             </div>`;
        }

        const total = calculateTotal(order.text);
        let actions = '';
        let treatBtn = ''; 
        let receiptBtn = ''; 

        let rewardBtn = '';
        if (App.rewardSettings && App.rewardSettings.enabled) {
            rewardBtn = `<button class="win-btn-top" style="background:transparent; border:1px solid #e1306c; color:#e1306c; padding:6px 10px; border-radius:6px; margin-right:8px; cursor:pointer; font-weight:600; font-size:13px;" onclick="App.openRewardQr('${order.id}')" title="QR Επιβράβευσης">🎁 QR</button>`;
        }

        if (App.einvoicingEnabled) {
            const hasReceipt = order.text.includes('[🧾 ΑΠΟΔΕΙΞΗ]');
            const btnColor = hasReceipt ? '#0095f6' : '#f56040';
            receiptBtn = `<button class="win-btn-top" style="background:transparent; border:1px solid ${btnColor}; color:${btnColor}; padding:6px 10px; border-radius:6px; margin-right:8px; cursor:pointer; font-weight:600; font-size:13px;" onclick="App.issueReceipt('${order.id}')" title="Ηλ. Τιμολόγηση">${hasReceipt ? '🧾 ΕΚΔΟΘΗΚΕ' : '🧾 ΑΠΟΔΕΙΞΗ'}</button>`;
        }

        if (App.adminMode !== 'kitchen') {
             treatBtn = `<button style="background:transparent; border:1px solid #dbdbdb; color:#262626; padding:6px 10px; border-radius:6px; margin-right:8px; cursor:pointer; font-size:14px;" onclick="App.showTreatOptions('${order.id}')" title="Κέρασμα">🎁</button>`;
             treatBtn += `<button style="background:transparent; border:1px solid #dbdbdb; color:#262626; padding:6px 10px; border-radius:6px; margin-right:8px; cursor:pointer; font-size:14px;" onclick="App.printOrder('${order.id}')" title="Εκτύπωση">🖨️</button>`;
             if (!App.printerEnabled) treatBtn = `<button style="background:transparent; border:1px solid #dbdbdb; color:#262626; padding:6px 10px; border-radius:6px; margin-right:8px; cursor:pointer; font-size:14px;" onclick="App.showTreatOptions('${order.id}')" title="Κέρασμα">🎁</button>`;
        }

        if (order.status === 'pending') {
            actions = `<button class="btn-win-action" style="background:#0095f6; color:white; border-radius:8px; padding:12px; font-weight:600; border:none; width:100%; cursor:pointer;" onclick="App.acceptOrder(${order.id})">🔊 ΑΠΟΔΟΧΗ</button>`;
        } else if (order.status === 'cooking') {
            if (order.text.includes('[PICKUP')) {
                actions = `<button class="btn-win-action" style="background:#f56040; color:white; border-radius:8px; padding:12px; font-weight:600; border:none; width:100%; cursor:pointer;" onclick="App.markReady(${order.id})">🛍️ ΕΤΟΙΜΟ ΓΙΑ ΠΑΡΑΛΑΒΗ</button>`;
            } else if (order.text.includes('[ΤΡ:')) {
                actions = `<button class="btn-win-action" style="background:#00E676; color:black; border-radius:8px; padding:12px; font-weight:600; border:none; width:100%; cursor:pointer;" onclick="App.markReady(${order.id})">🍽️ ΕΤΟΙΜΟ (ΤΡΑΠΕΖΙ)</button>`;
            } else {
                actions = `<button class="btn-win-action" style="background:#fd1d1d; color:white; border-radius:8px; padding:12px; font-weight:600; border:none; width:100%; cursor:pointer;" onclick="App.markReady(${order.id})">🛵 ΕΤΟΙΜΟ / ΔΙΑΝΟΜΗ</button>`;
            }
        } else {
            if (App.adminMode === 'kitchen') {
                actions = `<button class="btn-win-action" style="background:#efefef; color:#262626; border-radius:8px; padding:12px; font-weight:600; border:none; width:100%; cursor:pointer;" onclick="App.minimizeOrder('${order.id}')">OK (ΚΛΕΙΣΙΜΟ)</button>`;
            } else {
                treatBtn = `<button style="background:transparent; border:1px solid #dbdbdb; color:#262626; padding:6px 10px; border-radius:6px; margin-right:8px; cursor:pointer; font-size:14px;" onclick="App.showTreatOptions('${order.id}')" title="Κέρασμα">🎁</button>`;
                if (App.printerEnabled) {
                    treatBtn += `<button style="background:transparent; border:1px solid #dbdbdb; color:#262626; padding:6px 10px; border-radius:6px; margin-right:8px; cursor:pointer; font-size:14px;" onclick="App.printOrder('${order.id}')" title="Εκτύπωση">🖨️</button>`;
                }
                if (App.hasFeature('pack_pos') && App.softPosSettings && App.softPosSettings.enabled) {
                    actions = `<button class="btn-win-action" style="background:#0095f6; color:white; margin-bottom:10px; border-radius:8px; padding:12px; font-weight:600; border:none; width:100%; cursor:pointer;" onclick="App.payWithSoftPos('${order.id}')">📱 TAP TO PAY</button>` + actions;
                }
                if (App.hasFeature('pack_pos')) actions = `<button class="btn-win-action" style="background:#833ab4; color:white; margin-bottom:10px; border-radius:8px; padding:12px; font-weight:600; border:none; width:100%; cursor:pointer;" onclick="App.openQrPayment('${order.id}')">💳 QR CARD (ΠΕΛΑΤΗΣ)</button>` + actions;
                
                actions += `<button class="btn-win-action" style="background:#3897f0; color:white; border-radius:8px; padding:12px; font-weight:600; border:none; width:100%; cursor:pointer;" onclick="App.completeOrder(${order.id})">💰 ΕΞΟΦΛΗΣΗ / ΚΛΕΙΣΙΜΟ</button>`;
            }
        }
        // ✅ Preserve positions/transforms during updates by avoiding cssText overwrite
        win.style.background = "#fff";
        win.style.color = "#262626";
        win.style.borderRadius = "12px";
        win.style.boxShadow = "0 10px 30px rgba(0,0,0,0.15)";
        win.style.overflow = "hidden";
        win.style.display = "flex";
        win.style.flexDirection = "column";
        win.style.border = "1px solid #dbdbdb";
        win.innerHTML = `
            <div class="win-header" style="background:#fff; border-bottom:1px solid #efefef; padding:15px; display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <div style="width:36px; height:36px; min-width:36px; border-radius:50%; background:linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%); display:flex; align-items:center; justify-content:center; color:white; font-weight:bold; font-size:16px; box-shadow:0 2px 5px rgba(0,0,0,0.1);">
                        ${order.from.charAt(0)}
                    </div>
                    <span style="font-weight:600; color:#262626; font-size:16px;">${order.from}</span>
                </div>
                <div class="win-controls" style="display:flex; align-items:center;">
                    ${rewardBtn}
                    ${receiptBtn}
                    ${treatBtn}
                    <button class="win-btn-top" style="background:transparent; color:#262626; padding:6px 12px; border:1px solid #dbdbdb; border-radius:6px; font-weight:bold; cursor:pointer;" onclick="App.minimizeOrder('${order.id}')">✕</button>
                </div>
            </div>
            <div class="win-body" style="padding:15px; flex:1; overflow-y:auto; background:#fafafa;">
                <div class="order-info-section" style="font-size:13px; color:#8e8e8e; margin-bottom:15px; text-align:center;">
                    ${infoText}
                    ${timeInfo}
                </div>
                <div class="order-items-section" style="background:#fff; border:1px solid #efefef; border-radius:8px; padding:10px;">
                    ${displayItems}
                </div>
                <div style="font-size:20px; color:#262626; font-weight:bold; text-align:right; margin-top:15px; padding-top:10px; border-top:1px solid #efefef;">
                    ΣΥΝΟΛΟ: ${total.toFixed(2)}€
                </div>
            </div>
            <div class="win-footer" style="padding:15px; background:#fff; border-top:1px solid #efefef; display:flex; flex-direction:column; gap:10px;">
                ${actions}
            </div>
        `;
        win.style.display = 'flex';
        
        window.highestOrderZIndex = (window.highestOrderZIndex || 2000) + 1;
        win.style.zIndex = window.highestOrderZIndex;
        
        // ✅ NEW: Initialize Offset on first open
        if (!win.dataset.initialized) {
            const existingWins = document.querySelectorAll('.order-window[style*="display: flex"]').length;
            const offset = (existingWins * 20) % 150; // offset slightly down & right
            win.style.transform = `translate(calc(-50% + ${offset}px), calc(-50% + ${offset}px))`;
            win.dataset.initialized = "true";
        }
        
        // ✅ Make Window Draggable
        if (App.makeDraggable) App.makeDraggable(win);
    },
    
    // --- WINDOW CONTROLS ---
    minimizeOrder: (id) => { document.getElementById(`win-${id}`).style.display = 'none'; },
    
    acceptOrder: (id) => {
        const App = window.App;
        if(window.AudioEngine) window.AudioEngine.stopAlarm();
        window.socket.emit('admin-stop-ringing'); 
        window.socket.emit('accept-order', id); 
        const win = document.getElementById(`win-${id}`);
        if(win) win.style.display = 'none';
    },
    
    markReady: (id) => {
        const App = window.App;
        const order = App.activeOrders.find(o => o.id == id);
        const isPickup = order && order.text.includes('[PICKUP');

        if (App.staffChargeMode && !isPickup) { 
            App.openDeliveryAssignModal(id);
        } else {
            window.socket.emit('ready-order', id); 
            const win = document.getElementById(`win-${id}`);
            if(win) win.style.display = 'none';
        }
    },

    // --- DELIVERY ASSIGN (From admin.js) ---
    openDeliveryAssignModal: (orderId) => {
        const App = window.App;
        const order = App.activeOrders.find(o => o.id == orderId);
        if (order && !order.text.includes('[DELIVERY')) {
            window.socket.emit('ready-order', orderId, true);
            App.minimizeOrder(orderId);
            return;
        }

        const modal = document.getElementById('deliveryAssignModal');
        const list = document.getElementById('driverAssignList');
        list.innerHTML = '';
        const btnAll = document.createElement('button');
        btnAll.className = 'modal-btn';
        btnAll.style.background = '#FFD700';
        btnAll.style.color = 'black';
        btnAll.innerHTML = '🔊 ΟΛΟΙ (Broadcast)';
        btnAll.onclick = () => { window.socket.emit('assign-delivery', { orderId: orderId, targetDriver: 'ALL' }); modal.style.display = 'none'; App.minimizeOrder(orderId); };
        list.appendChild(btnAll);
        
        App.lastStaffList.forEach(u => {
            if (u.role === 'driver') {
                const btn = document.createElement('button');
                btn.className = 'modal-btn';
                btn.style.cssText = 'background:#f9fafb; color:#1f2937; border:1px solid #e5e7eb; border-radius:8px; font-weight:600; padding:12px;';
                btn.innerHTML = `🛵 ${u.username}`;
                btn.onclick = () => { window.socket.emit('assign-delivery', { orderId: orderId, targetDriver: u.username }); modal.style.display = 'none'; App.minimizeOrder(orderId); };
                list.appendChild(btn);
            }
        });
        const btnSilent = document.createElement('button');
        btnSilent.className = 'modal-btn';
        btnSilent.style.background = '#607D8B';
        btnSilent.style.color = 'white';
        btnSilent.innerHTML = '🔕 ΕΤΟΙΜΟ (ΧΩΡΙΣ ΚΛΗΣΗ)';
        btnSilent.onclick = () => { window.socket.emit('ready-order', orderId, true); modal.style.display = 'none'; App.minimizeOrder(orderId); };
        list.appendChild(btnSilent);
        modal.style.display = 'flex';
    },

    // --- TREATS (From admin.js) ---
    showTreatOptions: (id) => {
        const App = window.App;
        const order = App.activeOrders.find(o => o.id == id);
        if (!order) return;
        const win = document.getElementById(`win-${id}`);
        const body = win.querySelector('.win-body');
        const footer = win.querySelector('.win-footer');
        let itemsHtml = `<div style="margin-bottom:10px; color:#8e8e8e; font-size:14px; text-align:center;">${App.t('alert_choose_treat') || 'Επιλέξτε είδος για κέρασμα ή πατήστε ΟΛΑ'}:</div>`;
        const lines = order.text.split('\n');
        lines.forEach((line, idx) => {
            if (!line.trim() || line.startsWith('[')) return;
            if (line.includes(':') && !line.includes(':0')) {
                itemsHtml += `<button onclick="App.treatItem('${id}', ${idx})" style="width:100%; padding:12px; margin-bottom:8px; background:#fff; color:#262626; border:1px solid #dbdbdb; border-radius:8px; text-align:left; cursor:pointer; font-weight:500; font-size:15px; transition:background 0.2s;">${line}</button>`;
            } else { itemsHtml += `<div style="padding:8px; color:#8e8e8e; font-size:14px;">${line}</div>`; }
        });
        body.innerHTML = itemsHtml;
        footer.innerHTML = `
            <button class="btn-win-action" style="background:#e1306c; color:white; margin-bottom:10px; border-radius:8px; padding:12px; font-weight:600; border:none; width:100%; cursor:pointer;" onclick="App.treatFull('${id}')">🎁 ΚΕΡΑΣΜΑ ΟΛΑ</button>
            <button class="btn-win-action" style="background:#efefef; color:#262626; border-radius:8px; padding:12px; font-weight:600; border:none; width:100%; cursor:pointer;" onclick="App.openOrderWindow(App.activeOrders.find(o=>o.id==${id}))">🔙 ΑΚΥΡΟ</button>
        `;
    },
    treatItem: (id, idx) => { if(confirm("Κέρασμα για αυτό το είδος;")) window.socket.emit('treat-order', { id: id, type: 'partial', index: idx }); },
    treatFull: (id) => { if(confirm("Κέρασμα ΟΛΗ η παραγγελία;")) window.socket.emit('treat-order', { id: id, type: 'full' }); },
    
    // --- DRAG & DROP LOGIC ---
    makeDraggable: (el) => {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        const header = el.querySelector('.win-header');
        if (!header) return;
        
        header.style.cursor = 'move';
        
        el.onmousedown = el.ontouchstart = () => {
            window.highestOrderZIndex = (window.highestOrderZIndex || 2000) + 1;
            el.style.zIndex = window.highestOrderZIndex;
        };

        const dragMouseDown = (e) => {
            if (e.target.tagName === 'BUTTON') return; // Don't drag if clicking buttons
            e = e || window.event;
            
            window.highestOrderZIndex = (window.highestOrderZIndex || 2000) + 1;
            el.style.zIndex = window.highestOrderZIndex;

            if (e.type === 'touchstart') {
                pos3 = e.touches[0].clientX;
                pos4 = e.touches[0].clientY;
            } else {
                e.preventDefault();
                pos3 = e.clientX;
                pos4 = e.clientY;
            }
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
            document.ontouchend = closeDragElement;
            document.ontouchmove = elementDrag;
        };

        const elementDrag = (e) => {
            e = e || window.event;
            let clientX = e.type && e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
            let clientY = e.type && e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
            
            pos1 = pos3 - clientX;
            pos2 = pos4 - clientY;
            pos3 = clientX;
            pos4 = clientY;
            
            // ✅ Disable CSS transform constraint so we can move freely via top/left
            if (el.style.transform && el.style.transform !== 'none') {
                const rect = el.getBoundingClientRect();
                el.style.transform = 'none';
                el.style.left = rect.left + 'px';
                el.style.top = rect.top + 'px';
            }

            el.style.top = (el.offsetTop - pos2) + "px";
            el.style.left = (el.offsetLeft - pos1) + "px";
        };

        const closeDragElement = () => {
            document.onmouseup = null;
            document.onmousemove = null;
            document.ontouchend = null;
            document.ontouchmove = null;
        };

        header.onmousedown = dragMouseDown;
        header.ontouchstart = dragMouseDown;
    }
};