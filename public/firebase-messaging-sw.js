importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

// ✅ 1. Variable for the Loop
let notificationInterval;

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
  
  // ✅ Clear previous Loop if exists
  if (notificationInterval) {
      clearInterval(notificationInterval);
      notificationInterval = null;
  }

  const title = payload.data.title || payload.notification?.title || 'BellGo';
  const body = payload.data.body || payload.notification?.body || 'Νέα ειδοποίηση';
  const url = payload.data.url || '/login.html'; 

  // ✅ 2. Check if Alarm
  const isAlarm = (title + ' ' + body).toLowerCase().includes('paragelia') ||
                  (title + ' ' + body).toLowerCase().includes('alarm') ||
                  payload.data.type === 'alarm';

  if (isAlarm) {
      // ✅ 3. Loop Logic (Alarm)
      const showNotification = () => {
          return self.registration.showNotification(title, {
              body: body,
              icon: '/admin.png',
              tag: 'bellgo-alarm-loop',
              renotify: true,       
              requireInteraction: true, 
              vibrate: [2000, 500, 2000, 500, 2000], 
              data: { url: url, isLooping: true }    
          });
      };

      // Start loop every 4 seconds
      notificationInterval = setInterval(showNotification, 4000);

      // Show first immediately
      return showNotification();

  } else {
      // ✅ 4. Simple Notification
      return self.registration.showNotification(title, {
        body: body,
        icon: '/admin.png',
        tag: 'bellgo-alarm', 
        renotify: true,      
        requireInteraction: true,
        vibrate: [500, 200, 500],
        data: { url: url }   
      });
  }
});

self.addEventListener('notificationclick', function(event) {
  // ✅ 5. Stop Loop on Click
  if (event.notification.data?.isLooping) {
    if (notificationInterval) {
        clearInterval(notificationInterval);
        notificationInterval = null;
    }
  }

  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/login.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientsArr => {
      for (const client of clientsArr) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
            return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});