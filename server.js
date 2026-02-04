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

    const existingInterval = activeUsers[key] ? activeUsers[key].alarmInterval : null;
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
      alarmInterval: existingInterval
    };

    console.log(`👤 JOIN: ${username} @ ${store}`);
    updateStore(store);

    if (activeUsers[key].isRinging) {
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

  /* ---------- TRIGGER ALARM (IOS FIXED LOOP) ---------- */
  socket.on('trigger-alarm', (targetName) => {
    const key = `${socket.store}_${targetName}`;
    const target = activeUsers[key];
    
    if (!target) return;
    if (target.isRinging) return; 

    console.log(`🔔 ALARM START -> ${targetName}`);
    target.isRinging = true;
    updateStore(socket.store); 

    // 1. Socket Signal 
    if (target.socketId) io.to(target.socketId).emit('ring-bell');

    // 2. FCM Loop Function (ΒΕΛΤΙΩΜΕΝΟ ΓΙΑ IPHONE)
    const sendPush = () => {
        // Έλεγχος αν πρέπει να σταματήσει
        if (!activeUsers[key] || !activeUsers[key].isRinging) {
            if (activeUsers[key] && activeUsers[key].alarmInterval) {
                clearInterval(activeUsers[key].alarmInterval);
            }
            return;
        }

        if (target.fcmToken) {
            const message = {
                token: target.fcmToken,
                data: { 
                    type: "alarm", 
                    alarmId: Date.now().toString() 
                },
                // Ρυθμίσεις για Android
                android: {
                    priority: "high",
                    notification: {
                        channelId: "fcm_default_channel",
                        priority: "max",
                        visibility: "public",
                        sound: "alert_sound",
                        title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑ!",
                        body: "ΠΑΤΑ ΤΩΡΑ ΓΙΑ ΑΠΟΔΟΧΗ",
                        clickAction: "/" 
                    }
                },
                // Ρυθμίσεις για iOS (TO ΚΡΙΣΙΜΟ ΣΗΜΕΙΟ)
                apns: {
                    headers: {
                        "apns-priority": "10", // 🔴 ΑΥΤΟ ΞΥΠΝΑΕΙ ΤΟ IPHONE
                        "apns-expiration": "0"  // Να παραδοθεί άμεσα, μην περιμένεις
                    },
                    payload: {
                        aps: {
                            alert: {
                                title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑ!",
                                body: "ΠΑΤΑ ΤΩΡΑ ΓΙΑ ΑΠΟΔΟΧΗ"
                            },
                            sound: "default", // Ή το όνομα αρχείου αν το έχεις στο app bundle
                            badge: 1,
                            "content-available": 1, // Λέει στο iOS να ξυπνήσει το app στο background
                            "mutable-content": 1
                        }
                    }
                }
            };
            
            admin.messaging().send(message)
                .then(() => process.stdout.write(".")) // Τυπώνει τελίτσα για κάθε notification
                .catch(err => console.error("❌ FCM Fail:", err.message));
        }
    };

    // Στείλε το πρώτο
    sendPush();
    // Ξεκίνα το loop κάθε 5 δευτερόλεπτα
    target.alarmInterval = setInterval(sendPush, 5000);
  });

  /* ---------- ACCEPT ALARM ---------- */
  socket.on('alarm-accepted', (data) => {
    const sName = socket.store || (data ? data.store : null);
    const uName = socket.username || (data ? data.username : null);

    if (!sName || !uName) return;

    const key = `${sName}_${uName}`;
    const user = activeUsers[key];

    if (user && user.isRinging) {
        console.log(`✅ STOP ALARM: ${uName}`);
        
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
    io.to(socket.store).emit('chat-message', { sender: socket.username, role: socket.role, text: msg.text });
  });

  /* ---------- MANUAL LOGOUT ---------- */
  socket.on('manual-logout', (data) => {
    if (data && data.targetUser) { 
        const key = `${socket.store}_${data.targetUser}`;
        if (activeUsers[key]) {
            if(activeUsers[key].alarmInterval) clearInterval(activeUsers[key].alarmInterval);
            delete activeUsers[key];
            updateStore(socket.store);
        }
    } else { 
        const key = `${socket.store}_${socket.username}`;
        if (activeUsers[key]) {
            if(activeUsers[key].alarmInterval) clearInterval(activeUsers[key].alarmInterval);
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
        console.log(`😴 BACKGROUND: ${user.username}`);
        updateStore(socket.store);
    }
  });
});

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

function updateStore(store) {
  if(!store) return;
  const list = Object.values(activeUsers)
    .filter(u => u.store === store)
    .map(u => ({ 
        username: u.username, 
        role: u.role, 
        status: u.status,
        isRinging: u.isRinging
    }));
  io.to(store).emit('staff-list-update', list);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));
