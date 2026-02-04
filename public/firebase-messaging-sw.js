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
  const title = payload.data.title || '🚨 ΚΛΗΣΗ!';
  const body = payload.data.body || 'ΠΑΤΑ ΓΙΑ ΑΠΑΝΤΗΣΗ';

  return self.registration.showNotification(title, {
    body: body,
    icon: '/icon.png',
    
    // --- Aggressive Settings ---
    tag: 'bellgo-alarm', // Χρησιμοποιούμε το ίδιο tag για να μην γεμίζει η μπάρα
    renotify: true,      // 🔴 ΑΝΑΓΚΑΖΕΙ ΤΟ ΚΙΝΗΤΟ ΝΑ ΞΑΝΑΧΤΥΠΗΣΕΙ/ΔΟΝΗΘΕΙ
    requireInteraction: true,
    
    vibrate: [500, 200, 500, 200, 500],
    
    data: { url: '/?type=alarm' }
  });
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientsArr => {
      for (const client of clientsArr) {
        if (client.url.includes('bellgo') || 'focus' in client) {
            return client.focus();
        }
      }
      return clients.openWindow('/?type=alarm');
    })
  );
});
