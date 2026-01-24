importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

const firebaseConfig = {
  apiKey: "AIzaSyBDOAlwLn4P5PMlwkg_Hms6-4f9fEcBKn8",
  authDomain: "bellgo-5dbe5.firebaseapp.com",
  projectId: "bellgo-5dbe5",
  storageBucket: "bellgo-5dbe5.firebasestorage.app",
  messagingSenderId: "799314495253",
  appId: "1:799314495253:web:baf6852f2a065c3a2e8b1c",
  measurementId: "G-379ETZJP8H"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// ΑΚΟΥΕΙ ΟΤΑΝ ΤΟ APP ΕΙΝΑΙ ΚΛΕΙΣΤΟ
messaging.onBackgroundMessage((payload) => {
  console.log('[Background] ', payload);
  
  const notificationTitle = payload.data.title;
  const notificationOptions = {
    body: payload.data.body,
    icon: '/icon.png', // Προαιρετικό
    vibrate: [500, 200, 500],
    requireInteraction: true, // Δεν φεύγει αν δεν το πατήσει
    data: { url: '/' } // Ανοίγει την εφαρμογή
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});
