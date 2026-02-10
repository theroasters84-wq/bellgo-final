/* -----------------------------------------------------------
   1. IMPORTS
----------------------------------------------------------- */
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

/* -----------------------------------------------------------
   2. CONFIGURATION & CACHE (V7)
----------------------------------------------------------- */
const CACHE_NAME = 'bellgo-v7'; 
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
   4. BACKGROUND HANDLER (Τρέχει όταν είναι κλειστό/background)
----------------------------------------------------------- */
messaging.setBackgroundMessageHandler(function(payload) {
  console.log('[sw.js] Background message received:', payload);
  
  // Διαβάζουμε τα δεδομένα από το payload του server
  const title = payload.data.title || payload.notification?.title || '🚨 ΚΛΗΣΗ!';
  const body = payload.data.body || payload.notification?.body || 'ΠΑΤΑ ΓΙΑ ΑΠΑΝΤΗΣΗ';
  
  // Το URL έρχεται δυναμικά από τον Server (premium.html ή stafpremium.html)
  const url = payload.data.url || '/login.html';

  // Εμφάνιση της ειδοποίησης συστήματος
  return self.registration.showNotification(title, {
    body: body,
    icon: '/admin.png', // Generic icon, θα μπορούσε να είναι δυναμικό
    tag: 'bellgo-alarm',      // Το ίδιο tag αντικαθιστά το προηγούμενο (για να μην γεμίζει η μπάρα)
    renotify: true,           // Ξανακάνει δόνηση/ήχο παρόλο που υπάρχει ήδη
    requireInteraction: true, // Μένει στην οθόνη μέχρι να το πατήσει ο χρήστης
    vibrate: [500, 200, 500, 200, 500],
    data: { url: url }        // Αποθηκεύουμε το URL για το click event
  });
});

/* -----------------------------------------------------------
   5. CLICK HANDLER (Τρέχει όταν πατάς την ειδοποίηση)
----------------------------------------------------------- */
self.addEventListener('notificationclick', function(event) {
  event.notification.close(); // Κλείνει την ειδοποίηση
  
  // Παίρνουμε το URL που αποθηκεύσαμε στο data
  const urlToOpen = event.notification.data.url || '/login.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientsArr => {
      // 1. Ψάχνουμε αν υπάρχει ήδη ανοιχτή καρτέλα με αυτό το URL
      for (const client of clientsArr) {
        // Ελέγχουμε αν το URL ταιριάζει (π.χ. αν περιέχει "premium.html")
        if (client.url.includes(urlToOpen) && 'focus' in client) {
            return client.focus(); // Αν υπάρχει, απλά την φέρνουμε μπροστά
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
  if (event.request.url.includes('socket.io') || 
      event.request.url.includes('manifest.json') ||
      event.request.url.includes('firestore') ||
      event.request.url.includes('googleapis') ||
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
