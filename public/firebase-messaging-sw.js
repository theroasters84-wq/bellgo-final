// public/firebase-messaging-sw.js

// Χρησιμοποιούμε την έκδοση 8.10.1 για να ταιριάζει με το index.html
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

firebase.initializeApp({
  apiKey: "AIzaSyBDOAlwLn4P5PMlwkg_Hms6-4f9fEcBKn8",
  projectId: "bellgo-5dbe5",
  messagingSenderId: "799314495253",
  appId: "1:799314495253:web:baf6852f2a065c3a2e8b1c",
  storageBucket: "bellgo-5dbe5.firebasestorage.app",
});

const messaging = firebase.messaging();

// 1. ΛΗΨΗ ΜΗΝΥΜΑΤΟΣ ΣΤΟ ΠΑΡΑΣΚΗΝΙΟ
messaging.setBackgroundMessageHandler(function(payload) {
  console.log('[SW] Background Message:', payload);

  const notificationTitle = payload.data.title || payload.notification.title || '🔔 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ';
  const notificationOptions = {
    body: payload.data.body || payload.notification.body || 'Πάτα για αποδοχή',
    icon: '/icon.png', // Βεβαιώσου ότι υπάρχει icon.png στο public
    vibrate: [1000, 500, 1000], // Δόνηση από το Service Worker
    requireInteraction: true,   // Να μένει στην οθόνη
    data: { url: '/' }          // Για να ξέρουμε πού να πάμε στο κλικ
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// 2. ΟΤΑΝ Ο ΧΡΗΣΤΗΣ ΠΑΤΑΕΙ ΤΗΝ ΕΙΔΟΠΟΙΗΣΗ
self.addEventListener('notificationclick', function(event) {
  event.notification.close(); // Κλείσε την ειδοποίηση

  // Άνοιξε την εφαρμογή ή κάνε focus αν είναι ήδη ανοιχτή
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      // Αν υπάρχει ήδη ανοιχτό tab, πήγαινε εκεί
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      // Αν δεν υπάρχει, άνοιξε νέο
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
