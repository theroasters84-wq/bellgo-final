// premium-stats.js

export const StatsUI = {

    // ✅ NEW: Open Stats and fetch data
    openStatsModal: () => {
        document.getElementById('statsModal').style.display = 'flex';
        document.getElementById('statsContent').innerHTML = '<p style="text-align:center; color:#aaa;">Φόρτωση...</p>';
        
        // Use a flag to prevent multiple requests
        if (!window.socket._callbacks || !window.socket._callbacks['stats-data']) {
            window.socket.on('stats-data', App.renderStats);
        }
        
        window.socket.emit('get-stats');
    },

    // ✅ NEW: Main function to render the dashboard
    renderStats: (data) => {
        App.cachedStats = data; // Cache the data
        App.renderStatsDashboard(); // Render the main dashboard
    },

    // ✅ NEW: Helper για εμφάνιση Dine-In vs Delivery
    getQrStatsHtml: (stats) => {
        if (!stats) return '';
        const dineIn = stats.dineIn || { turnover: 0, orders: 0 };
        const delivery = stats.delivery || { turnover: 0, orders: 0 };
        const totalTurnover = dineIn.turnover + delivery.turnover;
        
        if (totalTurnover === 0 && dineIn.orders === 0 && delivery.orders === 0) return '';

        const dineInPerc = totalTurnover > 0 ? (dineIn.turnover / totalTurnover) * 100 : 0;
        const deliveryPerc = totalTurnover > 0 ? (delivery.turnover / totalTurnover) * 100 : 0;

        return `
            <div style="margin-top:15px; margin-bottom:15px;">
                <h4 class="stats-subsection-title" style="margin-bottom:10px; color:#aaa; font-size:12px;">ΚΑΤΑΝΟΜΗ (DINE-IN vs DELIVERY)</h4>
                <div style="display:flex; gap:10px;">
                    <div style="flex:1; background:#222; padding:12px; border-radius:12px; border-left:4px solid #FF9800; position:relative; overflow:hidden;">
                        <div style="font-size:11px; color:#aaa; font-weight:bold; margin-bottom:4px;">DINE-IN 🍽️</div>
                        <div style="font-size:18px; font-weight:bold; color:white;">${dineIn.turnover.toFixed(2)}€</div>
                        <div style="font-size:11px; color:#ccc;">${dineIn.orders} παρ. (${dineInPerc.toFixed(0)}%)</div>
                        <div style="position:absolute; bottom:-5px; right:5px; font-size:40px; opacity:0.1;">🍽️</div>
                    </div>
                    <div style="flex:1; background:#222; padding:12px; border-radius:12px; border-left:4px solid #2196F3; position:relative; overflow:hidden;">
                        <div style="font-size:11px; color:#aaa; font-weight:bold; margin-bottom:4px;">DELIVERY 🛵</div>
                        <div style="font-size:18px; font-weight:bold; color:white;">${delivery.turnover.toFixed(2)}€</div>
                        <div style="font-size:11px; color:#ccc;">${delivery.orders} παρ. (${deliveryPerc.toFixed(0)}%)</div>
                        <div style="position:absolute; bottom:-5px; right:5px; font-size:40px; opacity:0.1;">🛵</div>
                    </div>
                </div>
            </div>
        `;
    },

    // ✅ NEW: Helper για Γράφημα Ωρών (Bar Chart)
    getPeakHoursHtml: (hoursData, context) => {
        if (!hoursData || Object.keys(hoursData).length === 0) return '<p style="color:#666; font-size:12px;">Δεν υπάρχουν δεδομένα ωρών.</p>';
        
        const hours = Object.keys(hoursData).sort();
        const max = Math.max(...Object.values(hoursData));
        
        let html = '<div style="display:flex; align-items:flex-end; justify-content:center; height:80px; gap:3px; overflow-x:auto; padding-bottom:5px; margin-top:10px;">';
        hours.forEach(h => {
            const count = hoursData[h];
            const height = max > 0 ? (count / max) * 100 : 0;
            html += `<div style="flex:1; max-width:30px; min-width:15px; background:linear-gradient(to top, #2196F3, #64B5F6); height:${Math.max(height, 5)}%; position:relative; border-radius:3px 3px 0 0;" title="${h}:00 - ${count} παρ.">
                <span style="position:absolute; bottom:-15px; left:50%; transform:translateX(-50%); font-size:9px; color:#aaa;">${h}</span>
            </div>`;
        });
        html += '</div>';
        
        if (context) {
            html += `<button onclick='App.openChartModal(${JSON.stringify(context)})' style="width:100%; margin-top:20px; background:#333; color:white; border:1px solid #555; padding:12px; border-radius:8px; cursor:pointer; font-weight:bold; font-size:14px;">📊 ΠΡΟΒΟΛΗ ΣΕ ΠΛΗΡΗ ΟΘΟΝΗ</button>`;
        } else {
            html += '<div style="text-align:center; font-size:10px; color:#aaa; margin-top:15px; font-weight:bold;">ΩΡΕΣ ΑΙΧΜΗΣ (Αριθμός Παραγγελιών)</div>';
        }
        
        return html;
    },

    // ✅ NEW: Open Chart Modal (Full Screen)
    openChartModal: (context) => {
        let data = {};
        let title = "";
        
        if (context.type === 'month') {
            data = App.cachedStats[context.key].hours;
            title = `Ώρες Αιχμής: ${context.key}`;
        } else if (context.type === 'day') {
            data = App.cachedStats[context.month].days[context.day].hours;
            title = `Ώρες Αιχμής: ${context.month}-${context.day}`;
        }
        
        if (!data) return;

        const hours = Object.keys(data).sort();
        const max = Math.max(...Object.values(data));
        
        let html = `
        <div id="chartModal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.95); z-index:20000; display:flex; flex-direction:column; padding:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h2 style="color:white; margin:0; font-size:18px;">${title}</h2>
                <button onclick="document.getElementById('chartModal').remove()" style="background:#333; color:white; border:none; padding:10px 20px; border-radius:5px; font-size:16px;">✕ ΚΛΕΙΣΙΜΟ</button>
            </div>
            <div style="flex:1; display:flex; align-items:flex-end; justify-content:center; gap:5px; padding-bottom:30px; overflow-x:auto;">
        `;
        
        hours.forEach(h => {
            const count = data[h];
            const height = max > 0 ? (count / max) * 100 : 0;
            html += `
                <div style="flex:1; max-width:80px; min-width:30px; background:linear-gradient(to top, #2196F3, #64B5F6); height:${Math.max(height, 1)}%; position:relative; border-radius:5px 5px 0 0;" title="${h}:00 - ${count}">
                    <div style="position:absolute; top:-25px; left:50%; transform:translateX(-50%); color:white; font-weight:bold; font-size:14px;">${count}</div>
                    <div style="position:absolute; bottom:-25px; left:50%; transform:translateX(-50%); color:#aaa; font-size:12px; font-weight:bold;">${h}:00</div>
                </div>
            `;
        });
        
        html += `</div></div>`;
        
        const div = document.createElement('div');
        div.innerHTML = html;
        document.body.appendChild(div.firstElementChild);
    },

    // ✅ NEW: LOGISTIS BAR (Ο ΛΟΓΙΣΤΗΣ)
    // Formula: (Turnover * 0.532) - Fixed - Wages
    // Explanation: T - 30% (Cost) = 0.7T. VAT is 24% of 0.7T = 0.168T.
    // Net = 0.7T - 0.168T = 0.532T. Then subtract Fixed (Pagia) and Wages.
    getLogistisHtml: (turnover, fixedExpenses, wages) => {
        // ✅ FIX: Μετατροπή σε αριθμούς για αποφυγή NaN
        const t = Number(turnover) || 0;
        const f = Number(fixedExpenses) || 0;
        const w = Number(wages) || 0;

        const estimatedNet = (t * 0.532) - f - w;
        const color = estimatedNet >= 0 ? '#00E676' : '#FF5252';
        
        return `
            <div style="margin-top:20px; margin-bottom:20px; background:#111; border:1px solid #333; border-radius:12px; padding:15px; position:relative; overflow:hidden;">
                <div style="position:absolute; top:0; left:0; width:4px; height:100%; background:${color};"></div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-size:12px; color:#aaa; font-weight:bold; letter-spacing:1px;">👨‍💼 Ο ΛΟΓΙΣΤΗΣ ΛΕΕΙ:</div>
                        <div style="font-size:10px; color:#666;">(Τζίρος -30% -ΦΠΑ -Πάγια -Μεροκάματα)</div>
                    </div>
                    <div style="font-size:22px; font-weight:900; color:${color};">${estimatedNet.toFixed(2)}€</div>
                </div>
            </div>
        `;
    },

    renderStatsDashboard: () => {
        const stats = App.cachedStats;
        const content = document.getElementById('statsContent');
        if (!stats || Object.keys(stats).length === 0) {
            content.innerHTML = '<p style="text-align:center; color:#FF5252; font-weight:bold;">Δεν υπάρχουν δεδομένα στατιστικών.</p>';
            return;
        }

        document.getElementById('statsTitle').innerText = '📊 DASHBOARD';
        document.getElementById('btnStatsBack').style.display = 'none';

        const months = Object.keys(stats).sort().reverse();
        
        let totalTurnover = 0;
        let totalOrders = 0;
        let totalExpenses = 0; // ✅ NEW: Global Expenses
        let totalWages = 0;
        let totalFixed = 0; // Estimate based on current settings * days? Or just sum wages?
        // Note: For global dashboard, "Logistis" is tricky because Fixed Expenses are daily/monthly.
        // We will show Logistis mainly in Month/Day views where it's accurate.
        
        let globalHours = {}; // ✅ NEW: Aggregate Hours

        months.forEach(m => {
            totalTurnover += (stats[m].turnover || 0);
            totalOrders += (stats[m].orders || 0);
            // Calc expenses for month
            if (stats[m].days) {
                Object.values(stats[m].days).forEach(d => {
                    if (d.expenses && d.expenses.total) totalExpenses += d.expenses.total;
                    if (d.expenses && d.expenses.wages) totalWages += d.expenses.wages;
                });
            }
            // ✅ NEW: Aggregate Hours for Global Chart
            if (stats[m].hours) {
                Object.keys(stats[m].hours).forEach(h => {
                    globalHours[h] = (globalHours[h] || 0) + stats[m].hours[h];
                });
            }
        });

        const totalNet = totalTurnover - totalExpenses;

        let html = `
            <div class="stats-overview">
                <div class="stat-card" style="background:#222; border:1px solid #333;">
                    <div class="stat-value">${totalTurnover.toFixed(2)}€</div>
                    <div class="stat-label">Συνολικός Τζίρος</div>
                </div>
                <div class="stat-card" style="background:#222; border:1px solid #333;">
                    <div class="stat-value" style="color:${totalNet >= 0 ? '#00E676' : '#FF5252'}">${totalNet.toFixed(2)}€</div>
                    <div class="stat-label">Καθαρό Κέρδος</div>
                    <div style="font-size:10px; color:#aaa; margin-top:2px;">(Έξοδα: -${totalExpenses.toFixed(2)}€)</div>
                </div>
            </div>
            
            <h3 class="stats-section-title" style="margin-top:20px;">⏰ Ώρες Αιχμής (Συνολικά)</h3>
            <div style="background:#222; padding:15px; border-radius:10px; border:1px solid #333;">
                ${StatsUI.getPeakHoursHtml(globalHours, null)}
            </div>

            <h3 class="stats-section-title">Ανάλυση ανά Μήνα</h3>
            <div class="stats-list">
        `;

        months.forEach(monthKey => {
            const monthData = stats[monthKey];
            html += `
                <div class="stats-list-item" onclick="App.renderMonthDetail('${monthKey}')">
                    <span>📅 ${monthKey}</span>
                    <span style="color:#00E676; font-weight:bold;">${(monthData.turnover || 0).toFixed(2)}€</span>
                </div>
            `;
        });

        html += '</div>';
        content.innerHTML = html;
    },
    
    // ✅ NEW: Render details for a specific month
    renderMonthDetail: (monthKey) => {
        const monthData = App.cachedStats[monthKey];
        if (!monthData) return;

        document.getElementById('statsTitle').innerText = `🔍 ${monthKey}`;
        document.getElementById('btnStatsBack').style.display = 'block';

        const content = document.getElementById('statsContent');
        const days = Object.keys(monthData.days || {}).sort().reverse();

        // ✅ NEW: Calculate Total Expenses for the month
        let totalExpenses = 0;
        let totalWages = 0;
        // Calculate Fixed Expenses Sum (Assuming App.fixedExpenses is daily, we multiply by days with data?)
        // Better: Use the wages saved. For Fixed, we use the current settings sum * number of active days.
        const dailyFixedSum = (App.fixedExpenses || []).reduce((a,b) => a + b.price, 0);
        const activeDaysCount = days.length;
        const totalFixed = dailyFixedSum * activeDaysCount;

        if (monthData.days) {
            Object.values(monthData.days).forEach(d => {
                if (d.expenses && d.expenses.total) totalExpenses += d.expenses.total;
                if (d.expenses && d.expenses.wages) totalWages += d.expenses.wages;
            });
        }
        const netProfit = (monthData.turnover || 0) - totalExpenses;
        const avgOrder = monthData.orders > 0 ? (monthData.turnover / monthData.orders) : 0;

        // Calculate totals for products
        const products = monthData.products || {};
        const sortedProducts = Object.entries(products).sort(([, a], [, b]) => b - a);

        // Calculate totals for treats
        const treats = monthData.treats || [];
        const totalTreatValue = treats.reduce((sum, t) => sum + (t.price || 0), 0);
        
        // ✅ NEW: Group products by category
        const categories = {
            "ΚΑΦΕΔΕΣ": [],
            "SANDWICH": [],
            "ΑΝΑΨΥΚΤΙΚΑ": [],
            "ΡΟΦΗΜΑΤΑ": [],
            "ΖΕΣΤΗ ΚΟΥΖΙΝΑ": [],
            "ΚΡΥΑ ΚΟΥΖΙΝΑ": [],
            "ΣΦΟΛΙΑΤΕΣ": [],
            "SNACKS": [],
            "ΚΡΑΣΙΑ": [], // The new category
            " άλλα": []
        };
        
        // Find keywords for each category (simple matching)
        const catKeywords = {
            "ΚΑΦΕΔΕΣ": ["freddo", "cappuccino", "espresso", "latte", "flat white", "americano", "ελληνικός"],
            "SANDWICH": ["sandwich", "club", "burger", "hot dog", "toast", "panini", "baguette"],
            "ΑΝΑΨΥΚΤΙΚΑ": ["coca-cola", "pepsi", "fanta", "sprite", "soda", "νερό"],
            "ΡΟΦΗΜΑΤΑ": ["σοκολάτα", "chocolate", "tea", "τσάι"],
            "ΖΕΣΤΗ ΚΟΥΖΙΝΑ": ["μακαρόνια", "pasta", "pizza", "πίτσα", "ομελέτα"],
            "ΚΡΥΑ ΚΟΥΖΙΝΑ": ["σαλάτα", "salad"],
            "ΣΦΟΛΙΑΤΕΣ": ["τυρόπιτα", "bougatsa", "ครัวσαν"],
            "SNACKS": ["chips", "πατατάκια", "μπάρα"],
            "ΚΡΑΣΙΑ": ["wine", "κρασί", "moschato", "sauvignon", "merlot"]
        };

        sortedProducts.forEach(([name, quantity]) => {
            let found = false;
            for (const cat in catKeywords) {
                if (catKeywords[cat].some(k => name.toLowerCase().includes(k))) {
                    categories[cat].push({ name, quantity });
                    found = true;
                    break;
                }
            }
            if (!found) categories[" άλλα"].push({ name, quantity });
        });
        
        let productsHtml = '';
        for(const cat in categories) {
            if(categories[cat].length > 0) {
                productsHtml += `<h4 class="stats-subsection-title">${cat}</h4>`;
                categories[cat].forEach(p => {
                    productsHtml += `<div class="stats-product-item"><span>${p.name}</span> <span class="stats-product-qty">${p.quantity}</span></div>`;
                });
            }
        }

        // ✅ NEW: Least Sold (Λιγότερο Δημοφιλή)
        const leastSold = sortedProducts.slice(-5).reverse(); // Τα τελευταία 5
        let leastSoldHtml = '';
        leastSold.forEach(([name, qty]) => {
            leastSoldHtml += `<div class="stats-product-item" style="opacity:0.7;"><span>${name}</span> <span class="stats-product-qty" style="background:#444; color:#aaa;">${qty}</span></div>`;
        });

        let html = `
            <div class="stats-overview">
                <div class="stat-card" style="background:#222; border:1px solid #333;">
                    <div class="stat-value">${(monthData.turnover || 0).toFixed(2)}€</div>
                    <div class="stat-label">Τζίρος Μήνα</div>
                </div>
                <div class="stat-card" style="background:#222; border:1px solid #333;">
                    <div class="stat-value" style="color:${netProfit >= 0 ? '#00E676' : '#FF5252'}">${netProfit.toFixed(2)}€</div>
                    <div class="stat-label">Καθαρό Κέρδος</div>
                    <div style="font-size:10px; color:#aaa;">(Έξοδα: -${totalExpenses.toFixed(2)}€)</div>
                </div>
                <div class="stat-card" style="background:#222; border:1px solid #333;">
                    <div class="stat-value" style="color:#FFD700;">${avgOrder.toFixed(2)}€</div>
                    <div class="stat-label">Μέση Παραγγελία</div>
                </div>
            </div>

            ${StatsUI.getLogistisHtml(monthData.turnover || 0, totalFixed, totalWages)}

            ${StatsUI.getQrStatsHtml(monthData.qrStats)}

            <h3 class="stats-section-title" style="margin-top:20px;">⏰ Ώρες Αιχμής (Μήνας)</h3>
            <div style="background:#222; padding:15px; border-radius:10px; border:1px solid #333;">${StatsUI.getPeakHoursHtml(monthData.hours, {type:'month', key:monthKey})}</div>

            <h3 class="stats-section-title">🏆 Top Προϊόντα (Top Sellers)</h3>
            <div class="stats-products-list">${productsHtml}</div>

            <h3 class="stats-section-title" style="margin-top:20px; color:#aaa; border-color:#444;">📉 Λιγότερο Δημοφιλή</h3>
            <div class="stats-products-list">${leastSoldHtml || '<p style="color:#666;">Δεν υπάρχουν δεδομένα.</p>'}</div>
            
            <h3 class="stats-section-title" style="margin-top:20px;">Ανάλυση ανά Ημέρα</h3>
            <div class="stats-list">
        `;

        days.forEach(dayKey => {
            const dayData = monthData.days[dayKey];
            const expenseTotal = (dayData.expenses && dayData.expenses.total) ? dayData.expenses.total : 0;
            const net = (dayData.turnover || 0) - expenseTotal;
            html += `
                <div class="stats-list-item" onclick="App.renderDayDetail('${monthKey}', '${dayKey}')">
                    <span>📅 ${monthKey}-${dayKey}</span>
                    <div style="text-align:right;">
                        <span style="color:#00E676;">+${(dayData.turnover || 0).toFixed(2)}€</span>
                        <span style="color:#FF5252; margin-left:10px;">-${expenseTotal.toFixed(2)}€</span>
                        <strong style="color:${net >= 0 ? '#635BFF' : '#FF5252'}; margin-left:10px;">= ${net.toFixed(2)}€</strong>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        content.innerHTML = html;
    },
    
    // ✅ NEW: Render details for a specific day
    renderDayDetail: (monthKey, dayKey) => {
        const dayData = App.cachedStats[monthKey].days[dayKey];
        if (!dayData) return;

        // Calculate Fixed for Day
        const dailyFixedSum = (App.fixedExpenses || []).reduce((a,b) => a + b.price, 0);
        const dayWages = (dayData.expenses && dayData.expenses.wages) ? dayData.expenses.wages : 0;

        document.getElementById('statsTitle').innerText = `🔍 ${monthKey}-${dayKey}`;
        document.getElementById('btnStatsBack').onclick = () => App.renderMonthDetail(monthKey); // Set back button to month
        document.getElementById('btnStatsBack').style.display = 'block';

        const content = document.getElementById('statsContent');
        const staff = dayData.staff || {};
        const sortedStaff = Object.entries(staff).sort(([, a], [, b]) => b.turnover - a.turnover);

        const expenses = dayData.expenses || { text: 'Δεν καταγράφηκαν έξοδα.', total: 0 };
        const net = (dayData.turnover || 0) - (expenses.total || 0);

        let staffHtml = '';
        sortedStaff.forEach(([name, data]) => {
            // ✅ NEW: Υπολογισμός Τεμαχίων (Items) ανά άτομο
            let totalItems = 0;
            if (data.products) Object.values(data.products).forEach(q => totalItems += q);

            staffHtml += `
                <div class="stats-staff-card">
                    <div class="stats-staff-header">
                        <span class="stats-staff-name">${name}</span>
                        <div style="text-align:right;">
                            <div class="stats-staff-turnover">${data.turnover.toFixed(2)}€</div>
                            <div style="font-size:10px; color:#aaa;">${totalItems} τμχ.</div>
                        </div>
                        <span class="stats-staff-turnover">${data.turnover.toFixed(2)}€</span>
                    </div>
                    <div class="stats-staff-products">
                        ${Object.entries(data.products || {}).map(([p,q]) => `<div>- ${p}: <b>${q}</b></div>`).join('')}
                    </div>
                </div>
            `;
        });

        let html = `
            <div class="stats-overview">
                 <div class="stat-card" style="background:rgba(0, 230, 118, 0.1); border:1px solid #00E676;">
                    <div class="stat-value">+${(dayData.turnover || 0).toFixed(2)}€</div>
                    <div class="stat-label">Τζίρος</div>
                </div>
                <div class="stat-card" style="background:rgba(255, 82, 82, 0.1); border:1px solid #FF5252;">
                    <div class="stat-value">-${(expenses.total || 0).toFixed(2)}€</div>
                    <div class="stat-label">Έξοδα</div>
                </div>
                <div class="stat-card" style="background:#222; border:1px solid #444;">
                    <div class="stat-value" style="color:${net >= 0 ? '#00E676' : '#FF5252'}">${net.toFixed(2)}€</div>
                    <div class="stat-label">Καθαρό</div>
                </div>
            </div>

            ${StatsUI.getLogistisHtml(dayData.turnover || 0, dailyFixedSum, dayWages)}

            ${StatsUI.getQrStatsHtml(dayData.qrStats)}

            <h3 class="stats-section-title">⏰ Ώρες Αιχμής (Σήμερα)</h3>
            <div style="background:#222; padding:15px; border-radius:10px; border:1px solid #333;">${StatsUI.getPeakHoursHtml(dayData.hours, {type:'day', month:monthKey, day:dayKey})}</div>

            <h3 class="stats-section-title">Ανάλυση Προσωπικού</h3>
            <div class="stats-staff-container">${staffHtml || '<p>Δεν υπάρχουν δεδομένα.</p>'}</div>
            
            <h3 class="stats-section-title" style="margin-top:20px;">Σημειώσεις Εξόδων</h3>
            <pre class="stats-expenses-text">${expenses.text}</pre>
        `;

        content.innerHTML = html;
    }
};
