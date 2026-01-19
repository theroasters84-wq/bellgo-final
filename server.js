const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const admin = require('firebase-admin');

// Εισαγωγή του αρχείου ταυτοποίησης Firebase
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// Αποθήκευση των FCM Tokens των οδηγών
let driverTokens = {}; 

io.on('connection', (socket) => {
  console.log('Χρήστης συνδέθηκε:', socket.id);

  // Όταν ένας οδηγός στέλνει το Token του
  socket.on('update-fcm-token', (data) => {
    console.log(`Λήψη Token για τον οδηγό ${data.name}: ${data.token}`);
    driverTokens[data.name] = data.token;
  });

  // Όταν ο Admin στέλνει νέα παραγγελία
  socket.on('send-order', (orderData) => {
    console.log('Νέα παραγγελία από Admin:', orderData);
    
    // 1. Αποστολή μέσω Socket (για όσους είναι online)
    io.emit('new-order', orderData);

    // 2. Αποστολή μέσω Firebase Push Notification σε όλους τους οδηγούς
    Object.values(driverTokens).forEach(token => {
      const message = {
        notification: {
          title: 'Νέα Κλήση Bellgo!',
          body: `Παραγγελία από: ${orderData.shopName || 'Το κατάστημα'}`
        },
        token: token
      };

      admin.messaging().send(message)
        .then((response) => console.log('Push εστάλη επιτυχώς:', response))
        .catch((error) => console.log('Σφάλμα Push:', error));
    });
  });

  socket.on('send-chat-message', (msg) => {
    io.emit('new-chat-message', { user: socket.id, text: msg });
  });

  socket.on('disconnect', () => {
    console.log('Χρήστης αποσυνδέθηκε');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});