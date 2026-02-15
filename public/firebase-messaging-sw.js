importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

let notificationInterval;
let badgeCount = 0;

firebase.initializeApp({
  apiKey: "AIzaSyBDOAlwLn4P5PMlwkg_Hms6-4f9fEcBKn8",
  projectId: "bellgo-5dbe5",
  messagingSenderId: "799314495253",
  appId: "1:799314495253:web:baf6852f2a065c3a2e8b1c",
  storageBucket: "bellgo-5dbe5.firebasestorage.app",
});

const messaging = firebase.messaging();

// ✅ Force Update: Για να πάρει το νέο SW αμέσως
self.addEventListener('install', (event) => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(clients.claim()); });

messaging.setBackgroundMessageHandler(function(payload) {
  console.log('[BG] Message:', payload);
  
  // Clear previous loop
  if (notificationInterval) { clearInterval(notificationInterval); notificationInterval = null; badgeCount = 0; }

  const originalTitle = payload.data.title || 'BellGo';
  const originalBody = payload.data.body || 'Νέα ειδοποίηση';
  const url = payload.data.url || '/login.html'; 

  // ✅ Check if Alarm
  const isAlarm = payload.data.type === 'alarm' || 
                  (originalTitle + originalBody).toLowerCase().includes('paragelia') || 
                  (originalTitle + originalBody).toLowerCase().includes('alarm');

  if (isAlarm) {
      const showLoop = () => {
          badgeCount++;
          // 🔴 ANTI-SPAM TRICK: Αλλάζουμε το body για να φαίνεται σαν Update
          const dynamicBody = `${originalBody} ${"🔔".repeat((badgeCount % 3) + 1)}`;
          
          return self.registration.showNotification(originalTitle, {
              body: dynamicBody,
              icon: '/admin.png',
              tag: 'bellgo-alarm-loop',
              renotify: true,           
              requireInteraction: true, 
              vibrate: [1000, 500, 1000, 500, 1000],
              data: { url: url, isLooping: true }
          });
      };

      // Loop κάθε 6 δευτερόλεπτα (Safe for Chrome)
      notificationInterval = setInterval(showLoop, 6000);
      return showLoop();
  }

  // Normal Notification
  return self.registration.showNotification(originalTitle, {
      body: originalBody,
      icon: '/admin.png',
      tag: 'bellgo-normal',
      renotify: true,
      data: { url: url }
  });
});

self.addEventListener('notificationclick', function(event) {
  if (notificationInterval) { clearInterval(notificationInterval); notificationInterval = null; }
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/login.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if (c.url.includes(urlToOpen) && 'focus' in c) return c.focus(); }
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});