const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require("firebase-admin");
const nodemailer = require('nodemailer'); // ✅ NEW: Email Module
const Logic = require('./logic'); // ✅ Import Logic Module

// ✅ EMAIL CONFIGURATION (Ρυθμίστε το εδώ)
const transporter = nodemailer.createTransport({
    service: 'gmail', 
    auth: {
        user: 'theroasters84@gmail.com',
        pass: 'goit nsbk wsae awwc'
    }
});

// ✅ STRIPE SETUP (ΠΡΟΣΟΧΗ: Σε παραγωγή χρησιμοποιούμε .env)
const stripe = require('stripe')('sk_test_51SwnsPJcEtNSGviLf1RB1NTLaHJ3LTmqqy9LM52J3Qc7DpgbODtfhYK47nHAy1965eNxwVwh9gA4PTuizOxhMPil00dIoebxMx');
const STRIPE_CLIENT_ID = 'ca_TxCnGjK4GvUPXuJrE5CaUW9NeUdCeow6'; 
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || ''; // ✅ Add your Webhook Secret here
const YOUR_DOMAIN = 'https://bellgo-final.onrender.com'; 

// ✅ PRICE LIST
const PRICE_BASIC = 'price_1Sx9PFJcEtNSGviLteieJCwj';   // 4€
const PRICE_PREMIUM = 'price_1SzHTPJcEtNSGviLk7N84Irn'; // 10€

// ✅ NEW: Αντιστοίχιση Stripe Price IDs με Features
// ⚠️ ΠΡΟΣΟΧΗ: Αντικατέστησε τα 'price_xxx' με τα πραγματικά ID από το Stripe Dashboard
const FEATURE_PRICES = {
    'price_1Sx9PFJcEtNSGviLteieJCwj': 'pack_chat', // ✅ BellGo Basic (4€) -> Pack 1
    'price_1SzHTPJcEtNSGviLk7N84Irn': 'pack_manager', // ✅ Premium (10€) -> Pack 2
    'price_1T5RpbJcEtNSGviLy5zj4t2F': 'pack_delivery',
    'price_1T5RtQJcEtNSGviLGHRhyDx9': 'pack_tables',
    'price_1T5RvLJcEtNSGviLrYYs72aH': 'pack_pos',
    'price_1T5RwBJcEtNSGviLq7VJ1KLi': 'pack_loyalty'
};

/* ---------------- FIREBASE ADMIN SETUP ---------------- */
let db;
try {
    const serviceAccount = require("./serviceAccountKey.json");
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
    console.log("✅ Firebase Admin & Firestore Initialized");
} catch (e) {
    console.log("⚠️ Firebase Warning: serviceAccountKey.json not found.");
}

/* ---------------- SERVER SETUP ---------------- */
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
    pingTimeout: 60000,
    pingInterval: 25000
});

/* ---------------- DATA STORE (MULTI-TENANT MEMORY) ---------------- */
let storesData = {};
let activeUsers = {}; 
const tempBlacklist = new Set();

// ✅ STRIPE ROUTES & WEBHOOKS (Mounted BEFORE express.json)
const stripeRoutes = require('./stripe-routes')({
    stripe, STRIPE_WEBHOOK_SECRET, STRIPE_CLIENT_ID, YOUR_DOMAIN, 
    PRICE_BASIC, PRICE_PREMIUM, FEATURE_PRICES, db, storesData, activeUsers, io, admin
});
app.use('/', stripeRoutes);

// ✅ API ROUTES (PIN Resets, Rewards, etc.)
const apiRoutes = require('./api-routes')({ db, storesData });
app.use('/', apiRoutes);

app.use(express.json());
app.use(express.urlencoded({ extended: true })); 

// ✅ NEW: Redirect Root to Login (Admin PWA)
app.get('/', (req, res) => {
    res.redirect('/manage/login.html');
});

// ✅ FIX: Redirect Root Admin pages to /manage/ to isolate PWA Scope
// Αυτό διασφαλίζει ότι το Admin PWA έχει scope /manage/ και ΔΕΝ πιάνει τα QR παραγγελιών (/shop/...)
app.get(['/login.html', '/index.html', '/premium.html'], (req, res) => {
    const q = new URLSearchParams(req.query).toString();
    res.redirect(`/manage${req.path}${q ? '?' + q : ''}`);
});

// ✅ FIX: Redirect direct Staff access to /staff/ scope
app.get('/stafpremium.html', (req, res) => {
    const q = new URLSearchParams(req.query).toString();
    res.redirect(`/staff/app${q ? '?' + q : ''}`);
});

app.use(express.static(path.join(__dirname, 'public'))); 
app.use('/manage', express.static(path.join(__dirname, 'public'))); // ✅ NEW: Εικονικός φάκελος για Admin PWA Isolation
app.use('/mini', express.static(path.join(__dirname, 'mini_app'))); // ✅ NEW: Εντελώς ξεχωριστός φάκελος (Isolated App)
app.use('/staff', express.static(path.join(__dirname, 'public'))); // ✅ NEW: Static files for Staff App

/* ---------------- VIRTUAL ROUTES (PWA ISOLATION) ---------------- */
// 🔥 NEW: Αυτό το route επιτρέπει URLs τύπου /shop/roasters/ που σερβίρουν το order.html
// αλλά ο browser τα βλέπει σαν ξεχωριστούς φακέλους για το PWA Scope.
app.get('/shop/:storeName/*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'order.html'));
});

// Επίσης κρατάμε και το παλιό για backward compatibility
app.get('/shop/:storeName', (req, res) => { 
    res.sendFile(path.join(__dirname, 'public', 'order.html')); 
});

// ✅ NEW: Dine-In Route (Pure Web - No PWA Scope)
app.get('/dinein/:storeName', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'order.html'));
});

// ✅ NEW: Fallback για το Mini App (για να ανοίγει σωστά πάντα)
app.get('/mini*', (req, res) => {
    res.sendFile(path.join(__dirname, 'mini_app', 'index.html'));
});

// ✅ NEW: Virtual Route για το Staff App (για να έχει δικό του PWA Scope)
app.get('/manage/kitchen.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'kitchen.html'));
});

app.get('/staff/app', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'stafpremium.html')); });
app.get('/staff/driver', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'dianomeas.html')); });

// ✅ NEW: Explicit Route για το Trapaizei (Table Ordering)
app.get('/trapaizei.html', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'trapaizei.html')); });

app.get('/staff/login', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'login.html')); });
app.get('/admin', (req, res) => { res.redirect('/manage/login.html'); }); // ✅ Redirect στο νέο isolated path

/* ---------------- DYNAMIC MANIFEST ---------------- */
app.get('/manifest.json', async (req, res) => {
    const iconType = req.query.icon || 'admin'; 
    const storeParam = req.query.store || "general";
    const safeStoreId = storeParam.replace(/[^a-zA-Z0-9@._-]/g, ''); // Allow emails
    
    let storeName = "BellGo App";
    if (safeStoreId !== "general") {
        const data = await Logic.getStoreData(safeStoreId, db, storesData);
        storeName = data.settings.name || `Shop ${safeStoreId}`;
    }
    if (req.query.name) storeName = req.query.name;

    let appId = `bellgo_${iconType}_${safeStoreId}`; 
    let iconFile = "admin.png"; 
    let startUrl = ".";  
    let scopeUrl = "/";        

    if (iconType === 'shop') {
        iconFile = "shop.png"; 
        // 🔥 PWA ISOLATION: Start URL & Scope are specific to this shop folder
        // This tricks the browser into thinking it's a separate app/folder
        startUrl = `/shop/${safeStoreId}/?name=${encodeURIComponent(storeName)}`;
        scopeUrl = `/shop/${safeStoreId}/`; 
    } else if (req.query.id === 'staff_app') {
        // ✅ FIX: Staff App Isolation
        iconFile = "admin.png";
        startUrl = `/staff/app?store=${encodeURIComponent(storeParam)}`;
        scopeUrl = "/staff/";
    } else {
        iconFile = "admin.png";
        startUrl = `/manage/login.html`; // ✅ Αλλαγή Start URL
        scopeUrl = "/manage/";           // ✅ FIX: Scope στο /manage/ για να ΜΗΝ πιάνει τα QR πελατών
    }

    res.set('Content-Type', 'application/manifest+json');
    res.json({
        "id": appId,              
        "name": storeName,            
        "short_name": storeName,
        "start_url": startUrl,   
        "scope": scopeUrl,        
        "display": "standalone",
        "background_color": "#ffffff",
        "icons": [
            { "src": `/${iconFile}`, "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
            { "src": `/${iconFile}`, "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
        ]
    });
});

/* ---------------- SOCKET.IO ---------------- */

// ✅ NEW: Global Server Logger (Παρακολουθεί ΟΛΑ τα events)
io.on('connection', (socket) => {
    socket.onAny((eventName, ...args) => {
        if (eventName === 'heartbeat') return; // Κρύβουμε το heartbeat για να μη γεμίζει η οθόνη
        console.log(`[SERVER] 📥 EVENT: '${eventName}' | Από: ${socket.username || socket.id}`);
    });
});

require('./socket-events')({ io, storesData, activeUsers, tempBlacklist, db, admin, stripe, YOUR_DOMAIN, transporter });

/* ---------------- CRON JOBS & TIMERS ---------------- */
require('./cron-jobs')({ io, storesData, activeUsers, db, transporter, YOUR_DOMAIN, admin });

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
