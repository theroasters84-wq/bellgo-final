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

// --- MENU SYSTEM (PERSISTENCE JSON) ---
const MENU_FILE = path.join(__dirname, 'saved_menu.json');
let liveMenu = []; // Default is now an Array (Categories)

// Φόρτωση μενού από δίσκο κατά την εκκίνηση (Smart Load)
try {
    if (fs.existsSync(MENU_FILE)) {
        const rawData = fs.readFileSync(MENU_FILE, 'utf8');
        try {
            // Προσπάθεια ανάγνωσης ως JSON (Νέο σύστημα)
            liveMenu = JSON.parse(rawData);
            console.log("📜 Menu loaded as JSON structure.");
        } catch (err) {
            // Αν αποτύχει, είναι παλιό text file -> Μετατροπή σε Default Category
            console.log("⚠️ Old menu format detected. Converting...");
            const items = rawData.split('\n').filter(l => l.trim() !== '');
            liveMenu = [{ id: 1, order: 1, name: "ΓΕΝΙΚΑ", items: items }];
        }
    } else {
        // Αν δεν υπάρχει αρχείο, δημιουργούμε default δομή
        liveMenu = [{ id: 1, order: 1, name: "ΚΑΦΕΔΕΣ", items: ["Espresso", "Cappuccino"] }];
        fs.writeFileSync(MENU_FILE, JSON.stringify(liveMenu), 'utf8');
    }
} catch (e) { 
    console.error("Menu Load Error:", e);
    liveMenu = []; 
}


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

  // 2. Λίστα Παραγγελιών (Desktop Icons για Admin / Badge για Waiters / Status για Customers)
  const storeOrders = activeOrders.filter(o => o.store === store);
  io.to(store).emit('orders-update', storeOrders);

  // 3. Ενημέρωση Μενού (JSON Data)
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
    const role = data.role || 'waiter'; // 'admin', 'waiter', 'driver', 'customer'
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
    
    // Ενημέρωση όλων στο κατάστημα
    updateStore(store);

    // Στέλνουμε το τρέχον μενού ΜΟΝΟ στον χρήστη που μπήκε (για σιγουριά)
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
    if (target.isRinging) return;

    console.log(`🔔 ALARM START -> ${targetName} @ ${socket.store}`);
    target.isRinging = true;
    updateStore(socket.store); 

    if (target.socketId) io.to(target.socketId).emit('ring-bell');

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
                    fcm_options: { link: "/stafpremium.html" } 
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

  // 1. Αποθήκευση Μενού (Save JSON)
  socket.on('save-menu', (jsonText) => {
      try {
          liveMenu = JSON.parse(jsonText); // Validate JSON
          fs.writeFileSync(MENU_FILE, jsonText, 'utf8'); 
          io.to(socket.store).emit('menu-update', liveMenu); // Send as Object
      } catch (e) {
          console.error("Save Menu Error: Invalid JSON");
      }
  });

  // 2. Live Update (Sync Input)
  socket.on('live-menu-type', (jsonText) => {
      // Σε αυτό το mode, απλά προωθούμε την αλλαγή, χωρίς save ακόμα
      // Αλλά επειδή είναι πολύπλοκο το JSON structure, συνήθως το αγνοούμε
      // ή το χρησιμοποιούμε αν θέλουμε real-time collaboration.
      // Εδώ το αγνοούμε προς το παρόν για ασφάλεια δεδομένων.
  });

  // 3. Νέα Παραγγελία (Από Πελάτη ή Σερβιτόρο)
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
      updateStore(socket.store); // Ενημερώνει ΟΛΟΥΣ (Πελάτες, Staff, Admin)

      // Ειδοποίηση σε ΟΛΟΥΣ τους ADMINS
      const adminUsers = Object.values(activeUsers).filter(u => u.store === socket.store && u.role === 'admin');
      
      adminUsers.forEach(adminUser => {
          if (adminUser.socketId) io.to(adminUser.socketId).emit('ring-bell');
          sendPushNotification(adminUser, "ΝΕΑ ΠΑΡΑΓΓΕΛΙΑ", `Από: ${socket.username}`);
      });
  });

  // 4. Αποδοχή Παραγγελίας (Pending -> Cooking)
  socket.on('accept-order', (orderId) => {
      const order = activeOrders.find(o => o.id === orderId);
      if (order) {
          order.status = 'cooking';
          updateStore(socket.store); // Ο Πελάτης θα δει την αλλαγή status
      }
  });

  // 5. Έτοιμη Παραγγελία (Cooking -> Ready) - *ΝΕΟ ΓΙΑ DELIVERY*
  socket.on('ready-order', (orderId) => {
      const order = activeOrders.find(o => o.id === orderId);
      if (order) {
          order.status = 'ready';
          updateStore(socket.store);
          
          // Ειδοποίηση στον συγκεκριμένο πελάτη/σερβιτόρο
          const targetKey = `${socket.store}_${order.from}`;
          const targetUser = activeUsers[targetKey];
          if (targetUser) {
              if (targetUser.socketId) io.to(targetUser.socketId).emit('ring-bell');
              sendPushNotification(targetUser, "Η ΠΑΡΑΓΓΕΛΙΑ ΣΟΥ ΕΙΝΑΙ ΕΤΟΙΜΗ!", "🛵 Έρχεται!");
          }
      }
  });

  // 6. Κλείσιμο Παραγγελίας (Delete)
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
