/* sw.js - Service Worker για BellGo PWA */
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Επιτρέπει την κανονική λειτουργία του δικτύου
    event.respondWith(fetch(event.request));
});
