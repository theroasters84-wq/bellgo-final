const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require("firebase-admin");

/* ---------------- FIREBASE ADMIN SETUP ---------------- */
// Βεβαιώσου ότι το αρχείο serviceAccountKey.json βρίσκεται στον ίδιο φάκελο
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

console.log("✅ Firebase Admin Initialized");

/* ---------------- SERVER SETUP ---------------- */
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Σερβίρει τα στατικά αρχεία από τον φάκελο public
app.use(express.static(path.join(__dirname, 'public')));

/* ---------------- MEMORY STORE ---------------- */
// Εδώ αποθηκεύονται όλοι οι ενεργοί χρήστες
let activeUsers = {};

/* ---------------- HELPER FUNCTIONS ---------------- */

/**
 * Στέλνει την ανανεωμένη λίστα προσωπικού μόνο στους χρήστες
 * που ανήκουν στο ίδιο κατάστημα (room).
 */
function updateStore(store) {
  if (!store) return;

  const list = Object.values(activeUsers)
    .filter(u => u.store === store)
    .map(u => ({ 
      name: u.username, // Στέλνουμε "name" για να το διαβάζει το Android Native App
      role: u.role, 
      status: u.status,
      isRinging: u.isRinging 
    }));

  // Εκπομπή της λίστας αποκλειστικά στο room του καταστήματος
  io.to(store).emit('staff-list-update', list);
}

/* ---------------- SOCKET.IO LOGIC ---------------- */
io.on('connection', (socket) => {

  // --- JOIN STORE ---
  socket.on('join-store', (data) => {
    const store = (data.storeName || '').toLowerCase().trim();
    const username = (data.username || '').trim();
    const role = data.role;
    const token = data.token || null;
    
    // Αναγνώριση Native Android App για αποφυγή FCM Loop
    const isNative = data.isNative === true || data.deviceType === "AndroidNative";

    if (!store || !username) return;

    socket.store = store;
    socket.username = username;
    socket.role = role;
    socket.join(store); // Ο χρήστης μπαίνει στο δικό του απομονωμένο room

    const key = `${store}_${username}`;
    
    // Διατήρηση κατάστασης αν ο χρήστης υπήρχε ήδη
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

    // Αν ο χρήστης επανασυνδέεται ενώ το alarm είναι ενεργό
    if (activeUsers[key].isRinging) {
        socket.emit('ring-bell');
    }
  });

  // --- UPDATE TOKEN ---
  socket.on('update-token', (data) => {
    const key = `${socket.store}_${socket.username}`;
    if (activeUsers[key]) {
        activeUsers[key].fcmToken = data.token;
    }
  });

  // --- HEARTBEAT ---
  socket.on('heartbeat', () => {
    const key = `${socket.store}_${socket.username}`;
    if (activeUsers[key]) {
      activeUsers[key].lastSeen = Date.now();
      // Αν ήταν "away" (γκρι) και έστειλε heartbeat, γίνεται πάλι "online"
      if (activeUsers[key].status === 'away') {
        activeUsers[key].status = 'online';
        activeUsers[key].socketId = socket.id;
        updateStore(socket.store);
      }
    }
  });

  // --- TRIGGER ALARM (ΚΛΗΣΗ) ---
  socket.on('trigger-alarm', (targetName) => {
    const key = `${socket.store}_${targetName}`;
    const target = activeUsers[key];
    
    if (!target) return;
    if (target.isRinging) return; // Μην ξεκινάς νέο alarm αν ήδη χτυπάει

    console.log(`🔔 ALARM START -> ${targetName} @ ${socket.store}`);
    target.isRinging = true;
    updateStore(socket.store); 

    // 1. Άμεσο σήμα μέσω Socket
    if (target.socketId) {
        io.to(target.socketId).emit('ring-bell');
    }

    // 2. ΕΙΔΙΚΟΣ ΧΕΙΡΙΣΜΟΣ ΓΙΑ NATIVE APP (ΟΧΙ LOOP)
    if (target.isNative) {
        console.log(`📱 ${targetName} is Native. Single FCM and no loop.`);
        if (target.fcmToken) {
            const msg = {
                token: target.fcmToken,
                data: { type: "alarm" },
                android: { 
                  priority: "high", 
                  notification: { 
                    channelId: "fcm_default_channel", 
                    title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑ!", 
                    body: "Πατήστε για αποδοχή" 
                  } 
                }
            };
            admin.messaging().send(msg).catch(e => {});
        }
        return; 
    }

    // 3. ΧΕΙΡΙΣΜΟΣ ΓΙΑ WEB/IOS (AGGRESSIVE LOOP)
    const sendPush = () => {
        if (!activeUsers[key] || !activeUsers[key].isRinging) {
            if (activeUsers[key] && activeUsers[key].alarmInterval) {
                clearInterval(activeUsers[key].alarmInterval);
            }
            return;
        }

        if (target.fcmToken) {
            const message = {
                token: target.fcmToken,
                data: { type: "alarm", time: Date.now().toString() },
                webpush: {
                    headers: { "Urgency": "high", "TTL": "0" },
                    fcm_options: { link: "/?type=alarm" }
                },
                apns: {
                    payload: { aps: { alert: { title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑ!", body: "ΠΑΤΑ ΤΩΡΑ" }, sound: "default" } }
                }
            };
            admin.messaging().send(message).catch(err => {});
        }
    };

    sendPush();
    target.alarmInterval = setInterval(sendPush, 4000);
  });

  // --- ACCEPT ALARM (ΣΤΑΜΑΤΗΜΑ) ---
  socket.on('alarm-accepted', (data) => {
    const sName = socket.store || (data ? data.store : null);
    const uName = socket.username || (data ? data.username : null);

    if (!sName || !uName) return;

    const key = `${sName}_${uName}`;
    const user = activeUsers[key];

    if (user && user.isRinging) {
        console.log(`✅ ALARM ACCEPTED by ${uName}`);
        if (user.alarmInterval) {
            clearInterval(user.alarmInterval);
            user.alarmInterval = null;
        }
        user.isRinging = false;
        // Ενημερώνουμε όλους στο κατάστημα ότι η κλήση απαντήθηκε
        io.to(sName).emit('staff-accepted-alarm', { username: uName });
        updateStore(sName);
    }
  });

  // --- CHAT MESSAGE ---
  socket.on('chat-message', (msg) => {
    if (socket.store) {
        io.to(socket.store).emit('chat-message', { 
            sender: socket.username, 
            role: socket.role, 
            text: msg.text 
        });
    }
  });

  // --- MANUAL LOGOUT / REMOVE USER ---
  socket.on('manual-logout', (data) => {
    let targetKey;
    if (data && data.targetUser) {
        targetKey = `${socket.store}_${data.targetUser}`;
    } else {
        targetKey = `${socket.store}_${socket.username}`;
    }

    if (activeUsers[targetKey]) {
        if (activeUsers[targetKey].alarmInterval) clearInterval(activeUsers[targetKey].alarmInterval);
        delete activeUsers[targetKey];
        updateStore(socket.store);
    }
  });

  // --- DISCONNECT ---
  socket.on('disconnect', () => {
    const key = `${socket.store}_${socket.username}`;
    if (activeUsers[key] && activeUsers[key].socketId === socket.id) {
        activeUsers[key].socketId = null;
        activeUsers[key].status = 'away'; // Γίνεται γκρι (background)
        console.log(`😴 AWAY: ${socket.username}`);
        updateStore(socket.store);
    }
  });
});

/* ---------------- CLEANUP TASK ---------------- */
// Καθαρισμός χρηστών που δεν έχουν δώσει σημεία ζωής για 12 ώρες
setInterval(() => {
  const now = Date.now();
  for (const key in activeUsers) {
    if (now - activeUsers[key].lastSeen > 12 * 3600000) {
      if (activeUsers[key].alarmInterval) clearInterval(activeUsers[key].alarmInterval);
      const store = activeUsers[key].store;
      delete activeUsers[key];
      updateStore(store);
    }
  }
}, 60000);

/* ---------------- SERVER START ---------------- */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 BellGo Server is Live on port ${PORT}`));
