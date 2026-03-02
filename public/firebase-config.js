import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, onDisconnect, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
  getMessaging, 
  getToken, 
  onMessage 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";

/* ---------------- FIREBASE CONFIG ---------------- */
const firebaseConfig = {
  apiKey: "AIzaSyBDOAlwLn4P5PMlwkg_Hms6-4f9fEcBKn8",
  authDomain: "bellgo-5dbe5.firebaseapp.com",
  projectId: "bellgo-5dbe5",
  storageBucket: "bellgo-5dbe5.firebasestorage.app",
  messagingSenderId: "799314495253",
  appId: "1:799314495253:web:baf6852f2a065c3a2e8b1c",
  measurementId: "G-379ETZJP8H"
};

/* ---------------- INIT ---------------- */
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const messaging = getMessaging(app);

/* ---------------- HELPERS ---------------- */
function sanitizeEmail(email) {
  if (!email) return "";
  return email.toLowerCase().trim().replace(/\./g, ',');
}

/* ---------------- FCM INIT ---------------- */
async function initFCM(socket) {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("❌ Notifications permission denied");
      return null;
    }

    const token = await getToken(messaging, {
      vapidKey: "BDUWH0UaYagUPXGB8BM59VFRBW8FMbgOy7YcbBHxT4aJ6rN0Jms-0dGWXIODGYWoSSHomos4gg1GOTZn6k70JcM"
    });

    if (token) {
      console.log("🔑 FCM Token:", token);
      socket.emit("update-token", { token });
      return token;
    }
  } catch (err) {
    console.error("❌ FCM init error:", err);
  }
  return null;
}

/* ---------------- FOREGROUND PUSH ---------------- */
onMessage(messaging, payload => {
  console.log("🔔 Foreground FCM:", payload);

  const alarmId = payload.data?.alarmId;

  // ΔΟΝΗΣΗ (όπου επιτρέπεται)
  if (navigator.vibrate) {
    navigator.vibrate([1000, 500, 1000, 500, 2000]);
  }

  // Κρατάμε το alarmId για ACK
  if (alarmId) {
    window.currentAlarmId = alarmId;
  }
});

/* ---------------- EXPORTS ---------------- */
export { 
  app, 
  db, 
  auth, 
  messaging,
  ref, 
  set, 
  onValue, 
  update, 
  onDisconnect, 
  push, 
  sanitizeEmail,
  signInWithPopup, 
  GoogleAuthProvider, 
  signInWithEmailAndPassword,
  getToken,
  onMessage,
  initFCM
};
