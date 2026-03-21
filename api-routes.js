const express = require('express');
const Logic = require('./logic');

module.exports = function(context) {
    const router = express.Router();
    const { db, storesData } = context;

    /* ---------------- PIN RESET ROUTES ---------------- */
    router.get('/reset-pin', (req, res) => {
        const { email } = req.query;
        res.send(`
            <!DOCTYPE html>
            <html lang="el">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Επαναφορά PIN</title>
                <style>
                    body { background-color: #f4f6f8; color: #1f2937; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                    .card { background: #ffffff; padding: 40px; border-radius: 20px; text-align: center; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #e5e7eb; max-width: 90%; width: 320px; }
                    h2 { color: #10B981; margin: 0 0 20px 0; font-size: 24px; }
                    p { color: #6b7280; font-size: 14px; margin-bottom: 30px; line-height: 1.5; }
                    input { padding: 12px; border-radius: 10px; border: 1px solid #d1d5db; background: #f9fafb; color: #1f2937; width: 100%; max-width: 200px; text-align: center; font-size: 24px; letter-spacing: 5px; margin-bottom: 20px; outline: none; transition: border 0.3s; font-weight: bold; }
                    input:focus { border-color: #10B981; }
                    button { padding: 12px 30px; background: #10B981; color: white; border: none; border-radius: 30px; font-weight: bold; cursor: pointer; font-size: 16px; transition: transform 0.1s, background 0.3s; width: 100%; max-width: 220px; box-shadow: 0 4px 10px rgba(16,185,129,0.3); }
                    button:active { transform: scale(0.95); }
                    button:hover { background: #059669; }
                    .email-tag { background: #f3f4f6; padding: 5px 10px; border-radius: 5px; color: #1f2937; font-weight: bold; font-size: 12px; display: inline-block; margin-top: 5px; border: 1px solid #e5e7eb; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h2>🔑 Επαναφορά PIN</h2>
                    <p>Ορίστε το νέο 4-ψήφιο PIN για:<br><span class="email-tag">${email}</span></p>
                    <form action="/set-new-pin" method="POST">
                        <input type="hidden" name="email" value="${email}">
                        <input type="number" name="pin" placeholder="____" required pattern="[0-9]{4}" maxlength="4" oninput="if(this.value.length>4) this.value=this.value.slice(0,4)">
                        <br>
                        <button type="submit">ΑΠΟΘΗΚΕΥΣΗ</button>
                    </form>
                </div>
            </body>
            </html>
        `);
    });

    router.post('/set-new-pin', async (req, res) => {
        const { email, pin } = req.body;
        if (email && pin) {
            const store = await Logic.getStoreData(email, db, storesData);
            store.settings.pin = pin;
            Logic.saveStoreToFirebase(email, db, storesData);
            res.send(`
                <!DOCTYPE html>
                <html lang="el">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Επιτυχία</title>
                    <style>
                    body { background-color: #f4f6f8; color: #1f2937; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                    .card { background: #ffffff; padding: 40px; border-radius: 20px; text-align: center; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #e5e7eb; max-width: 90%; width: 320px; }
                        .icon { font-size: 60px; margin-bottom: 20px; display: block; animation: pop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
                    h1 { color: #10B981; margin: 0 0 10px 0; font-size: 24px; }
                    p { color: #6b7280; font-size: 16px; margin-bottom: 30px; line-height: 1.5; }
                    .btn { background: #10B981; color: white; text-decoration: none; padding: 12px 30px; border-radius: 30px; font-weight: bold; display: inline-block; transition: transform 0.1s; box-shadow: 0 4px 10px rgba(16,185,129,0.3); }
                        .btn:active { transform: scale(0.95); }
                        @keyframes pop { 0% { transform: scale(0); } 100% { transform: scale(1); } }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <span class="icon">✅</span>
                        <h1>Επιτυχία!</h1>
                        <p>Το PIN ενημερώθηκε.<br>Μπορείτε να κλείσετε αυτή τη σελίδα.</p>
                        <a href="/manage/login.html" class="btn">Επιστροφή</a>
                    </div>
                </body>
                </html>
            `);
        } else {
            res.send("Σφάλμα.");
        }
    });

    /* ---------------- ADMIN PIN RESET ROUTES ---------------- */
    router.get('/reset-admin-pin', (req, res) => {
        const { email } = req.query;
        res.send(`
            <!DOCTYPE html>
            <html lang="el">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Επαναφορά Admin PIN</title>
                <style>
                    body { background-color: #f4f6f8; color: #1f2937; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                    .card { background: #ffffff; padding: 40px; border-radius: 20px; text-align: center; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #e5e7eb; max-width: 90%; width: 320px; }
                    h2 { color: #10B981; margin: 0 0 20px 0; font-size: 24px; }
                    p { color: #6b7280; font-size: 14px; margin-bottom: 30px; line-height: 1.5; }
                    input { padding: 12px; border-radius: 10px; border: 1px solid #d1d5db; background: #f9fafb; color: #1f2937; width: 100%; max-width: 200px; text-align: center; font-size: 24px; letter-spacing: 2px; margin-bottom: 20px; outline: none; transition: border 0.3s; font-weight: bold; }
                    input:focus { border-color: #10B981; }
                    button { padding: 12px 30px; background: #10B981; color: white; border: none; border-radius: 30px; font-weight: bold; cursor: pointer; font-size: 16px; transition: transform 0.1s; width: 100%; max-width: 220px; box-shadow: 0 4px 10px rgba(16,185,129,0.3); }
                    button:active { transform: scale(0.95); }
                </style>
            </head>
            <body>
                <div class="card">
                    <h2>🛡️ Reset Admin PIN</h2>
                    <p>Ορίστε νέο Κωδικό Διαχειριστή για:<br><span style="color:#1f2937; font-weight:bold;">${email}</span></p>
                    <form action="/set-new-admin-pin" method="POST">
                        <input type="hidden" name="email" value="${email}">
                        <input type="text" name="pin" placeholder="Νέος Κωδικός" required>
                        <br>
                        <button type="submit">ΑΠΟΘΗΚΕΥΣΗ</button>
                    </form>
                </div>
            </body>
            </html>
        `);
    });

    router.post('/set-new-admin-pin', async (req, res) => {
        const { email, pin } = req.body;
        if (email && pin) {
            const store = await Logic.getStoreData(email, db, storesData);
            store.settings.adminPin = pin;
            Logic.saveStoreToFirebase(email, db, storesData);
            res.send(`
                <!DOCTYPE html>
                <html lang="el">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Επιτυχία</title>
                    <style>
                    body { background-color: #f4f6f8; color: #1f2937; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                    .card { background: #ffffff; padding: 40px; border-radius: 20px; text-align: center; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #e5e7eb; max-width: 90%; width: 320px; }
                        .icon { font-size: 60px; margin-bottom: 20px; display: block; }
                    h1 { color: #10B981; margin: 0 0 10px 0; font-size: 24px; }
                    .btn { background: #10B981; color: white; text-decoration: none; padding: 12px 30px; border-radius: 30px; font-weight: bold; display: inline-block; margin-top: 20px; box-shadow: 0 4px 10px rgba(16,185,129,0.3); }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <span class="icon">✅</span>
                        <h1>Επιτυχία!</h1>
                        <p>Ο Κωδικός Διαχειριστή άλλαξε.</p>
                        <a href="/manage/login.html" class="btn">Επιστροφή</a>
                    </div>
                </body>
                </html>
            `);
        } else {
            res.send("Σφάλμα.");
        }
    });

    /* ---------------- REWARD CLAIM ENDPOINT ---------------- */
    router.post('/claim-reward', async (req, res) => {
        const { storeName, orderId, phone } = req.body;
        
        if (!storeName || !orderId || !phone) return res.json({ success: false, error: "Λείπουν στοιχεία." });
        
        const store = await Logic.getStoreData(storeName, db, storesData);
        if (!store) return res.json({ success: false, error: "Το κατάστημα δεν βρέθηκε." });
        
        const isManual = String(orderId).startsWith('MANUAL_');
        
        if (!isManual) {
            if (!store.settings.reward || !store.settings.reward.enabled) {
                return res.json({ success: false, error: "Το πρόγραμμα επιβράβευσης είναι ανενεργό." });
            }

            if (!store.orders) store.orders = [];
            const order = store.orders.find(o => o.id == orderId);
            const isValidId = (Date.now() - orderId) < 86400000; // 24 ώρες
            
            if (!order && !isValidId) return res.json({ success: false, error: "Η παραγγελία έληξε ή δεν βρέθηκε." });
        }

        if (!store.claimedRewards) store.claimedRewards = {};
        if (store.claimedRewards[orderId]) {
            return res.json({ success: false, error: "Το QR έχει ήδη χρησιμοποιηθεί!" });
        }

        store.claimedRewards[orderId] = { phone, date: Date.now() };
        
        if (!store.rewards) store.rewards = {};
        if (!store.rewards[phone]) store.rewards[phone] = 0;
        store.rewards[phone]++;

        const target = (store.settings.reward && parseInt(store.settings.reward.target)) || 5;
        const gift = (store.settings.reward && store.settings.reward.gift) || 'Καφές';

        if (store.rewards[phone] % target === 0) {
            const now = new Date();
            const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' }); 
            const [year, month, day] = dateStr.split('-');
            const monthKey = `${year}-${month}`;

            if (!store.stats) store.stats = {};
            if (!store.stats[monthKey]) store.stats[monthKey] = { orders: 0, turnover: 0, days: {} };
            
            if (!store.stats[monthKey].rewardsGiven) store.stats[monthKey].rewardsGiven = 0;
            store.stats[monthKey].rewardsGiven++;

            if (!store.stats[monthKey].days[day]) store.stats[monthKey].days[day] = { orders: 0, turnover: 0 };
            if (!store.stats[monthKey].days[day].rewardsGiven) store.stats[monthKey].days[day].rewardsGiven = 0;
            store.stats[monthKey].days[day].rewardsGiven++;
        }
        
        Logic.saveStoreToFirebase(storeName, db, storesData);

        res.json({ success: true, count: store.rewards[phone], target: target, gift: gift });
    });

    /* ---------------- LOYALTY STANDALONE ROUTES ---------------- */
    router.post('/api/loyalty/settings', async (req, res) => {
        const { email, name, target, gift } = req.body;
        if (!email) return res.json({ success: false, error: 'No email' });
        const storeName = email.toLowerCase().trim();
        const storeData = await Logic.getStoreData(storeName, db, storesData);
        if (!storeData.settings) storeData.settings = {};
        if (!storeData.settings.reward) storeData.settings.reward = {};
        storeData.settings.name = name || storeData.settings.name || storeName;
        storeData.settings.reward.enabled = true;
        storeData.settings.reward.target = parseInt(target) || 5;
        storeData.settings.reward.gift = gift || 'Καφές';
        Logic.saveStoreToFirebase(storeName, db, storesData);
        res.json({ success: true });
    });

    router.post('/api/loyalty/get-settings', async (req, res) => {
        const { email } = req.body;
        if (!email) return res.json({ success: false });
        const storeName = email.toLowerCase().trim();
        const storeData = await Logic.getStoreData(storeName, db, storesData);
        const settings = storeData.settings || {};
        const reward = settings.reward || {};
        res.json({
            success: true,
            name: settings.name || storeName,
            target: reward.target || 5,
            gift: reward.gift || 'Καφές'
        });
    });

    return router;
};