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

// Force activation
self.addEventListener('install', (event) => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(clients.claim()); });

messaging.setBackgroundMessageHandler(function(payload) {
  // Clear previous loop
  if (notificationInterval) { clearInterval(notificationInterval); notificationInterval = null; badgeCount = 0; }

  const originalTitle = payload.data.title || payload.notification?.title || 'BellGo';
  const originalBody = payload.data.body || payload.notification?.body || 'Νέα ειδοποίηση';
  const url = payload.data.url || '/login.html'; 

  // ✅ Check if Alarm
  const isAlarm = payload.data.type === 'alarm' || 
                  (originalTitle + originalBody).toLowerCase().includes('paragelia') || 
                  (originalTitle + originalBody).toLowerCase().includes('alarm');

  if (isAlarm) {
      const showLoop = () => {
          badgeCount++;
          // Dynamic Body Trick
          const dynamicBody = `${originalBody} ${"🔔".repeat((badgeCount % 3) + 1)}`;
          
          return self.registration.showNotification(originalTitle, {
              body: dynamicBody,
              icon: '/admin.png',
              tag: 'bellgo-alarm-loop',
              renotify: true,           
              requireInteraction: true, 
              vibrate: [500, 200, 500, 200, 500],
              data: { url: url, isLooping: true }
          });
      };

      // Local Loop fast (3s) - Android will try this, Server will backup every 8s
      notificationInterval = setInterval(showLoop, 3000);
      return showLoop();
  }

  // Normal Notification
  return self.registration.showNotification(originalTitle, {
      body: originalBody,
      icon: '/admin.png',
      tag: 'bellgo-normal',
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