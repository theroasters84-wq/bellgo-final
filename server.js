const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require("firebase-admin");
const fs = require('fs'); // ΝΕΟ: Για αποθήκευση του μενού

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
let activeOrders = []; // ΝΕΟ: Λίστα ενεργών παραγγελιών

// --- MENU SYSTEM (PERSISTENCE) ---
const MENU_FILE = path.join(__dirname, 'saved_menu.json');
let defaultMenu = "1. Καφές\n2. Τοστ\n3. Νερό";
let liveMenu = defaultMenu;

// Φόρτωση μενού από δίσκο κατά την εκκίνηση
try {
    if (fs.existsSync(MENU_FILE)) {
        liveMenu = fs.readFileSync(MENU_FILE, 'utf8');
        console.log("📜 Menu loaded from disk.");
    } else {
        // Αν δεν υπάρχει, δημιουργούμε το αρχικό
        fs.writeFileSync(MENU_FILE, defaultMenu, 'utf8');
    }
} catch (e) { console.error("Menu Load Error:", e); }


/* ---------------- STRIPE FUNCTIONS ---------------- */

// 1. Έλεγχος Συνδρομής (Τροποποιημένο για Premium Suffix)
app.post('/check-subscription', async (req, res) => {
    let { email } = req.body;
    let requestPlan = 'basic'; // Default

    try {
        if (!email) return res.json({ active: false });

        // --- ΕΛΕΓΧΟΣ ΓΙΑ PREMIUM SUFFIX ---
        // Αν το email τελειώνει σε "premium" (π.χ. "user@gmail.compremium")
        if (email.endsWith('premium')) {
            requestPlan = 'premium';
            email = email.replace('premium', ''); // Καθαρίζουμε το email για το Stripe
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
        
        // Αν είναι Active, επιστρέφουμε και το Plan που ζητήθηκε (hacky way)
        console.log(`🔍 Payment Check [${email}]: ${isActive ? '✅ PAID' : '❌ UNPAID'} (Mode: ${requestPlan})`);
        
        res.json({ 
            active: isActive, 
            plan: isActive ? requestPlan : null // Επιστρέφει 'premium' ή 'basic'
        });

    } catch (e) {
        console.error("Stripe Check Error:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// 2. Δημιουργία Link Πληρωμής
app.post('/create-checkout-session', async (req, res) => {
    let { email } = req.body;
    
    // Καθαρίζουμε το email αν κατά λάθος έστειλε το premium suffix στην πληρωμή
    if (email && email.endsWith('premium')) {
        email = email.replace('premium', '');
    }

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            customer_email: email,
            line_items: [{
                // Χρησιμοποιούμε το ίδιο Price ID που είχες (4€)
                // Εφόσον το premium είναι "κόλπο" στο email, δεν αλλάζουμε το Stripe Product ακόμα
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

  // --- ΝΕΟ: Ενημέρωση Παραγγελιών ---
  const storeOrders = activeOrders.filter(o => o.store === store);
  io.to(store).emit('orders-update', storeOrders);

  // --- ΝΕΟ: Ενημέρωση Μενού ---
  io.to(store).emit('menu-update', liveMenu);
}

// Helper για Push Notification (επαναχρησιμοποίηση)
function sendPushNotification(target, title, body, dataPayload = { type: "alarm" }) {
    if (target && target.fcmToken) {
        const msg = {
            token: target.fcmToken,
            data: dataPayload,
            android: { priority: "high", notification: { channelId: "fcm_default_channel", title: title, body: body } },
            webpush: { headers: { "Urgency": "high" } } // Για web pwa
        };
        admin.messaging().send(msg).catch(e => console.log("FCM Error:", e.message));
    }
}

/* ---------------- SOCKET.IO LOGIC ---------------- */
io.on('connection', (socket) => {

  socket.on('join-store', (data) => {
    // Αν είναι premium email στο join, καθαρίζουμε το όνομα του Store
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

    // Στέλνουμε το τρέχον μενού στον χρήστη που μόλις μπήκε
    socket.emit('menu-update', liveMenu);

    if (activeUsers[key].isRinging) {
        socket.emit('ring-bell');
    }
  });

  socket.on('update-token', (data) => {
      const key = `${socket.store}_${socket.username}`;
      if (activeUsers[key] && data.token) {
          activeUsers[key].fcmToken = data.token;
          console.log(`📲 FCM Token Updated for ${socket.username}`);
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

  /* --- ALARM LOGIC (ΥΠΑΡΧΟΥΣΑ) --- */
  socket.on('trigger-alarm', (targetName) => {
    const key = `${socket.store}_${targetName}`;
    const target = activeUsers[key];
    
    if (!target) return;
    if (target.isRinging) return;

    console.log(`🔔 ALARM START -> ${targetName} @ ${socket.store}`);
    target.isRinging = true;
    updateStore(socket.store); 

    if (target.socketId) io.to(target.socketId).emit('ring-bell');

    // Logic για Native App Push
    if (target.isNative) {
        sendPushNotification(target, "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑ!", "Πάτα για αποδοχή");
        return; 
    }

    // Logic για Web Push Loop
    const sendPushLoop = () => {
        const currentTarget = activeUsers[key];
        if (!currentTarget || !currentTarget.isRinging) {
            if (currentTarget && currentTarget.alarmInterval) clearInterval(currentTarget.alarmInterval);
            return;
        }
        // Χρησιμοποιούμε την ίδια λογική με πριν για Web Push
        if (currentTarget.fcmToken) {
            const message = {
                token: currentTarget.fcmToken,
                data: { type: "alarm", time: Date.now().toString() },
                webpush: { 
                    headers: { "Urgency": "high" }, 
                    fcm_options: { link: "/index.html?type=alarm" } 
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
        io.to(sName).emit('staff-accepted-alarm', { username: uName });
        updateStore(sName);
    }
  });

  /* --- ΝΕΑ PREMIUM LOGIC: MENU & ORDERS --- */

  // 1. Αποθήκευση Μενού (Save)
  socket.on('save-menu', (newText) => {
      // Μόνο admin ή εξουσιοδοτημένοι
      liveMenu = newText;
      fs.writeFileSync(MENU_FILE, liveMenu, 'utf8'); // Γράψιμο στο δίσκο
      io.to(socket.store).emit('menu-update', liveMenu); // Ενημέρωση όλων
  });

  // 2. Live Update Μενού (χωρίς Save)
  socket.on('live-menu-type', (newText) => {
      liveMenu = newText;
      io.to(socket.store).emit('menu-update', liveMenu);
  });

  // 3. Νέα Παραγγελία (Από Πελάτη ή Σερβιτόρο)
  socket.on('new-order', (orderText) => {
      if (!socket.store) return;
      
      const newOrder = {
          id: Date.now(),
          text: orderText,
          from: socket.username,
          status: 'pending', // pending -> cooking -> ready
          store: socket.store
      };
      
      activeOrders.push(newOrder);
      updateStore(socket.store);

      // Ειδοποίηση στον ADMIN ότι ήρθε παραγγελία
      const adminKey = `${socket.store}_Admin`;
      const adminUser = Object.values(activeUsers).find(u => u.store === socket.store && u.role === 'admin');
      
      if (adminUser) {
          if (adminUser.socketId) io.to(adminUser.socketId).emit('ring-bell'); // Χτυπάει το PC
          sendPushNotification(adminUser, "ΝΕΑ ΠΑΡΑΓΓΕΛΙΑ", `Από: ${socket.username}`);
      }
  });

  // 4. Admin: Αποδοχή Παραγγελίας (Μπαίνει σε ετοιμασία)
  socket.on('accept-order', (orderId) => {
      const order = activeOrders.find(o => o.id === orderId);
      if (order) {
          order.status = 'cooking';
          updateStore(socket.store);
      }
  });

  // 5. Admin: Έτοιμη Παραγγελία (Ειδοποιεί πελάτη/σερβιτόρο)
  socket.on('ready-order', (orderId) => {
      const order = activeOrders.find(o => o.id === orderId);
      if (order) {
          order.status = 'ready';
          updateStore(socket.store);

          // Βρες ποιος το παρήγγειλε και χτύπα του
          const targetKey = `${socket.store}_${order.from}`;
          const targetUser = activeUsers[targetKey];
          
          if (targetUser) {
              if (targetUser.socketId) io.to(targetUser.socketId).emit('ring-bell');
              sendPushNotification(targetUser, "Η ΠΑΡΑΓΓΕΛΙΑ ΣΟΥ ΕΙΝΑΙ ΕΤΟΙΜΗ!", "Έλα να παραλάβεις");
          }
      }
  });

  // 6. Κλείσιμο Παραγγελίας (Διαγραφή)
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
    if (now - activeUsers[key].lastSeen > 12 * 3600000) {
      if (activeUsers[key].alarmInterval) clearInterval(activeUsers[key].alarmInterval);
      const st = activeUsers[key].store;
      delete activeUsers[key];
      updateStore(st);
    }
  }
}, 60000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
