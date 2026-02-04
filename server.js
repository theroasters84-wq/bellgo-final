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

  // --- JOIN ---
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
    
    // Ανάκτηση προηγούμενης κατάστασης
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

    // Αν χτυπούσε πριν, ξαναστείλε εντολή να ανοίξει η οθόνη
    if (activeUsers[key].isRinging) {
        socket.emit('ring-bell');
    }
  });

  // --- UPDATE TOKEN ---
  socket.on('update-token', (data) => {
    const key = `${socket.store}_${socket.username}`;
    if (activeUsers[key]) activeUsers[key].fcmToken = data.token;
  });

  // --- HEARTBEAT ---
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

  // --- TRIGGER ALARM (FULL AGGRESSIVE LOOP) ---
  socket.on('trigger-alarm', (targetName) => {
    const key = `${socket.store}_${targetName}`;
    const target = activeUsers[key];
    
    if (!target) return;
    if (target.isRinging) return; 

    console.log(`🔔 ALARM START -> ${targetName}`);
    target.isRinging = true;
    updateStore(socket.store); 

    // 1. Socket Signal (Άμεσα)
    if (target.socketId) io.to(target.socketId).emit('ring-bell');

    // 2. FCM Loop Function (ΤΟ ΠΥΡΗΝΙΚΟ ΟΠΛΟ ΓΙΑ IPHONE)
    const sendPush = () => {
        // Αν σταμάτησε το alarm ή διαγράφηκε ο χρήστης
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
                
                // --- ANDROID ---
                android: {
                    priority: "high",
                    ttl: 0, 
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

                // --- WEB PUSH (ΓΙΑ IPHONE PWA) ---
                // Αυτά τα headers είναι που κάνουν το iPhone να ξυπνάει
                webpush: {
                    headers: {
                        "Urgency": "high",  
                        "TTL": "0"          
                    },
                    fcm_options: {
                        link: "/?type=alarm"
                    }
                },

                // --- NATIVE IOS (Backup) ---
                apns: {
                    headers: {
                        "apns-priority": "10",
                        "apns-expiration": "0"
                    },
                    payload: {
                        aps: {
                            alert: {
                                title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑ!",
                                body: "ΠΑΤΑ ΤΩΡΑ ΓΙΑ ΑΠΟΔΟΧΗ"
                            },
                            sound: "default",
                            badge: 1,
                            "content-available": 1
                        }
                    }
                }
            };
            
            admin.messaging().send(message)
                .then(() => process.stdout.write(".")) 
                .catch(err => console.error("❌ FCM Fail:", err.message));
        }
    };

    // Στείλε το πρώτο
    sendPush();
    // Ξεκίνα το loop κάθε 3 δευτερόλεπτα (Πιο γρήγορα = Πιο συνεχόμενο)
    target.alarmInterval = setInterval(sendPush, 3000);
  });

  // --- ACCEPT ALARM (STOP LOOP) ---
  socket.on('alarm-accepted', (data) => {
    const sName = socket.store || (data ? data.store : null);
    const uName = socket.username || (data ? data.username : null);

    if (!sName || !uName) return;

    const key = `${sName}_${uName}`;
    const user = activeUsers[key];

    if (user && user.isRinging) {
        console.log(`✅ STOP ALARM LOOP: ${uName}`);
        
        if (user.alarmInterval) {
            clearInterval(user.alarmInterval);
            user.alarmInterval = null;
        }
        user.isRinging = false;

        io.to(sName).emit('staff-accepted-alarm', { username: uName });
        updateStore(sName);
    }
  });

  // --- CHAT ---
  socket.on('chat-message', (msg) => {
    io.to(socket.store).emit('chat-message', { sender: socket.username, role: socket.role, text: msg.text });
  });

  // --- LOGOUT ---
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

  // --- DISCONNECT ---
  socket.on('disconnect', () => {
    const key = `${socket.store}_${socket.username}`;
    const user = activeUsers[key];

    if (user && user.socketId === socket.id) {
        user.socketId = null;
        user.status = 'away'; // Γίνεται Γκρι
        console.log(`😴 BACKGROUND: ${user.username}`);
        // Συνεχίζουμε το Loop notifications κανονικά!
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
        isRinging: u.isRinging // Στέλνουμε το isRinging για να φαίνεται "ΚΛΗΣΗ" ακόμα και σε background
    }));
  io.to(store).emit('staff-list-update', list);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));
