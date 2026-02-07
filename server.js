const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require("firebase-admin");
const fs = require('fs');

// --- TO DOMAIN ΣΟΥ ---
const YOUR_DOMAIN = 'https://bellgo-final.onrender.com'; 

// --- STRIPE SETUP ---
const stripe = require('stripe')('sk_test_51SwnsPJcEtNSGviLf1RB1NTLaHJ3LTmqqy9LM52J3Qc7DpgbODtfhYK47nHAy1965eNxwVwh9gA4PTuizOxhMPil00dIoebxMx');

/* ---------------- FIREBASE ADMIN SETUP ---------------- */
try {
    const serviceAccount = require("./serviceAccountKey.json");
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("✅ Firebase Admin Initialized");
} catch (e) {
    console.log("⚠️ Firebase Warning: serviceAccountKey.json not found.");
}

/* ---------------- SERVER SETUP ---------------- */
const app = express();
app.use(express.json()); 

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(express.static(path.join(__dirname, 'public')));

/* ---------------- DATA STORE (MEMORY) ---------------- */
let activeUsers = {};
let activeOrders = []; // Λίστα ενεργών παραγγελιών

// --- MENU SYSTEM (PERSISTENCE) ---
const MENU_FILE = path.join(__dirname, 'saved_menu.json');
let liveMenu = "1. Καφές\n2. Τοστ\n3. Νερό"; // Default

// Φόρτωση μενού από δίσκο κατά την εκκίνηση
try {
    if (fs.existsSync(MENU_FILE)) {
        liveMenu = fs.readFileSync(MENU_FILE, 'utf8');
        console.log("📜 Menu loaded from disk.");
    } else {
        fs.writeFileSync(MENU_FILE, liveMenu, 'utf8');
    }
} catch (e) { console.error("Menu Load Error:", e); }


/* ---------------- STRIPE FUNCTIONS ---------------- */

app.post('/check-subscription', async (req, res) => {
    let { email } = req.body;
    let requestPlan = 'basic'; 

    try {
        if (!email) return res.json({ active: false });

        // --- ΕΛΕΓΧΟΣ ΓΙΑ PREMIUM SUFFIX ---
        if (email.endsWith('premium')) {
            requestPlan = 'premium';
            email = email.replace('premium', ''); 
        }

        const customers = await stripe.customers.list({ 
            email: email.toLowerCase().trim(), 
            limit: 1 
        });

        if (customers.data.length === 0) return res.json({ active: false });

        const subscriptions = await stripe.subscriptions.list({
            customer: customers.data[0].id,
            status: 'active',
        });

        const isActive = subscriptions.data.length > 0;
        
        console.log(`🔍 Payment Check [${email}]: ${isActive ? '✅ PAID' : '❌ UNPAID'} (Mode: ${requestPlan})`);
        
        res.json({ 
            active: isActive, 
            plan: isActive ? requestPlan : null 
        });

    } catch (e) {
        console.error("Stripe Check Error:", e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post('/create-checkout-session', async (req, res) => {
    let { email } = req.body;
    
    if (email && email.endsWith('premium')) {
        email = email.replace('premium', '');
    }

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            customer_email: email,
            line_items: [{
                price: 'price_1Sx9PFJcEtNSGviLteieJCwj', 
                quantity: 1,
            }],
            mode: 'subscription',
            success_url: `${YOUR_DOMAIN}/login.html?payment=success&email=${email}`,
            cancel_url: `${YOUR_DOMAIN}/login.html?payment=cancel`,
        });

        res.json({ id: session.id, url: session.url }); 

    } catch (e) {
        console.error("Checkout Error:", e.message);
        res.status(500).json({ error: e.message });
    }
});

/* ---------------- HELPER FUNCTIONS ---------------- */
function updateStore(store) {
  if (!store) return;

  // 1. Λίστα Προσωπικού
  const list = Object.values(activeUsers)
    .filter(u => u.store === store)
    .map(u => ({ 
      name: u.username,        
      username: u.username,  
      role: u.role, 
      status: u.status, 
      isRinging: u.isRinging 
    }));

  io.to(store).emit('staff-list-update', list);

  // 2. Λίστα Παραγγελιών (Desktop Icons για Admin / Badge για Waiters)
  const storeOrders = activeOrders.filter(o => o.store === store);
  io.to(store).emit('orders-update', storeOrders);

  // 3. Ενημέρωση κειμένου Μενού
  io.to(store).emit('menu-update', liveMenu);
}

function sendPushNotification(target, title, body, dataPayload = { type: "alarm" }) {
    if (target && target.fcmToken) {
        const msg = {
            token: target.fcmToken,
            data: dataPayload,
            android: { priority: "high", notification: { channelId: "fcm_default_channel", title: title, body: body } },
            webpush: { headers: { "Urgency": "high" } }
        };
        admin.messaging().send(msg).catch(e => console.log("FCM Error:", e.message));
    }
}

/* ---------------- SOCKET.IO LOGIC ---------------- */
io.on('connection', (socket) => {

  socket.on('join-store', (data) => {
    let rawStore = data.storeName || '';
    if (rawStore.endsWith('premium')) rawStore = rawStore.replace('premium', '');

    const store = rawStore.toLowerCase().trim();
    const username = (data.username || '').trim();
    const role = data.role || 'waiter';
    const token = data.token || null;
    const isNative = data.isNative === true || data.deviceType === "AndroidNative";

    if (!store || !username) return;

    socket.store = store;
    socket.username = username;
    socket.role = role;
    socket.join(store);

    const key = `${store}_${username}`;
    const existingRinging = activeUsers[key] ? activeUsers[key].isRinging : false;

    activeUsers[key] = {
      store, username, role, 
      socketId: socket.id, 
      fcmToken: token,
      status: "online", 
      lastSeen: Date.now(),
      isRinging: existingRinging,
      isNative: isNative
    };

    console.log(`👤 JOIN: ${username} @ ${store} (${role})`);
    updateStore(store);

    // Άμεση αποστολή μενού στον χρήστη
    socket.emit('menu-update', liveMenu);

    if (activeUsers[key].isRinging) {
        socket.emit('ring-bell');
    }
  });

  socket.on('update-token', (data) => {
      const key = `${socket.store}_${socket.username}`;
      if (activeUsers[key] && data.token) {
          activeUsers[key].fcmToken = data.token;
      }
  });

  socket.on('heartbeat', () => {
    const key = `${socket.store}_${socket.username}`;
    if (activeUsers[key]) {
      activeUsers[key].lastSeen = Date.now();
      if (activeUsers[key].status === 'away') {
        activeUsers[key].status = 'online';
        activeUsers[key].socketId = socket.id;
        updateStore(socket.store);
      }
    }
  });

  /* --- ALARM LOGIC (STAFF CALLING) --- */
  socket.on('trigger-alarm', (targetName) => {
    const key = `${socket.store}_${targetName}`;
    const target = activeUsers[key];
    
    if (!target) return;
    if (target.isRinging) return; // Αν χτυπάει ήδη, αγνόησέ το

    console.log(`🔔 ALARM START -> ${targetName} @ ${socket.store}`);
    target.isRinging = true;
    updateStore(socket.store); 

    // Χτυπάει άμεσα αν είναι συνδεδεμένος
    if (target.socketId) io.to(target.socketId).emit('ring-bell');

    // Push Notifications
    if (target.isNative) {
        sendPushNotification(target, "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑ!", "Πάτα για αποδοχή");
        return; 
    }

    // Web Push Loop
    const sendPushLoop = () => {
        const currentTarget = activeUsers[key];
        if (!currentTarget || !currentTarget.isRinging) {
            if (currentTarget && currentTarget.alarmInterval) clearInterval(currentTarget.alarmInterval);
            return;
        }
        if (currentTarget.fcmToken) {
            const message = {
                token: currentTarget.fcmToken,
                data: { type: "alarm", time: Date.now().toString() },
                webpush: { 
                    headers: { "Urgency": "high" }, 
                    fcm_options: { link: "/stafpremium.html" } // Redirect στο σωστό αρχείο
                }
            };
            admin.messaging().send(message).catch(err => {});
        }
    };
    sendPushLoop();
    target.alarmInterval = setInterval(sendPushLoop, 4000);
  });

  socket.on('alarm-accepted', (data) => {
    const sName = socket.store || (data ? data.store : null);
    const uName = socket.username || (data ? data.username : null);

    if (!sName || !uName) return;

    const key = `${sName}_${uName}`;
    const user = activeUsers[key];

    if (user && user.isRinging) {
        if (user.alarmInterval) clearInterval(user.alarmInterval);
        user.alarmInterval = null;
        user.isRinging = false;
        updateStore(sName);
    }
  });

  /* --- PREMIUM LOGIC: MENU & ORDERS --- */

  // 1. Αποθήκευση Μενού
  socket.on('save-menu', (newText) => {
      liveMenu = newText;
      fs.writeFileSync(MENU_FILE, liveMenu, 'utf8'); 
      io.to(socket.store).emit('menu-update', liveMenu); 
  });

  // 2. Live Update (χωρίς Save)
  socket.on('live-menu-type', (newText) => {
      liveMenu = newText;
      io.to(socket.store).emit('menu-update', liveMenu);
  });

  // 3. Νέα Παραγγελία (ΔΙΟΡΘΩΜΕΝΟ)
  socket.on('new-order', (orderText) => {
      if (!socket.store) return;
      
      const newOrder = {
          id: Date.now(),
          text: orderText,
          from: socket.username,
          status: 'pending', 
          store: socket.store
      };
      
      activeOrders.push(newOrder);
      updateStore(socket.store); // Ενημερώνει ΟΛΟΥΣ (icons για Admin, badges για Waiters)

      // **ΔΙΟΡΘΩΣΗ:** Βρίσκουμε ΟΛΟΥΣ τους Admins του καταστήματος
      const adminUsers = Object.values(activeUsers).filter(u => u.store === socket.store && u.role === 'admin');
      
      adminUsers.forEach(adminUser => {
          // Χτυπάει το PC του Admin (χρησιμοποιούμε το 'ring-bell' event που στο premium.html παίζει ήχο)
          if (adminUser.socketId) io.to(adminUser.socketId).emit('ring-bell');
          // Στέλνουμε Push notification
          sendPushNotification(adminUser, "ΝΕΑ ΠΑΡΑΓΓΕΛΙΑ", `Από: ${socket.username}`);
      });
  });

  // 4. Αποδοχή Παραγγελίας
  socket.on('accept-order', (orderId) => {
      const order = activeOrders.find(o => o.id === orderId);
      if (order) {
          order.status = 'cooking';
          updateStore(socket.store);
      }
  });

  // 5. Κλείσιμο Παραγγελίας
  socket.on('close-order', (orderId) => {
      activeOrders = activeOrders.filter(o => o.id !== orderId);
      updateStore(socket.store);
  });

  /* --- CHAT & LOGOUT --- */

  socket.on('chat-message', (msg) => {
    if (socket.store) {
        io.to(socket.store).emit('chat-message', { sender: socket.username, text: msg.text });
    }
  });

  socket.on('manual-logout', (data) => {
    const targetUser = (data && data.targetUser) ? data.targetUser : socket.username;
    const targetKey = `${socket.store}_${targetUser}`;

    if (activeUsers[targetKey]) {
        if (activeUsers[targetKey].alarmInterval) clearInterval(activeUsers[targetKey].alarmInterval);
        delete activeUsers[targetKey];
        updateStore(socket.store);
    }
  });

  socket.on('disconnect', () => {
    const key = `${socket.store}_${socket.username}`;
    if (activeUsers[key] && activeUsers[key].socketId === socket.id) {
        activeUsers[key].socketId = null;
        activeUsers[key].status = 'away';
        updateStore(socket.store);
    }
  });
});

setInterval(() => {
  const now = Date.now();
  for (const key in activeUsers) {
    if (now - activeUsers[key].lastSeen > 12 * 3600000) { // 12 ώρες
      if (activeUsers[key].alarmInterval) clearInterval(activeUsers[key].alarmInterval);
      const st = activeUsers[key].store;
      delete activeUsers[key];
      updateStore(st);
    }
  }
}, 60000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
