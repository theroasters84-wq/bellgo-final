importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

const CACHE_NAME = 'bellgo-v5'; 
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

firebase.initializeApp({
  apiKey: "AIzaSyBDOAlwLn4P5PMlwkg_Hms6-4f9fEcBKn8",
  projectId: "bellgo-5dbe5",
  messagingSenderId: "799314495253",
  appId: "1:799314495253:web:baf6852f2a065c3a2e8b1c",
  storageBucket: "bellgo-5dbe5.firebasestorage.app",
});

const messaging = firebase.messaging();

// BACKGROUND HANDLER
messaging.setBackgroundMessageHandler(function(payload) {
  console.log('[sw.js] Background:', payload);
  const title = payload.data.title || '🚨 ΚΛΗΣΗ!';
  const body = payload.data.body || 'ΠΑΤΑ ΓΙΑ ΑΠΑΝΤΗΣΗ';
  const url = payload.data.url || '/stafpremium.html';

  return self.registration.showNotification(title, {
    body: body,
    icon: '/staff.png',
    tag: 'bellgo-alarm',      // Keeps replacing the same notification
    renotify: true,           // Vibrates every time
    requireInteraction: true, // Stays on screen
    vibrate: [500, 200, 500, 200, 500],
    data: { url: url }
  });
});

// CLICK HANDLER
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const urlToOpen = event.notification.data.url || '/stafpremium.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientsArr => {
      // Check if tab exists
      for (const client of clientsArr) {
        if (client.url.includes('stafpremium.html') && 'focus' in client) {
            return client.focus(); // Just focus if open
        }
      }
      // If not open, open new
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// INSTALL
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)));
});

// ACTIVATE
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keyList) => Promise.all(keyList.map((key) => {
    if (key !== CACHE_NAME) return caches.delete(key);
  }))));
  return self.clients.claim();
});

// FETCH
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('socket.io') || event.request.url.includes('manifest.json')) return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
