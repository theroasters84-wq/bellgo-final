const CACHE_NAME = 'bellgo-v2';
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

// 1. Εγκατάσταση: Αποθήκευσε τα βασικά αρχεία
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. Ενεργοποίηση: Καθάρισε παλιές caches
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

// 3. Fetch: Εξυπηρέτησε από Cache αν υπάρχει, αλλιώς Network
self.addEventListener('fetch', (event) => {
  // ΑΓΝΟΗΣΕ ΤΑ DYNAMIC (Socket.io & Manifest) - Πάντα Network
  if (event.request.url.includes('socket.io') || event.request.url.includes('manifest.json')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      // Αν το βρήκες στην cache, δώσ' το. Αλλιώς ζήτα το από το δίκτυο.
      return response || fetch(event.request);
    })
  );
});
