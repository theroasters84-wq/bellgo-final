/* -----------------------------------------------------------
   1. IMPORTS (Πρέπει να είναι πρώτα)
----------------------------------------------------------- */
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

/* -----------------------------------------------------------
   2. CONFIGURATION & CACHE
----------------------------------------------------------- */
const CACHE_NAME = 'bellgo-v4'; // ✅ Αλλαγή σε v3 για ανανέωση
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/order.html',
  '/login.html',
  '/premium.html',
  '/stafpremium.html',
  '/admin.png',
  '/shop.png',
  '/staff.png',
  '/alert.mp3',
  '/silence.mp3',
  '/tone19hz.wav',
  'https://js.stripe.com/v3/',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
];

/* -----------------------------------------------------------
   3. FIREBASE INITIALIZATION
----------------------------------------------------------- */
firebase.initializeApp({
  apiKey: "AIzaSyBDOAlwLn4P5PMlwkg_Hms6-4f9fEcBKn8",
  projectId: "bellgo-5dbe5",
  messagingSenderId: "799314495253",
  appId: "1:799314495253:web:baf6852f2a065c3a2e8b1c",
  storageBucket: "bellgo-5dbe5.firebasestorage.app",
});

const messaging = firebase.messaging();

/* -----------------------------------------------------------
   4. BACKGROUND MESSAGING (Κλήση όταν είναι κλειστό)
----------------------------------------------------------- */
messaging.setBackgroundMessageHandler(function(payload) {
  console.log('[sw.js] Background message:', payload);
  
  const title = payload.data.title || '🚨 ΚΛΗΣΗ!';
  const body = payload.data.body || 'ΠΑΤΑ ΓΙΑ ΑΠΑΝΤΗΣΗ';

  return self.registration.showNotification(title, {
    body: body,
    icon: '/admin.png',       // ✅ ΔΙΟΡΘΩΣΗ: admin.png
    tag: 'bellgo-alarm',      
    renotify: true,           // 🔴 ΣΗΜΑΝΤΙΚΟ: Ξαναχτυπάει!
    requireInteraction: true, // ✅ Να μένει στην οθόνη
    vibrate: [500, 200, 500], // ✅ Δόνηση
    data: { url: '/premium.html' } // ✅ Να ανοίγει το Admin Panel
  });
});

/* -----------------------------------------------------------
   5. NOTIFICATION CLICK (Άνοιγμα εφαρμογής)
----------------------------------------------------------- */
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientsArr => {
      // Προσπάθησε να βρεις ανοιχτό παράθυρο του Admin
      for (const client of clientsArr) {
        if (client.url.includes('premium.html') && 'focus' in client) {
            return client.focus();
        }
      }
      // Αν δεν υπάρχει, άνοιξε νέο
      if (clients.openWindow) {
        return clients.openWindow('/premium.html');
      }
    })
  );
});

/* -----------------------------------------------------------
   6. PWA CACHING (Install, Activate, Fetch)
----------------------------------------------------------- */

// ΕΓΚΑΤΑΣΤΑΣΗ
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// ΕΝΕΡΓΟΠΟΙΗΣΗ (Καθαρισμός παλιών caches)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// FETCH (Offline support)
self.addEventListener('fetch', (event) => {
  // ΑΓΝΟΗΣΕ ΤΑ DYNAMIC (Socket.io, Manifest, Firebase) - Πάντα Network
  if (event.request.url.includes('socket.io') || 
      event.request.url.includes('manifest.json') ||
      event.request.url.includes('firestore') ||
      event.request.url.includes('googleapis')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      // Αν το βρήκες στην cache, δώσ' το. Αλλιώς ζήτα το από το δίκτυο.
      return response || fetch(event.request);
    })
  );
});
