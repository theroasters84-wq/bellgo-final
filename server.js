const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require("firebase-admin");

/* ---------------- FIREBASE ADMIN SETUP ---------------- */
try {
    const serviceAccount = require("./serviceAccountKey.json");
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("✅ Firebase Admin Initialized");
} catch (e) {
    console.log("⚠️ Firebase Warning: serviceAccountKey.json not found or invalid.");
}

/* ---------------- SERVER SETUP ---------------- */
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(express.static(path.join(__dirname, 'public')));

/* ---------------- MEMORY STORE ---------------- */
let activeUsers = {};

/* ---------------- HELPER FUNCTIONS ---------------- */
function updateStore(store) {
  if (!store) return;

  const list = Object.values(activeUsers)
    .filter(u => u.store === store)
    .map(u => ({ 
      name: u.username,      // Android Native Compatibility
      username: u.username,  // Web Compatibility
      role: u.role, 
      status: u.status, 
      isRinging: u.isRinging 
    }));

  io.to(store).emit('staff-list-update', list);
}

/* ---------------- SOCKET.IO LOGIC ---------------- */
io.on('connection', (socket) => {

  socket.on('join-store', (data) => {
    const store = (data.storeName || '').toLowerCase().trim();
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
    
    // Κρατάμε την κατάσταση αν χτυπούσε ήδη
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

    console.log(`👤 JOIN: ${username} @ ${store} [Native: ${isNative}]`);
    updateStore(store);

    // Αν χτυπούσε πριν αποσυνδεθεί, ξαναστέλνουμε την εντολή να χτυπήσει
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
    const key = `${socket.store}_${targetName}`;
    const target = activeUsers[key];
    
    if (!target) return;
    if (target.isRinging) return;

    console.log(`🔔 ALARM START -> ${targetName} @ ${socket.store}`);
    target.isRinging = true;
    updateStore(socket.store); 

    // 1. Socket
    if (target.socketId) io.to(target.socketId).emit('ring-bell');

    // 2. Native App (One-time Push)
    if (target.isNative) {
        if (target.fcmToken) {
            const msg = {
                token: target.fcmToken,
                data: { type: "alarm" },
                android: { priority: "high", notification: { channelId: "fcm_default_channel", title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑ!", body: "Πάτα για αποδοχή" } }
            };
            admin.messaging().send(msg).catch(e => {});
        }
        return; 
    }

    // 3. Web App (Loop Push)
    const sendPush = () => {
        const currentTarget = activeUsers[key];
        if (!currentTarget || !currentTarget.isRinging) {
            if (currentTarget && currentTarget.alarmInterval) clearInterval(currentTarget.alarmInterval);
            return;
        }

        if (currentTarget.fcmToken) {
            const message = {
                token: currentTarget.fcmToken,
                data: { type: "alarm" },
                webpush: { headers: { "Urgency": "high" }, fcm_options: { link: "/index.html?type=alarm" } } // Σημαντικό: Link στο index.html
            };
            admin.messaging().send(message).catch(err => {});
        }
    };
    sendPush();
    target.alarmInterval = setInterval(sendPush, 4000);
  });

  // --- ACCEPT ALARM ---
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
