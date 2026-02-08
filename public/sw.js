/* sw.js - Service Worker για PWA */
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Απλά επιτρέπει τη φόρτωση, απαραίτητο για PWA
    event.respondWith(fetch(event.request));
});
