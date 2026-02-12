/* -----------------------------------------------------------
   1. IMPORTS
----------------------------------------------------------- */
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

/* -----------------------------------------------------------
   2. CONFIGURATION & CACHE (V21)
----------------------------------------------------------- */
const CACHE_NAME = 'bellgo-v21'; // ✅ Updated Version
const ASSETS_TO_CACHE = [
  '/',
  
  // HTML Files
  '/index.html',
  '/login.html',
  '/order.html',
  '/premium.html',
  '/stafpremium.html',
  
  // CSS
  '/style.css',

  // JavaScript Files
  '/menu-presets.js',
  '/order.js',
  '/premium.js',
  '/player.js',
  '/firebase-config.js',
  // Σημείωση: Το firebase-messaging-sw.js και sw.js δεν χρειάζεται να είναι εδώ συνήθως, 
  // αλλά τα backend αρχεία (server.js, package.json) ΔΕΝ μπαίνουν εδώ.

  // Media (Images)
  '/admin.png',
  '/shop.png',
  '/staff.png',

  // Media (Audio)
  '/alert.mp3',
  '/silence.mp3',
  '/test.mp3',
  '/tone19hz.wav',

  // External Libraries
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
----------------------------------------------------------- */
messaging.setBackgroundMessageHandler(function(payload) {
  console.log('[sw.js] Background message:', payload);
  
  const title = payload.data.title || payload.notification?.title || '🚨 ΚΛΗΣΗ!';
  const body = payload.data.body || payload.notification?.body || 'ΠΑΤΑ ΓΙΑ ΑΠΑΝΤΗΣΗ';
  const url = payload.data.url || '/login.html';

  return self.registration.showNotification(title, {
    body: body,
    icon: '/admin.png',
    tag: 'bellgo-alarm',      
    renotify: true,           
    requireInteraction: true, 
    vibrate: [500, 200, 500, 200, 500],
    data: { url: url }        
  });
});

/* -----------------------------------------------------------
   5. CLICK HANDLER
----------------------------------------------------------- */
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/login.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientsArr => {
      for (const client of clientsArr) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
            return client.focus();
        }
      }
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
            console.log('[sw.js] Cleaning old cache:', key);
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
  // Αγνοούμε requests που δεν πρέπει να γίνουν cache
  if (event.request.url.includes('socket.io') || 
      event.request.url.includes('manifest.json') ||
      event.request.url.includes('firebase') || 
      event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Αν το αρχείο ήρθε σωστά από το ίντερνετ, το βάζουμε στο cache
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Αν δεν έχουμε ίντερνετ, το φέρνουμε από το cache
        return caches.match(event.request);
      })
  );
});
