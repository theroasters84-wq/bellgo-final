/* -----------------------------------------------------------
   PREMIUM PRINT - Λογική Εκτύπωσης Παραγγελιών
----------------------------------------------------------- */

const calculateTotal = (text) => {
    let total = 0;
    if (!text) return 0;
    const lines = text.split('\n');
    lines.forEach(line => {
        const match = line.match(/^(\d+)?\s*(.+):(\d+(?:\.\d+)?)$/);
        if (match) {
            let qty = parseInt(match[1] || '1');
            let price = parseFloat(match[3]);
            total += qty * price;
        }
    });
    return total;
};

export const PrintSystem = {
    printOrder: (id, directObj = null) => {
        const App = window.App;
        let order = null;
        if (directObj) {
            order = directObj; 
        } else {
            order = App.activeOrders.find(o => o.id == id);
        }
        
        if(!order) return;
        
        const total = calculateTotal(order.text);
        const date = new Date(order.id).toLocaleString('el-GR');
        const storeName = document.getElementById('inpStoreNameHeader').value || "BellGo Order";
        const itemsHtml = order.text.replace(/\n/g, '<br>');

        let qrHtml = '';
        if (order.aadeQr) {
            const div = document.createElement('div');
            new QRCode(div, { text: order.aadeQr, width: 100, height: 100, correctLevel: QRCode.CorrectLevel.L });
            const img = div.querySelector('img');
            const canvas = div.querySelector('canvas');
            let src = canvas ? canvas.toDataURL() : (img ? img.src : '');
            if (src) qrHtml = `<div style="text-align:center; margin-top:20px; border-top:1px dashed #000; padding-top:10px;"><div style="font-size:10px; font-weight:bold; margin-bottom:5px;">QR Code ΑΑΔΕ</div><img src="${src}" style="width:100px; height:100px;"/></div>`;
        }

        let rewardQrHtml = '';
        if (App.rewardSettings && App.rewardSettings.enabled) {
             const baseUrl = window.location.origin;
             const storeParam = encodeURIComponent(App.userData.store);
             const rewardUrl = `${baseUrl}/loyalty.html?store=${storeParam}&order=${order.id}`;
             const divReward = document.createElement('div');
             new QRCode(divReward, { text: rewardUrl, width: 100, height: 100, correctLevel: QRCode.CorrectLevel.L });
             const imgR = divReward.querySelector('img');
             const canvasR = divReward.querySelector('canvas');
             let srcR = canvasR ? canvasR.toDataURL() : (imgR ? imgR.src : '');
             if (srcR) rewardQrHtml = `<div style="text-align:center; margin-top:20px; border-top:1px dashed #000; padding-top:10px;"><div style="font-size:12px; font-weight:bold; margin-bottom:5px;">🎁 ΣΚΑΝΑΡΕ ΓΙΑ ΔΩΡΟ!</div><img src="${srcR}" style="width:100px; height:100px;"/></div>`;
        }

        const win = window.open('', '', 'width=300,height=600');
        win.document.write(`
            <html>
            <head>
                <title>Print Order #${id}</title>
                <style>
                    body { font-family: 'Courier New', monospace; width: 280px; margin: 0 auto; padding: 10px; color: black; }
                    .header { text-align: center; font-weight: bold; margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 5px; }
                    .meta { font-size: 12px; margin-bottom: 10px; }
                    .items { font-size: 14px; font-weight: bold; border-bottom: 1px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
                    .total { text-align: right; font-size: 18px; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="header">${storeName}</div><div class="meta">${date}<br>${order.from}</div><div class="items">${itemsHtml}</div><div class="total">ΣΥΝΟΛΟ: ${total.toFixed(2)}€</div>${qrHtml}${rewardQrHtml}<script>window.onload = function() { window.print(); setTimeout(function(){ window.close(); }, 500); }</script>
            </body></html>`);

        if (App.autoClosePrint) { const winEl = document.getElementById(`win-${id}`); if(winEl) winEl.style.display = 'none'; }
    }
};