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

        // ✅ Οριστική απόκρυψη του E-Invoicing αν λείπει το πακέτο 5 (POS)
        if (window.App && window.App.hasFeature && !window.App.hasFeature('pack_pos')) {
            const sModal = document.getElementById('settingsModal');
            if (sModal) {
                sModal.querySelectorAll('button').forEach(b => {
                    if (b.innerText.includes('E-INVOICING') || b.innerText.includes('myDATA')) {
                        b.style.display = 'none';
                    }
                });
            }
        }

        // ✅ ΕΞΟΔΟΣ μέσα στις ρυθμίσεις (προσθήκη στο κεντρικό μενού για να το βλέπουν οι σερβιτόροι)
        let settingsMain = document.getElementById('settingsMain');
        if (!settingsMain) {
            const sModal = document.getElementById('settingsModal');
            if (sModal) settingsMain = sModal.querySelector('.modal-box') || sModal.firstElementChild;
        }
        
        if (settingsMain && !document.getElementById('btnSettingsLogoutDynamic')) {
            const logoutBtn = document.createElement('button');
            logoutBtn.id = 'btnSettingsLogoutDynamic';
            logoutBtn.setAttribute('data-i18n', 'exit');
            logoutBtn.innerHTML = '🚪 ΕΞΟΔΟΣ';
            logoutBtn.style.cssText = 'width:100%; padding:15px; margin-top:20px; background:#EF4444; color:white; border:none; border-radius:8px; font-weight:bold; font-size:16px; cursor:pointer; box-shadow:0 4px 10px rgba(239,68,68,0.3); display:block !important;';
            logoutBtn.onclick = () => { 
                const msg = (window.App && window.App.t) ? window.App.t('logout_confirm') : "Είστε σίγουροι ότι θέλετε να αποσυνδεθείτε;";
                if(confirm(msg)) { 
                    if(window.Admin && window.Admin.logout) window.Admin.logout(); 
                    else { localStorage.removeItem('bellgo_session'); window.location.replace("login.html"); } 
                } 
            };
            
            const existingCloseBtn = Array.from(settingsMain.children).find(el => el.getAttribute('data-i18n') === 'close' || (el.innerText || '').includes('ΚΛΕΙΣΙΜΟ'));
            if (existingCloseBtn) {
                settingsMain.insertBefore(logoutBtn, existingCloseBtn);
            } else {
                settingsMain.appendChild(logoutBtn);
            }
        }

        // ✅ NEW: Αυτόματη αποθήκευση αμέσως μόλις πληκτρολογείς στις ρυθμίσεις
        const sModal = document.getElementById('settingsModal');
        if (sModal && !sModal.dataset.autosaveAttached) {
            sModal.dataset.autosaveAttached = "true";
            sModal.addEventListener('change', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
                    if (window.App && window.App.autoSaveSettings) window.App.autoSaveSettings();
                }
            });
            sModal.addEventListener('focusout', (e) => {
                if (e.target.tagName === 'INPUT' && (e.target.type === 'text' || e.target.type === 'number')) {
                    if (window.App && window.App.autoSaveSettings) window.App.autoSaveSettings();
                }
            });
        }
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
            const requiresLock = window.App.hasFeature('pack_pos') || window.App.hasFeature('pack_manager') || window.App.hasFeature('pack_delivery') || window.App.hasFeature('pack_tables');
            if (id === 'subGeneral' && !window.App.settingsUnlocked && requiresLock) {
            document.getElementById('adminUnlockModal').style.display = 'flex';
            const pinInp = document.getElementById('inpAdminUnlockPin');
            if (pinInp) {
                pinInp.value = '';
                setTimeout(() => pinInp.focus(), 100);
            }
            return;
        }

        document.getElementById('settingsMain').style.display = 'none';
        document.querySelectorAll('.settings-sub').forEach(el => el.style.display = 'none');
        const target = document.getElementById(id);
        if(target) {
            target.style.display = 'block';
            
            // ✅ Εξαφάνιση του παλιού διπλού κουμπιού "ΑΠΟΘΗΚΕΥΣΗ ΟΛΩΝ"
            if (id === 'subGeneral') {
                Array.from(target.getElementsByTagName('button')).forEach(b => {
                    if (b.id !== 'btnSaveSubGeneralDynamic' && (b.innerText || '').includes('ΑΠΟΘΗΚΕΥΣΗ ΟΛΩΝ')) {
                        b.style.display = 'none';
                    }
                });
            }
            
            // ✅ NEW: Προσθήκη Κουμπιού ΑΠΟΘΗΚΕΥΣΗΣ μέσα στις Γενικές Ρυθμίσεις (όπου είναι το SoftPOS)
            if (id === 'subGeneral' && !document.getElementById('btnSaveSubGeneralDynamic')) {
                const saveBtn = document.createElement('button');
                saveBtn.id = 'btnSaveSubGeneralDynamic';
                saveBtn.innerHTML = '💾 ΑΠΟΘΗΚΕΥΣΗ ΡΥΘΜΙΣΕΩΝ';
                saveBtn.style.cssText = 'width:100%; padding:15px; margin-top:20px; margin-bottom:10px; background:#10B981; color:white; border:none; border-radius:8px; font-weight:bold; font-size:16px; cursor:pointer; box-shadow:0 4px 10px rgba(16,185,129,0.3); display:block !important;';
                saveBtn.onclick = () => { 
                    if (window.App && window.App.autoSaveSettings) window.App.autoSaveSettings();
                    alert("✅ Όλες οι ρυθμίσεις αποθηκεύτηκαν επιτυχώς!");
                };
                
                // ✅ ΑΠΟΛΥΤΗ ΠΡΟΣΤΑΣΙΑ ΕΜΦΑΝΙΣΗΣ ΚΟΥΜΠΙΟΥ ΑΠΟΘΗΚΕΥΣΗΣ (Όπου κι αν είναι το κουμπί ΠΙΣΩ)
                let backBtn = target.querySelector('[data-i18n="back"]');
                if (!backBtn) {
                    backBtn = Array.from(target.getElementsByTagName('button')).find(b => (b.innerText || '').includes('ΠΙΣΩ'));
                }
                
                if (backBtn && backBtn.parentNode) {
                    backBtn.parentNode.insertBefore(saveBtn, backBtn);
                } else {
                    target.appendChild(saveBtn);
                }
            }
        }
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
        if (window.App && window.App.autoSaveSettings) window.App.autoSaveSettings();
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
            let unlockModal = document.getElementById('dynamicFakeLockUnlockModal');
            if (!unlockModal) {
                window.AdminFakeLockPIN = {
                    value: '',
                    add: (n) => { 
                        if(window.AdminFakeLockPIN.value.length < 4) { 
                            window.AdminFakeLockPIN.value += n; 
                            document.getElementById('fakeLockPinDisplay').innerText = '*'.repeat(window.AdminFakeLockPIN.value.length); 
                        } 
                    },
                    clear: () => { 
                        window.AdminFakeLockPIN.value = ''; 
                        document.getElementById('fakeLockPinDisplay').innerText = ''; 
                    },
                    submit: () => {
                        const pin = window.AdminFakeLockPIN.value;
                        if(pin.length < 4) return alert("Το PIN πρέπει να είναι 4 ψηφία");
                        if (window.socket) {
                            window.socket.emit('verify-pin', { pin, email: window.App.userData.store });
                            window.socket.once('pin-verified', (data) => {
                                if (data.success) {
                                    document.getElementById('fakeLockOverlay').style.display = 'none';
                                    document.getElementById('dynamicFakeLockUnlockModal').style.display = 'none';
                                    if (window.socket) window.socket.emit('set-user-status', 'online');
                                    window.AdminFakeLockPIN.clear();
                                } else {
                                    alert("❌ Λάθος PIN!");
                                    window.AdminFakeLockPIN.clear();
                                }
                            });
                        }
                    },
                    forgot: () => {
                        if (confirm("Να σταλεί email επαναφοράς PIN στο κατάστημα;")) {
                            if(window.socket) window.socket.emit('forgot-pin', { email: window.App.userData.store });
                            alert("Το email εστάλη! Ενημερώστε τον διαχειριστή.");
                        }
                    },
                    close: () => {
                        document.getElementById('dynamicFakeLockUnlockModal').style.display = 'none';
                        window.AdminFakeLockPIN.clear();
                    }
                };

                const unlockText = (window.App && window.App.t) ? window.App.t('unlock') : "ΞΕΚΛΕΙΔΩΜΑ";
                const forgotPinSosText = (window.App && window.App.t) ? window.App.t('forgot_pin_sos') : "🆘 ΞΕΧΑΣΑ ΤΟ PIN";
                const cancelText = (window.App && window.App.t) ? window.App.t('cancel') : "ΑΚΥΡΟ";

                unlockModal = document.createElement('div');
                unlockModal.id = 'dynamicFakeLockUnlockModal';
                unlockModal.className = 'modal-overlay';
                unlockModal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:25000; display:flex; align-items:center; justify-content:center;';
                
                unlockModal.innerHTML = `
                    <div class="modal-box" style="background:white; padding:20px; border-radius:12px; width:90%; max-width:300px; text-align:center; box-shadow:0 10px 30px rgba(0,0,0,0.3);">
                        <h3 style="color:#1f2937; margin-top:0;" data-i18n="unlock">${unlockText}</h3>
                        <div id="fakeLockPinDisplay" style="font-size:32px; letter-spacing:10px; margin:20px 0; color:#10B981; height:40px; font-weight:bold;"></div>
                        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:15px;">
                            <button style="background:#f9fafb; color:#1f2937; border:1px solid #e5e7eb; font-size:24px; padding:15px; border-radius:8px; cursor:pointer;" onclick="AdminFakeLockPIN.add(1)">1</button>
                            <button style="background:#f9fafb; color:#1f2937; border:1px solid #e5e7eb; font-size:24px; padding:15px; border-radius:8px; cursor:pointer;" onclick="AdminFakeLockPIN.add(2)">2</button>
                            <button style="background:#f9fafb; color:#1f2937; border:1px solid #e5e7eb; font-size:24px; padding:15px; border-radius:8px; cursor:pointer;" onclick="AdminFakeLockPIN.add(3)">3</button>
                            <button style="background:#f9fafb; color:#1f2937; border:1px solid #e5e7eb; font-size:24px; padding:15px; border-radius:8px; cursor:pointer;" onclick="AdminFakeLockPIN.add(4)">4</button>
                            <button style="background:#f9fafb; color:#1f2937; border:1px solid #e5e7eb; font-size:24px; padding:15px; border-radius:8px; cursor:pointer;" onclick="AdminFakeLockPIN.add(5)">5</button>
                            <button style="background:#f9fafb; color:#1f2937; border:1px solid #e5e7eb; font-size:24px; padding:15px; border-radius:8px; cursor:pointer;" onclick="AdminFakeLockPIN.add(6)">6</button>
                            <button style="background:#f9fafb; color:#1f2937; border:1px solid #e5e7eb; font-size:24px; padding:15px; border-radius:8px; cursor:pointer;" onclick="AdminFakeLockPIN.add(7)">7</button>
                            <button style="background:#f9fafb; color:#1f2937; border:1px solid #e5e7eb; font-size:24px; padding:15px; border-radius:8px; cursor:pointer;" onclick="AdminFakeLockPIN.add(8)">8</button>
                            <button style="background:#f9fafb; color:#1f2937; border:1px solid #e5e7eb; font-size:24px; padding:15px; border-radius:8px; cursor:pointer;" onclick="AdminFakeLockPIN.add(9)">9</button>
                            <button style="background:#EF4444; color:white; font-size:20px; padding:15px; border-radius:8px; border:none; cursor:pointer;" onclick="AdminFakeLockPIN.clear()">C</button>
                            <button style="background:#f9fafb; color:#1f2937; border:1px solid #e5e7eb; font-size:24px; padding:15px; border-radius:8px; cursor:pointer;" onclick="AdminFakeLockPIN.add(0)">0</button>
                            <button style="background:#10B981; color:white; font-size:20px; padding:15px; border-radius:8px; border:none; cursor:pointer;" onclick="AdminFakeLockPIN.submit()">OK</button>
                        </div>
                        <button onclick="AdminFakeLockPIN.forgot()" style="background:none; border:none; color:#0095f6; font-weight:bold; cursor:pointer; margin-bottom:10px; width:100%;" data-i18n="forgot_pin_sos">${forgotPinSosText}</button>
                        <button onclick="AdminFakeLockPIN.close()" style="background:none; border:none; color:#6b7280; font-weight:bold; cursor:pointer; width:100%;" data-i18n="cancel">${cancelText}</button>
                    </div>
                `;
                document.body.appendChild(unlockModal);
            }
            window.AdminFakeLockPIN.clear();
            unlockModal.style.display = 'flex';
        } else {
            el.style.display = 'flex';
        }
    }
};