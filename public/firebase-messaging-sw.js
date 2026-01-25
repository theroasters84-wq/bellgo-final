importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

const firebaseConfig = {
    apiKey: "AIzaSyBDOAlwLn4P5PMlwkg_Hms6-4f9fEcBKn8",
    authDomain: "bellgo-5dbe5.firebaseapp.com",
    projectId: "bellgo-5dbe5",
    storageBucket: "bellgo-5dbe5.firebasestorage.app",
    messagingSenderId: "799314495253",
    appId: "1:799314495253:web:baf6852f2a065c3a2e8b1c",
    measurementId: "G-379ETZJP8H"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// BACKGROUND HANDLER
messaging.setBackgroundMessageHandler(function(payload) {
  console.log('[SW] Background message: ', payload);
  
  const notificationTitle = '🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ!';
  const notificationOptions = {
    body: 'Πάτα ΕΔΩ για προβολή.',
    icon: 'https://cdn-icons-png.flaticon.com/512/10337/10337229.png',
    tag: 'alarm-notification',
    renotify: true,
    requireInteraction: true, // Να μένει εκεί μέχρι να το πατήσεις
    data: { url: '/' }
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// 🔥 CLICK HANDLER (FOCUS TAB) 🔥
self.addEventListener('notificationclick', function(event) {
  console.log('Notification click received.');
  event.notification.close();

  event.waitUntil(
    clients.matchAll({type: 'window', includeUncontrolled: true}).then(function(clientList) {
      // 1. Ψάχνουμε αν υπάρχει ήδη ανοιχτή καρτέλα
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.indexOf('/') > -1 && 'focus' in client) {
          return client.focus(); // Την φέρνουμε μπροστά
        }
      }
      // 2. Αν δεν υπάρχει, ανοίγουμε νέα
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
