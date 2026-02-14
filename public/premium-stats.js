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
        months.forEach(m => {
            totalTurnover += (stats[m].turnover || 0);
            totalOrders += (stats[m].orders || 0);
        });

        let html = `
            <div class="stats-overview">
                <div class="stat-card">
                    <div class="stat-value">${totalTurnover.toFixed(2)}€</div>
                    <div class="stat-label">Συνολικός Τζίρος</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${totalOrders}</div>
                    <div class="stat-label">Συνολικές Παραγγελίες</div>
                </div>
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


        let html = `
            <div class="stats-overview">
                <div class="stat-card">
                    <div class="stat-value">${(monthData.turnover || 0).toFixed(2)}€</div>
                    <div class="stat-label">Τζίρος Μήνα</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${monthData.orders || 0}</div>
                    <div class="stat-label">Παραγγελίες</div>
                </div>
                <div class="stat-card" style="background:#FF9800;">
                    <div class="stat-value">${totalTreatValue.toFixed(2)}€</div>
                    <div class="stat-label">Αξία Κερασμάτων</div>
                </div>
            </div>

            <h3 class="stats-section-title">Προϊόντα (Top Sellers)</h3>
            <div class="stats-products-list">${productsHtml}</div>
            
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
            staffHtml += `
                <div class="stats-staff-card">
                    <div class="stats-staff-header">
                        <span class="stats-staff-name">${name}</span>
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
                 <div class="stat-card" style="background:#00E676;">
                    <div class="stat-value">+${(dayData.turnover || 0).toFixed(2)}€</div>
                    <div class="stat-label">Τζίρος</div>
                </div>
                <div class="stat-card" style="background:#FF5252;">
                    <div class="stat-value">-${(expenses.total || 0).toFixed(2)}€</div>
                    <div class="stat-label">Έξοδα</div>
                </div>
                <div class="stat-card" style="background:${net >= 0 ? '#635BFF' : '#FF5252'};">
                    <div class="stat-value">${net.toFixed(2)}€</div>
                    <div class="stat-label">Καθαρό</div>
                </div>
            </div>

            <h3 class="stats-section-title">Ανάλυση Προσωπικού</h3>
            <div class="stats-staff-container">${staffHtml || '<p>Δεν υπάρχουν δεδομένα.</p>'}</div>
            
            <h3 class="stats-section-title" style="margin-top:20px;">Σημειώσεις Εξόδων</h3>
            <pre class="stats-expenses-text">${expenses.text}</pre>
        `;

        content.innerHTML = html;
    }
};
