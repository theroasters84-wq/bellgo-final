// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, onDisconnect, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";

const firebaseConfig = {
  apiKey: "AIzaSyBDOAlwLn4P5PMlwkg_Hms6-4f9fEcBKn8",
  authDomain: "bellgo-5dbe5.firebaseapp.com",
  projectId: "bellgo-5dbe5",
  storageBucket: "bellgo-5dbe5.firebasestorage.app",
  messagingSenderId: "799314495253",
  appId: "1:799314495253:web:baf6852f2a065c3a2e8b1c",
  measurementId: "G-379ETZJP8H"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const messaging = getMessaging(app);

// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, onDisconnect, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";

const firebaseConfig = {
  apiKey: "AIzaSyBDOAlwLn4P5PMlwkg_Hms6-4f9fEcBKn8",
  authDomain: "bellgo-5dbe5.firebaseapp.com",
  projectId: "bellgo-5dbe5",
  storageBucket: "bellgo-5dbe5.firebasestorage.app",
  messagingSenderId: "799314495253",
  appId: "1:799314495253:web:baf6852f2a065c3a2e8b1c",
  measurementId: "G-379ETZJP8H"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const messaging = getMessaging(app);

// ΝΕΑ ΛΕΙΤΟΥΡΓΙΑ: Κάνει τα πάντα μικρά γράμματα, σβήνει κενά και αλλάζει τις τελείες
function sanitizeEmail(email) {
    if(!email) return "";
    return email.toLowerCase().trim().replace(/\./g, ',');
}

export { app, db, auth, messaging, ref, set, onValue, update, onDisconnect, push, sanitizeEmail, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, getToken, onMessage };

// Helper για να καθαρίζουμε το email (το firebase δεν δέχεται τελείες στα paths)
function sanitizeEmail(email) {
    return email.replace(/\./g, ',');
}

export { app, db, auth, messaging, ref, set, onValue, update, onDisconnect, push, sanitizeEmail, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, getToken, onMessage };
