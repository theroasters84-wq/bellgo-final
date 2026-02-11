/* -----------------------------------------------------------
   1. IMPORTS
----------------------------------------------------------- */
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

/* -----------------------------------------------------------
   2. CONFIGURATION & CACHE (V13)
----------------------------------------------------------- */
const CACHE_NAME = 'bellgo-v13'; // ✅ Updated Version
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
   4. BACKGROUND HANDLER
   Τρέχει όταν η σελίδα είναι κλειστή ΚΑΙ το μήνυμα είναι Data-only.
   (Αν το μήνυμα έχει "notification" block, το χειρίζεται το σύστημα,
    αλλά αυτός ο κώδικας είναι η ασφάλειά μας).
----------------------------------------------------------- */
messaging.setBackgroundMessageHandler(function(payload) {
  console.log('[sw.js] Background message:', payload);
  
  const title = payload.data.title || payload.notification?.title || '🚨 ΚΛΗΣΗ!';
  const body = payload.data.body || payload.notification?.body || 'ΠΑΤΑ ΓΙΑ ΑΠΑΝΤΗΣΗ';
  // ✅ Default σε login αν δεν βρει URL, για ασφάλεια
  const url = payload.data.url || '/login.html';

  return self.registration.showNotification(title, {
    body: body,
    icon: '/admin.png',
    tag: 'bellgo-alarm',      // Το ίδιο tag αντικαθιστά το προηγούμενο
    renotify: true,           // Ξανακάνει δόνηση/ήχο
    requireInteraction: true, // Μένει στην οθόνη
    vibrate: [500, 200, 500, 200, 500],
    data: { url: url }        // Αποθηκεύουμε το URL για το κλικ
  });
});

/* -----------------------------------------------------------
   5. CLICK HANDLER (Διαχείριση Κλικ στην Ειδοποίηση)
----------------------------------------------------------- */
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  // Παίρνουμε το URL από τα δεδομένα της ειδοποίησης
  // Αν δεν υπάρχει, πάμε στο login
  const urlToOpen = event.notification.data?.url || '/login.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientsArr => {
      // 1. Ψάχνουμε αν υπάρχει ήδη ανοιχτή καρτέλα που ταιριάζει
      for (const client of clientsArr) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
            return client.focus();
        }
      }
      // 2. Αν δεν υπάρχει, ανοίγουμε νέα
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
  // Αγνοούμε δυναμικά αιτήματα
  if (event.request.url.includes('socket.io') || 
      event.request.url.includes('manifest.json') ||
      event.request.url.includes('firebase') || 
      event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
