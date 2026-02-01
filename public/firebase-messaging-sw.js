// public/firebase-messaging-sw.js

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

// --- ΕΔΩ ΓΙΝΕΤΑΙ Η ΔΟΝΗΣΗ ---
// Επειδή ο Server έστειλε μόνο "data", τρέχει αυτή η συνάρτηση:
messaging.setBackgroundMessageHandler(function(payload) {
  console.log('[SW] Background Alarm Received:', payload);

  const notificationTitle = payload.data.title || '🔔 BellGo';
  const notificationOptions = {
    body: payload.data.body || 'Νέα Κλήση',
    icon: '/icon.png',
    
    // ΔΥΝΑΤΗ ΔΟΝΗΣΗ: [Δόνηση, Παύση, Δόνηση, Παύση, Δόνηση...]
    vibrate: [1000, 500, 1000, 500, 2000], 
    
    tag: 'alarm-notification', // Το ίδιο tag για να μην γεμίζει η μπάρα
    renotify: true,            // Να ξαναχτυπήσει/δονηθεί ακόμα κι αν υπάρχει ήδη ειδοποίηση!
    requireInteraction: true,  // Να μείνει στην οθόνη μέχρι να το πατήσεις
    data: { url: '/' }
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Όταν πατήσεις την ειδοποίηση
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      // Αν είναι ήδη ανοιχτό, πήγαινε εκεί
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      // Αλλιώς άνοιξε το
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
