const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require("firebase-admin");

// --- STRIPE SETUP (TEST MODE) ---
// Το Secret Key από τη φωτογραφία σου
const stripe = require('stripe')('sk_test_51SwnsPJcEtNSGviLf1RB1NTLaHJ3LTmqqy9LM52J3Qc7DpgbODtfhYK47nHAy1965eNxwVwh9gA4PTuiz0xhMPil00dIoebxMx');

/* ---------------- FIREBASE ADMIN SETUP ---------------- */
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

console.log("✅ Firebase Admin Initialized");

/* ---------------- SERVER SETUP ---------------- */
const app = express();

// ΑΠΑΡΑΙΤΗΤΟ για να διαβάζει JSON δεδομένα από το Stripe request
app.use(express.json()); 

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(express.static(path.join(__dirname, 'public')));

/* ---------------- MEMORY STORE ---------------- */
let activeUsers = {};

/* ---------------- STRIPE FUNCTIONS ---------------- */

// 1. Δημιουργία Checkout Session (Πληρωμή)
app.post('/create-checkout-session', async (req, res) => {
    const { email } = req.body;
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            customer_email: email, // Συνδέουμε το email με την πληρωμή
            line_items: [{
                // Το Price ID από τη φωτογραφία σου
                price: 'price_1Sx9PFJcEtNSGviLteieJCwj', 
                quantity: 1,
            }],
            mode: 'subscription',
            success_url: `${req.headers.origin}/?payment=success`,
            cancel_url: `${req.headers.origin}/?payment=cancel`,
        });
        res.json({ id: session.id });
    } catch (e) {
        console.error("Stripe Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// 2. Έλεγχος Συνδρομής
async function hasActiveSubscription(email) {
    try {
        // Ψάχνουμε τον πελάτη με βάση το email
        const customers = await stripe.customers.list({
            email: email.toLowerCase().trim(),
            limit: 1
        });

        if (customers.data.length === 0) return false;

        // Ελέγχουμε αν έχει ενεργή συνδρομή
        const subscriptions = await stripe.subscriptions.list({
            customer: customers.data[0].id,
            status: 'active',
        });

        return subscriptions.data.length > 0;
    } catch (e) {
        console.error("Subscription Check Error:", e.message);
        return false;
    }
}

/* ---------------- HELPER FUNCTIONS ---------------- */

function updateStore(store) {
  if (!store) return;

  const list = Object.values(activeUsers)
    .filter(u => u.store === store)
    .map(u => ({ 
      name: u.username,      // Για το Android Native App
      username: u.username,  // Για συμβατότητα
      role: u.role, 
      status: u.status,
      isRinging: u.isRinging 
    }));

  io.to(store).emit('staff-list-update', list);
}

/* ---------------- SOCKET.IO LOGIC ---------------- */
io.on('connection', (socket) => {

  // --- JOIN STORE ---
  socket.on('join-store', async (data) => {
    const store = (data.storeName || '').toLowerCase().trim();
    const username = (data.username || '').trim();
    const role = data.role || 'waiter';
    const token = data.token || null;
    
    // ΕΔΩ: Έλεγχος αν είναι Native
    const isNative = data.isNative === true || data.deviceType === "AndroidNative";

    if (!store) return;

    // === ΝΕΟ: ΕΛΕΓΧΟΣ ΠΛΗΡΩΜΗΣ (ΜΟΝΟ ΓΙΑ ADMIN) ===
    if (role === 'admin') {
        const isPaid = await hasActiveSubscription(store);
        
        // Αν δεν έχει πληρώσει, στέλνουμε μήνυμα λάθους και διακόπτουμε
        if (!isPaid) {
            console.log(`❌ Unpaid login attempt: ${store}`);
            socket.emit('subscription-required', { email: store });
            return; // STOP HERE
        }
        console.log(`✅ Subscription verified for: ${store}`);
    }

    if (!username) return;

    socket.store = store;
    socket.username = username;
    socket.role = role;
    socket.join(store);

    const key = `${store}_${username}`;
    
    const existingRinging = activeUsers[key] ? activeUsers[key].isRinging : false;

    activeUsers[key] = {
      store,
      username,
      role,
      socketId: socket.id,
      fcmToken: token,
      status: "online",
      lastSeen: Date.now(),
      isRinging: existingRinging,
      isNative: isNative
    };

    console.log(`👤 JOIN: ${username} @ ${store} [Native: ${isNative}]`);
    updateStore(store);

    if (activeUsers[key].isRinging) {
        socket.emit('ring-bell');
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

  // --- TRIGGER ALARM ---
  socket.on('trigger-alarm', (targetName) => {
    // ΣΗΜΑΝΤΙΚΟ: Βρίσκουμε τον στόχο στο σωστό κατάστημα
    const key = `${socket.store}_${targetName}`;
    const target = activeUsers[key];
    
    if (!target) {
        console.log(`⚠️ Target ${targetName} not found in ${socket.store}`);
        return;
    }
    
    if (target.isRinging) return;

    console.log(`🔔 ALARM START -> ${targetName} @ ${socket.store}`);
    target.isRinging = true;
    updateStore(socket.store); 

    // 1. Αποστολή στο Socket (αν είναι online)
    if (target.socketId) {
        io.to(target.socketId).emit('ring-bell');
    }

    // 2. Αν είναι Native, στέλνουμε ΕΝΑ FCM και τέλος (για να μη κολλάει)
    if (target.isNative) {
        if (target.fcmToken) {
            const msg = {
                token: target.fcmToken,
                data: { type: "alarm" },
                android: { 
                  priority: "high",
                  notification: { 
                    channelId: "fcm_default_channel", 
                    title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑ!", 
                    body: "Πάτα για αποδοχή" 
                  } 
                }
            };
            admin.messaging().send(msg).catch(e => console.log("FCM Error Native"));
        }
        return; 
    }

    // 3. Αν είναι Web/iOS, Loop
    const sendPush = () => {
        const currentTarget = activeUsers[key];
        if (!currentTarget || !currentTarget.isRinging) {
            if (currentTarget && currentTarget.alarmInterval) clearInterval(currentTarget.alarmInterval);
            return;
        }

        if (currentTarget.fcmToken) {
            const message = {
                token: currentTarget.fcmToken,
                data: { type: "alarm", time: Date.now().toString() },
                webpush: { headers: { "Urgency": "high", "TTL": "0" }, fcm_options: { link: "/?type=alarm" } },
                apns: { payload: { aps: { alert: { title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑ!", body: "ΠΑΤΑ ΤΩΡΑ" }, sound: "default" } } }
            };
            admin.messaging().send(message).catch(err => {});
        }
    };

    sendPush();
    target.alarmInterval = setInterval(sendPush, 4000);
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
