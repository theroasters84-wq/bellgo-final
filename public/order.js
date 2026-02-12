/* --- 2026 MODERN THEME (VARIABLES) --- */
:root {
    --bg-dark: #0a0a0a; [cite: 1]
    --surface: #141414; [cite: 1]
    --primary: #00E676; [cite: 1]
    --accent: #FFD700; [cite: 1]
    --danger: #FF5252; [cite: 2]
    --text-main: #ffffff; [cite: 2]
    --border-glass: 1px solid rgba(255, 255, 255, 0.08); [cite: 2]
    --radius-box: 16px; [cite: 2]
    --radius-btn: 12px; [cite: 2]
    --app-height: 100vh; [cite: 2]
} [cite: 3]

* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; outline: none; }

body { 
    background-color: var(--bg-dark); [cite: 4]
    color: var(--text-main); [cite: 4]
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; [cite: 4]
    margin: 0; [cite: 4]
    height: var(--app-height); [cite: 4]
    width: 100vw; [cite: 4]
    overflow: hidden; [cite: 4]
    display: flex; [cite: 4]
    flex-direction: column; [cite: 4]
    position: fixed; top: 0; left: 0; right: 0; bottom: 0; [cite: 5]
} [cite: 6]

/* --- COMMON HEADER UTILS --- */
.header { 
    height: 70px; background: rgba(10, 10, 10, 0.8); [cite: 7]
    backdrop-filter: blur(12px); [cite: 7]
    display: flex; align-items: center; justify-content: space-between; padding: 0 15px; [cite: 7]
    border-bottom: var(--border-glass); flex-shrink: 0; z-index: 1000; position: relative; [cite: 7]
} [cite: 8]

.user-info { display: flex; flex-direction: column; } [cite: 9]
.header-actions { display: flex; align-items: center; gap: 8px; } [cite: 9]
.btn-logout { background: var(--danger); color: white; border: none; padding: 6px 12px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 12px; } [cite: 10]
.btn-icon-wrapper { position: relative; display: inline-block; } [cite: 11]
.btn-icon { background: transparent; border: 1px solid #aaa; color: #aaa; width: 35px; height: 35px; border-radius: 50%; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 18px; position: relative; } [cite: 11]
.btn-icon:active { background: #333; } [cite: 12]
.btn-badge { position: absolute; top: -5px; right: -5px; background: var(--danger); color: white; border-radius: 50%; width: 18px; height: 18px; font-size: 10px; display: flex; align-items: center; justify-content: center; border: 1px solid #121212; display: none; } [cite: 13]
.chat-badge { position: absolute; top: -2px; right: -2px; width: 12px; height: 12px; background-color: var(--danger); border-radius: 50%; border: 2px solid #1e1e1e; display: none; z-index: 10; } [cite: 14, 15]

/* Order Header Specifics - ΔΙΟΡΘΩΣΗ: row layout για όνομα/ώρα */
.store-info { display: flex; flex-direction: row; align-items: center; width: 100%; justify-content: center; gap: 10px; } 
#storeNameHeader { font-weight: 800; font-size: 20px; color: var(--accent); text-align: center; text-transform: uppercase; } 
.schedule-badge { font-size: 11px; color: #ccc; background: rgba(255,255,255,0.1); padding: 2px 8px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 4px; } [cite: 17]

/* ΔΙΟΡΘΩΣΗ: Status κάτω από το Header */
.header-left { position: absolute; left: 15px; top: 75px; height: auto; display: flex; align-items: center; } 
.btn-status-mini { display: none; background: rgba(255, 215, 0, 0.15); border: 1px solid var(--accent); color: var(--accent); padding: 6px 10px; border-radius: 20px; font-size: 11px; font-weight: bold; cursor: pointer; align-items: center; gap: 5px; animation: pulseMini 2s infinite; } [cite: 19, 20]
.btn-header-install { display: none; background: var(--primary); color: black; border: none; padding: 6px 12px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 12px; } [cite: 21]

/* --- MENU STYLES --- */
/* ΔΙΟΡΘΩΣΗ: Premium στοίχιση 3 κάθετα */
#appContent, .admin-main-area, #mainApp, #waiterPanel { display: flex; flex-direction: column; height: 100%; width: 100%; position: relative; overflow: hidden; } 
.admin-main-area { display: flex; flex-direction: column; flex-wrap: wrap; align-content: flex-start; gap: 15px; padding: 15px; height: 420px; } 

#menuContainer { flex: 1; overflow-y: auto; padding: 10px; background: var(--bg-dark); display: flex; flex-direction: column; gap: 15px; padding-bottom: 400px; -webkit-overflow-scrolling: touch; overscroll-behavior-y: contain; touch-action: pan-y; will-change: scroll-position; } [cite: 23]
.category-block { width: 100%; } [cite: 24]
.category-title { color: var(--accent); font-weight: bold; font-size: 16px; margin-bottom: 8px; border-bottom: 1px solid #333; padding-bottom: 2px; text-transform: uppercase; } [cite: 25]
.category-items { display: flex; flex-wrap: wrap; gap: 8px; } [cite: 26]
.item-box { background: #222; border: 1px solid #444; padding: 12px 14px; border-radius: 8px; color: #eee; font-size: 15px; cursor: pointer; transition: transform 0.1s; user-select: none; display: flex; justify-content: space-between; align-items: center; } [cite: 27]
.item-box:active { transform: scale(0.95); background: #333; border-color: var(--accent); } [cite: 27]
.item-name { font-style: italic; } [cite: 27]
.item-price { background: var(--primary); color: black; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 13px; margin-left: 8px; } [cite: 28]
.menu-fade-out { opacity: 0.3; filter: grayscale(100%); transform: scale(0.98); } [cite: 29]
.menu-fade-in { animation: menuEntry 0.4s ease-out forwards; } [cite: 29]

/* --- ORDER PANEL --- */
.order-panel { position: fixed; bottom: 0; left: 0; width: 100%; background: #1a1a1a; border-top: 2px solid #333; display: flex; flex-direction: column; box-shadow: 0 -5px 20px rgba(0,0,0,0.5); z-index: 50; height: 45%; transition: height 0.2s ease-out; } [cite: 30, 31]
.order-panel.minimized { height: 50px; overflow: hidden; } [cite: 32]
.order-panel.writing-mode { height: 45% !important; transition: none !important; } [cite: 33]
.order-panel.writing-mode .panel-header-bar, .order-panel.writing-mode .address-bar, .order-panel.writing-mode #liveTotal, .order-panel.writing-mode #btnSendOrder, .order-panel.writing-mode .form-row, .order-panel.writing-mode #cancelUpdateBtn { display: none !important; } [cite: 33]
.order-panel.writing-mode .panel-content { padding: 5px; height: 100%; } [cite: 34]
.order-panel.writing-mode textarea.order-text { height: 100% !important; margin: 0; border: 2px solid var(--primary); border-radius: 4px; } [cite: 35]

.panel-header-bar { height: 40px; background: #252525; border-bottom: 1px solid #333; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; } [cite: 36]
.toggle-icon { font-size: 20px; color: #aaa; transition: transform 0.3s; } [cite: 37]
.order-panel.minimized .toggle-icon { transform: rotate(180deg); } [cite: 37]
.panel-content { padding: 10px; display: flex; flex-direction: column; flex: 1; height: 100%; overflow: hidden; } [cite: 37]
.address-bar { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: #aaa; margin-bottom: 5px; padding-bottom: 5px; border-bottom: 1px solid #333; } [cite: 38]
.btn-edit { background: none; border: 1px solid #555; color: var(--accent); padding: 2px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; } [cite: 39]
textarea.order-text { flex: 1; width: 100%; background: #222; border: 1px solid #444; color: white; padding: 10px; border-radius: 6px; font-size: 16px; resize: none; margin-bottom: 8px; } [cite: 40, 41]
.btn-send { width: 100%; padding: 15px; background: var(--accent); color: black; border: none; border-radius: 8px; font-size: 18px; font-weight: bold; cursor: pointer; flex-shrink: 0; } [cite: 42]
.btn-send:disabled { background: #555; color: #aaa; cursor: not-allowed; } [cite: 42]
.btn-send.update-mode { background: #2196F3; color: white; } [cite: 42]
#liveTotal { text-align: right; color: var(--primary); font-size: 20px; font-weight: bold; margin-bottom: 10px; flex-shrink: 0; } [cite: 43]
#cancelUpdateBtn { display:none; width: 100%; padding: 10px; background: #555; color: white; border: none; border-radius: 10px; font-size: 16px; font-weight: bold; cursor: pointer; margin-top: 5px; } [cite: 44, 45]

/* STAFF FORM */
.form-row { display: flex; gap: 10px; flex-shrink: 0; align-items: flex-end; margin-bottom: 8px; } [cite: 46]
.input-group { flex: 1; } [cite: 47]
.input-group label { display: block; font-size: 11px; color: #888; margin-bottom: 3px; } [cite: 47]
.input-box { width: 100%; padding: 12px; background: #333; border: 1px solid #444; border-radius: 6px; color: white; font-size: 16px; text-align: center; font-weight: bold; } [cite: 48]
.pay-method-toggle { display: flex; border: 1px solid #444; border-radius: 8px; overflow: hidden; height: 45px; } [cite: 49]
.pay-btn { flex: 1; border: none; background: #222; color: #777; font-size: 20px; cursor: pointer; display:flex; align-items:center; justify-content:center; } [cite: 49]
.pay-btn.active { background: var(--primary); color: black; } [cite: 50]

/* MODALS */
.overlay-screen, .modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.95); z-index: 4000; align-items: center; justify-content: center; flex-direction: column; padding: 20px; backdrop-filter: blur(5px); text-align: center; } [cite: 51]
.details-box, .modal-box { background: #222; padding: 20px; border-radius: 10px; border: 1px solid #444; width: 100%; max-width: 400px; display: flex; flex-direction: column; gap: 10px; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.5); } [cite: 52, 53]
.extras-grid { display: flex; flex-wrap: wrap; gap: 8px; max-height: 300px; overflow-y: auto; margin: 15px 0; } [cite: 54]
.extra-option { background: #333; border: 1px solid #555; padding: 10px; border-radius: 6px; color: white; font-size: 14px; cursor: pointer; user-select: none; flex: 1 1 45%; display: flex; justify-content: space-between; } [cite: 55]
.extra-option.selected { background: var(--primary); color: black; border-color: var(--primary); font-weight: bold; } [cite: 56]
.btn-save-details { padding: 12px; background: var(--primary); color: black; border: none; border-radius: 5px; font-weight: bold; font-size: 16px; cursor: pointer; margin-top: 10px; width: 100%; } [cite: 57]
.inp-detail { padding: 12px; background: #333; border: 1px solid #555; color: white; border-radius: 5px; font-size: 16px; width: 100%; } [cite: 58]

/* STAFF ORDERS */
.orders-box-container { width: 95%; max-width: 500px; background: #1a1a1a; border: 1px solid #444; border-radius: 10px; display: flex; flex-direction: column; height: 85vh; overflow:hidden; } [cite: 59]
.orders-tabs { display: flex; background: #111; border-bottom: 1px solid #333; } [cite: 60]
.tab-btn { flex: 1; padding: 15px; background: transparent; border: none; color: #888; font-weight: bold; border-bottom: 3px solid transparent; cursor: pointer; } [cite: 61]
.tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); background: #222; } [cite: 61]
.search-bar { padding: 10px; background: #222; border-bottom: 1px solid #333; display: flex; gap: 10px; } [cite: 62]
.search-inp { flex: 1; padding: 10px; background: #111; border: 1px solid #444; color: white; border-radius: 6px; text-align: center; font-size: 16px; } [cite: 63]
.orders-list { overflow-y: auto; padding: 10px; flex: 1; display: flex; flex-direction: column; gap: 10px; } [cite: 63]
.my-order-item { background: #2a2a2a; padding: 12px; border-radius: 8px; border-left: 5px solid #999; text-align: left; position: relative; cursor: pointer; } [cite: 64]
.my-order-item:active { transform: scale(0.98); background: #333; } [cite: 65]
.my-order-item.pending { border-left-color: #FF9800; } [cite: 65]
.my-order-item.cooking { border-left-color: #2196F3; } [cite: 65]
.my-order-item.ready { border-left-color: var(--primary); } [cite: 65]
.order-meta { display: flex; justify-content: space-between; font-size: 12px; color: #aaa; margin-bottom: 5px; } [cite: 66]
.order-content { white-space: pre-wrap; font-weight: bold; color: white; font-size: 15px; } [cite: 66]
.order-total { text-align: right; color: var(--accent); font-weight: bold; margin-top: 5px; font-size: 16px; } [cite: 67]

/* ACTION MODAL */
#actionModal { display: none; position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index: 25000; align-items:center; justify-content:center; } [cite: 68]
.action-box { background: #222; padding: 20px; border-radius: 10px; width: 80%; max-width: 300px; display:flex; flex-direction:column; gap:15px; } [cite: 69]
.btn-act { padding: 15px; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; color: black; } [cite: 70]

/* CHAT */
#staffChatOverlay, #adminChatOverlay { display: none; position: fixed; bottom: 0; right: 0; width: 100%; height: 100%; background: #121212; z-index: 3000; flex-direction: column; } [cite: 71]
.overlay-header { padding: 15px; background: #1e1e1e; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; } [cite: 72]
.chat-container { flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative; height: 100%; } [cite: 73]
.chat-messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 10px; padding-bottom: 80px; } [cite: 73]
.chat-input-area { position: absolute; bottom: 0; left: 0; width: 100%; padding: 10px; background: #1a1a1a; border-top: 1px solid #333; display: flex; gap: 10px; } [cite: 74, 75]
.chat-inp { flex: 1; padding: 12px; border-radius: 20px; border: 1px solid #444; background: #000; color: white; } [cite: 76]
.chat-btn, .btn-icon.menu-active { margin-left: 10px; width: 45px; border-radius: 50%; border: none; background: var(--primary); cursor: pointer; font-size: 20px; display:flex; align-items:center; justify-content:center; } [cite: 77]
.chat-msg { padding: 10px 14px; border-radius: 12px; font-size: 15px; max-width: 80%; } [cite: 77]
.chat-msg.me { align-self: flex-end; background: var(--primary); color: black; } [cite: 78]
.chat-msg.other { align-self: flex-start; background: #333; color: white; } [cite: 78]

/* SCREENS */
#startScreen { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #121212; z-index: 6000; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; } [cite: 79, 80]
.btn-start { padding: 15px 35px; background: var(--primary); color: black; border: none; border-radius: 30px; font-size: 20px; font-weight: bold; cursor: pointer; box-shadow: 0 0 20px rgba(0, 230, 118, 0.4); animation: pulse 2s infinite; } [cite: 81]
#fakeLockOverlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: black; z-index: 20000; align-items: center; justify-content: center; flex-direction: column; color: #333; font-size: 14px; } [cite: 82, 83]

#staffBellBtn { background: var(--accent); color: black; border: 2px solid var(--accent); display: none; } [cite: 84]
#staffBellBtn.ringing { display: flex; animation: shake 0.5s infinite; box-shadow: 0 0 15px var(--accent); } [cite: 84]
.flash { animation: flashAnim 0.2s; } [cite: 85]
@keyframes flashAnim { 0% { background: #333; } 50% { background: #555; } 100% { background: #333; } } [cite: 86]

#statusOverlay { position: absolute; bottom: 0; left: 0; width: 100%; height: 0; background: rgba(0,0,0,0.95); transition: height 0.3s; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 3000; } [cite: 87]
.status-content { text-align: center; width: 80%; display: flex; flex-direction: column; align-items: center; } [cite: 88]
.status-icon { font-size: 70px; margin-bottom: 20px; animation: pulse 1.5s infinite; } [cite: 89]
.status-text { font-size: 24px; font-weight: bold; color: white; margin-bottom: 10px; } [cite: 89]
.status-sub { font-size: 15px; color: #aaa; } [cite: 89]
.btn-new-order { margin-top: 20px; padding: 12px 25px; background: var(--primary); color: black; border: none; border-radius: 30px; font-size: 16px; font-weight: bold; cursor: pointer; display: none; box-shadow: 0 4px 15px rgba(0, 230, 118, 0.4); width: 100%; } [cite: 90, 91]
.btn-minimize { margin-top: 15px; background: transparent; border: 1px solid #555; color: #aaa; padding: 8px 15px; border-radius: 20px; cursor: pointer; font-size: 14px; } [cite: 92]
.store-closed-overlay, #closedOverlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 9000; display: none; align-items: center; justify-content: center; flex-direction: column; } [cite: 93]
#closedOverlay { top: 60px; height: calc(100% - 60px); } [cite: 94]
.closed-text { font-size: 24px; color: var(--danger); font-weight: bold; text-transform: uppercase; border: 2px solid var(--danger); padding: 10px 20px; border-radius: 10px; background: #121212; } [cite: 95]

/* ADMIN SPECIFICS */
.header-store-input { background: transparent; border: none; border-bottom: 1px solid #333; color: var(--accent); font-size: 18px; font-weight: 800; width: 100%; max-width: 200px; text-transform: uppercase; text-shadow: 0 0 10px rgba(255, 215, 0, 0.3); } [cite: 96, 97]
.status-dot { width: 10px; height: 10px; background: red; border-radius: 50%; box-shadow: 0 0 8px red; cursor: pointer; } [cite: 98]
.order-folder { width: 85px; height: 100px; display: flex; flex-direction: column; align-items: center; cursor: pointer; animation: popIn 0.4s; position: relative; } [cite: 99]
.order-folder.ringing .folder-icon { animation: shake 0.5s infinite; color: var(--accent); } [cite: 100]
.order-folder.cooking { border: 2px dashed var(--accent); border-radius: 10px; background: rgba(255, 215, 0, 0.05); } [cite: 100]
.folder-icon { font-size: 50px; color: #555; transition: 0.2s; } [cite: 101]
.folder-label { font-size: 11px; text-align: center; color: white; background: rgba(0,0,0,0.5); padding: 2px 6px; border-radius: 6px; margin-top: 5px; width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } [cite: 102]
.folder-time { font-size: 10px; color: #000; background: var(--primary); padding: 2px 6px; border-radius: 10px; position: absolute; top: 0; right: 0; font-weight: bold; } [cite: 103]

/* ΔΙΟΡΘΩΣΗ: Admin Window Κεντραρισμένο Fixed */
.order-window { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 90%; max-width: 400px; height: auto; max-height: 80%; background: #1a1a1a; border: 1px solid #444; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.8); display: flex; flex-direction: column; z-index: 2000; overflow: hidden; animation: popIn 0.3s; } [cite: 104, 105, 106]
.win-header { background: #252525; padding: 15px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; } [cite: 106]
.win-body { flex: 1; overflow-y: auto; padding: 20px; font-size: 16px; line-height: 1.5; color: #eee; } [cite: 107]
.win-footer { padding: 15px; border-top: 1px solid #333; background: #222; } [cite: 108]
.btn-win-action { width: 100%; padding: 15px; border: none; border-radius: 8px; font-size: 18px; font-weight: bold; cursor: pointer; } [cite: 108]
.order-info-section { color: #aaa; font-size: 14px; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #444; } [cite: 109]
.order-items-section { font-weight: bold; } [cite: 110]

#staffContainer { background: #1a1a1a; border-top: 1px solid #333; display: flex; flex-direction: column; flex-shrink: 0; height: 210px; transition: height 0.3s ease; } [cite: 111]
#staffContainer.minimized { height: 35px; } [cite: 111]
.sidebar-header { padding: 8px; background: #222; display: flex; justify-content: center; align-items: center; cursor: pointer; color: #aaa; font-size: 11px; font-weight: bold; } [cite: 112]
#staffList { flex: 1; overflow-x: auto; padding: 10px; display: grid; grid-template-rows: repeat(2, 1fr); grid-auto-flow: column; gap: 8px; } [cite: 113]
.btn-staff { width: 130px; height: 100%; padding: 5px; border-radius: 12px; color: white; font-weight: bold; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #333; border: 2px solid transparent; } [cite: 114]
.btn-staff.waiter { border-color: #2196F3; background: rgba(33, 150, 243, 0.1); } [cite: 115]
.btn-staff.driver { border-color: var(--danger); background: rgba(255, 82, 82, 0.1); } [cite: 116]

#menuFullPanel { display: none; flex-direction: column; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: var(--bg-dark); z-index: 500; padding: 15px; overflow-y: auto; } [cite: 117]
.menu-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 10px; border-bottom: var(--border-glass); } [cite: 118]
.menu-title { font-size: 22px; font-weight: 900; color: var(--text-main); letter-spacing: 1px; } [cite: 118]
.category-box { background: var(--surface); border: 1px solid #333; padding: 20px; border-radius: var(--radius-box); font-size: 18px; font-weight: 800; text-align: center; cursor: pointer; position: relative; color: var(--accent); box-shadow: 0 4px 10px rgba(0,0,0,0.3); transition: transform 0.2s; } [cite: 119, 120]
.category-box:active { transform: scale(0.98); } [cite: 120]
.btn-delete-cat { position: absolute; top: -10px; right: -10px; background: var(--danger); color: white; width: 25px; height: 25px; border-radius: 50%; font-size: 12px; border:none; display:flex; align-items:center; justify-content:center; } [cite: 121]
.item-wrapper { display: flex; align-items: center; gap: 10px; width: 100%; position: relative; animation: fadeInUp 0.3s ease; } [cite: 122]
.menu-input-box { flex: 1; background: #000; border: 1px solid #333; color: white; padding: 12px; border-radius: var(--radius-btn); font-size: 15px; padding-right: 40px; } [cite: 123]
.btn-item-extras { position: absolute; right: 45px; top: 5px; background: #2196F3; color: white; border: none; width: 25px; height: 25px; border-radius: 6px; font-weight: bold; cursor: pointer; } [cite: 124, 125]
.has-extras { background: var(--primary) !important; color: black !important; } [cite: 125]
.btn-item-del { background: #333; color: var(--danger); border: 1px solid #333; width: 35px; height: 35px; border-radius: 8px; font-weight: bold; } [cite: 126]

/* ΔΙΟΡΘΩΣΗ: Modern Premium Buttons στο Menu Editor */
.btn-add { background: var(--primary); color: black; border: none; padding: 12px 24px; border-radius: var(--radius-btn); font-weight: 800; cursor: pointer; box-shadow: 0 4px 15px rgba(0, 230, 118, 0.2); } [cite: 127]
.btn-back { background: var(--surface); color: white; border: var(--border-glass); padding: 12px 24px; border-radius: var(--radius-btn); cursor: pointer; font-weight: bold; } [cite: 128]

.extra-item-row { display: flex; justify-content: space-between; background: #333; padding: 10px; border-radius: 8px; margin-bottom: 5px; } [cite: 129]
.extra-inputs { display: flex; gap: 5px; margin-bottom: 10px; } [cite: 129]
.extra-name-inp { flex: 2; background: #111; border: 1px solid #444; color: white; padding: 10px; border-radius: 8px; } [cite: 130]
.extra-price-inp { flex: 1; background: #111; border: 1px solid #444; color: var(--primary); padding: 10px; border-radius: 8px; text-align: center; } [cite: 131]

.switch-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; } [cite: 131]
.switch { position: relative; display: inline-block; width: 40px; height: 22px; } [cite: 132]
.switch input { opacity: 0; width: 0; height: 0; } [cite: 132]
.slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #444; transition: .4s; border-radius: 34px; } [cite: 133]
.slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; } [cite: 134, 135]
input:checked + .slider { background-color: var(--primary); } [cite: 135]
input:checked + .slider:before { transform: translateX(18px); } [cite: 135]

#qrOverlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.95); z-index: 7000; flex-direction: column; align-items: center; justify-content: center; } [cite: 136, 137]

@keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } [cite: 138]
@keyframes popIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } } [cite: 139]
@keyframes shake { 0% { transform: translate(1px, 1px); } 20% { transform: translate(-3px, 0px); } 40% { transform: translate(1px, -1px); } 60% { transform: translate(-3px, 1px); } 80% { transform: translate(-1px, -1px); } 100% { transform: translate(1px, -2px); } } [cite: 140, 141]
@keyframes menuEntry { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } [cite: 142]
@keyframes pulse { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.1); opacity: 0.8; } 100% { transform: scale(1); opacity: 1; } } [cite: 143, 144]
@keyframes pulseMini { 0% { opacity: 0.8; } 50% { opacity: 1; } 100% { opacity: 0.8; } } [cite: 144]
