import { getToken } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";
import { vapidKey } from './config.js';

/* -----------------------------------------------------------
   1. INTERNATIONALIZATION (I18N)
----------------------------------------------------------- */
export const I18n = {
    translations: {},
    
    t: function(key) {
        return this.translations[key];
    },
    
    setLanguage: async function(lang) {
        localStorage.setItem('bellgo_lang', lang);
        try {
            const response = await fetch(`/i18n/${lang}.json`);
            this.translations = await response.json();
            this.applyTranslations();
            
            const btnEl = document.getElementById('lang-el');
            const btnEn = document.getElementById('lang-en');
            if (btnEl) btnEl.classList.toggle('active', lang === 'el');
            if (btnEn) btnEn.classList.toggle('active', lang === 'en');
            document.documentElement.lang = lang;
        } catch (error) {
            console.error(`Lang Error: ${lang}`, error);
        }
    },
    
    applyTranslations: function() {
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            if (this.translations[key]) {
                if (element.children.length > 0) {
                    for (let i = 0; i < element.childNodes.length; i++) {
                        if (element.childNodes[i].nodeType === 3) { 
                            element.childNodes[i].nodeValue = this.translations[key];
                            break;
                        }
                    }
                } else if (element.tagName === 'INPUT' && (element.type === 'button' || element.type === 'submit')) {
                    element.value = this.translations[key];
                } else {
                    element.innerText = this.translations[key];
                }
            }
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            if (this.translations[key]) {
                element.placeholder = this.translations[key];
            }
        });
    }
};

/* -----------------------------------------------------------
   2. PUSH NOTIFICATIONS HELPERS
----------------------------------------------------------- */
export const PushNotifications = {
    requestPermission: async (messaging, onTokenReceived) => {
        try {
            if (Notification.permission === 'default') {
                const result = await Notification.requestPermission();
                if (result !== 'granted') {
                    alert(I18n.t('notifications_blocked_msg') || '⚠️ Ο Browser μπλόκαρε τις ειδοποιήσεις.\n\nΠατήστε το εικονίδιο 🔒 ή 🔔 στη γραμμή διευθύνσεων (πάνω αριστερά) και επιλέξτε "Allow/Επιτρέπεται".');
                    return;
                }
            }
            
            if (Notification.permission === "granted") {
                const registration = await navigator.serviceWorker.ready;
                const token = await getToken(messaging, { 
                    vapidKey: vapidKey, 
                    serviceWorkerRegistration: registration 
                }); 
                if (token) {
                    localStorage.setItem('fcm_token', token);
                    if (onTokenReceived) onTokenReceived(token);
                }
            }
        } catch (error) { console.error("Notification Error:", error); }
    },

    checkPermission: (messaging, onTokenReceived, isCustomer = false) => {
        if (!isCustomer) {
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            if (!isMobile) return;
        }

        if (Notification.permission === 'default') {
            const div = document.createElement('div');
            div.id = 'notifPermRequest';
            
            if (isCustomer) {
                div.style.cssText = "position:fixed; bottom:0; left:0; width:100%; background:#ffffff; border-top:1px solid #e5e7eb; padding:20px; z-index:10000; text-align:center; box-shadow:0 -10px 30px rgba(0,0,0,0.1); border-radius:20px 20px 0 0;";
                div.innerHTML = `
                    <div style="color:#1f2937; font-weight:bold; margin-bottom:10px; font-size:16px;">🔔 ${I18n.t('enable_notifications_title') || 'Ενεργοποίηση Ειδοποιήσεων'}</div>
                    <div style="color:#6b7280; font-size:12px; margin-bottom:15px;">${I18n.t('enable_notifications_desc') || 'Για να ενημερωθείτε όταν έρθει η παραγγελία σας!'}</div>
                    <button id="btnAllowNotif" style="background:#10B981; color:white; border:none; padding:10px 25px; border-radius:20px; font-weight:bold; font-size:14px; cursor:pointer; box-shadow:0 4px 10px rgba(16,185,129,0.3);">${I18n.t('enable_btn') || 'ΕΝΕΡΓΟΠΟΙΗΣΗ'}</button>
                    <button onclick="document.getElementById('notifPermRequest').remove()" style="background:none; border:none; color:#6b7280; margin-left:10px; cursor:pointer; font-weight:bold;">${I18n.t('not_now') || 'Όχι τώρα'}</button>
                `;
            } else {
                div.style.cssText = "position:fixed; bottom:20px; right:20px; width:300px; background:#ffffff; border:1px solid #e5e7eb; padding:15px; z-index:10000; text-align:center; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,0.1);";
                div.innerHTML = `
                    <div style="color:#1f2937; font-weight:bold; margin-bottom:5px;">🔔 Ειδοποιήσεις Ήχου</div>
                    <div style="color:#6b7280; font-size:11px; margin-bottom:10px;">Απαραίτητο για να χτυπάει όταν είναι κλειστό.</div>
                    <button id="btnAllowNotif" style="background:#10B981; color:white; border:none; padding:8px 20px; border-radius:8px; font-weight:bold; cursor:pointer; box-shadow:0 4px 10px rgba(16,185,129,0.3);">ΕΝΕΡΓΟΠΟΙΗΣΗ</button>
                `;
            }

            document.body.appendChild(div);
            
            document.getElementById('btnAllowNotif').onclick = async () => {
                document.getElementById('notifPermRequest').remove();
                await PushNotifications.requestPermission(messaging, onTokenReceived);
            };
        } else if (Notification.permission === 'granted') {
            PushNotifications.requestPermission(messaging, onTokenReceived);
        }
    }
};

/* -----------------------------------------------------------
   3. DEV TOOLS (BACKEND SWITCH)
----------------------------------------------------------- */
window.toggleBackend = function() {
    const current = localStorage.getItem('use_live_backend') === 'true';
    localStorage.setItem('use_live_backend', !current);
    alert("⚙️ Dev Switch:\n\nΤο σύστημα πλέον συνδέεται στο:\n" + (!current ? "🌍 LIVE (Onrender)" : "💻 LOCAL (Localhost)") + "\n\nΗ σελίδα θα ανανεωθεί.");
    location.reload();
};