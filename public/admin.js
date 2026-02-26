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

        // LOCK LOGIC
        const app = window.App;
        const lockedArea = document.getElementById('settingsLockedArea');
        
        if (!app.settingsUnlocked) {
            if (window.getComputedStyle(lockedArea).position === 'static') lockedArea.style.position = 'relative';
            lockedArea.style.minHeight = '600px'; // ✅ FIX: Increase height for lock screen
            
            // ✅ NEW: Έλεγχος ορατότητας για το Lock Screen (ώστε να μην είναι καρφωτά)
            const hasManager = app.hasFeature('pack_manager');
            const hasDelivery = app.hasFeature('pack_delivery');
            const styleCust = hasDelivery ? 'flex' : 'none';
            const styleStaff = hasManager ? 'flex' : 'none';
            const styleCharge = hasManager ? 'flex' : 'none';

            let lock = document.getElementById('settingsLockOverlay');
            if (!lock) {
                lock = document.createElement('div');
                lock.id = 'settingsLockOverlay';
                lock.style.cssText = "position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.95); z-index:100; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; backdrop-filter:blur(5px); border-radius:10px; overflow-y:auto; padding:20px; box-sizing:border-box;";
                lock.innerHTML = `
                    <div style="font-size:50px; margin-bottom:20px;">🔒</div>
                    <h3 style="color:white; margin-bottom:10px;">Ρυθμίσεις Κλειδωμένες</h3>
                    <p style="color:#aaa; margin-bottom:20px; font-size:14px;">Απαιτείται PIN διαχειριστή.</p>
                    
                    <div style="display:flex; gap:10px; justify-content:center; margin-bottom:30px;">
                        <input type="password" id="inpUnlockPin" placeholder="PIN" style="padding:12px; border-radius:8px; border:1px solid #444; background:#222; color:white; text-align:center; font-size:18px; width:100px; outline:none;">
                        <button onclick="App.unlockSettings()" style="padding:12px 20px; background:#FFD700; color:black; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">OK</button>
                    </div>

                    <!-- EXCEPTION: STORE & HOURS -->
                    <div style="background:#222; padding:15px; border-radius:10px; border:1px solid #444; width:100%; max-width:300px; margin-bottom:20px; text-align:left;">
                        <h4 style="color:#aaa; margin:0 0 10px 0; font-size:12px; border-bottom:1px solid #333; padding-bottom:5px;">ΒΑΣΙΚΕΣ ΡΥΘΜΙΣΕΙΣ (ΕΞΑΙΡΕΣΗ)</h4>
                        
                        <div style="margin-bottom:10px;">
                            <label style="color:#ccc; font-size:12px; display:block;">Όνομα Καταστήματος</label>
                            <input type="text" id="inpLockStoreName" style="width:100%; padding:8px; background:#111; border:1px solid #333; color:white; border-radius:5px; box-sizing:border-box;" onchange="App.updateFromLock('name', this.value)">
                        </div>

                        <div style="display:flex; gap:10px; margin-bottom:15px;">
                            <div style="flex:1;">
                                <label style="color:#ccc; font-size:12px; display:block;">Ωράριο</label>
                                <input type="text" id="inpLockHours" style="width:100%; padding:8px; background:#111; border:1px solid #333; color:white; border-radius:5px; box-sizing:border-box;" onchange="App.updateFromLock('hours', this.value)">
                            </div>
                            <div style="flex:1;">
                                <label style="color:#ccc; font-size:12px; display:block;">Reset</label>
                                <input type="time" id="inpLockReset" style="width:100%; padding:8px; background:#111; border:1px solid #333; color:white; border-radius:5px; box-sizing:border-box;" onchange="App.updateFromLock('reset', this.value)">
                            </div>
                        </div>

                        <div style="border-top:1px solid #333; padding-top:10px;">
                            <div id="divLockCust" style="display:${styleCust}; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                <span style="color:#ccc; font-size:12px;">ΠΕΛΑΤΕΣ (Delivery)</span>
                                <label class="switch"><input type="checkbox" id="switchLockCust" onchange="App.updateFromLock('cust', this.checked)"><span class="slider round"></span></label>
                            </div>
                            <div id="divLockStaff" style="display:${styleStaff}; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                <span style="color:#ccc; font-size:12px;">ΠΡΟΣΩΠΙΚΟ (Staff)</span>
                                <label class="switch"><input type="checkbox" id="switchLockStaff" onchange="App.updateFromLock('staff', this.checked)"><span class="slider round"></span></label>
                            </div>
                            <div id="divLockCharge" style="display:${styleCharge}; justify-content:space-between; align-items:center;">
                                <span style="color:#ccc; font-size:12px;">ΧΡΕΩΣΗ ΠΡΟΣΩΠΙΚΟΥ</span>
                                <label class="switch"><input type="checkbox" id="switchLockCharge" onchange="App.updateFromLock('charge', this.checked)"><span class="slider round"></span></label>
                            </div>
                        </div>
                    </div>

                    <div style="border-top:1px solid #333; padding-top:20px; width:80%;">
                        <p style="color:#aaa; font-size:12px; margin-bottom:10px;">Εργαλεία Προσωπικού:</p>
                        <button onclick="window.DNDBot.init(); window.DNDBot.showIntro();" style="background:#333; color:white; border:1px solid #555; padding:10px 20px; border-radius:20px; cursor:pointer; font-size:14px; display:flex; align-items:center; gap:10px; margin:0 auto;">
                            <span>🤖</span> BellGo Bot (Setup)
                        </button>
                    </div>
                `;
                lockedArea.appendChild(lock);
            } else {
                lock.style.display = 'flex';
            }

            // ✅ FORCE UPDATE VISIBILITY (Fix for cached element)
            const divCust = document.getElementById('divLockCust');
            const divStaff = document.getElementById('divLockStaff');
            const divCharge = document.getElementById('divLockCharge');
            
            if(divCust) divCust.style.display = styleCust;
            if(divStaff) divStaff.style.display = styleStaff;
            if(divCharge) divCharge.style.display = styleCharge;

            // POPULATE VALUES
            const realName = document.getElementById('inpStoreNameHeader');
            const realHours = document.getElementById('inpHours');
            const realReset = document.getElementById('inpResetTime');
            if(realName) document.getElementById('inpLockStoreName').value = realName.value;
            if(realHours) document.getElementById('inpLockHours').value = realHours.value;
            if(realReset) document.getElementById('inpLockReset').value = realReset.value;

            const swCust = document.getElementById('switchCust');
            const swStaff = document.getElementById('switchStaff');
            const swCharge = document.getElementById('switchStaffCharge');
            if(swCust) document.getElementById('switchLockCust').checked = swCust.checked;
            if(swStaff) document.getElementById('switchLockStaff').checked = swStaff.checked;
            if(swCharge) document.getElementById('switchLockCharge').checked = swCharge.checked;

        } else {
            const lock = document.getElementById('settingsLockOverlay');
            if(lock) lock.style.display = 'none';
        }
        
        app.applyFeatureVisibility();
    },

    unlockSettings: () => {
        const pin = document.getElementById('inpUnlockPin').value;
        if(!pin) return;
        
        const storeEmail = window.App.userData ? window.App.userData.store : null;
        window.socket.emit('verify-pin', { pin: pin, email: storeEmail });
        
        window.socket.once('pin-verified', (data) => {
            if (data.success) {
                window.App.settingsUnlocked = true;
                const lock = document.getElementById('settingsLockOverlay');
                if(lock) lock.style.display = 'none';
                document.getElementById('settingsLockedArea').style.minHeight = ''; // ✅ Reset height
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