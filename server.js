const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require("firebase-admin");

// --- STRIPE SETUP (TEST MODE) ---
// Το Secret Key σου από τη φωτογραφία
const stripe = require('stripe')('sk_test_51SwnsPJcEtNSGviLf1RB1NTLaHJ3LTmqqy9LM52J3Qc7DpgbODtfhYK47nHAy1965eNxwVwh9gA4PTuiz0xhMPil00dIoebxMx');

/* ---------------- FIREBASE ADMIN SETUP (SECURE) ---------------- */
let serviceAccount;

// 1. Προσπάθεια ανάγνωσης από Environment Variable (Για τον Render Server)
if (process.env.GOOGLE_CREDENTIALS) {
    try {
        serviceAccount = JSON.parse(process.env.GOOGLE_CREDENTIALS);
        console.log("✅ Loaded Firebase Credentials from Environment");
    } catch (e) {
        console.error("❌ Failed to parse GOOGLE_CREDENTIALS env var", e);
    }
} 
// 2. Fallback: Προσπάθεια ανάγνωσης τοπικού αρχείου (Για το PC σου)
else {
    try {
        serviceAccount = require("./serviceAccountKey.json");
        console.log("✅ Loaded Firebase Credentials from local file");
    } catch (e) {
        console.error("❌ CRITICAL: No Google Credentials found (Env or File). Server will crash.");
    }
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

/* ---------------- SERVER SETUP ---------------- */
const app = express();

app.use(express.json()); // Απαραίτητο για το Stripe

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
app.post('/create-checkout-session', async (req, res) => {
    const { email } = req.body;
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            customer_email: email,
            line_items: [{
                price: 'price_1Sx9PFJcEtNSGviLteieJCwj', // Το Price ID σου
                quantity: 1,
            }],
            mode: 'subscription',
            success_url: `${req.headers.origin}/?payment=success`,
            cancel_url: `${req.headers.origin}/?payment=cancel`,
        });
        res.json({ id: session.id });
    } catch (e) {
        console.error("Stripe Error:", e.message);
        res.status(500).json({ error: e.message });
    }
});

async function hasActiveSubscription(email) {
    try {
        const customers = await stripe.customers.list({
            email: email.toLowerCase().trim(),
            limit: 1
        });

        if (customers.data.length === 0) return false;

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
      name: u.username,      // Android App compatibility
      username: u.username,  // Web compatibility
      role: u.role, 
      status: u.status,
      isRinging: u.isRinging 
    }));

  io.to(store).emit('staff-list-update', list);
}

/* ---------------- SOCKET.IO LOGIC ---------------- */
io.on('connection', (socket) => {

  socket.on('join-store', async (data) => {
    const store = (data.storeName || '').toLowerCase().trim();
    const username = (data.username || '').trim();
    const role = data.role;
    const token = data.token || null;
    const isNative = data.isNative === true || data.deviceType === "AndroidNative";

    if (!store) return;

    // === ΕΛΕΓΧΟΣ ΠΛΗΡΩΜΗΣ (ΜΟΝΟ ΓΙΑ ADMIN) ===
    if (role === 'admin') {
        const isPaid = await hasActiveSubscription(store);
        
        if (!isPaid) {
            console.log(`❌ Unpaid login attempt: ${store}`);
            socket.emit('subscription-required', { email: store });
            return;
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
    const existingInterval = activeUsers[key] ? activeUsers[key].alarmInterval : null;

    activeUsers[key] = {
      store,
      username,
      role,
      socketId: socket.id,
      fcmToken: token,
      status: "online",
      lastSeen: Date.now(),
      isRinging: existingRinging,
      alarmInterval: existingInterval,
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

  socket.on('trigger-alarm', (targetName) => {
    const key = `${socket.store}_${targetName}`;
    const target = activeUsers[key];
    
    if (!target) return;
    if (target.isRinging) return;

    console.log(`🔔 ALARM START -> ${targetName} @ ${socket.store}`);
    target.isRinging = true;
    updateStore(socket.store); 

    if (target.socketId) io.to(target.socketId).emit('ring-bell');

    // NATIVE (No Loop)
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
            admin.messaging().send(msg).catch(e => console.log("Native FCM Error"));
        }
        return; 
    }

    // WEB/iOS (Loop)
    const sendPush = () => {
        if (!activeUsers[key] || !activeUsers[key].isRinging) {
            if (activeUsers[key] && activeUsers[key].alarmInterval) clearInterval(activeUsers[key].alarmInterval);
            return;
        }

        if (target.fcmToken) {
            const message = {
                token: target.fcmToken,
                data: { type: "alarm" },
                webpush: { headers: { "Urgency": "high" }, fcm_options: { link: "/?type=alarm" } }
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
server.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));
