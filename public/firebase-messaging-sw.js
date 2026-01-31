importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

firebase.initializeApp({
 apiKey:"AIzaSyDyqu5tLS2hY3kS1XvHOrfw8CatB_mwI9A",
 authDomain:"bellgofinall.firebaseapp.com",
 projectId:"bellgofinall",
 messagingSenderId:"654570848224",
 appId:"1:654570848224:web:50704c332d885e3a0df585"
});

const messaging=firebase.messaging();

messaging.setBackgroundMessageHandler(()=> {
 return self.registration.showNotification("🚨 ΚΛΗΣΗ ΚΟΥΖΙΝΑΣ",{
  body:"Πάτα για άμεση αποδοχή",
  icon:"https://cdn-icons-png.flaticon.com/512/10337/10337229.png",
  requireInteraction:true,
  vibrate:[500,500,500],
  data:{url:'/'}
 });
});

self.addEventListener('notificationclick',e=>{
 e.notification.close();
 e.waitUntil(clients.openWindow('/'));
});
