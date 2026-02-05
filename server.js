const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require("firebase-admin");

const serviceAccount = require("./serviceAccountKey.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
    pingTimeout: 60000,
    pingInterval: 25000
});

app.use(express.static(path.join(__dirname, 'public')));

let activeUsers = {};

io.on('connection', (socket) => {

    socket.on('join-store', (data) => {
        const store = (data.storeName || '').toLowerCase().trim();
        const username = (data.username || '').trim();
        const role = data.role;
        const token = data.token || null;
        // Εδώ ελέγχουμε αν η σύνδεση έρχεται από το Native Android App
        const isNative = data.isNative || false; 

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
            lastSeen: Date.now(),
            isRinging: activeUsers[key] ? activeUsers[key].isRinging : false,
            alarmInterval: activeUsers[key] ? activeUsers[key].alarmInterval : null,
            isNative: isNative // Αποθήκευση αν είναι Native
        };

        console.log(`👤 JOIN: ${username} [Native: ${isNative}] @ ${store}`);
        updateStore(store);

        if (activeUsers[key].isRinging) {
            socket.emit('ring-bell');
        }
    });

    socket.on('trigger-alarm', (targetName) => {
        const key = `${socket.store}_${targetName}`;
        const target = activeUsers[key];
        
        if (!target || target.isRinging) return; 

        console.log(`🔔 ALARM START -> ${targetName}`);
        target.isRinging = true;
        updateStore(socket.store); 

        // 1. Πάντα στέλνουμε Socket (για να χτυπήσει αν είναι ανοιχτό)
        if (target.socketId) io.to(target.socketId).emit('ring-bell');

        // 2. ΕΔΩ ΕΙΝΑΙ Η ΔΙΟΡΘΩΣΗ:
        // Αν είναι Native Android App, ΔΕΝ στέλνουμε FCM Loop από τον Server.
        // Το Native App θα διαχειριστεί τον ήχο μόνο μέσω Socket.
        if (target.isNative) {
            console.log(`📱 Native App detected for ${targetName}. Skipping FCM Loop.`);
            return; 
        }

        // 3. Αν είναι Web/iOS, ξεκινάμε το Loop των Push Notifications
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
                    data: { type: "alarm" },
                    webpush: {
                        headers: { "Urgency": "high", "TTL": "0" },
                        fcm_options: { link: "/?type=alarm" }
                    },
                    apns: {
                        payload: { aps: { alert: { title: "🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑ!", body: "ΠΑΤΑ ΤΩΡΑ" }, sound: "default" } }
                    }
                };
                admin.messaging().send(message).catch(e => console.log("FCM Error"));
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

        if (user) {
            if (user.alarmInterval) clearInterval(user.alarmInterval);
            user.alarmInterval = null;
            user.isRinging = false;
            io.to(sName).emit('staff-accepted-alarm', { username: uName });
            updateStore(sName);
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

    socket.on('disconnect', () => {
        const key = `${socket.store}_${socket.username}`;
        if (activeUsers[key] && activeUsers[key].socketId === socket.id) {
            activeUsers[key].socketId = null;
            activeUsers[key].status = 'away';
            updateStore(socket.store);
        }
    });
});

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

server.listen(process.env.PORT || 3000);
