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
                btn.innerHTML = "📝 ΣΤΟΙΧΕΙΑ ΠΕΛΑΤΗ (ΚΛΙΚ)";
                btn.onclick = () => {
                    divDel.style.display = 'flex';
                    btn.style.display = 'none';
                    const firstInp = document.getElementById('sidebarDelName');
                    if(firstInp) firstInp.focus();
                };
                divDel.parentNode.insertBefore(btn, divDel);
                
                const closeBtn = document.createElement('button');
                closeBtn.innerHTML = "OK (ΚΛΕΙΣΙΜΟ)";
                closeBtn.style.cssText = "background:#00E676; color:black; border:none; padding:8px; width:100%; margin-top:5px; border-radius:5px; font-weight:bold; cursor:pointer;";
                closeBtn.onclick = () => {
                    divDel.style.display = 'none';
                    btn.style.display = 'block';
                    const name = document.getElementById('sidebarDelName').value;
                    const phone = document.getElementById('sidebarDelPhone').value;
                    if(name || phone) {
                        btn.innerHTML = `📝 ${name || ''} ${phone ? '('+phone+')' : ''} <br><span style='font-size:10px; color:#aaa;'>(Πατήστε για αλλαγή)</span>`;
                    } else {
                        btn.innerHTML = "📝 ΣΤΟΙΧΕΙΑ ΠΕΛΑΤΗ (ΚΛΙΚ)";
                    }
                };
                divDel.appendChild(closeBtn);
            }
            
            btn.style.display = 'block';
            divDel.style.display = 'none'; 
            const name = document.getElementById('sidebarDelName').value;
            if(name) btn.innerHTML = `📝 ${name} <span style='font-size:10px; color:#aaa;'>(Πατήστε για αλλαγή)</span>`;
        }
    },
    
    renderSidebarMenu: () => {
        const App = window.App;
        const container = document.getElementById('sidebarMenuContainer');
        container.innerHTML = '';
        App.menuData.forEach(cat => {
            const title = document.createElement('div');
            title.className = 'category-title';
            title.innerText = cat.name;
            const itemsDiv = document.createElement('div');
            itemsDiv.className = 'category-items';
            cat.items.forEach(item => {
                let name = item, price = 0;
                if(typeof item === 'object') { name = item.name; price = item.price; }
                else { const p = item.split(':'); name = p[0]; if(p.length>1) price=parseFloat(p[p.length-1]); }
                
                const box = document.createElement('div');
                box.className = 'item-box';
                box.innerHTML = `<span class="item-name">${name}</span>${price>0?`<span class="item-price">${price}€</span>`:''}`;
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
    
    calcSidebarTotal: () => {
        const txt = document.getElementById('sidebarOrderText').value;
        const total = calculateTotal(txt);
        document.getElementById('sidebarTotal').innerText = `ΣΥΝΟΛΟ: ${total.toFixed(2)}€`;
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
            if (!table) return alert("Παρακαλώ βάλτε τραπέζι ή επιλέξτε PASO.");

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
            if(!name || !addr || !phone) return alert("Συμπληρώστε τα στοιχεία Delivery!");
            header = `[DELIVERY 🛵]\n👤 ${name}\n📍 ${addr}\n📮 T.K.: ${zip || '-'}\n🏢 ${floor || '-'}\n📞 ${phone}\n${payMethod}`;
        }
        
        const separator = App.sidebarMode === 'delivery' ? '\n---\n' : '\n';
        window.socket.emit('new-order', `${header}${separator}${finalBody}`);
        
        alert("Εστάλη!");
        document.getElementById('sidebarOrderText').value = '';
        if(document.getElementById('sidebarTable')) document.getElementById('sidebarTable').value = '';
        if(document.getElementById('sidebarCovers')) document.getElementById('sidebarCovers').value = '';
        if(document.getElementById('sidebarDelName')) document.getElementById('sidebarDelName').value = '';
        if(document.getElementById('sidebarDelAddr')) document.getElementById('sidebarDelAddr').value = '';
        if(document.getElementById('sidebarDelFloor')) document.getElementById('sidebarDelFloor').value = '';
        if(document.getElementById('sidebarDelPhone')) document.getElementById('sidebarDelPhone').value = '';
        if(document.getElementById('sidebarDelZip')) document.getElementById('sidebarDelZip').value = '';
        App.toggleOrderSidebar(); 
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
            icon.className = `order-post ${order.status === 'pending' ? 'ringing' : ''}`;
            
            // Instagram Style Inner HTML
            let previewLines = order.text.split('\n');
            let previewHtml = previewLines.slice(0, 5).join('<br>');
            if(previewLines.length > 5) previewHtml += '<br><span style="color:#8e8e8e; font-size:12px;">...περισσότερα</span>';

            let statusText = order.status === 'pending' ? 'ΝΕΑ' : (order.status === 'cooking' ? 'ΕΤΟΙΜΑΖΕΤΑΙ' : 'ΕΤΟΙΜΟ');
            let statusColor = order.status === 'pending' ? '#ed4956' : (order.status === 'cooking' ? '#0095f6' : '#00E676');

            icon.innerHTML = `
                <div class="post-header">
                    <div class="post-avatar-ring"><div class="post-avatar">${isPaid ? '✅' : '👤'}</div></div>
                    <div class="post-title-group">
                        <span class="post-author">${displayLabel}</span>
                        <span class="post-time">${time}</span>
                    </div>
                    <div class="post-more">⋯</div>
                </div>
                <div class="post-image-placeholder">
                    <div class="post-status-badge" style="background:${statusColor};">${statusText}</div>
                    ${previewHtml}
                </div>
                <div class="post-action-bar">
                    <div class="action-left">🤍 💬 ✈️</div>
                    <div class="action-right">🔖</div>
                </div>
                <div class="post-likes" style="padding-bottom:10px;">Κατάσταση: <b>${isPaid ? 'Εξοφλημένη' : 'Εκκρεμεί Πληρωμή'}</b></div>
            `;
            icon.onclick = () => App.openOrderWindow(order);
            desktop.appendChild(icon);
        });
    },

    openOrderWindow: (order) => {
        const App = window.App;
        if(window.AudioEngine) window.AudioEngine.stopAlarm();
        window.socket.emit('admin-stop-ringing'); 

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
            
            const btnCash = `<button onclick="App.payItemPartial(${order.id}, ${i}, 'cash')" style="background:transparent; border:none; cursor:pointer; font-size:18px; margin-left:5px; opacity:${isPaidCard ? '0.3' : '1'}; filter:${isPaidCard ? 'grayscale(1)' : 'none'};" title="Μετρητά">💶</button>`;
            const btnCard = `<button onclick="App.payItemPartial(${order.id}, ${i}, 'card')" style="background:transparent; border:none; cursor:pointer; font-size:18px; margin-left:5px; opacity:${isPaidCash ? '0.3' : '1'}; filter:${isPaidCash ? 'grayscale(1)' : 'none'};" title="Κάρτα">💳</button>`;

            displayItems += `<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #333; padding:5px 0;">
                                <span style="color:${isPaid ? '#00E676' : 'white'};">${cleanLine}</span>
                                <div style="white-space:nowrap;">${btnCash}${btnCard}</div>
                             </div>`;
        }

        const total = calculateTotal(order.text);
        let actions = '';
        let treatBtn = ''; 
        let receiptBtn = ''; 

        let rewardBtn = '';
        if (App.rewardSettings && App.rewardSettings.enabled) {
            rewardBtn = `<button class="win-btn-top" style="background:transparent; border:1px solid #E91E63; color:#E91E63; padding:6px 12px; border-radius:6px; margin-right:8px; cursor:pointer; font-weight:bold;" onclick="App.openRewardQr('${order.id}')" title="QR Επιβράβευσης">🎁 QR</button>`;
        }

        if (App.einvoicingEnabled) {
            const hasReceipt = order.text.includes('[🧾 ΑΠΟΔΕΙΞΗ]');
            const btnColor = hasReceipt ? '#00E676' : '#FF9800';
            receiptBtn = `<button class="win-btn-top" style="background:transparent; border:1px solid ${btnColor}; color:${btnColor}; padding:6px 12px; border-radius:6px; margin-right:8px; cursor:pointer; font-weight:bold;" onclick="App.issueReceipt('${order.id}')" title="Ηλ. Τιμολόγηση">${hasReceipt ? '🧾 ΕΚΔΟΘΗΚΕ' : '🧾 ΑΠΟΔΕΙΞΗ'}</button>`;
        }

        if (App.adminMode !== 'kitchen') {
             treatBtn = `<button style="background:transparent; border:1px solid #FFD700; color:#FFD700; padding:6px 12px; border-radius:6px; margin-right:8px; cursor:pointer; font-size:16px;" onclick="App.showTreatOptions('${order.id}')" title="Κέρασμα">🎁</button>`;
             treatBtn += `<button style="background:transparent; border:1px solid #aaa; color:#aaa; padding:6px 12px; border-radius:6px; margin-right:8px; cursor:pointer; font-size:16px;" onclick="App.printOrder('${order.id}')" title="Εκτύπωση">🖨️</button>`;
             if (!App.printerEnabled) treatBtn = `<button style="background:transparent; border:1px solid #FFD700; color:#FFD700; padding:6px 12px; border-radius:6px; margin-right:8px; cursor:pointer; font-size:16px;" onclick="App.showTreatOptions('${order.id}')" title="Κέρασμα">🎁</button>`;
        }

        if (order.status === 'pending') {
            actions = `<button class="btn-win-action" style="background:#2196F3; color:white;" onclick="App.acceptOrder(${order.id})">🔊 ΑΠΟΔΟΧΗ</button>`;
        } else if (order.status === 'cooking') {
            if (order.text.includes('[PICKUP')) {
                actions = `<button class="btn-win-action" style="background:#FF9800; color:black;" onclick="App.markReady(${order.id})">🛍️ ΕΤΟΙΜΟ ΓΙΑ ΠΑΡΑΛΑΒΗ</button>`;
            } else {
                actions = `<button class="btn-win-action" style="background:#FFD700; color:black;" onclick="App.markReady(${order.id})">🛵 ΕΤΟΙΜΟ / ΔΙΑΝΟΜΗ</button>`;
            }
        } else {
            if (App.adminMode === 'kitchen') {
                actions = `<button class="btn-win-action" style="background:#555; color:white;" onclick="App.minimizeOrder('${order.id}')">OK (ΚΛΕΙΣΙΜΟ)</button>`;
            } else {
                treatBtn = `<button style="background:transparent; border:1px solid #FFD700; color:#FFD700; padding:6px 12px; border-radius:6px; margin-right:8px; cursor:pointer; font-size:16px;" onclick="App.showTreatOptions('${order.id}')" title="Κέρασμα">🎁</button>`;
                if (App.printerEnabled) {
                    treatBtn += `<button style="background:transparent; border:1px solid #aaa; color:#aaa; padding:6px 12px; border-radius:6px; margin-right:8px; cursor:pointer; font-size:16px;" onclick="App.printOrder('${order.id}')" title="Εκτύπωση">🖨️</button>`;
                }
                if (App.hasFeature('pack_pos') && App.softPosSettings && App.softPosSettings.enabled) {
                    actions = `<button class="btn-win-action" style="background:#00BCD4; color:white; margin-bottom:10px;" onclick="App.payWithSoftPos('${order.id}')">📱 TAP TO PAY</button>` + actions;
                }
                if (App.hasFeature('pack_pos')) actions = `<button class="btn-win-action" style="background:#635BFF; color:white; margin-bottom:10px;" onclick="App.openQrPayment('${order.id}')">💳 QR CARD (ΠΕΛΑΤΗΣ)</button>` + actions;
                
                actions += `<button class="btn-win-action" style="background:#00E676;" onclick="App.completeOrder(${order.id})">💰 ΕΞΟΦΛΗΣΗ / ΚΛΕΙΣΙΜΟ</button>`;
            }
        }
        win.style.border = `none`;
        win.innerHTML = `
            <div class="win-header">
                <span style="font-weight:bold; color:white; font-size:24px;">${order.from}</span>
                <div class="win-controls" style="display:flex; align-items:center;">
                    ${rewardBtn}
                    ${receiptBtn}
                    ${treatBtn}
                    <button class="win-btn-top" style="background:#FF9800; color:black; padding:6px 12px; border:none; border-radius:6px; font-weight:bold; cursor:pointer;" onclick="App.minimizeOrder('${order.id}')">🔙 ΠΙΣΩ</button>
                </div>
            </div>
            <div class="win-body">
                <div class="order-info-section">
                    ${infoText}
                    ${timeInfo}
                </div>
                <div class="order-items-section">${displayItems}</div>
                <div style="font-size:24px; color:#FFD700; font-weight:bold; text-align:right; margin-top:20px;">ΣΥΝΟΛΟ: ${total.toFixed(2)}€</div>
            </div>
            <div class="win-footer">${actions}</div>
        `;
        win.style.display = 'flex';
    },
    
    // --- PRINT LOGIC ---
    printOrder: (id, directObj = null) => {
        const App = window.App;
        let order = null;
        if (directObj) {
            order = directObj; 
        } else {
            order = App.activeOrders.find(o => o.id == id);
        }
        
        if(!order) return;
        
        const total = calculateTotal(order.text);
        const date = new Date(order.id).toLocaleString('el-GR');
        const storeName = document.getElementById('inpStoreNameHeader').value || "BellGo Order";
        const itemsHtml = order.text.replace(/\n/g, '<br>');

        let qrHtml = '';
        if (order.aadeQr) {
            const div = document.createElement('div');
            new QRCode(div, { text: order.aadeQr, width: 100, height: 100, correctLevel: QRCode.CorrectLevel.L });
            
            const img = div.querySelector('img');
            const canvas = div.querySelector('canvas');
            let src = '';
            if (canvas) src = canvas.toDataURL();
            else if (img) src = img.src;
            
            if (src) {
                qrHtml = `
                    <div style="text-align:center; margin-top:20px; border-top:1px dashed #000; padding-top:10px;">
                        <div style="font-size:10px; font-weight:bold; margin-bottom:5px;">QR Code ΑΑΔΕ</div>
                        <img src="${src}" style="width:100px; height:100px;"/>
                    </div>
                `;
            }
        }

        let rewardQrHtml = '';
        if (App.rewardSettings && App.rewardSettings.enabled) {
             const baseUrl = window.location.origin;
             const storeParam = encodeURIComponent(App.userData.store);
             const rewardUrl = `${baseUrl}/epivraveush.html?store=${storeParam}&order=${order.id}`;
             
             const divReward = document.createElement('div');
             new QRCode(divReward, { text: rewardUrl, width: 100, height: 100, correctLevel: QRCode.CorrectLevel.L });
             
             const imgR = divReward.querySelector('img');
             const canvasR = divReward.querySelector('canvas');
             let srcR = '';
             if (canvasR) srcR = canvasR.toDataURL();
             else if (imgR) srcR = imgR.src;
             
             if (srcR) {
                 rewardQrHtml = `
                    <div style="text-align:center; margin-top:20px; border-top:1px dashed #000; padding-top:10px;">
                        <div style="font-size:12px; font-weight:bold; margin-bottom:5px;">🎁 ΣΚΑΝΑΡΕ ΓΙΑ ΔΩΡΟ!</div>
                        <img src="${srcR}" style="width:100px; height:100px;"/>
                    </div>
                 `;
             }
        }

        const win = window.open('', '', 'width=300,height=600');
        win.document.write(`
            <html>
            <head>
                <title>Print Order #${id}</title>
                <style>
                    body { font-family: 'Courier New', monospace; width: 280px; margin: 0 auto; padding: 10px; color: black; }
                    .header { text-align: center; font-weight: bold; margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 5px; }
                    .meta { font-size: 12px; margin-bottom: 10px; }
                    .items { font-size: 14px; font-weight: bold; border-bottom: 1px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
                    .total { text-align: right; font-size: 18px; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="header">${storeName}</div>
                <div class="meta">${date}<br>${order.from}</div>
                <div class="items">${itemsHtml}</div>
                <div class="total">ΣΥΝΟΛΟ: ${total.toFixed(2)}€</div>
                ${qrHtml}
                ${rewardQrHtml}
                <script>window.onload = function() { window.print(); setTimeout(function(){ window.close(); }, 500); }</script>
            </body></html>`);

        if (App.autoClosePrint) {
            const winEl = document.getElementById(`win-${id}`);
            if(winEl) winEl.style.display = 'none';
        }
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
                btn.style.background = '#333';
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
        let itemsHtml = '<div style="margin-bottom:10px; color:#aaa;">Επιλέξτε είδος για κέρασμα ή πατήστε "ΟΛΑ":</div>';
        const lines = order.text.split('\n');
        lines.forEach((line, idx) => {
            if (!line.trim() || line.startsWith('[')) return;
            if (line.includes(':') && !line.includes(':0')) {
                itemsHtml += `<button onclick="App.treatItem('${id}', ${idx})" style="width:100%; padding:10px; margin-bottom:5px; background:#333; color:white; border:1px solid #555; border-radius:6px; text-align:left; cursor:pointer;">${line}</button>`;
            } else { itemsHtml += `<div style="padding:5px; color:#777;">${line}</div>`; }
        });
        body.innerHTML = itemsHtml;
        footer.innerHTML = `
            <button class="btn-win-action" style="background:#FFD700; color:black; margin-bottom:10px;" onclick="App.treatFull('${id}')">🎁 ΚΕΡΑΣΜΑ ΟΛΑ</button>
            <button class="btn-win-action" style="background:#555; color:white;" onclick="App.openOrderWindow(App.activeOrders.find(o=>o.id==${id}))">🔙 ΑΚΥΡΟ</button>
        `;
    },
    treatItem: (id, idx) => { if(confirm("Κέρασμα για αυτό το είδος;")) window.socket.emit('treat-order', { id: id, type: 'partial', index: idx }); },
    treatFull: (id) => { if(confirm("Κέρασμα ΟΛΗ η παραγγελία;")) window.socket.emit('treat-order', { id: id, type: 'full' }); }
};