const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require("firebase-admin");

// FIREBASE ADMIN
const serviceAccount = require("./serviceAccountKey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(express.static(path.join(__dirname, 'public')));

let activeUsers = {};
let pendingAlarms = {};

/**
 * SEND ALARM WITH RETRY
 */
async function sendAlarmFCM(targetUser, fromUser) {
  const alarmId = `${targetUser.username}_${Date.now()}`;
  pendingAlarms[alarmId] = true;

  for (let i = 1; i <= 3; i++) {
    if (!pendingAlarms[alarmId]) break;

    const message = {
      token: targetUser.fcmToken,
      notification: {
        title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ",
        body: "ΠΑΤΑ ΓΙΑ ΑΠΑΝΤΗΣΗ"
      },
      data: {
        type: "alarm",
        sender: fromUser,
        alarmId
      },
      android: {
        priority: "high",
        notification: {
          channelId: "bellgo_alarm_v3",
          priority: "max",
          visibility: "public",
          sound: "default",
          defaultVibrateTimings: true
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

    try {
      await admin.messaging().send(message);
      console.log(`🚨 Alarm sent (${i})`);
    } catch (e) {
      console.error("❌ FCM error:", e);
    }

    await new Promise(r => setTimeout(r, 4000));
  }

  delete pendingAlarms[alarmId];
}

/**
 * SOCKET
 */
io.on('connection', socket => {

  socket.on('join-store', data => {
    const store = data.storeName.toLowerCase();
    const user = data.username;

    socket.store = store;
    socket.username = user;
    socket.join(store);

    activeUsers[`${store}_${user}`] = {
      username: user,
      store,
      socketId: socket.id,
      fcmToken: data.token,
      status: "online",
      lastSeen: Date.now()
    };
  });

  socket.on('update-token', data => {
    const key = `${socket.store}_${socket.username}`;
    if (activeUsers[key]) {
      activeUsers[key].fcmToken = data.token;
    }
  });

  socket.on('trigger-alarm', targetName => {
    const key = `${socket.store}_${targetName}`;
    const user = activeUsers[key];
    if (!user) return;

    if (user.socketId) {
      io.to(user.socketId).emit('ring-bell', { from: socket.username });
    }

    if (user.fcmToken) {
      sendAlarmFCM(user, socket.username);
    }
  });

  socket.on('alarm-accepted', data => {
    if (data?.alarmId && pendingAlarms[data.alarmId]) {
      delete pendingAlarms[data.alarmId];
      console.log("✅ Alarm stopped");
    }
  });

  socket.on('disconnect', () => {
    const key = `${socket.store}_${socket.username}`;
    if (activeUsers[key]) {
      activeUsers[key].status = "away";
      activeUsers[key].socketId = null;
    }
  });
});

server.listen(3000, () => console.log("🚀 BellGo server running"));
