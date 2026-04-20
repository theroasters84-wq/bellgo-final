/* -----------------------------------------------------------
   0. ON-SCREEN DEBUGGER (FOR MOBILE TESTING)
----------------------------------------------------------- */
if (window.location.search.includes('debug=true') || localStorage.getItem('bellgo_debug') === 'true') {
    localStorage.setItem('bellgo_debug', 'true');
    
    const logContainer = document.createElement('div');
    logContainer.id = "bellgo-debug-console";
    logContainer.style.cssText = "position:fixed; bottom:0; left:0; width:100%; height:40vh; background:rgba(0,0,0,0.95); color:#fff; font-family:monospace; font-size:12px; overflow-y:auto; z-index:999998; padding:10px; display:none; flex-direction:column; gap:4px; box-sizing:border-box;";
    
    const toggleBtn = document.createElement('button');
    toggleBtn.id = "bellgo-debug-btn";
    toggleBtn.innerHTML = '🐞';
    toggleBtn.style.cssText = "position:fixed; bottom:15px; right:15px; z-index:999999; background:#333; border:2px solid #0f0; border-radius:50%; width:45px; height:45px; font-size:24px; display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 4px 10px rgba(0,0,0,0.5);";
    
    toggleBtn.onclick = () => {
        const isVisible = logContainer.style.display === 'flex';
        logContainer.style.display = isVisible ? 'none' : 'flex';
    };

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '🗑️ Κλείσιμο Debugger';
    closeBtn.style.cssText = "background:#EF4444; color:#fff; padding:8px; margin-bottom:5px; border:none; border-radius:5px; font-weight:bold; cursor:pointer; flex-shrink:0;";
    closeBtn.onclick = () => { 
        localStorage.removeItem('bellgo_debug'); 
        logContainer.remove(); toggleBtn.remove();
    };
    logContainer.appendChild(closeBtn);

    function attachDebugger() {
        if (!document.body) { setTimeout(attachDebugger, 100); return; }
        if (!document.getElementById('bellgo-debug-btn')) {
            document.body.appendChild(logContainer);
            document.body.appendChild(toggleBtn);
        }
    }
    attachDebugger();

    const origLog = console.log; const origErr = console.error; const origWarn = console.warn;
    function logToScreen(msgArgs, color) {
        const line = document.createElement('div');
        line.style.cssText = `color:${color}; border-bottom:1px solid #333; padding-bottom:4px; word-break:break-word;`;
        try {
            line.innerText = msgArgs.map(m => (m instanceof Error) ? m.message + "\\n" + m.stack : (typeof m === 'object' ? JSON.stringify(m) : String(m))).join(' ');
        } catch(e) { line.innerText = String(msgArgs); }
        logContainer.appendChild(line);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    console.log = function(...args) { origLog(...args); logToScreen(args, '#00E676'); };
    console.error = function(...args) { origErr(...args); logToScreen(args, '#FF5252'); };
    console.warn = function(...args) { origWarn(...args); logToScreen(args, '#FFD700'); };
    window.addEventListener('error', e => logToScreen(['[ERR]', e.message, 'at', e.filename, ':', e.lineno], '#FF5252'));
    window.addEventListener('unhandledrejection', e => logToScreen(['[PROMISE REJECTED]', e.reason], '#FF5252'));
    console.log("🐞 Debugger Attached!");
}

import { getToken } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";
import { vapidKey } from './config.js';

/* -----------------------------------------------------------
   1. INTERNATIONALIZATION (I18N)
----------------------------------------------------------- */
export const I18n = {
    translations: {},
    
    // ✅ Ενσωματωμένο Λεξικό για το Σύστημα (ώστε να μη λείπουν λέξεις αν δεν υπάρχουν στο en.json)
    builtIn: {
        en: {
            select_role: "Select your role:",
            cashier: "Cashier",
            kitchen: "Kitchen",
            waiter: "Waiter",
            driver: "Driver",
            staff_login: "Staff Login",
            placeholder_admin_email: "Business Email (Admin)",
            placeholder_personal_email: "Your Personal Email",
            placeholder_your_name: "Your Name",
            placeholder_pin: "Store PIN",
            login_btn: "LOGIN",
            back_btn: "🔙 BACK",
            admin_management: "Management (Admin)",
            or: "OR",
            google_login: "Login with Google",
            enter_pin: "Enter PIN",
            enter_your_pin: "Enter the store PIN",
            forgot_pin: "Forgot PIN",
            cancel: "Cancel",
            create_pin: "CREATE PIN",
            set_new_pin: "Set a new 4-digit code",
            
            // ✅ Settings Menu translations (with spaces for alignment)
            settings_title: "⚙️ SETTINGS",
            store_and_schedule: "🏪 STORE & SCHEDULE",
            printing: "🖨️ PRINTING",
            qr_and_links: "📱 QR & LINKS",
            admin_settings: "🔐\u00A0\u00A0ADMIN SETTINGS",
            loyalty_settings: "🎁 LOYALTY SETTINGS",
            e_invoicing: "🔌 E-INVOICING (myDATA)",
            exit: "🚪 LOGOUT",
            close: "CLOSE",
            bot_settings: "🤖 BOT SETTINGS",
            back: "🔙 BACK",
            
            staff_wallet: "💼 STAFF WALLET",
            enable_charge: "ENABLE CHARGE",
            cash_debt: "CASH (DEBT)",
            cards_bank: "CARDS (BANK)",
            reset_all: "🗑️ RESET ALL",
            reset_wallet_confirm: "Reset wallet for:",
            reset_all_confirm: "WARNING: Reset ALL wallets?",
            
            // ✅ Alerts & Modals
            no_active_sub: "No Active Subscription",
            no_active_packages: "The account has no active packages.",
            buy_subscription: "BUY SUBSCRIPTION",
            manage_subs: "Manage Subscriptions",
            month: "month",
            stripe_email: "Account Email (Stripe)",
            email_login_buy: "EMAIL LOGIN & BUY",
            verify_success: "Successful verification",
            google_verify_error: "Google verification error: ",
            select_package_alert: "Please select at least one package to buy.",
            enter_email_buy_alert: "Please enter your Email for the purchase.",
            error: "Error: ",
            connection_error: "Connection error.",
            enter_email_alert: "Please enter your Email.",
            sub_past_due: "⚠️ Your subscription is past due (Payment Failed).\nPlease settle the balance to continue.",
            no_active_sub_alert: "No active subscription found.",
            invalid_personal_email: "Please enter a valid Personal Email!",
            same_email_error: "Personal Email cannot be the same as Business Email!",
            fill_all_fields: "Please fill all fields!",
            checking: "CHECKING...",
            no_sub_found: "No active subscription found for this store.",
            network_error: "Network error.",
            whitelist_rejected: "⛔ Access Denied!\nYour email is not in the approved staff list (Whitelist).",
            wrong_pin: "❌ Wrong PIN!",
            fill_pin_alert: "Please enter the Store PIN to login.",
            pins_not_match: "PINs do not match.",
            pin_4_digits: "PIN must be 4 digits",
            admin_pin_title: "ADMIN PIN",
            admin_pin_sub: "Set Admin PIN (Only for you)",
            total: "TOTAL",
            unlock: "UNLOCK",
            forgot_pin_sos: "🆘 FORGOT PIN",
            tap_to_unlock: "Tap to Unlock",
            double_tap_to_unlock: "Double Tap to Unlock",
            
            // ✅ Sidebars & Missing Elements
            new_order_cashier: "NEW ORDER (CASHIER)",
            paso: "PASO",
            table: "TABLE",
            delivery: "DELIVERY",
            covers: "COVERS",
            customer_name: "Customer Name",
            address: "Address",
            phone: "Phone",
            products: "Products...",
            group_chat: "💬 Group Chat",
            message: "Message...",
            cash_method: "💵 CASH",
            card_method: "💳 CARD",
            wages: "👷 WAGES (Daily)",
            customer_details_click: "📝 CUSTOMER DETAILS (CLICK)",
            ok_close: "OK (CLOSE)",
            change: "Change",
            click_to_change: "Click to change",
            send_order: "SEND ORDER",
            
            // ✅ Menu Editor & Modals
            new_category: "New Category",
            cat_name_placeholder: "Name (e.g. COFFEE)",
            create: "CREATE",
            bulk_paste_btn: "📋 Bulk Paste",
            bulk_insert_title: "Bulk Paste",
            bulk_insert_help: "💡 Paste your products (one per line, e.g. 'Freddo Espresso 3.50'). The system will automatically extract the price. Set VAT and extras manually afterwards.",
            bulk_insert_btn: "Insert",
            paste_here: "Paste here...",
            save_catalog: "💾 Save Menu",
            
            // ✅ Missing Admin/Staff Elements
            load_preset: "Load Preset Menu:",
            select_preset: "Select...",
            cover_price: "Cover Price (€):",
            staff_charge: "STAFF CHARGE",
            online_reservations: "ONLINE RESERVATIONS",
            total_tables: "TOTAL TABLES:",
            links: "LINKS",
            qr_review: "⭐ REVIEW QR",
            loyalty: "🎁 LOYALTY",
            enable: "ENABLE",
            gift_name: "Gift (e.g. Coffee)",
            points_target: "Points Target",
            auto_qr: "Auto Show QR",
            manual_btn: "Manual (Button)",
            all_auto: "All (Auto)",
            tables_only: "Tables Only",
            paso_only: "Paso Only",
            delivery_only: "Delivery Only",
            softpos: "📱 SOFTPOS",
            choose_provider: "Choose Provider...",
            custom_provider: "Other / Custom",
            merchant_id: "Merchant ID / Source Code (TID)",
            api_key: "API Key / Token (Optional)",
            pos_mode: "POS MODE (Admin/Staff)",
            auto_send: "⚡ Auto Send",
            ask_confirm: "❓ Ask Confirmation",
            physical_pos: "📡 PHYSICAL POS (WiFi/Ethernet)",
            no_connection: "No Connection",
            terminal_ip: "Terminal ID / IP",
            terminal_port: "API Key / Port",
            stripe_payments: "💳 STRIPE (Card Payments)",
            connect_stripe: "🔗 CONNECT STRIPE",
            setup_complete: "⚠️ COMPLETE SETUP",
            setup_desc: "Fill in the Merchant ID to enable payments.",
            download_app: "📲 DOWNLOAD THE APP",
            download_desc: "Admin, Waiters & Drivers must have the provider's App.",
            get_app: "Get App",
            agenda: "📅 RESERVATIONS AGENDA",
            assign_delivery: "🛵 ASSIGN DELIVERY",
            floor_bell: "Floor / Bell",
            zip_code: "Zip Code",
            local_print: "🖨️ PRINTING (LOCAL)",
            auto_print: "Auto Print",
            close_window: "Close Window",
            security: "🔐 SECURITY",
            change_pin: "🔑 Change Login PIN",
            change_admin_pin: "🛡️ Change Admin PIN",
            options: "Options (Extras)",
            name_ex_cheese: "Name (e.g. Cheese)",
            price_eur: "Price (€)",
            add: "+ ADD",
            finish: "FINISH",
            save_changes: "Save Changes",
            save_how: "Should the change apply only for today or permanently?",
            only_today: "⏳ ONLY FOR TODAY",
            permanently: "💾 PERMANENTLY",
            upcoming_res: "📅 UPCOMING RESERVATIONS (1h)",
            alert_empty_table: "Please enter a table or select PASO.",
            alert_fill_delivery: "Fill in Delivery details!",
            alert_sent: "Sent!",
            alert_choose_treat: "Choose item to treat or press ALL",
            loading: "Loading...",
            payment_scan: "💳 PAYMENT (SCAN)",
            customer_scans: "Customer scans to pay",
            alarm_call: "⚠️ CALL!",
            alarm_requested: "THEY ARE ASKING FOR YOU",
            alarm_press_accept: "PRESS TO ACCEPT",
            new_delivery: "NEW DELIVERY!",
            who_takes_it: "Who will take it?",
            i_take_it: "🙋‍♂️ ME!",
            no_active_deliveries: "No active deliveries.",
            customer: "Customer",
            ready_rocket: "🚀 READY",
            cooking_hourglass: "⏳ PREPARING...",
            map: "🗺️ MAP",
            qr: "💳 QR",
            take_order: "🖐 TAKE",
            delivered: "✅ DELIVERED",
            pay_method_prompt: "Payment Method:\n1. 💵 CASH\n2. 💳 CARD (SoftPOS)",
            order_delivered_prompt: "Was the order delivered and collected?",
            zero_amount: "Zero amount.",
            
            // ✅ Staff App Specifics
            no_orders: "No orders",
            my_orders: "My Orders",
            all_orders: "📂 ALL ORDERS",
            search_table_placeholder: "🔍 Table No.",
            status_pending_en: "⏳ Pending",
            status_cooking_en: "🍳 Cooking",
            status_ready_en: "✅ Ready",
            the_product: "the product",
            treat_badge: "(TREAT)",
            balance: "BALANCE:",
            no_reservations_next_hour: "No reservations for the next hour.",
            people: "People",
            delete: "Delete",
            add_note: "+ Add Note...",
            added_items: "Added! ➕",
            fill_table_number: "Please enter a table number!",
            empty_order: "Empty order",
            treat_for: "Treat for: ",
            treat_entire_order: "Treat ENTIRE order?",
            charge_to_you: "💰 Charge ",
            charge_to_you_prompt: "€ to you (Cash)? \n\n(Press Cancel for Card/Simple Close)",
            close_as_card: "Close as Card/Bank?",
            pay_off_question: "Pay off?",
            pay_here_manual: "🔗 PAY HERE (MANUAL)",
            
            // ✅ Customer App Specifics (Order.js)
            install_ios_prompt: "To install on iPhone:\n1. Tap the 'Share' button (bottom)\n2. Select 'Add to Home Screen'",
            customer_default: "Customer",
            guest_default: "Guest",
            store_not_found_error: "⚠️ Error: Store not found. Please scan the QR code again.",
            missing_customer_details_error: "⚠️ Error: Customer details missing. The page will reload.",
            no_local_reservations: "No reservations found on this device.",
            no_active_reservations: "No active reservations.",
            status_pending_res: "PENDING",
            status_confirmed_res: "CONFIRMED",
            cancel_reservation_confirm: "Are you sure you want to cancel the reservation?",
            reservation_accepted: "Your reservation has been ACCEPTED!",
            waiting_confirmation: "WAITING CONFIRMATION...",
            reservation_cancelled: "Reservation cancelled.",
            geolocation_unsupported: "Geolocation is not supported by your browser.",
            gps_error: "GPS Error: ",
            book_btn: "BOOK",
            table_order: "TABLE ORDER",
            
            call: "CALL",
            confirm_call_waiter: "Do you want to call a waiter?",
            waiter_called_success: "Call sent! The manager will send a waiter shortly.",
            my_bill: "MY BILL",
            
            view_menu: "VIEW MENU",
            order_now: "ORDER NOW",
            call_waiter: "CALL WAITER",
            table_welcome: "Welcome to Table",
            return_btn: "🔙 RETURN",
            menu_only_alert: "To place an order, press 'RETURN' and select 'ORDER NOW'.",

            // ✅ Table Modal
            table_active: "The table is active.",
            btn_existing_order: "EXISTING ORDER",
            btn_new_order_reset: "NEW ORDER (Reset)",
            btn_supplement: "ADD ITEMS",
            btn_pay_full: "PAY NOW",
            new_people_question: "Did new people arrive?",
            new_people_hint: "If yes, please enter the number.",
            placeholder_people: "No. of people (optional)",
            btn_continue_menu: "CONTINUE TO MENU ▶",
            payment_method: "Payment Method",
            btn_call_waiter: "CALL WAITER",
            btn_pay_stripe: "ONLINE (Stripe)",
            waiter_notified: "Waiter has been notified!"
        },
        el: {
            select_role: "Επιλέξτε τον ρόλο σας:",
            cashier: "Ταμείο",
            kitchen: "Κουζίνα",
            waiter: "Σέρβις",
            driver: "Διανομή",
            staff_login: "Είσοδος Προσωπικού",
            placeholder_admin_email: "Email Επιχείρησης (Admin Email)",
            placeholder_personal_email: "Το Προσωπικό σου Email",
            placeholder_your_name: "Το Όνομά σου",
            placeholder_pin: "Κωδικός Καταστήματος (PIN)",
            login_btn: "ΕΙΣΟΔΟΣ",
            back_btn: "🔙 ΠΙΣΩ",
            admin_management: "Διαχείριση (Admin)",
            or: "Ή",
            google_login: "Σύνδεση με Google",
            enter_pin: "Εισαγωγή PIN",
            enter_your_pin: "Εισάγετε τον κωδικό καταστήματος",
            forgot_pin: "Ξέχασα το PIN",
            cancel: "Ακύρωση",
            create_pin: "ΔΗΜΙΟΥΡΓΙΑ PIN",
            set_new_pin: "Ορίστε έναν νέο 4-ψήφιο κωδικό",
            
            // ✅ Settings Menu translations (with spaces for alignment)
            settings_title: "⚙️ ΡΥΘΜΙΣΕΙΣ",
            store_and_schedule: "🏪 ΚΑΤΑΣΤΗΜΑ & ΩΡΑΡΙΟ",
            printing: "🖨️ ΕΚΤΥΠΩΣΗ",
            qr_and_links: "📱 QR & LINKS",
            admin_settings: "🔐\u00A0\u00A0ΡΥΘΜΙΣΕΙΣ ΔΙΑΧΕΙΡΙΣΤΗ",
            loyalty_settings: "🎁 ΡΥΘΜΙΣΕΙΣ LOYALTY",
            e_invoicing: "🔌 E-INVOICING (myDATA)",
            exit: "🚪 ΕΞΟΔΟΣ",
            close: "ΚΛΕΙΣΙΜΟ",
            bot_settings: "🤖 ΡΥΘΜΙΣΗ & ΚΛΕΙΔΩΜΑ (BOT)",
            back: "🔙 ΠΙΣΩ",
            
            staff_wallet: "💼 ΠΟΡΤΟΦΟΛΙ ΠΡΟΣΩΠΙΚΟΥ",
            enable_charge: "ΕΝΕΡΓΟΠΟΙΗΣΗ ΧΡΕΩΣΗΣ",
            cash_debt: "ΜΕΤΡΗΤΑ (ΧΡΕΟΣ)",
            cards_bank: "ΚΑΡΤΕΣ (ΤΡΑΠΕΖΑ)",
            reset_all: "🗑️ ΜΗΔΕΝΙΣΜΟΣ ΟΛΩΝ",
            reset_wallet_confirm: "Μηδενισμός ταμείου για:",
            reset_all_confirm: "ΠΡΟΣΟΧΗ: Μηδενισμός ΟΛΩΝ των ταμείων;",
            
            // ✅ Alerts & Modals
            no_active_sub: "Καμία Ενεργή Συνδρομή",
            no_active_packages: "Ο λογαριασμός δεν έχει ενεργά πακέτα.",
            buy_subscription: "ΑΓΟΡΑ ΣΥΝΔΡΟΜΗΣ",
            manage_subs: "Διαχείριση Συνδρομών",
            month: "μήνα",
            stripe_email: "Email Λογαριασμού (Stripe)",
            email_login_buy: "ΕΙΣΟΔΟΣ EMAIL & ΑΓΟΡΑ",
            verify_success: "Επιτυχής επαλήθευση",
            google_verify_error: "Σφάλμα επαλήθευσης Google: ",
            select_package_alert: "Παρακαλώ επιλέξτε τουλάχιστον ένα πακέτο για αγορά.",
            enter_email_buy_alert: "Παρακαλώ συμπληρώστε το Email σας για την αγορά.",
            error: "Σφάλμα: ",
            connection_error: "Σφάλμα σύνδεσης.",
            enter_email_alert: "Παρακαλώ εισάγετε Email.",
            sub_past_due: "⚠️ Η συνδρομή σας είναι ληξιπρόθεσμη (Αποτυχία Πληρωμής).\nΠαρακαλώ τακτοποιήστε την οφειλή για να συνεχίσετε.",
            no_active_sub_alert: "Δεν βρέθηκε ενεργή συνδρομή.",
            invalid_personal_email: "Παρακαλώ εισάγετε ένα έγκυρο Προσωπικό Email!",
            same_email_error: "Το Προσωπικό Email δεν μπορεί να είναι ίδιο με το Email της Επιχείρησης!",
            fill_all_fields: "Συμπληρώστε όλα τα πεδία!",
            checking: "ΕΛΕΓΧΟΣ...",
            no_sub_found: "Δεν βρέθηκε ενεργή συνδρομή για αυτό το κατάστημα.",
            network_error: "Σφάλμα δικτύου.",
            whitelist_rejected: "⛔ Δεν έχετε άδεια πρόσβασης!\nΤο email σας δεν βρίσκεται στη λίστα εγκεκριμένων υπαλλήλων (Whitelist).",
            wrong_pin: "❌ Λάθος PIN!",
            fill_pin_alert: "Παρακαλώ συμπληρώστε τον Κωδικό Καταστήματος (PIN) στο πεδίο για να συνδεθείτε.",
            pins_not_match: "Οι κωδικοί δεν ταιριάζουν.",
            pin_4_digits: "Το PIN πρέπει να είναι 4 ψηφία",
            admin_pin_title: "ΚΩΔΙΚΟΣ ΔΙΑΧΕΙΡΙΣΤΗ",
            admin_pin_sub: "Ορίστε το Admin PIN (Μόνο για εσάς)",
            total: "ΣΥΝΟΛΟ",
            unlock: "ΞΕΚΛΕΙΔΩΜΑ",
            forgot_pin_sos: "🆘 ΞΕΧΑΣΑ ΤΟ PIN",
            tap_to_unlock: "Πατήστε για Ξεκλείδωμα",
            double_tap_to_unlock: "Διπλό Κλικ για Ξεκλείδωμα",
            
            // ✅ Sidebars & Missing Elements
            new_order_cashier: "ΝΕΑ ΠΑΡΑΓΓΕΛΙΑ (ΤΑΜΕΙΟ)",
            paso: "PASO",
            table: "ΤΡΑΠΕΖΙ",
            delivery: "DELIVERY",
            covers: "ΚΟΥΒΕΡ",
            customer_name: "Όνομα Πελάτη",
            address: "Διεύθυνση",
            phone: "Τηλέφωνο",
            products: "Προϊόντα...",
            group_chat: "💬 Ομαδικό Chat",
            message: "Μήνυμα...",
            cash_method: "💵 ΜΕΤΡΗΤΑ",
            card_method: "💳 ΚΑΡΤΑ",
            wages: "👷 ΜΕΡΟΚΑΜΑΤΑ (Ημέρας)",
            customer_details_click: "📝 ΣΤΟΙΧΕΙΑ ΠΕΛΑΤΗ (ΚΛΙΚ)",
            ok_close: "OK (ΚΛΕΙΣΙΜΟ)",
            change: "Αλλαγή",
            click_to_change: "Πατήστε για αλλαγή",
            send_order: "ΑΠΟΣΤΟΛΗ",
            
            // ✅ Menu Editor & Modals
            new_category: "Νέα Κατηγορία",
            cat_name_placeholder: "Όνομα (π.χ. ΚΑΦΕΔΕΣ)",
            create: "ΔΗΜΙΟΥΡΓΙΑ",
            bulk_paste_btn: "📋 Γρήγορη Εισαγωγή (Paste)",
            bulk_insert_title: "Γρήγορη Εισαγωγή",
            bulk_insert_help: "💡 Κάντε επικόλληση τα προϊόντα σας (ένα ανά γραμμή, π.χ. 'Freddo Espresso 3.50'). Το σύστημα θα βρει αυτόματα την τιμή. Τον ΦΠΑ και τα έξτρα/υποκατηγορίες ρυθμίστε τα χειροκίνητα μετά.",
            bulk_insert_btn: "Εισαγωγή",
            paste_here: "Επικόλληση εδώ...",
            save_catalog: "💾 Αποθήκευση Καταλόγου",
            
            // ✅ Missing Admin/Staff Elements
            load_preset: "Φόρτωση Έτοιμου Μενού:",
            select_preset: "Επιλέξτε...",
            cover_price: "Τιμή Κουβέρ (€):",
            staff_charge: "ΧΡΕΩΣΗ ΠΡΟΣΩΠΙΚΟΥ",
            online_reservations: "ONLINE ΚΡΑΤΗΣΕΙΣ",
            total_tables: "ΣΥΝΟΛΟ ΤΡΑΠΕΖΙΩΝ:",
            links: "LINKS",
            qr_review: "⭐ QR ΑΞΙΟΛΟΓΗΣΗΣ",
            loyalty: "🎁 ΕΠΙΒΡΑΒΕΥΣΗ (LOYALTY)",
            enable: "ΕΝΕΡΓΟΠΟΙΗΣΗ",
            gift_name: "Δώρο (π.χ. Καφές)",
            points_target: "Στόχος Πόντων",
            auto_qr: "Αυτόματη Εμφάνιση QR",
            manual_btn: "Χειροκίνητα (Κουμπί)",
            all_auto: "Όλα (Αυτόματα)",
            tables_only: "Μόνο Τραπέζια",
            paso_only: "Μόνο Paso",
            delivery_only: "Μόνο Delivery",
            softpos: "📱 ΑΝΕΠΑΦΗ ΠΛΗΡΩΜΗ (SoftPOS)",
            choose_provider: "Επιλέξτε Πάροχο...",
            custom_provider: "Άλλο / Προσαρμοσμένο",
            merchant_id: "Αναγνωριστικό Εμπόρου / Κωδ. Πηγής (TID)",
            api_key: "Κλειδί API / Token (Προαιρετικό)",
            pos_mode: "ΛΕΙΤΟΥΡΓΙΑ POS (Admin/Σερβιτόρος)",
            auto_send: "⚡ Αυτόματη Αποστολή",
            ask_confirm: "❓ Ερώτηση Επιβεβαίωσης",
            physical_pos: "📡 ΦΥΣΙΚΟ ΤΕΡΜΑΤΙΚΟ (WiFi/Ethernet)",
            no_connection: "Χωρίς Σύνδεση",
            terminal_ip: "Αναγνωριστικό Τερματικού / IP",
            terminal_port: "Κλειδί API / Θύρα",
            stripe_payments: "💳 STRIPE (Πληρωμές με Κάρτα)",
            connect_stripe: "🔗 ΣΥΝΔΕΣΗ STRIPE",
            setup_complete: "⚠️ ΟΛΟΚΛΗΡΩΣΗ ΕΓΚΑΤΑΣΤΑΣΗΣ",
            setup_desc: "Συμπληρώστε τα στοιχεία (Merchant ID) για να ενεργοποιηθεί η χρέωση.",
            download_app: "📲 ΚΑΤΕΒΑΣΤΕ ΤΗΝ ΕΦΑΡΜΟΓΗ",
            download_desc: "Admin, Σερβιτόροι & Διανομείς πρέπει να έχουν το App του παρόχου.",
            get_app: "Λήψη Εφαρμογής",
            agenda: "📅 ΑΤΖΕΝΤΑ ΚΡΑΤΗΣΕΩΝ",
            assign_delivery: "🛵 ΑΝΑΘΕΣΗ ΔΙΑΝΟΜΗΣ",
            floor_bell: "Όροφος / Κουδούνι",
            zip_code: "Τ.Κ.",
            local_print: "🖨️ ΕΚΤΥΠΩΣΗ (ΤΟΠΙΚΑ)",
            auto_print: "Αυτόματη Εκτύπωση",
            close_window: "Κλείσιμο Παραθύρου",
            security: "🔐 ΑΣΦΑΛΕΙΑ",
            change_pin: "🔑 Αλλαγή PIN Εισόδου",
            change_admin_pin: "🛡️ Αλλαγή Κωδικού Διαχειριστή",
            options: "Επιλογές (Extras)",
            name_ex_cheese: "Όνομα (π.χ. Τυρί)",
            price_eur: "Τιμή (€)",
            add: "+ ΠΡΟΣΘΗΚΗ",
            finish: "ΟΛΟΚΛΗΡΩΣΗ",
            save_changes: "Αποθήκευση Αλλαγών",
            save_how: "Θέλετε η αλλαγή να ισχύει μόνο για σήμερα ή μόνιμα;",
            only_today: "⏳ ΜΟΝΟ ΓΙΑ ΣΗΜΕΡΑ",
            permanently: "💾 ΜΟΝΙΜΑ",
            upcoming_res: "📅 ΕΠΙΚΕΙΜΕΝΕΣ ΚΡΑΤΗΣΕΙΣ (1h)",
            alert_empty_table: "Παρακαλώ βάλτε τραπέζι ή επιλέξτε PASO.",
            alert_fill_delivery: "Συμπληρώστε τα στοιχεία Delivery!",
            alert_sent: "Εστάλη!",
            alert_choose_treat: "Επιλέξτε είδος για κέρασμα ή πατήστε ΟΛΑ",
            loading: "Φόρτωση...",
            payment_scan: "💳 ΠΛΗΡΩΜΗ (SCAN)",
            customer_scans: "Ο πελάτης σκανάρει για πληρωμή",
            alarm_call: "⚠️ ΚΛΗΣΗ!",
            alarm_requested: "ΣΕ ΖΗΤΟΥΝ",
            alarm_press_accept: "ΠΑΤΗΣΤΕ ΓΙΑ ΑΠΟΔΟΧΗ",
            new_delivery: "ΝΕΑ ΔΙΑΝΟΜΗ!",
            who_takes_it: "Ποιος θα την αναλάβει;",
            i_take_it: "🙋‍♂️ ΕΓΩ!",
            no_active_deliveries: "Δεν υπάρχουν ενεργές διανομές.",
            customer: "Πελάτης",
            ready_rocket: "🚀 ΕΤΟΙΜΟ",
            cooking_hourglass: "⏳ ΕΤΟΙΜΑΖΕΤΑΙ...",
            map: "🗺️ ΧΑΡΤΗΣ",
            qr: "💳 QR",
            take_order: "🖐 ΑΝΑΛΗΨΗ",
            delivered: "✅ ΠΑΡΑΔΟΘΗΚΕ",
            pay_method_prompt: "Τρόπος Πληρωμής:\n1. 💵 ΜΕΤΡΗΤΑ\n2. 💳 ΚΑΡΤΑ (SoftPOS)",
            order_delivered_prompt: "Η παραγγελία παραδόθηκε και εισπράχθηκε;",
            zero_amount: "Μηδενικό ποσό.",
            
            // ✅ Staff App Specifics
            no_orders: "Καμία παραγγελία",
            my_orders: "Οι Παραγγελίες μου",
            all_orders: "📂 ΓΕΝΙΚΕΣ",
            search_table_placeholder: "🔍 Αρ. Τραπεζιού",
            status_pending_en: "⏳ Αναμονή",
            status_cooking_en: "🍳 Ετοιμάζεται",
            status_ready_en: "✅ Έτοιμο",
            the_product: "το προϊόν",
            treat_badge: "(ΚΕΡΑΣΜΑ)",
            balance: "ΥΠΟΛΟΙΠΟ:",
            no_reservations_next_hour: "Καμία κράτηση την επόμενη ώρα.",
            people: "Άτομα",
            delete: "Διαγραφή",
            add_note: "+ Προσθήκη Σημείωσης...",
            added_items: "Προστέθηκαν! ➕",
            fill_table_number: "Παρακαλώ συμπληρώστε αριθμό τραπεζιού!",
            empty_order: "Κενή παραγγελία",
            treat_for: "Κέρασμα για: ",
            treat_entire_order: "Κέρασμα ΟΛΗ την παραγγελία;",
            charge_to_you: "💰 Χρέωση ",
            charge_to_you_prompt: "€ σε εσένα (Μετρητά); \n\n(Πατήστε Cancel για Κάρτα/Απλό Κλείσιμο)",
            close_as_card: "Κλείσιμο ως Κάρτα/Τράπεζα;",
            pay_off_question: "Εξόφληση;",
            pay_here_manual: "🔗 ΠΛΗΡΩΜΗ ΕΔΩ (MANUAL)",
            
            // ✅ Customer App Specifics (Order.js)
            install_ios_prompt: "Για εγκατάσταση σε iPhone:\n1. Πατήστε το κουμπί 'Share' (κάτω)\n2. Επιλέξτε 'Προσθήκη στην Οθόνη Αφετηρίας'",
            customer_default: "Πελάτης",
            guest_default: "Επισκέπτης",
            store_not_found_error: "⚠️ Σφάλμα: Δεν βρέθηκε κατάστημα. Παρακαλώ σκανάρετε ξανά το QR.",
            missing_customer_details_error: "⚠️ Σφάλμα: Λείπουν τα στοιχεία πελάτη. Η σελίδα θα ανανεωθεί.",
            no_local_reservations: "Δεν βρέθηκαν κρατήσεις σε αυτή τη συσκευή.",
            no_active_reservations: "Δεν υπάρχουν ενεργές κρατήσεις.",
            status_pending_res: "ΑΝΑΜΟΝΗ",
            status_confirmed_res: "ΕΠΙΒΕΒΑΙΩΜΕΝΗ",
            cancel_reservation_confirm: "Είστε σίγουροι ότι θέλετε να ακυρώσετε την κράτηση;",
            reservation_accepted: "Η κράτηση σας ΕΓΙΝΕ ΔΕΚΤΗ!",
            waiting_confirmation: "ΑΝΑΜΟΝΗ ΕΠΙΒΕΒΑΙΩΣΗΣ...",
            reservation_cancelled: "Η κράτηση ακυρώθηκε.",
            geolocation_unsupported: "Η γεωθεσία δεν υποστηρίζεται.",
            gps_error: "Σφάλμα GPS: ",
            book_btn: "ΚΡΑΤΗΣΗ",
            table_order: "ΠΑΡΑΓΓΕΛΙΑ ΣΤΟ ΤΡΑΠΕΖΙ",
            
            call: "ΚΛΗΣΗ",
            confirm_call_waiter: "Θέλετε να καλέσετε τον σερβιτόρο;",
            waiter_called_success: "Η κλήση εστάλη! Ο υπεύθυνος θα στείλει τον σερβιτόρο σας.",
            my_bill: "ΛΟΓΑΡΙΑΣΜΟΣ",
            
            view_menu: "ΔΕΣ ΤΟ ΜΕΝΟΥ",
            order_now: "ΠΑΡΑΓΓΕΙΛΕ ΤΩΡΑ",
            call_waiter: "ΚΑΛΕΣΕ ΤΟΝ ΣΕΡΒΙΤΟΡΟ",
            table_welcome: "Καλώς ήρθατε στο Τραπέζι",
            return_btn: "🔙 ΕΠΙΣΤΡΟΦΗ",
            menu_only_alert: "Για να παραγγείλετε, πατήστε 'ΕΠΙΣΤΡΟΦΗ' και επιλέξτε 'ΠΑΡΑΓΓΕΙΛΕ ΤΩΡΑ'.",

            // ✅ Table Modal
            table_active: "Το τραπέζι είναι ενεργό.",
            btn_existing_order: "ΥΠΑΡΧΟΥΣΑ ΠΑΡΑΓΓΕΛΙΑ",
            btn_new_order_reset: "ΝΕΑ ΠΑΡΑΓΓΕΛΙΑ (Reset)",
            btn_supplement: "ΣΥΜΠΛΗΡΩΣΗ",
            btn_pay_full: "ΠΛΗΡΩΜΗ",
            new_people_question: "Ήρθαν νέα άτομα;",
            new_people_hint: "Αν ναι, συμπληρώστε τον αριθμό.",
            placeholder_people: "Αρ. ατόμων (προαιρετικό)",
            btn_continue_menu: "ΣΥΝΕΧΕΙΑ ΣΤΟ MENU ▶",
            payment_method: "Τρόπος Πληρωμής",
            btn_call_waiter: "ΚΛΗΣΗ ΣΕΡΒΙΤΟΡΟΥ",
            btn_pay_stripe: "ONLINE (Stripe)",
            waiter_notified: "Ειδοποιήσαμε τον σερβιτόρο!"
        }
    },

    // ✅ Έξυπνο Λεξικό Μενού (Αυτόματη μετάφραση προϊόντων)
    menuDict: {
        "ΚΑΦΕΔΕΣ": "COFFEES",
        "ΑΝΑΨΥΚΤΙΚΑ": "SOFT DRINKS",
        "ΡΟΦΗΜΑΤΑ": "BEVERAGES",
        "ΖΕΣΤΗ ΚΟΥΖΙΝΑ": "HOT KITCHEN",
        "ΚΡΥΑ ΚΟΥΖΙΝΑ": "COLD KITCHEN",
        "ΣΦΟΛΙΑΤΕΣ": "PASTRIES",
        "ПОΤΑ": "DRINKS",
        "ΜΠΥΡΕΣ": "BEERS",
        "ΚΡΑΣΙΑ": "WINES",
        "ΖΥΜΑΡΙΚΑ": "PASTA",
        "ΣΑΛΑΤΕΣ": "SALADS",
        "ΟΡΕΚΤΙΚΑ": "APPETIZERS",
        "ΓΛΥΚΑ": "DESSERTS",
        "ΤΥΛΙΧΤΑ": "WRAPS",
        "ΜΕΡΙΔΕΣ": "PORTIONS",
        "ΤΕΜΑΧΙΑ": "PIECES",
        "BRUNCH": "BRUNCH",
        "COCKTAILS": "COCKTAILS",
        "PIZZA": "PIZZA",
        "BURGERS": "BURGERS",
        "SIDES": "SIDES",
        "SAUCES": "SAUCES",
        "Ελληνικός": "Greek Coffee",
        "Φίλτρου": "Filter Coffee",
        "Σοκολάτα (Ζεστή/Κρύα)": "Chocolate (Hot/Cold)",
        "Τσάι (Διάφορες Γεύσεις)": "Tea (Various Flavors)",
        "Φυσικός Χυμός Πορτοκάλι": "Fresh Orange Juice",
        "Φυσικός Χυμός Ανάμεικτος": "Fresh Mixed Juice",
        "Σοκολάτα": "Chocolate",
        "Τυρόπιτα Ταψιού": "Cheese Pie (Tray)",
        "Τυρόπιτα Κουρού": "Kourou Cheese Pie",
        "Σπανακόπιτα": "Spinach Pie",
        "Ζαμπονοτυρόπιτα": "Ham & Cheese Pie",
        "Λουκανικόπιτα": "Sausage Pie",
        "Μπουγάτσα Κρέμα": "Bougatsa (Cream)",
        "Πεϊνιρλί Special": "Peinirli Special",
        "Κρουασάν Βουτύρου": "Butter Croissant",
        "Κρουασάν Σοκολάτα": "Chocolate Croissant",
        "Κουλούρι Θεσσαλονίκης": "Thessaloniki Bagel",
        "Νερό 500ml": "Water 500ml",
        "Νερό 1L": "Water 1L",
        "Ομελέτα Special": "Special Omelette",
        "Ομελέτα Λαχανικών": "Vegetable Omelette",
        "Φιάλη Λευκό": "White Wine (Bottle)",
        "Φιάλη Κόκκινο": "Red Wine (Bottle)",
        "Φιάλη Ροζέ": "Rose Wine (Bottle)",
        "Ποτήρι Λευκό": "White Wine (Glass)",
        "Ποτήρι Κόκκινο": "Red Wine (Glass)",
        "Ποτήρι Ροζέ": "Rose Wine (Glass)",
        "Ελληνική": "Greek",
        "4 Τυριά": "4 Cheeses",
        "Χωριάτικη": "Greek Salad",
        "Σκορδόψωμο": "Garlic Bread",
        "Πατάτες Τηγανητές": "French Fries",
        "Φέτα Ψητή": "Baked Feta",
        "Σουφλέ Σοκολάτας": "Chocolate Souffle",
        "Πίτα Γύρος Χοιρινό": "Pork Gyro Pita",
        "Πίτα Γύρος Κοτόπουλο": "Chicken Gyro Pita",
        "Πίτα Καλαμάκι Χοιρινό": "Pork Skewer Pita",
        "Πίτα Καλαμάκι Κοτόπουλο": "Chicken Skewer Pita",
        "Πίτα Κεμπάπ": "Kebab Pita",
        "Πίτα Λουκάνικο": "Sausage Pita",
        "Πίτα Μπιφτέκι": "Burger Patty Pita",
        "Πίτα Χαλούμι": "Halloumi Pita",
        "Πίτα Μανιτάρια (Veggie)": "Mushroom Pita (Veggie)",
        "Πίτα Οικολογική (Χωρίς Κρέας)": "Eco Pita (No Meat)",
        "Μερίδα Γύρος Χοιρινό": "Pork Gyro Portion",
        "Μερίδα Γύρος Κοτόπουλο": "Chicken Gyro Portion",
        "Μερίδα Καλαμάκια Χοιρινά (3τμχ)": "Pork Skewers Portion (3pcs)",
        "Μερίδα Καλαμάκια Κοτόπουλο (3τμχ)": "Chicken Skewers Portion (3pcs)",
        "Μερίδα Κεμπάπ Γιαουρτλού": "Kebab Giaourtlou Portion",
        "Μερίδα Μπιφτέκι Γεμιστό": "Stuffed Burger Patty Portion",
        "Σκεπαστή Γύρος Χοιρινό": "Skepasti Pork Gyro",
        "Σκεπαστή Γύρος Κοτόπουλο": "Skepasti Chicken Gyro",
        "Καλαμάκι Χοιρινό": "Pork Skewer",
        "Καλαμάκι Κοτόπουλο": "Chicken Skewer",
        "Κεμπάπ": "Kebab",
        "Λουκάνικο": "Sausage",
        "Μπιφτέκι": "Burger Patty",
        "Τζατζίκι": "Tzatziki",
        "Τυροκαυτερή": "Spicy Cheese Dip",
        "Φέτα (Λάδι/Ρίγανη)": "Feta Cheese (Oil/Oregano)",
        "Σαγανάκι": "Saganaki (Fried Cheese)",
        "Κολοκυθοκεφτέδες": "Zucchini Fritters",
        "Τυροκροκέτες": "Cheese Croquettes",
        "Πίτα Σκέτη": "Plain Pita Bread",
        "Ψωμί Ψητό": "Grilled Bread",
        "Ντοματοκεφτέδες": "Tomato Fritters",
        "Ντάκος": "Dakos",
        "Μαρούλι": "Lettuce Salad",
        "Λάχανο-Καρότο": "Cabbage-Carrot Salad",
        "Χωρίς Κρεμμύδι": "No Onion",
        "Χωρίς Τζατζίκι": "No Tzatziki",
        "Απ'όλα": "Everything",
        "Σως": "Sauce",
        "Γάλα": "Milk",
        "Μέτριο": "Medium",
        "Γλυκό": "Sweet",
        "Σκέτο": "Plain",
        "Κανέλα": "Cinnamon",
        "Σαντιγύ": "Whipped Cream",
        "Άχνη/Κανέλα": "Powdered Sugar/Cinnamon",
        "Πατάτες": "Fries",
        "Μέλι/Καρύδια": "Honey/Walnuts",
        "Διπλός": "Double",
        "Με Τυρί": "With Cheese"
    },

    t: function(key) {
        const lang = document.documentElement.lang || 'el';
        return this.translations[key] || (this.builtIn[lang] && this.builtIn[lang][key]) || key;
    },
    
    // ✅ NEW: Συνάρτηση για δυναμική μετάφραση προϊόντων
    tMenu: function(text) {
        const lang = document.documentElement.lang || 'el';
        if (lang === 'el' || !text) return text;
        
        if (this.menuDict[text]) return this.menuDict[text];
        if (this.menuDict[text.toUpperCase()]) return this.menuDict[text.toUpperCase()];

        let res = text;
        const keys = Object.keys(this.menuDict).sort((a,b) => b.length - a.length);
        for (let k of keys) {
            if (res.includes(k)) {
                res = res.split(k).join(this.menuDict[k]);
            }
        }
        return res;
    },

    setLanguage: async function(lang) {
        localStorage.setItem('bellgo_lang', lang);
        document.documentElement.lang = lang;
        try {
            const response = await fetch(`/i18n/${lang}.json`);
            this.translations = await response.json();
            const btnEl = document.getElementById('lang-el');
            const btnEn = document.getElementById('lang-en');
            if (btnEl) btnEl.classList.toggle('active', lang === 'el');
            if (btnEn) btnEn.classList.toggle('active', lang === 'en');
        } catch (error) {
            console.error(`Lang Error: ${lang}`, error);
            this.translations = {}; // Fallback
        }
        this.applyTranslations();
    },
    
    applyTranslations: function() {
        const lang = document.documentElement.lang || 'el';
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            const val = this.translations[key] || (this.builtIn[lang] && this.builtIn[lang][key]);
            if (val) {
                if (element.children.length > 0) {
                    for (let i = 0; i < element.childNodes.length; i++) {
                        // ✅ FIX: Αγνοούμε τα κενά/αόρατα text nodes (tabs/spaces)
                        if (element.childNodes[i].nodeType === 3 && element.childNodes[i].nodeValue.trim() !== '') { 
                            element.childNodes[i].nodeValue = val;
                            break;
                        }
                    }
                } else if (element.tagName === 'INPUT' && (element.type === 'button' || element.type === 'submit')) {
                    element.value = val;
                } else {
                    element.innerText = val;
                }
            }
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            const val = this.translations[key] || (this.builtIn[lang] && this.builtIn[lang][key]);
            if (val) {
                element.placeholder = val;
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
            // Πρόληψη κρασαρίσματος σε Insecure Contexts (π.χ. τοπική IP μέσω HTTP)
            if (!('Notification' in window) || !('serviceWorker' in navigator)) {
                console.warn("Οι ειδοποιήσεις δεν υποστηρίζονται σε αυτό το περιβάλλον (απαιτείται HTTPS).");
                return;
            }
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
        if (!('Notification' in window) || !('serviceWorker' in navigator)) {
            console.warn("Δεν υποστηρίζονται Push Notifications (Insecure context).");
            return;
        }
        
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

/* -----------------------------------------------------------
   4. NATIVE APK AUTO-UPDATER (ANDROID STAFF ONLY)
----------------------------------------------------------- */
setTimeout(() => {
    if (typeof window === 'undefined') return;
    
    const isAndroid = /Android/i.test(navigator.userAgent);
    let isStaff = false;
    try {
        const session = JSON.parse(localStorage.getItem('bellgo_session') || '{}');
        if (['admin', 'kitchen', 'waiter', 'driver'].includes(session.role)) isStaff = true;
    } catch(e) {}
    
    // Εκτέλεση ελέγχου ΜΟΝΟ αν είναι συσκευή Android ΚΑΙ είναι συνδεδεμένο προσωπικό
    if (isAndroid && isStaff) {
        const lastCheck = localStorage.getItem('bellgo_apk_last_check');
        const now = Date.now();
        
        // Έλεγχος το πολύ 1 φορά ανά 1 ώρα (3600000 ms) για αποφυγή rate-limit από το GitHub
        if (lastCheck && (now - parseInt(lastCheck)) < 3600000) return;
        
        fetch('https://api.github.com/repos/theroasters84-wq/bellgo-final/releases/latest')
            .then(res => {
                if (!res.ok) throw new Error("GitHub API Error");
                return res.json();
            })
            .then(data => {
                localStorage.setItem('bellgo_apk_last_check', now.toString());
                const latestVersion = data.tag_name;
                if (!latestVersion) return;
                
                // ✅ Εκκίνηση ελέγχου από την v.0.6 (Αν δεν έχει καταγραφεί άλλη έκδοση)
                const installedVersion = localStorage.getItem('bellgo_apk_version') || 'v.0.6';
                
                if (latestVersion !== installedVersion) {
                    if (document.getElementById('apkUpdateOverlay')) return;

                    const div = document.createElement('div');
                    div.id = 'apkUpdateOverlay';
                    div.className = 'modal-overlay';
                    div.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:99999; display:flex; align-items:center; justify-content:center;";
                    div.innerHTML = `
                        <div class="modal-box" style="background:#fff; padding:20px; border-radius:12px; width:90%; max-width:320px; text-align:center; box-shadow:0 10px 30px rgba(0,0,0,0.5);">
                            <div style="font-size:50px; margin-bottom:10px;">🚀</div>
                            <h3 style="color:#10B981; margin:0 0 10px 0;">Νέα Έκδοση App!</h3>
                            <p style="color:#1f2937; font-size:15px; margin-bottom:20px;">Είναι διαθέσιμη η νέα έκδοση <b>${latestVersion}</b> (Τρέχουσα: ${installedVersion}). Παρακαλώ κατεβάστε την για τη σωστή λειτουργία του συστήματος.</p>
                            <button id="btnDownloadApkUpdate" style="background:#10B981; color:white; border:none; padding:15px; width:100%; border-radius:8px; font-weight:bold; font-size:16px; margin-bottom:10px; cursor:pointer; box-shadow:0 4px 10px rgba(16,185,129,0.3);">📥 ΚΑΤΕΒΑΣΜΑ ΤΩΡΑ</button>
                            <button onclick="this.parentElement.parentElement.remove()" style="background:#f3f4f6; color:#1f2937; border:1px solid #d1d5db; padding:10px; width:100%; border-radius:8px; font-weight:bold; cursor:pointer;">ΑΡΓΟΤΕΡΑ</button>
                        </div>
                    `;
                    document.body.appendChild(div);

                    document.getElementById('btnDownloadApkUpdate').onclick = () => {
                        // Αποθήκευση της νέας έκδοσης πριν τη λήψη
                        localStorage.setItem('bellgo_apk_version', latestVersion);
                        window.location.href = "https://github.com/theroasters84-wq/bellgo-final/releases/latest/download/app-release.apk";
                        div.remove();
                    };
                }
            }).catch(e => console.log("APK Update Check Error", e));
    }
}, 3000);