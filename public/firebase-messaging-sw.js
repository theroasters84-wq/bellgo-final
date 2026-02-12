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

messaging.setBackgroundMessageHandler(function(payload) {
  console.log('[firebase-messaging-sw.js] Background message:', payload);
  
  const title = payload.data.title || payload.notification?.title || 'BellGo';
  const body = payload.data.body || payload.notification?.body || 'Νέα ειδοποίηση';
  const url = payload.data.url || '/login.html'; // ✅ Λήψη URL από τον Server

  return self.registration.showNotification(title, {
    body: body,
    icon: '/admin.png',
    tag: 'bellgo-alarm', // Ίδιο tag για να μην γεμίζει η μπάρα
    renotify: true,      // 🔴 ΑΝΑΓΚΑΖΕΙ ΤΗ ΣΥΣΚΕΥΗ ΝΑ ΞΑΝΑΧΤΥΠΗΣΕΙ
    requireInteraction: true,
    vibrate: [500, 200, 500],
    data: { url: url }   // ✅ Αποθήκευση URL για το κλικ
  });
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/login.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientsArr => {
      for (const client of clientsArr) {
        // ✅ Έλεγχος αν υπάρχει ήδη ανοιχτή καρτέλα με το σωστό URL
        if (client.url.includes(urlToOpen) && 'focus' in client) {
            return client.focus();
        }
      }
      // ✅ Αν όχι, άνοιγμα νέας
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});
