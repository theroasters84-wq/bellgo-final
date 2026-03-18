import { PRESET_MENUS } from './menu-presets.js';
const calculateTotal = (text) => { let t=0; if(!text)return 0; text.split('\n').forEach(l=>{ const m=l.match(/^(\d+)?\s*(.+):(\d+(?:\.\d+)?)$/); if(m) t+=(parseInt(m[1]||'1')*parseFloat(m[3])); }); return t; };

export const Admin = {
    // --- STORE SETTINGS ---
    saveStoreName: () => {
        const newName = document.getElementById('inpStoreNameHeader').value.trim();
        if(newName) window.socket.emit('save-store-name', newName);
    },

    toggleStatus: (type) => {
        const isOpen = (type === 'customer') 
            ? document.getElementById('switchCust').checked 
            : document.getElementById('switchStaff').checked;
        window.socket.emit('toggle-status', { type: type, isOpen: isOpen });
    },

    toggleStaffCharge: (isChecked) => {
        window.socket.emit('save-store-settings', { staffCharge: isChecked });
    },

    acceptAlarm: () => {
        if(window.AudioEngine) window.AudioEngine.stopAlarm();
        window.socket.emit('admin-stop-ringing'); 
    },

    autoSaveSettings: () => {
        const app = window.App;
        const time = document.getElementById('inpResetTime').value;
        const hours = document.getElementById('inpHours').value;
        const cp = document.getElementById('inpCoverPrice').value;
        const gmaps = document.getElementById('inpGoogleMaps').value.trim();
        const ap = document.getElementById('selAutoPrint').value === 'true';
        const acp = document.getElementById('switchAutoClosePrint').checked;
        const pe = document.getElementById('switchPrinterEnabled').checked;
        const sc = document.getElementById('switchStaffCharge').checked;
        const resEnabled = document.getElementById('switchReservations').checked;
        const totalTables = document.getElementById('inpTotalTables').value;
        
        let rewardData = app.rewardSettings || {};
        const elReward = document.getElementById('switchRewardEnabled');
        if (elReward) {
            rewardData = {
                enabled: elReward.checked,
                gift: document.getElementById('inpRewardGift').value,
                target: parseInt(document.getElementById('inpRewardTarget').value) || 5,
                mode: document.getElementById('selRewardMode').value
            };
        }

        const softPosData = {
            provider: document.getElementById('selSoftPosProvider').value,
            merchantId: document.getElementById('inpSoftPosMerchantId').value,
            apiKey: document.getElementById('inpSoftPosApiKey').value,
            enabled: document.getElementById('switchSoftPosEnabled').checked
        };
        const posMode = document.getElementById('selPosMode').value;

        const posData = {
            provider: document.getElementById('inpPosProvider').value,
            id: document.getElementById('inpPosId').value,
            key: document.getElementById('inpPosKey').value
        };

        window.socket.emit('save-store-settings', { resetTime: time, hours: hours, coverPrice: cp, googleMapsUrl: gmaps, autoPrint: ap, autoClosePrint: acp, printerEnabled: pe, staffCharge: sc, reservationsEnabled: resEnabled, totalTables: totalTables, softPos: softPosData, posMode: posMode, pos: posData, reward: rewardData, features: app.features });
    },
    
    saveSettings: () => {
        window.App.autoSaveSettings();
        document.getElementById('settingsModal').style.display = 'none';
    },

    
    saveSchedule: () => {
        const inputs = document.querySelectorAll('.day-input');
        let newSched = {};
        inputs.forEach(inp => { newSched[inp.dataset.day] = inp.value; });
        window.App.scheduleData = newSched;
        window.socket.emit('save-store-settings', { schedule: newSched });
        document.getElementById('scheduleModal').style.display = 'none';
        document.getElementById('settingsModal').style.display = 'flex';
    },

    applyPresetMenu: () => {
        let type = document.getElementById('selShopTypePanel').value;
        if (!type) type = document.getElementById('selShopType').value;

        if (!type) return alert("Παρακαλώ επιλέξτε είδος καταστήματος!");
        if (!confirm("ΠΡΟΣΟΧΗ: Αυτό θα αντικαταστήσει το υπάρχον μενού. Συνέχεια;")) return;
        
        const newMenu = JSON.parse(JSON.stringify(PRESET_MENUS[type]));
        window.App.menuData = newMenu;
        window.socket.emit('save-menu', { menu: newMenu, mode: 'permanent' });
        window.App.renderMenu();
        alert("Το μενού φορτώθηκε επιτυχώς!");
        document.getElementById('settingsModal').style.display = 'none';
    },

    // --- STAFF MANAGEMENT ---
    removeStaff: (username) => {
        if(confirm(`Αφαίρεση χρήστη ${username};`)) {
            window.socket.emit('manual-logout', { targetUser: username });
        }
    },
    
    renderStaffList: (list) => {
        const container = document.getElementById('staffList');
        if (!container) return;
        const now = Date.now();
        const app = window.App;
        
        if(!app.tempComingState) app.tempComingState = {};

        list.forEach(u => {
            const wasRinging = app.lastRingingState[u.username];
            const isRinging = u.isRinging;
            if (wasRinging && !isRinging) { app.tempComingState[u.username] = now; }
            app.lastRingingState[u.username] = isRinging;
        });

        container.innerHTML = '';
        list.forEach(u => {
            if (u.role === 'admin' || u.role === 'customer') return;

            const staffDiv = document.createElement('div');
            // ✅ FIX: Γίνεται γκρι αν είναι offline. Για Android δίνουμε 60'' περιθώριο (για να μην αναβοσβήνει στο background)
            const isAway = u.status === 'offline' && (!u.isAndroid || u.secondsSinceSeen > 60);
            
            let roleClass = 'role-waiter';
            let icon = '🧑‍🍳';
            if (u.role === 'driver') {
                roleClass = 'role-driver';
                icon = '🛵';
            }

            staffDiv.className = `staff-folder ${roleClass} ${isAway ? 'ghost' : ''}`;

            let stTxt = u.status === 'offline' ? "Offline" : (isAway ? "Away" : "Idle");
            const isComing = app.tempComingState[u.username] && (now - app.tempComingState[u.username] < 15000);

            if (u.isRinging) {
                stTxt = "Ringing";
                staffDiv.classList.add('ringing');
            } else if (isComing) {
                stTxt = "Coming";
                staffDiv.classList.add('coming');
            }

            let closeBtn = '';
            if (isAway) {
                closeBtn = `<button onclick="event.stopPropagation(); App.removeStaff('${u.username}')" style="position:absolute; top:2px; right:2px; background:#D32F2F; color:white; border:none; border-radius:50%; width:20px; height:20px; font-size:10px; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; z-index:10; box-shadow:0 2px 4px rgba(0,0,0,0.5);">✕</button>`;
            }
            
            staffDiv.style.position = 'relative'; 
            staffDiv.innerHTML = `
                ${closeBtn}
                <div class="staff-icon">${icon}</div>
                <div class="staff-label">${u.username}</div>
                <div class="staff-status">${stTxt}</div>
            `;
            
            staffDiv.onclick = () => {
                const sourceLabel = app.adminMode === 'kitchen' ? "👨‍🍳" : "💸";
                window.socket.emit('trigger-alarm', { target: u.username, source: sourceLabel });
                staffDiv.querySelector('.staff-status').innerText = 'Ringing';
                staffDiv.classList.add('ringing');
            };
            container.appendChild(staffDiv);
        });
    },

    // --- SECURITY SETTINGS ---
    renderSecuritySettings: () => {
        const modal = document.getElementById('settingsModal');
        // ✅ FIX: Move Security Settings inside 'subGeneral' (Admin Settings)
        const targetArea = document.getElementById('subGeneral');
        if (!targetArea) return;

        let secDiv = document.getElementById('securitySettingsDiv');
        if (!secDiv) {
            secDiv = document.createElement('div');
            secDiv.id = 'securitySettingsDiv';
            secDiv.style.cssText = "margin-top:20px; border-top:1px solid #333; padding-top:15px;";
            
            // Insert before the last element (Back button)
            if (targetArea.lastElementChild) targetArea.insertBefore(secDiv, targetArea.lastElementChild);
            else targetArea.appendChild(secDiv);
        }

        secDiv.innerHTML = `<h4 style="color:#6b7280; margin:0 0 10px 0; font-size:12px; font-weight:bold;">🔐 ΑΣΦΑΛΕΙΑ</h4>`;

        // ✅ NEW: E-Invoicing Button (Moved up)
        const btnEinv = document.createElement('button');
        btnEinv.style.cssText = "width:100%; background:#f9fafb; color:#1f2937; border:1px solid #e5e7eb; padding:12px; margin-bottom:10px; border-radius:8px; cursor:pointer; text-align:left; font-size:14px; font-weight:600;";
        btnEinv.innerHTML = "🔌 E-INVOICING (myDATA)";
        btnEinv.onclick = () => {
            if (window.Apodiksh) window.Apodiksh.openSettings();
        };
        secDiv.appendChild(btnEinv);

        // 1. Change Login PIN (All Subscriptions)
        const btnPin = document.createElement('button');
        btnPin.style.cssText = "width:100%; background:#f9fafb; color:#1f2937; border:1px solid #e5e7eb; padding:12px; margin-bottom:10px; border-radius:8px; cursor:pointer; text-align:left; font-size:14px; font-weight:600;";
        btnPin.innerHTML = "🔑 Αλλαγή PIN Εισόδου";
        btnPin.onclick = () => {
            if(window.PIN) { window.PIN.reset(); }
            window.App.openPinModal();
        };
        secDiv.appendChild(btnPin);

        // 2. Change Admin Password (Subscription 2, 3, 4, 5)
        const hasManager = window.App.hasFeature('pack_manager');
        const hasDelivery = window.App.hasFeature('pack_delivery');
        const hasTables = window.App.hasFeature('pack_tables');
        const hasPos = window.App.hasFeature('pack_pos');

        if (hasPos || hasManager || hasDelivery || hasTables) {
            const btnAdmin = document.createElement('button');
            btnAdmin.style.cssText = "width:100%; background:#fffbeb; color:#b45309; border:1px solid #fcd34d; padding:12px; margin-bottom:10px; border-radius:8px; cursor:pointer; text-align:left; font-size:14px; font-weight:600;";
            btnAdmin.innerHTML = "🛡️ Αλλαγή Κωδικού Διαχειριστή (Lock)";
            btnAdmin.onclick = () => Admin.changeAdminPassword();
            secDiv.appendChild(btnAdmin);
        }
    },

    changeAdminPassword: () => {
        if (window.App.adminPin) {
            const current = prompt("🔒 Εισάγετε τον ΤΡΕΧΟΝΤΑ Κωδικό Διαχειριστή:");
            if (current === null) return;
            if (current !== String(window.App.adminPin)) return alert("❌ Λάθος Κωδικός!");
        }

        // ✅ FIX: Double Confirmation for Admin Password
        const p1 = prompt("1/2. Ορίστε νέο Κωδικό Διαχειριστή:");
        if (!p1) return;
        
        const p2 = prompt("2/2. Επιβεβαίωση Κωδικού:");
        if (!p2) return;

        if (p1.trim() === p2.trim()) {
            const finalPass = p1.trim();
            window.socket.emit('save-store-settings', { adminPin: finalPass });
            window.App.adminPin = finalPass;
            alert("✅ Ο κωδικός ενημερώθηκε επιτυχώς!");
        } else {
            alert("❌ Οι κωδικοί δεν ταιριάζουν. Προσπαθήστε ξανά.");
        }
    },

    forgotPin: () => {
        if(confirm("Να σταλεί email επαναφοράς PIN στο email του καταστήματος;")) {
            window.socket.emit('forgot-pin', { email: window.App.userData.store });
            alert("Το email εστάλη! Ελέγξτε τα εισερχόμενά σας.");
        }
    },

    
    renderFixedExpenses: () => {
        const container = document.getElementById('fixedExpensesContainer');
        container.innerHTML = '';
        (window.App.fixedExpenses || []).forEach((fixed, idx) => {
            const btn = document.createElement('div');
            btn.style.cssText = "background:#fffbeb; color:#b45309; padding:5px 10px; border-radius:15px; font-size:12px; display:flex; align-items:center; gap:5px; border:1px solid #fcd34d;";
            
            // Έλεγχος Ασφαλείας Δεδομένων
            let name = "Άγνωστο";
            let price = 0;
            if (typeof fixed === 'object') {
                name = fixed.name || name;
                price = Number(fixed.price) || 0;
            } else if (typeof fixed === 'string') {
                name = fixed;
            }

            btn.innerHTML = `<span>${name}: <b>${price.toFixed(2)}€</b></span> <span style="color:#FF5252; font-weight:bold; font-size:10px; cursor:pointer;">✕</span>`;
            btn.children[1].onclick = (e) => {
                if(confirm("Διαγραφή πάγιου εξόδου;")) {
                    window.App.fixedExpenses.splice(idx, 1);
                    window.socket.emit('save-store-settings', { fixedExpenses: window.App.fixedExpenses });
                    window.App.renderFixedExpenses();
                    window.App.calcExpensesTotal();
                }
            };
            container.appendChild(btn);
        });
    },

    addFixedExpense: () => {
        const name = document.getElementById('inpFixedName').value.trim();
        const price = parseFloat(document.getElementById('inpFixedPrice').value);
        if(!name || isNaN(price)) return alert("Συμπληρώστε όνομα και τιμή!");
        
        if(!window.App.fixedExpenses) window.App.fixedExpenses = [];
        window.App.fixedExpenses.push({ name, price });
        
        window.socket.emit('save-store-settings', { fixedExpenses: window.App.fixedExpenses });
        document.getElementById('inpFixedName').value = '';
        document.getElementById('inpFixedPrice').value = '';
        window.App.renderFixedExpenses();
        window.App.calcExpensesTotal();
    },

    renderExpensePresets: () => {
        const container = document.getElementById('expensePresetsContainer');
        container.innerHTML = '';
        (window.App.expensePresets || []).forEach((preset, idx) => {
            const btn = document.createElement('div');
            btn.style.cssText = "background:#f9fafb; color:#1f2937; padding:5px 10px; border-radius:15px; font-size:12px; cursor:pointer; display:flex; align-items:center; gap:5px; border:1px solid #e5e7eb; font-weight:500;";
            let name = preset;
            let price = null;
            if(typeof preset === 'object') { name = preset.name; price = preset.price; }
            btn.innerHTML = `<span>${name}${price ? ` (${price}€)` : ''}</span> <span style="color:#FF5252; font-weight:bold; font-size:10px;">✕</span>`;
            btn.onclick = (e) => {
                const txt = document.getElementById('txtExpenses');
                const lineToAdd = price ? `${name} . ${price}` : `${name} . `;
                txt.value += (txt.value ? '\n' : '') + lineToAdd;
                window.App.calcExpensesTotal();
            };
            btn.children[1].onclick = (e) => {
                e.stopPropagation();
                if(confirm("Διαγραφή παγίου;")) {
                    window.App.expensePresets.splice(idx, 1);
                    window.socket.emit('save-store-settings', { expensePresets: window.App.expensePresets });
                    window.App.renderExpensePresets();
                }
            };
            container.appendChild(btn);
        });
    },
    
    addExpensePreset: () => {
        const val = document.getElementById('inpNewPreset').value.trim();
        const price = parseFloat(document.getElementById('inpNewPresetPrice').value);
        if(!val) return;
        if(!window.App.expensePresets) window.App.expensePresets = [];
        if(!isNaN(price) && price > 0) { window.App.expensePresets.push({ name: val, price: price }); } 
        else { window.App.expensePresets.push(val); }
        window.socket.emit('save-store-settings', { expensePresets: window.App.expensePresets });
        document.getElementById('inpNewPreset').value = '';
        document.getElementById('inpNewPresetPrice').value = '';
        window.App.renderExpensePresets();
    },
    
    calcExpensesTotal: () => {
        let total = 0;
        if(window.App.fixedExpenses) { window.App.fixedExpenses.forEach(f => total += (f.price || 0)); }
        const wages = parseFloat(document.getElementById('inpWages').value) || 0;
        total += wages;
        const txt = document.getElementById('txtExpenses').value;
        txt.split('\n').forEach(line => {
            const match = line.match(/[\d,.]+$/);
            if(match) {
                let numStr = match[0];
                if (numStr.startsWith('.') || numStr.startsWith(',')) {
                    if (numStr.slice(1).match(/[.,]/)) { numStr = numStr.substring(1); }
                    else if (match.index > 0 && line[match.index - 1].trim() !== '') { numStr = numStr.substring(1); }
                }
                numStr = numStr.replace(/,/g, '.');
                const val = parseFloat(numStr);
                if(!isNaN(val)) total += val;
            }
        });
        document.getElementById('expensesTotal').innerText = total.toFixed(2) + '€';
        return total;
    },
    
    saveExpenses: () => {
        const total = window.App.calcExpensesTotal();
        const text = document.getElementById('txtExpenses').value;
        const wages = parseFloat(document.getElementById('inpWages').value) || 0;
        window.socket.emit('save-expenses', { text: text, total: total, wages: wages });
        document.getElementById('expensesModal').style.display = 'none';
        alert("Αποθηκεύτηκε!");
    },

    // --- TABLE QR ---
    generateTableQrs: () => {
        const input = document.getElementById('inpTableNumbers').value.trim();
        const container = document.getElementById('qrGrid');
        container.innerHTML = '';
        if(!input) return alert("Δώστε αριθμούς τραπεζιών (π.χ. 1-10)");
        let tables = [];
        if(input.includes('-') && !isNaN(parseInt(input.split('-')[0]))) {
            const parts = input.split('-');
            const start = parseInt(parts[0]);
            const end = parseInt(parts[1]);
            for(let i=start; i<=end; i++) tables.push(i);
        } else { tables = input.split(',').map(x => x.trim()).filter(x => x !== ""); }
        const baseUrl = window.location.origin;
        const storeParam = encodeURIComponent(window.App.userData.store);
        tables.forEach(t => {
            const url = `${baseUrl}/trapaizei.html?store=${storeParam}&table=${encodeURIComponent(t)}`;
            const wrapper = document.createElement('div');
            wrapper.style.cssText = "display:flex; flex-direction:column; align-items:center; padding:10px; border:1px solid #ccc; page-break-inside: avoid;";
            wrapper.innerHTML = `<div style="font-weight:bold; font-size:18px; margin-bottom:5px;">Τραπέζι ${t}</div><div id="qr-tbl-${t}"></div><div style="font-size:10px; margin-top:5px;">Scan to Order</div>`;
            container.appendChild(wrapper);
            new QRCode(document.getElementById(`qr-tbl-${t}`), { text: url, width: 100, height: 100 });
        });
    },
    printQrs: () => {
        const content = document.getElementById('qrGrid').innerHTML;
        const win = window.open('', '', 'width=800,height=600');
        win.document.write(`<html><head><title>Print QR</title><style>body{font-family:sans-serif;} .grid{display:grid; grid-template-columns:repeat(4, 1fr); gap:20px;} @media print { .grid { display:grid; grid-template-columns:repeat(4, 1fr); gap:20px; } div { page-break-inside: avoid; } }</style></head><body><div class="grid">${content}</div><script>window.print();window.close();<\/script></body></html>`);
    },

    // --- CHAT ---
    sendChat: () => {
        const inp = document.getElementById('adminChatInp');
        if (inp.value.trim()) { window.socket.emit('chat-message', { text: inp.value }); inp.value = ''; }
    },
    appendChat: (data) => {
        const app = window.App;
        if (data.sender !== app.userData.name && !app.isChatOpen) { document.getElementById('chatBadge').style.display = 'block'; }
        const box = document.getElementById('adminChatBox');
        if(box) {
            box.innerHTML += `<div class="chat-msg ${data.sender === app.userData.name ? 'me' : 'other'}"><b>${data.sender}:</b> ${data.text}</div>`;
            box.scrollTop = box.scrollHeight;
        }
    },

    // --- SYSTEM ---
    logout: () => { if(window.socket) window.socket.emit('manual-logout'); localStorage.removeItem('bellgo_session'); window.location.replace("login.html"); },
    
    
    forceReconnect: () => { window.socket.disconnect(); setTimeout(()=>window.socket.connect(), 500); },
    startHeartbeat: () => setInterval(() => { if (window.socket && window.socket.connected) window.socket.emit('heartbeat'); }, 3000)
};