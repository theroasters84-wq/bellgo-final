<!DOCTYPE html>
<html lang="el">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, interactive-widget=resizes-content, viewport-fit=cover">
    
    <title>Delivery</title>
    <link rel="icon" type="image/png" href="shop.png">
    <link rel="apple-touch-icon" href="shop.png">
    
    <meta name="theme-color" content="#121212">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="Delivery">

    <link rel="manifest" id="dynamicManifest">
    
    <link rel="stylesheet" href="/style.css">

    <script src="https://js.stripe.com/v3/"></script>
    <script src="/socket.io/socket.io.js"></script>
</head>
<body>

    <div id="loginScreen">
        <h1 style="color:#FFD700;">BellGo Delivery 🛵</h1>
        <p style="color:#aaa;">Συνδεθείτε για να παραγγείλετε</p>
        <button class="btn-google" onclick="App.loginGoogle()">
            <span>G</span> Σύνδεση με Google
        </button>
        <button id="btnInstallLogin" class="btn-install-app" onclick="App.installPWA()">📲 ΕΓΚΑΤΑΣΤΑΣΗ APP</button>
    </div>

    <div id="detailsOverlay" class="overlay-screen">
        <div class="details-box">
            <h3 style="color:#FFD700; margin:0;">📍 Στοιχεία Παράδοσης</h3>
            <input type="text" id="inpName" class="inp-detail" placeholder="Το Όνομά σας">
            <input type="text" id="inpAddress" class="inp-detail" placeholder="Διεύθυνση (π.χ. Ερμού 15)">
            <input type="text" id="inpFloor" class="inp-detail" placeholder="Όροφος / Κουδούνι">
            <input type="tel" id="inpPhone" class="inp-detail" placeholder="Τηλέφωνο Επικοινωνίας">
            <button class="btn-save-details" onclick="App.saveDetails()">ΑΠΟΘΗΚΕΥΣΗ & ΣΥΝΕΧΕΙΑ</button>
        </div>
    </div>

    <div id="paymentOverlay" class="overlay-screen">
        <div class="details-box">
            <h3 style="color:#FFD700;">Τρόπος Πληρωμής</h3>
            <button class="btn-pay" id="payCash" onclick="App.confirmPayment('💵 ΜΕΤΡΗΤΑ')">💵 ΜΕΤΡΗΤΑ</button>
            <button class="btn-pay" id="payCard" onclick="App.confirmPayment('💳 ΚΑΡΤΑ')">💳 ΚΑΡΤΑ</button>
            <button onclick="document.getElementById('paymentOverlay').style.display='none'" style="background:transparent; border:none; color:#aaa; margin-top:15px; font-size:14px; cursor:pointer;">ΑΚΥΡΩΣΗ</button>
        </div>
    </div>
    
    <div id="closedOverlay" class="store-closed-overlay">
        <div class="closed-text">🔴 ΚΛΕΙΣΤΟ</div>
        <p style="color:#aaa;">Το κατάστημα δεν δέχεται παραγγελίες αυτή τη στιγμή.</p>
    </div>
    
    <div id="scheduleViewModal" class="overlay-screen" onclick="document.getElementById('scheduleViewModal').style.display='none'">
        <div class="details-box" onclick="event.stopPropagation()">
            <h3 style="color:#FFD700; margin:0; margin-bottom:15px;">📅 Ωράριο Διανομής</h3>
            <div id="scheduleList" style="width:100%;"></div>
            <button onclick="document.getElementById('scheduleViewModal').style.display='none'" style="background:transparent; border:none; color:#aaa; margin-top:15px; cursor:pointer;">ΚΛΕΙΣΙΜΟ</button>
        </div>
    </div>

    <div id="userExtrasModal" class="overlay-screen">
        <div class="details-box">
            <h3 style="color:#FFD700; margin:0;" id="userExtrasTitle">Επιλογές</h3>
            <div id="userExtrasList" class="extras-grid"></div>
            <button class="btn-save-details" onclick="App.confirmExtras()">ΠΡΟΣΘΗΚΗ</button>
            <button onclick="document.getElementById('userExtrasModal').style.display='none'" style="background:transparent; border:none; color:#aaa; margin-top:10px; cursor:pointer;">ΑΚΥΡΩΣΗ</button>
        </div>
    </div>

    <div id="appContent">
        <div class="header">
            <div class="header-left">
                <button id="btnStatusMini" class="btn-status-mini" onclick="App.maximizeStatus()">
                    ⏳ <span id="miniStatusText">...</span>
                </button>
            </div>

            <div class="store-info">
                <span id="storeNameHeader">...</span>
                <div id="headerSchedule" class="schedule-badge" onclick="App.showFullSchedule()">
                    <span>🕒</span> <span id="todayHours">--:--</span>
                </div>
            </div>
            <div class="header-actions">
                <button id="btnInstallHeader" class="btn-header-install" onclick="App.installPWA()">📲 APP</button>
            </div>
        </div>

        <div id="menuContainer">
            <div style="text-align:center; color:#555; margin-top:50px;">Φόρτωση καταλόγου...</div>
        </div>

        <div id="orderPanel" class="order-panel">
            <div class="panel-header-bar" onclick="App.toggleOrderPanel()">
                <div style="font-size:12px; color:#aaa; margin-right:10px;">ΚΑΛΑΘΙ / ΑΠΟΣΤΟΛΗ</div>
                <div id="panelIcon" class="toggle-icon">▼</div>
            </div>
            <div class="panel-content">
                <div class="address-bar">
                    <span id="displayAddress">...</span>
                    <button class="btn-edit" onclick="App.editDetails()">✏️ Αλλαγή</button>
                </div>
                
                <textarea id="orderText" class="order-text" 
                    placeholder="Γράψτε εδώ...&#10;(⚠️ Για πληρωμή με ΚΑΡΤΑ, επιλέξτε προϊόντα από τον κατάλογο!)" 
                    oninput="App.handleInput()">
                </textarea>
                
                <div id="liveTotal">ΣΥΝΟΛΟ: 0.00€</div>

                <button id="btnSendOrder" class="btn-send" onclick="App.requestPayment()">ΑΠΟΣΤΟΛΗ ΠΑΡΑΓΓΕΛΙΑΣ 🚀</button>
            </div>
        </div>

        <div id="statusOverlay">
            <div class="status-content">
                <div id="statusIcon" class="status-icon">⏳</div>
                <div id="statusText" class="status-text">Αναμονή...</div>
                <div id="statusSub" class="status-sub">Μην κλείνετε την εφαρμογή</div>
                <button id="btnNewOrder" class="btn-new-order" onclick="App.resetForNewOrder()">➕ ΝΕΑ ΠΑΡΑΓΓΕΛΙΑ</button>
                <button class="btn-minimize" onclick="App.minimizeStatus()">▼ ΠΙΣΩ ΣΤΟ ΜΕΝΟΥ</button>
            </div>
        </div>
    </div>

    <script type="module" src="order.js"></script>
</body>
</html>
