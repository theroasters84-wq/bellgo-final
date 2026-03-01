import { PRESET_MENUS } from './menu-presets.js';

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

    // --- UI TOGGLES ---
    togglePresetPanel: () => {
        const p = document.getElementById('presetPanel');
        if(p) p.style.display = (p.style.display === 'none' ? 'block' : 'none');
    },

    toggleMenuMode: () => {
        const panel = document.getElementById('menuFullPanel');
        const btn = document.getElementById('btnMenuToggle');
        if (panel.style.display === 'flex') {
            panel.style.display = 'none';
            btn.classList.remove('menu-active');
        } else {
            panel.style.display = 'flex';
            btn.classList.add('menu-active');
        }
    },
    
    toggleStaffPanel: () => {
        const el = document.getElementById('staffContainer');
        const icon = document.getElementById('staffToggleIcon');
        if (el.classList.contains('minimized')) {
            el.classList.remove('minimized');
            icon.innerText = "▼";
            icon.style.transform = "rotate(0deg)";
        } else {
            el.classList.add('minimized');
            icon.innerText = "▲";
            icon.style.transform = "rotate(180deg)";
        }
    },

    // --- MODALS & SETTINGS ---
    openPinModal: () => {
        document.getElementById('settingsModal').style.display = 'none'; 
        if(window.PIN) window.PIN.clear();
        document.getElementById('pinChangeModal').style.display = 'flex';
    },
    closePinModal: () => { 
        document.getElementById('pinChangeModal').style.display = 'none'; 
        document.getElementById('settingsModal').style.display = 'flex'; 
    },
    
    openSettingsModal: () => { 
        document.getElementById('settingsModal').style.display = 'flex';
        if(window.App) window.App.closeSettingsSub(); 

        // ✅ NEW: Render Security Settings (Dynamic)
        Admin.renderSecuritySettings();

        // ❌ REMOVED: Lock overlay over the whole area.
        // Settings now open freely, and code is requested only for Admin Settings.
        const lock = document.getElementById('settingsLockOverlay');
        if(lock) lock.style.display = 'none';
        
        const app = window.App;
        app.applyFeatureVisibility();
    },

    unlockSettings: () => {
        const pin = document.getElementById('inpUnlockPin').value.trim();
        
        // ✅ NEW: Check Admin Lock Password first
        if (window.App.adminPin) {
            if (pin === String(window.App.adminPin).trim()) {
                window.App.settingsUnlocked = true;
                const lock = document.getElementById('settingsLockOverlay');
                if(lock) lock.style.display = 'none';
                document.getElementById('settingsLockedArea').style.minHeight = ''; 
            } else {
                alert("Λάθος Κωδικός Διαχειριστή!");
                document.getElementById('inpUnlockPin').value = '';
            }
            return;
        }
        
        const storeEmail = window.App.userData ? window.App.userData.store : null;
        window.socket.emit('verify-pin', { pin: pin, email: storeEmail });
        
        window.socket.once('pin-verified', (data) => {
            if (data.success) {
                window.App.settingsUnlocked = true;
                const lock = document.getElementById('settingsLockOverlay');
                if(lock) lock.style.display = 'none';
                document.getElementById('settingsLockedArea').style.minHeight = ''; 
            } else {
                alert("Λάθος PIN!");
                document.getElementById('inpUnlockPin').value = '';
            }
        });
    },
    
    updateFromLock: (type, val) => {
        const app = window.App;
        if (type === 'name') {
            const el = document.getElementById('inpStoreNameHeader');
            if(el) { el.value = val; app.saveStoreName(); }
        } else if (type === 'hours') {
            const el = document.getElementById('inpHours');
            if(el) { el.value = val; app.autoSaveSettings(); }
        } else if (type === 'reset') {
            const el = document.getElementById('inpResetTime');
            if(el) { el.value = val; app.autoSaveSettings(); }
        } else if (type === 'cust') {
            const el = document.getElementById('switchCust');
            if(el) { el.checked = val; app.toggleStatus('customer'); }
        } else if (type === 'staff') {
            const el = document.getElementById('switchStaff');
            if(el) { el.checked = val; app.toggleStatus('staff'); }
        } else if (type === 'charge') {
            const el = document.getElementById('switchStaffCharge');
            if(el) { el.checked = val; app.toggleStaffCharge(val); }
        }
    },

    openSettingsSub: (id) => {
        // ✅ NEW: REQUIRE PIN ONLY FOR ADMIN SETTINGS (subGeneral)
        if (id === 'subGeneral' && !window.App.settingsUnlocked && window.App.hasFeature('pack_pos')) {
            const pin = prompt(window.App.adminPin ? "🔐 ΕΙΣΑΓΕΤΕ ΚΩΔΙΚΟ ΔΙΑΧΕΙΡΙΣΤΗ:" : "🔐 ΕΙΣΑΓΕΤΕ PIN:");
            if (!pin) return;

            if (window.App.adminPin) {
                if (pin === String(window.App.adminPin).trim()) {
                    window.App.settingsUnlocked = true;
                    // Continue to open
                } else {
                    alert("❌ Λάθος Κωδικός!");
                    return;
                }
            } else {
                const storeEmail = window.App.userData ? window.App.userData.store : null;
                window.socket.emit('verify-pin', { pin: pin, email: storeEmail });
                window.socket.once('pin-verified', (data) => {
                    if (data.success) {
                        window.App.settingsUnlocked = true;
                        Admin.openSettingsSub('subGeneral');
                    } else {
                        alert("❌ Λάθος PIN!");
                    }
                });
                return;
            }
        }

        document.getElementById('settingsMain').style.display = 'none';
        document.querySelectorAll('.settings-sub').forEach(el => el.style.display = 'none');
        const target = document.getElementById(id);
        if(target) target.style.display = 'block';
    },

    closeSettingsSub: () => {
        document.querySelectorAll('.settings-sub').forEach(el => el.style.display = 'none');
        const main = document.getElementById('settingsMain');
        if(main) main.style.display = 'block';
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

    openScheduleModal: () => {
        document.getElementById('settingsModal').style.display = 'none';
        const days = ['Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο', 'Κυριακή'];
        const container = document.getElementById('weekDaysContainer');
        container.innerHTML = '';
        const sched = window.App.scheduleData || {};
        days.forEach(day => {
            const row = document.createElement('div');
            row.className = 'day-row';
            const val = sched[day] || '';
            row.innerHTML = `<span class="day-label">${day.substring(0,3)}</span>
                             <input type="text" class="day-input" data-day="${day}" value="${val}" placeholder="π.χ. 18:00 - 23:00">`;
            container.appendChild(row);
        });
        document.getElementById('scheduleModal').style.display = 'flex';
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
            const isAway = u.status === 'away' || u.status === 'offline' || u.status === 'background';
            
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
        // ✅ FIX: Append to Locked Area so it gets hidden by the lock overlay
        const lockedArea = document.getElementById('settingsLockedArea');
        if (!lockedArea) return;

        let secDiv = document.getElementById('securitySettingsDiv');
        if (!secDiv) {
            secDiv = document.createElement('div');
            secDiv.id = 'securitySettingsDiv';
            secDiv.style.cssText = "margin-top:20px; border-top:1px solid #333; padding-top:15px;";
            lockedArea.appendChild(secDiv);
        }

        secDiv.innerHTML = `<h4 style="color:#aaa; margin:0 0 10px 0; font-size:12px;">🔐 ΑΣΦΑΛΕΙΑ</h4>`;

        // 1. Change Login PIN (All Subscriptions)
        const btnPin = document.createElement('button');
        btnPin.style.cssText = "width:100%; background:#333; color:white; border:1px solid #555; padding:10px; margin-bottom:10px; border-radius:5px; cursor:pointer; text-align:left; font-size:14px;";
        btnPin.innerHTML = "🔑 Αλλαγή PIN Εισόδου";
        btnPin.onclick = () => {
            // Reset PIN state for double confirmation
            if(window.PIN) { window.PIN.reset(); }
            Admin.openPinModal();
        };
        secDiv.appendChild(btnPin);

        // 2. Change Admin Password (Subscription 2, 3, 4, 5)
        const hasManager = window.App.hasFeature('pack_manager');
        const hasDelivery = window.App.hasFeature('pack_delivery');
        const hasTables = window.App.hasFeature('pack_tables');
        const hasPos = window.App.hasFeature('pack_pos');

        if (hasPos || hasManager || hasDelivery || hasTables) {
            const btnAdmin = document.createElement('button');
            btnAdmin.style.cssText = "width:100%; background:#333; color:#FFD700; border:1px solid #FFD700; padding:10px; margin-bottom:10px; border-radius:5px; cursor:pointer; text-align:left; font-size:14px;";
            btnAdmin.innerHTML = "🛡️ Αλλαγή Κωδικού Διαχειριστή (Lock)";
            btnAdmin.onclick = () => Admin.changeAdminPassword();
            secDiv.appendChild(btnAdmin);
        }
    },

    changeAdminPassword: () => {
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

    // --- CHAT ---
    toggleAdminChat: () => { 
        const el = document.getElementById('adminChatOverlay');
        const app = window.App;
        app.isChatOpen = (el.style.display === 'flex');
        if (app.isChatOpen) { el.style.display = 'none'; app.isChatOpen = false; } 
        else { el.style.display = 'flex'; app.isChatOpen = true; document.getElementById('chatBadge').style.display = 'none'; }
    },
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
    
    toggleFakeLock: () => { 
        const el = document.getElementById('fakeLockOverlay');
        if (el.style.display === 'flex') {
            // Unlock Attempt (Secure)
            const pin = prompt("PIN (Admin/Waiter/Driver):");
            if (pin) window.socket.emit('verify-pin', { pin, email: window.App.userData.store });
        } else {
            // Lock
            el.style.display = 'flex';
            if(window.socket) window.socket.emit('set-user-status', 'background');
        }
    },
    
    forceReconnect: () => { window.socket.disconnect(); setTimeout(()=>window.socket.connect(), 500); },
    startHeartbeat: () => setInterval(() => { if (window.socket && window.socket.connected) window.socket.emit('heartbeat'); }, 3000)
};