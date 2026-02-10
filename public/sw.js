/* -----------------------------------------------------------
   1. IMPORTS
----------------------------------------------------------- */
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

/* -----------------------------------------------------------
   2. CONFIGURATION & CACHE (V6)
----------------------------------------------------------- */
const CACHE_NAME = 'bellgo-v6'; 
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
   4. BACKGROUND HANDLER (NAGGING LOOP)
----------------------------------------------------------- */
messaging.setBackgroundMessageHandler(function(payload) {
  console.log('[sw.js] Background:', payload);
  const title = payload.data.title || '🚨 ΚΛΗΣΗ!';
  const body = payload.data.body || 'ΠΑΤΑ ΓΙΑ ΑΠΑΝΤΗΣΗ';
  const url = payload.data.url || '/stafpremium.html';

  return self.registration.showNotification(title, {
    body: body,
    icon: '/staff.png',
    tag: 'bellgo-alarm',      // ⚠️ ΣΗΜΑΝΤΙΚΟ: Το ίδιο tag αντικαθιστά το προηγούμενο
    renotify: true,           // ⚠️ ΣΗΜΑΝΤΙΚΟ: Ξανακάνει δόνηση/ήχο παρόλο που υπάρχει ήδη
    requireInteraction: true, // Μένει στην οθόνη
    vibrate: [500, 200, 500, 200, 500],
    data: { url: url }
  });
});

/* -----------------------------------------------------------
   5. CLICK HANDLER
----------------------------------------------------------- */
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const urlToOpen = event.notification.data.url || '/stafpremium.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientsArr => {
      // 1. Ψάχνουμε αν είναι ήδη ανοιχτό
      for (const client of clientsArr) {
        // Ελέγχουμε αν το URL ταιριάζει με αυτό που θέλουμε να ανοίξουμε
        if (client.url.includes('stafpremium.html') && 'focus' in client) {
            return client.focus();
        }
      }
      // 2. Αν δεν είναι, ανοίγουμε νέο
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

/* -----------------------------------------------------------
   6. PWA CACHING (Network First Strategy)
----------------------------------------------------------- */
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

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

// NETWORK FIRST, THEN CACHE
self.addEventListener('fetch', (event) => {
  // Αγνοούμε τα δυναμικά calls
  if (event.request.url.includes('socket.io') || 
      event.request.url.includes('manifest.json') ||
      event.request.url.includes('firestore') ||
      event.request.url.includes('googleapis')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Αν πετύχει η σύνδεση, αποθήκευσε το νέο αρχείο στην cache
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      })
      .catch(() => {
        // Αν δεν έχει ίντερνετ, δώσε το παλιό από τη μνήμη
        return caches.match(event.request);
      })
  );
});
