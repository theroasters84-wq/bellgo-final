/* -----------------------------------------------------------
   ADMIN UI - Λειτουργίες διεπαφής (Toggles, Modals, Locks)
----------------------------------------------------------- */

export const AdminUI = {
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

        const app = window.App;
        app.applyFeatureVisibility(); 

        if(app.renderSecuritySettings) app.renderSecuritySettings();

        const lock = document.getElementById('settingsLockOverlay');
        if(lock) lock.style.display = 'none';
    },

    unlockSettings: () => {
        const pin = document.getElementById('inpUnlockPin').value.trim();
        
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
        if (id === 'subGeneral' && !window.App.settingsUnlocked && window.App.hasFeature('pack_pos')) {
            document.getElementById('adminUnlockModal').style.display = 'flex';
            document.getElementById('inpAdminUnlockPin').value = '';
            document.getElementById('inpAdminUnlockPin').focus();
            return;
        }

        document.getElementById('settingsMain').style.display = 'none';
        document.querySelectorAll('.settings-sub').forEach(el => el.style.display = 'none');
        const target = document.getElementById(id);
        if(target) target.style.display = 'block';
    },

    submitAdminUnlock: () => {
        const pin = document.getElementById('inpAdminUnlockPin').value.trim();
        if (!pin) return;

        if (window.App.adminPin) {
            if (pin === String(window.App.adminPin).trim()) {
                window.App.settingsUnlocked = true;
                document.getElementById('adminUnlockModal').style.display = 'none';
                window.App.openSettingsSub('subGeneral');
            } else {
                alert("❌ Λάθος Κωδικός!");
            }
        } else {
            const storeEmail = window.App.userData ? window.App.userData.store : null;
            window.socket.emit('verify-pin', { pin: pin, email: storeEmail });
            window.socket.once('pin-verified', (data) => {
                if (data.success) {
                    window.App.settingsUnlocked = true;
                    document.getElementById('adminUnlockModal').style.display = 'none';
                    window.App.openSettingsSub('subGeneral');
                } else {
                    alert("❌ Λάθος PIN!");
                }
            });
        }
    },

    forgotAdminUnlockPin: () => {
        if (window.App.adminPin) {
            if(confirm("Να σταλεί email επαναφοράς Κωδικού Διαχειριστή;")) {
                window.socket.emit('forgot-admin-pin', { email: window.App.userData.store });
                alert("Το email εστάλη! Ελέγξτε τα εισερχόμενά σας.");
                document.getElementById('adminUnlockModal').style.display = 'none';
            }
        } else {
            window.App.forgotPin();
        }
    },

    closeSettingsSub: () => {
        document.querySelectorAll('.settings-sub').forEach(el => el.style.display = 'none');
        const main = document.getElementById('settingsMain');
        if(main) main.style.display = 'block';
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

    openExpensesModal: () => {
        document.getElementById('expensesModal').style.display = 'flex';
        if(window.App.renderExpensePresets) window.App.renderExpensePresets();
        if(window.App.renderFixedExpenses) window.App.renderFixedExpenses();
        
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });
        const [year, month, day] = dateStr.split('-');
        const monthKey = `${year}-${month}`;
        
        let currentText = "";
        if (window.App.cachedStats && window.App.cachedStats[monthKey] && window.App.cachedStats[monthKey].days[day] && window.App.cachedStats[monthKey].days[day].expenses) {
            currentText = window.App.cachedStats[monthKey].days[day].expenses.text || "";
        }
        document.getElementById('txtExpenses').value = currentText;
        
        let currentWages = 0;
        if (window.App.cachedStats && window.App.cachedStats[monthKey] && window.App.cachedStats[monthKey].days[day] && window.App.cachedStats[monthKey].days[day].expenses) {
            currentWages = window.App.cachedStats[monthKey].days[day].expenses.wages || 0;
        }
        document.getElementById('inpWages').value = currentWages > 0 ? currentWages : '';

        if(window.App.calcExpensesTotal) window.App.calcExpensesTotal();

        const txt = document.getElementById('txtExpenses');
        const modal = document.getElementById('expensesModal');
        if (txt && !txt.dataset.hasListeners) {
            txt.dataset.hasListeners = "true";
            txt.addEventListener('focus', () => { modal.classList.add('writing-mode'); });
            txt.addEventListener('blur', () => { setTimeout(() => modal.classList.remove('writing-mode'), 150); });
        }
    },

    openTableQrModal: () => {
        document.getElementById('settingsModal').style.display = 'none';
        document.getElementById('tableQrModal').style.display = 'flex';
    },

    toggleAdminChat: () => { 
        const el = document.getElementById('adminChatOverlay');
        const app = window.App;
        app.isChatOpen = (el.style.display === 'flex');
        if (app.isChatOpen) { el.style.display = 'none'; app.isChatOpen = false; } 
        else { el.style.display = 'flex'; app.isChatOpen = true; document.getElementById('chatBadge').style.display = 'none'; }
    },

    toggleFakeLock: () => { 
        const el = document.getElementById('fakeLockOverlay');
        if (el.style.display === 'flex') {
            const pin = prompt("Εισάγετε PIN:");
            if (pin && window.socket) {
                window.socket.emit('verify-pin', { pin, email: window.App.userData.store });
                window.socket.once('pin-verified', (data) => {
                    if (data.success) {
                        el.style.display = 'none';
                    } else {
                        alert("❌ Λάθος PIN!");
                    }
                });
            }
        } else {
            el.style.display = 'flex';
        }
    }
};