/* -----------------------------------------------------------
   1. IMPORTS
----------------------------------------------------------- */
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

/* -----------------------------------------------------------
   2. CONFIGURATION & CACHE (V22)
----------------------------------------------------------- */
const CACHE_NAME = 'bellgo-v25'; // ✅ Νέα έκδοση για Multi-tenant υποστήριξη
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/login.html',
  '/order.html',
  '/premium.html',
  '/stafpremium.html',
  '/style.css',
  '/menu-presets.js',
  '/order.js',
  '/premium.js',
  '/player.js',
  '/firebase-config.js',
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
   4. BACKGROUND HANDLER (Push Notifications)
----------------------------------------------------------- */
messaging.setBackgroundMessageHandler(function(payload) {
  const title = payload.data.title || payload.notification?.title || '🚨 BellGo!';
  const body = payload.data.body || payload.notification?.body || 'Νέα ειδοποίηση';
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
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});

/* -----------------------------------------------------------
   6. INSTALL & ACTIVATE (Cache Management)
----------------------------------------------------------- */
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
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

/* -----------------------------------------------------------
   7. FETCH STRATEGY (Network First with Dynamic Shop handling)
----------------------------------------------------------- */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Παράκαμψη για Websockets, Firebase και Manifests
  if (url.pathname.includes('socket.io') || 
      url.pathname.includes('firebase') || 
      url.pathname.includes('manifest.json') ||
      event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Αν η κλήση είναι επιτυχής
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // OFFLINE LOGIC: 
        // Αν ο χρήστης ζητάει ένα URL καταστήματος (/shop/name/), του σερβίρουμε το cached order.html
        if (url.pathname.startsWith('/shop/')) {
          return caches.match('/order.html');
        }
        return caches.match(event.request);
      })
  );
});
