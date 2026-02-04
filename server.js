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

    // Κρατάμε την κατάσταση αν υπήρχε
    const existingStatus = activeUsers[key] ? activeUsers[key].status : "online";
    const existingRinging = activeUsers[key] ? activeUsers[key].isRinging : false;
    const existingInterval = activeUsers[key] ? activeUsers[key].alarmInterval : null;

    activeUsers[key] = {
      store,
      username,
      role,
      socketId: socket.id,
      fcmToken: token,
      status: existingStatus,
      lastSeen: Date.now(),
      isRinging: existingRinging,
      alarmInterval: existingInterval
    };

    console.log(`👤 JOIN: ${username} @ ${store} (${role})`);
    updateStore(store);

    // Αν χτυπούσε, ξαναστείλε εντολή
    if (activeUsers[key].isRinging) {
        socket.emit('ring-bell'); 
    }
  });

  /* ---------- UPDATE TOKEN ---------- */
  socket.on('update-token', (data) => {
    const key = `${socket.store}_${socket.username}`;
    if (activeUsers[key]) {
      activeUsers[key].fcmToken = data.token;
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

  /* ---------- TRIGGER ALARM (LOOP) ---------- */
  socket.on('trigger-alarm', (targetName) => {
    const key = `${socket.store}_${targetName}`;
    const target = activeUsers[key];
    
    if (!target) return;
    if (target.isRinging) return; // Αν χτυπάει ήδη, αγνόησε

    console.log(`🔔 ALARM START -> ${targetName}`);
    target.isRinging = true;
    updateStore(socket.store);

    // 1. Socket (Άμεσα)
    if (target.socketId) io.to(target.socketId).emit('ring-bell');

    // 2. FCM Loop (Κάθε 5 δευτερόλεπτα)
    const sendPush = () => {
        // Αν σταμάτησε, σταματάμε το loop
        if (!activeUsers[key] || !activeUsers[key].isRinging) {
            if (activeUsers[key] && activeUsers[key].alarmInterval) {
                clearInterval(activeUsers[key].alarmInterval);
            }
            return;
        }

        if (target.fcmToken) {
            const message = {
                token: target.fcmToken,
                data: { type: "alarm", alarmId: Date.now().toString() },
                android: {
                    priority: "high",
                    notification: {
                        channelId: "fcm_default_channel",
                        priority: "max",
                        visibility: "public",
                        sound: "default",
                        title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑ!",
                        body: "ΠΑΤΑ ΤΩΡΑ ΓΙΑ ΑΠΟΔΟΧΗ",
                        clickAction: "/" 
                    }
                },
                apns: {
                    payload: { aps: { sound: "default", badge: 1, alert: { title: "🚨 ΚΛΗΣΗ!", body: "ΠΑΤΑ ΤΩΡΑ" } } }
                }
            };
            admin.messaging().send(message).catch(e => console.log("FCM Fail", e));
        }
    };

    sendPush();
    target.alarmInterval = setInterval(sendPush, 5000);
  });

  /* ---------- ACCEPT ALARM (FIXED) ---------- */
  socket.on('alarm-accepted', (data) => {
    // Παίρνουμε τα δεδομένα είτε από το socket είτε από το πακέτο που έστειλε το index.html
    const sName = socket.store || (data ? data.store : null);
    const uName = socket.username || (data ? data.username : null);

    if (!sName || !uName) return;

    const key = `${sName}_${uName}`;
    const user = activeUsers[key];

    if (user && user.isRinging) {
        console.log(`✅ STOP ALARM LOOP: ${uName}`);
        
        // Σκοτώνουμε το Interval
        if (user.alarmInterval) {
            clearInterval(user.alarmInterval);
            user.alarmInterval = null;
        }
        user.isRinging = false;

        io.to(sName).emit('staff-accepted-alarm', { username: uName });
        updateStore(sName);
    }
  });

  /* ---------- CHAT ---------- */
  socket.on('chat-message', (msg) => {
    io.to(socket.store).emit('chat-message', {
      sender: socket.username,
      role: socket.role,
      text: msg.text
    });
  });

  /* ---------- LOGOUT ---------- */
  socket.on('manual-logout', (data) => {
    if (data && data.targetUser) { 
      const key = `${socket.store}_${data.targetUser}`;
      if (activeUsers[key]) {
        if (activeUsers[key].alarmInterval) clearInterval(activeUsers[key].alarmInterval);
        delete activeUsers[key];
        updateStore(socket.store);
      }
    } else {
      const key = `${socket.store}_${socket.username}`;
      if (activeUsers[key]) {
        if (activeUsers[key].alarmInterval) clearInterval(activeUsers[key].alarmInterval);
        delete activeUsers[key];
      }
      updateStore(socket.store);
    }
  });

  /* ---------- DISCONNECT ---------- */
  socket.on('disconnect', () => {
    const key = `${socket.store}_${socket.username}`;
    const user = activeUsers[key];

    if (user && user.socketId === socket.id) {
      user.socketId = null;
      user.status = 'away';
      // ΔΕΝ ΣΤΑΜΑΤΑΜΕ ΤΟ LOOP ΕΔΩ (για να συνεχίσει να βαράει FCM)
      updateStore(socket.store);
    }
  });
});

/* ---------------- CLEANUP ---------------- */
setInterval(() => {
  const now = Date.now();
  for (const key in activeUsers) {
    const u = activeUsers[key];
    if (u.status === 'away' && now - u.lastSeen > 12 * 3600000) {
      if (u.alarmInterval) clearInterval(u.alarmInterval);
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
