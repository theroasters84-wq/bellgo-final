const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require("firebase-admin");

/* ---------------- FIREBASE ADMIN ---------------- */
// Βεβαιώσου ότι το serviceAccountKey.json είναι στον ίδιο φάκελο
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

    // Αν υπήρχε ήδη ο χρήστης, κρατάμε το status του, αλλιώς "online"
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
      isRinging: existingRinging, // Θυμόμαστε αν χτυπάει
      alarmInterval: existingInterval // Θυμόμαστε το Loop ειδοποιήσεων
    };

    console.log(`👤 JOIN: ${username} @ ${store} (${role})`);
    updateStore(store);

    // ΕΛΕΓΧΟΣ ΚΑΤΑ ΤΗ ΣΥΝΔΕΣΗ (REFRESH): Αν χτυπούσε, ξαναστείλε εντολή!
    if (activeUsers[key].isRinging) {
        console.log(`♻️ RE-SENDING ALARM to refreshed user: ${username}`);
        socket.emit('ring-bell'); 
    }
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

  /* ---------- TRIGGER ALARM (LOOP LOGIC) ---------- */
  socket.on('trigger-alarm', (targetName) => {
    const key = `${socket.store}_${targetName}`;
    const target = activeUsers[key];
    if (!target) return;

    // Αν χτυπάει ήδη, μην ξανακάνεις τίποτα
    if (target.isRinging) return;

    console.log(`🔔 ALARM START -> ${targetName}`);
    target.isRinging = true;
    updateStore(socket.store); // Ενημέρωσε το UI του Admin ότι χτυπάει (προαιρετικό)

    // 1. Στέλνουμε ΆΜΕΣΑ Socket εντολή
    if (target.socketId) {
      io.to(target.socketId).emit('ring-bell');
    }

    // 2. Ξεκινάμε LOOP για FCM notifications (κάθε 5 δευτερόλεπτα)
    // Αυτό λύνει το πρόβλημα αν το iPhone κοιμηθεί. Ο Server θα συνεχίσει να στέλνει.
    const sendPush = () => {
        if (!target.fcmToken) return;
        
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
                    defaultVibrateTimings: true,
                    title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑ!",
                    body: "ΠΑΤΑ ΤΩΡΑ ΓΙΑ ΑΠΟΔΟΧΗ"
                }
            },
            apns: {
                payload: {
                    aps: {
                        sound: "default",
                        badge: 1,
                        alert: {
                            title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑ!",
                            body: "ΠΑΤΑ ΤΩΡΑ ΓΙΑ ΑΠΟΔΟΧΗ"
                        }
                    }
                }
            }
        };

        admin.messaging().send(message)
            .then(() => console.log(`📲 FCM Sent to ${targetName}`))
            .catch(err => console.error("❌ FCM ERROR", err));
    };

    // Στείλε το πρώτο και ξεκίνα το loop
    sendPush();
    target.alarmInterval = setInterval(sendPush, 5000); // Κάθε 5 δευτερόλεπτα
  });

  /* ---------- ACCEPT ALARM ---------- */
  socket.on('alarm-accepted', () => {
    const key = `${socket.store}_${socket.username}`;
    const user = activeUsers[key];

    if (user && user.isRinging) {
        console.log(`✅ ACCEPT STOP: ${socket.username}`);
        
        // Σταματάμε το Loop ειδοποιήσεων
        if (user.alarmInterval) {
            clearInterval(user.alarmInterval);
            user.alarmInterval = null;
        }
        
        user.isRinging = false;
        
        // Ειδοποιούμε τον Admin
        io.to(socket.store).emit('staff-accepted-alarm', {
            username: socket.username
        });
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

  /* ---------- MANUAL LOGOUT ---------- */
  socket.on('manual-logout', (data) => {
    // ADMIN DELETE
    if (data && data.targetUser) {
      const key = `${socket.store}_${data.targetUser}`;
      if (activeUsers[key]) {
        // Καθαρισμός αν χτυπάει
        if (activeUsers[key].alarmInterval) clearInterval(activeUsers[key].alarmInterval);
        delete activeUsers[key];
        updateStore(socket.store);
      }
      return;
    }

    // SELF LOGOUT
    const key = `${socket.store}_${socket.username}`;
    if (activeUsers[key]) {
        if (activeUsers[key].alarmInterval) clearInterval(activeUsers[key].alarmInterval);
        delete activeUsers[key];
    }
    updateStore(socket.store);
  });

  /* ---------- DISCONNECT ---------- */
  socket.on('disconnect', () => {
    const key = `${socket.store}_${socket.username}`;
    const user = activeUsers[key];

    if (user && user.socketId === socket.id) {
      user.socketId = null;
      user.status = 'away';
      // ΔΕΝ σταματάμε το alarmInterval εδώ! Θέλουμε να χτυπάει ακόμα κι αν βγει offline.
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
    // Αν είναι away πάνω από 12 ώρες, διέγραψέ τον
    if (u.status === 'away' && now - u.lastSeen > 12 * 60 * 60 * 1000) {
      if (u.alarmInterval) clearInterval(u.alarmInterval); // Stop alarm
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
