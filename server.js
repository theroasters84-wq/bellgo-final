const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require("firebase-admin");

/* ---------------- FIREBASE ADMIN ---------------- */
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

console.log("✅ Firebase Admin OK");

/* ---------------- SERVER ---------------- */
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

/* ---------------- SOCKET ---------------- */
io.on('connection', (socket) => {

  /* ---------- JOIN STORE ---------- */
  socket.on('join-store', (data) => {
    const store = (data.storeName || '').toLowerCase().trim();
    const username = (data.username || '').trim();
    const role = data.role;
    const token = data.token || null;

    if (!store || !username) return;

    socket.store = store;
    socket.username = username;
    socket.role = role;

    socket.join(store);

    const key = `${store}_${username}`;

    activeUsers[key] = {
      store,
      username,
      role,
      socketId: socket.id,
      fcmToken: token,
      status: "online",
      lastSeen: Date.now()
    };

    console.log(`👤 JOIN: ${username} @ ${store} (${role})`);
    updateStore(store);
  });

  /* ---------- UPDATE TOKEN ---------- */
  socket.on('update-token', (data) => {
    const key = `${socket.store}_${socket.username}`;
    if (activeUsers[key]) {
      activeUsers[key].fcmToken = data.token;
      console.log(`🔑 TOKEN UPDATE: ${socket.username}`);
    }
  });

  /* ---------- HEARTBEAT ---------- */
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

  /* ---------- TRIGGER ALARM ---------- */
  socket.on('trigger-alarm', (targetName) => {
    const key = `${socket.store}_${targetName}`;
    const target = activeUsers[key];
    if (!target) return;

    console.log(`🔔 ALARM -> ${targetName}`);

    // SOCKET (αν είναι online)
    if (target.socketId) {
      io.to(target.socketId).emit('ring-bell');
    }

    // FCM (ΠΑΝΤΑ)
    if (target.fcmToken) {
      const message = {
        token: target.fcmToken,
        data: {
          type: "alarm"
        },
        android: {
          priority: "high",
          notification: {
            channelId: "fcm_default_channel",
            priority: "max",
            visibility: "public",
            sound: "default",
            defaultVibrateTimings: true,
            title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ",
            body: "ΠΑΤΑ ΓΙΑ ΑΠΑΝΤΗΣΗ"
          }
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1
            }
          }
        }
      };

      admin.messaging().send(message)
        .then(() => console.log("✅ FCM SENT"))
        .catch(err => console.error("❌ FCM ERROR", err));
    }
  });

  /* ---------- ACCEPT ALARM ---------- */
  socket.on('alarm-accepted', () => {
    console.log(`✅ ACCEPT: ${socket.username}`);
    io.to(socket.store).emit('staff-accepted-alarm', {
      username: socket.username
    });
  });

  /* ---------- CHAT ---------- */
  socket.on('chat-message', (msg) => {
    io.to(socket.store).emit('chat-message', {
      sender: socket.username,
      role: socket.role,
      text: msg.text
    });
  });

  /* ---------- MANUAL LOGOUT / ADMIN DELETE ---------- */
  socket.on('manual-logout', (data) => {

    // ADMIN DELETE
    if (data && data.targetUser) {
      const key = `${socket.store}_${data.targetUser}`;
      if (activeUsers[key]) {
        console.log(`🗑️ ADMIN DELETE: ${data.targetUser}`);
        delete activeUsers[key];
        updateStore(socket.store);
      }
      return;
    }

    // SELF LOGOUT
    const key = `${socket.store}_${socket.username}`;
    delete activeUsers[key];
    updateStore(socket.store);
  });

  /* ---------- DISCONNECT ---------- */
  socket.on('disconnect', () => {
    const key = `${socket.store}_${socket.username}`;
    const user = activeUsers[key];

    if (user && user.socketId === socket.id) {
      user.socketId = null;
      user.status = 'away';
      console.log(`😴 BACKGROUND: ${user.username}`);
      updateStore(socket.store);
    }
  });
});

/* ---------------- CLEANUP ---------------- */
setInterval(() => {
  const now = Date.now();

  for (const key in activeUsers) {
    const u = activeUsers[key];

    // online -> away (2 λεπτά)
    if (u.status === 'online' && now - u.lastSeen > 2 * 60 * 1000) {
      u.status = 'away';
      u.socketId = null;
      updateStore(u.store);
    }

    // away -> delete (12 ώρες)
    if (u.status === 'away' && now - u.lastSeen > 12 * 60 * 60 * 1000) {
      console.log(`🗑️ CLEANUP: ${u.username}`);
      delete activeUsers[key];
      updateStore(u.store);
    }
  }
}, 30000);

/* ---------------- UPDATE STORE ---------------- */
function updateStore(store) {
  if (!store) return;

  const staff = Object.values(activeUsers)
    .filter(u => u.store === store)
    .map(u => ({
      username: u.username,
      role: u.role,
      status: u.status
    }));

  io.to(store).emit('staff-list-update', staff);
}

/* ---------------- START ---------------- */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 BellGo Server running on ${PORT}`);
});
