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

/**
 * BACKGROUND MESSAGE
 * Εμφανίζει την ειδοποίηση όταν η εφαρμογή είναι κλειστή/στο background.
 */
messaging.setBackgroundMessageHandler(function(payload) {
  const title = payload.data?.title || '🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ';
  const body  = payload.data?.body  || 'ΠΑΤΑ ΓΙΑ ΑΠΟΔΟΧΗ';

  return self.registration.showNotification(title, {
    body: body,
    icon: '/icon.png',
    badge: '/badge.png', // Βεβαιώσου ότι υπάρχει ή αφαίρεσέ το
    vibrate: [1000, 500, 1000],
    tag: 'bellgo-alarm', // Το ίδιο tag για να αντικαθιστά την προηγούμενη και να μην γεμίζει η μπάρα
    renotify: true, // Να ξαναχτυπάει/δονείται κάθε φορά που έρχεται νέο μήνυμα (από το server loop)
    requireInteraction: true,
    data: { url: '/' }
  });
});

/**
 * CLICK ΣΤΟ NOTIFICATION
 * Ανοίγει την εφαρμογή και εστιάζει.
 */
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  // Προσπάθεια να ανοίξει ή να εστιάσει το παράθυρο
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientsArr => {
      // Αν υπάρχει ήδη ανοιχτό tab, πήγαινε σε αυτό
      for (const client of clientsArr) {
        if (client.url.includes('bellgo') || client.url === '/' || 'focus' in client) {
          return client.focus();
        }
      }
      // Αν όχι, άνοιξε νέο
      return clients.openWindow('/');
    })
  );
});
