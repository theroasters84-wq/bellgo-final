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
const activeAlarms = {};

/**
 * BACKGROUND MESSAGE (DATA)
 */
messaging.setBackgroundMessageHandler(function(payload) {
  const alarmId = payload.data?.alarmId || Date.now().toString();
  const title = payload.data?.title || '🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ';
  const body  = payload.data?.body  || 'ΠΑΤΑ ΓΙΑ ΑΠΑΝΤΗΣΗ';

  if (!activeAlarms[alarmId]) {
    const showNotif = () => {
      console.log('[SW] Show alarm notification', alarmId);
      self.registration.showNotification(title, {
        body,
        icon: '/icon.png',
        badge: '/badge.png',
        vibrate: [1000, 500, 1000, 500, 2000, 500, 2000],
        tag: 'bellgo-alarm',
        renotify: true,
        requireInteraction: true,
        data: { url: '/', alarmId }
      });
    };

    // Άμεση εμφάνιση
    showNotif();

    // Επαναλαμβανόμενη ειδοποίηση ΚΑΘΕ 3 δευτ.
    const interval = setInterval(showNotif, 3000);
    activeAlarms[alarmId] = interval;
  }
});

/**
 * CLICK ΣΤΟ NOTIFICATION
 */
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const alarmId = event.notification.data?.alarmId;

  if (alarmId && activeAlarms[alarmId]) {
    clearInterval(activeAlarms[alarmId]);
    delete activeAlarms[alarmId];
    console.log('[SW] Alarm cleared', alarmId);
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientsArr => {
      for (const client of clientsArr) {
        if ('focus' in client) {
          client.postMessage({ type: 'ALARM_CLICK', alarmId });
          return client.focus();
        }
      }
      return clients.openWindow('/');
    })
  );
});
