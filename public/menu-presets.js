/* ΑΡΧΕΙΟ ΠΡΟΤΥΠΩΝ ΚΑΤΑΛΟΓΩΝ (PRESETS)
   Εδώ μπορείς να αλλάξεις προϊόντα, τιμές και extras.
   
   ΠΡΟΣΟΧΗ: Μην σβήσεις τα άγκιστρα { } και τις αγκύλες [ ].
*/

export const DEFAULT_CATEGORIES = [
    { order: 1, name: "ΚΑΦΕΔΕΣ", items: [] },
    { order: 2, name: "SANDWICH", items: [] },
    { order: 3, name: "ΑΝΑΨΥΚΤΙΚΑ", items: [] },
    { order: 4, name: "ΡΟΦΗΜΑΤΑ", items: [] },
    { order: 5, name: "ΖΕΣΤΗ ΚΟΥΖΙΝΑ", items: [] },
    { order: 6, name: "ΚΡΥΑ ΚΟΥΖΙΝΑ", items: [] },
    { order: 7, name: "ΣΦΟΛΙΑΤΕΣ", items: [] },
    { order: 8, name: "SNACKS", items: [] }
];

export const PRESET_MENUS = {
    'coffee_takeaway': [
        { order: 1, name: "ΚΑΦΕΔΕΣ", items: [
            { name: "Espresso", price: 2.20, extras: [] },
            { name: "Espresso Double", price: 2.80, extras: [] },
            { name: "Freddo Espresso", price: 3.00, extras: [{name:"Μέτριο",price:0},{name:"Γλυκό",price:0},{name:"Σκέτο",price:0},{name:"Γάλα",price:0.30}] },
            { name: "Cappuccino", price: 3.00, extras: [{name:"Κανέλα",price:0},{name:"Σοκολάτα",price:0}] },
            { name: "Cappuccino Double", price: 3.50, extras: [] },
            { name: "Freddo Cappuccino", price: 3.30, extras: [{name:"Μέτριο",price:0},{name:"Γλυκό",price:0},{name:"Σκέτο",price:0},{name:"Κανέλα",price:0}] },
            { name: "Latte", price: 3.50, extras: [] },
            { name: "Flat White", price: 3.30, extras: [] },
            { name: "Nes / Frappe", price: 2.50, extras: [{name:"Γάλα",price:0.30}] },
            { name: "Ελληνικός", price: 2.00, extras: [{name:"Διπλός",price:0.50}] },
            { name: "Φίλτρου", price: 2.80, extras: [] }
        ]},
        { order: 2, name: "ΡΟΦΗΜΑΤΑ", items: [
            { name: "Σοκολάτα (Ζεστή/Κρύα)", price: 3.50, extras: [{name:"Σαντιγύ",price:0.50}] },
            { name: "Τσάι (Διάφορες Γεύσεις)", price: 2.80, extras: [] },
            { name: "Φυσικός Χυμός Πορτοκάλι", price: 4.00, extras: [] },
            { name: "Φυσικός Χυμός Ανάμεικτος", price: 4.50, extras: [] },
            { name: "Smoothie Φράουλα", price: 5.00, extras: [] },
            { name: "Smoothie Μπανάνα", price: 5.00, extras: [] },
            { name: "Milkshake Σοκολάτα", price: 4.50, extras: [] },
            { name: "Milkshake Βανίλια", price: 4.50, extras: [] },
            { name: "Γρανίτα Φράουλα", price: 3.50, extras: [] }
        ]},
        { order: 3, name: "ΣΦΟΛΙΑΤΕΣ", items: [
            { name: "Τυρόπιτα Ταψιού", price: 2.50, extras: [] },
            { name: "Τυρόπιτα Κουρού", price: 2.20, extras: [] },
            { name: "Σπανακόπιτα", price: 2.60, extras: [] },
            { name: "Ζαμπονοτυρόπιτα", price: 2.80, extras: [] },
            { name: "Λουκανικόπιτα", price: 2.60, extras: [] },
            { name: "Μπουγάτσα Κρέμα", price: 3.00, extras: [{name:"Άχνη/Κανέλα",price:0}] },
            { name: "Πεϊνιρλί Special", price: 3.20, extras: [] },
            { name: "Κρουασάν Βουτύρου", price: 2.00, extras: [] },
            { name: "Κρουασάν Σοκολάτα", price: 2.50, extras: [] },
            { name: "Κουλούρι Θεσσαλονίκης", price: 1.00, extras: [] }
        ]},
        { order: 4, name: "SNACKS", items: [
            { name: "Toast Ζαμπόν-Τυρί", price: 3.00, extras: [{name:"Μαγιονέζα",price:0}] },
            { name: "Toast Γαλοπούλα-Τυρί", price: 3.00, extras: [] },
            { name: "Club Sandwich Classic", price: 7.50, extras: [{name:"Πατάτες",price:0}] },
            { name: "Club Sandwich Κοτόπουλο", price: 8.50, extras: [{name:"Πατάτες",price:0}] },
            { name: "Baguette Ζαμπόν", price: 4.50, extras: [] },
            { name: "Baguette Κοτόπουλο", price: 5.00, extras: [] },
            { name: "Baguette Τόνος", price: 5.20, extras: [] },
            { name: "Tortilla Γαλοπούλα", price: 4.80, extras: [] },
            { name: "Tortilla Κοτόπουλο", price: 5.20, extras: [] },
            { name: "Muffin Σοκολάτα", price: 2.80, extras: [] },
            { name: "Cookie", price: 2.20, extras: [] },
            { name: "Donut", price: 2.20, extras: [] },
            { name: "Μπάρα Δημητριακών", price: 2.00, extras: [] }
        ]},
        { order: 5, name: "ΑΝΑΨΥΚΤΙΚΑ", items: [
            { name: "Νερό 500ml", price: 0.50, extras: [] },
            { name: "Coca Cola 330ml", price: 2.00, extras: [] },
            { name: "Coca Cola Zero 330ml", price: 2.00, extras: [] },
            { name: "Fanta Κόκκινη 330ml", price: 2.00, extras: [] },
            { name: "Fanta Μπλε 330ml", price: 2.00, extras: [] },
            { name: "Sprite 330ml", price: 2.00, extras: [] },
            { name: "Soda 330ml", price: 2.00, extras: [] },
            { name: "Red Bull", price: 3.00, extras: [] },
            { name: "Amita Motion", price: 2.50, extras: [] },
            { name: "Monster Energy", price: 3.00, extras: [] }
        ]}
    ],
    'coffee_bar': [
        { order: 1, name: "ΚΑΦΕΔΕΣ", items: [
            { name: "Espresso", price: 3.50, extras: [] },
            { name: "Espresso Double", price: 4.00, extras: [] },
            { name: "Cappuccino", price: 4.50, extras: [] },
            { name: "Freddo Espresso", price: 4.50, extras: [] },
            { name: "Freddo Cappuccino", price: 5.00, extras: [] },
            { name: "Latte", price: 5.00, extras: [] },
            { name: "Flat White", price: 4.80, extras: [] },
            { name: "Ελληνικός", price: 3.50, extras: [{name:"Διπλός",price:1.00}] },
            { name: "Irish Coffee", price: 8.00, extras: [] },
            { name: "Cold Brew", price: 5.00, extras: [] }
        ]},
        { order: 2, name: "BRUNCH", items: [
            { name: "Pancakes Σοκολάτα", price: 8.50, extras: [{name:"Μπανάνα",price:1.00},{name:"Μπισκότο",price:0.50}] },
            { name: "Pancakes Maple Syrup", price: 8.00, extras: [] },
            { name: "Pancakes Red Velvet", price: 9.50, extras: [] },
            { name: "Ομελέτα Special", price: 9.00, extras: [] },
            { name: "Ομελέτα Λαχανικών", price: 8.50, extras: [] },
            { name: "Eggs Benedict", price: 10.00, extras: [] },
            { name: "Croque Madame", price: 9.50, extras: [] },
            { name: "Avocado Toast", price: 9.00, extras: [] },
            { name: "Yogurt Bowl", price: 7.50, extras: [{name:"Μέλι/Καρύδια",price:0}] },
            { name: "Club Sandwich", price: 10.00, extras: [] },
            { name: "Burger Classic", price: 12.00, extras: [{name:"Πατάτες",price:0}] }
        ]},
        { order: 3, name: "ΠΟΤΑ", items: [
            { name: "Whiskey Simple", price: 9.00, extras: [] },
            { name: "Whiskey Special", price: 11.00, extras: [] },
            { name: "Vodka Simple", price: 9.00, extras: [] },
            { name: "Vodka Premium", price: 12.00, extras: [] },
            { name: "Gin Simple", price: 9.00, extras: [] },
            { name: "Gin Premium", price: 12.00, extras: [] },
            { name: "Rum Simple", price: 9.00, extras: [] },
            { name: "Rum Special", price: 11.00, extras: [] },
            { name: "Tequila White", price: 9.00, extras: [] },
            { name: "Tequila Yellow", price: 9.00, extras: [] },
            { name: "Metaxa 5*", price: 8.00, extras: [] }
        ]},
        { order: 4, name: "COCKTAILS", items: [
            { name: "Mojito", price: 11.00, extras: [] },
            { name: "Margarita", price: 11.00, extras: [] },
            { name: "Daiquiri", price: 11.00, extras: [] },
            { name: "Aperol Spritz", price: 10.00, extras: [] },
            { name: "Negroni", price: 11.00, extras: [] },
            { name: "Old Fashioned", price: 11.00, extras: [] },
            { name: "Pornstar Martini", price: 12.00, extras: [] },
            { name: "Mai Tai", price: 12.00, extras: [] },
            { name: "Paloma", price: 11.00, extras: [] },
            { name: "Zombie", price: 13.00, extras: [] },
            { name: "Espresso Martini", price: 12.00, extras: [] }
        ]},
        { order: 5, name: "ΜΠΥΡΕΣ", items: [
            { name: "Draught Small 330ml", price: 5.00, extras: [] },
            { name: "Draught Large 500ml", price: 6.50, extras: [] },
            { name: "Lager Bottle", price: 5.50, extras: [] },
            { name: "Pilsner Bottle", price: 6.00, extras: [] },
            { name: "Weiss Bottle", price: 6.50, extras: [] },
            { name: "IPA Bottle", price: 7.00, extras: [] },
            { name: "Corona", price: 6.00, extras: [] }
        ]},
        { order: 6, name: "ΚΡΑΣΙΑ", items: [
            { name: "Ποτήρι Λευκό", price: 6.00, extras: [] },
            { name: "Ποτήρι Κόκκινο", price: 6.50, extras: [] },
            { name: "Ποτήρι Ροζέ", price: 6.50, extras: [] },
            { name: "Φιάλη Λευκό", price: 28.00, extras: [] },
            { name: "Φιάλη Κόκκινο", price: 32.00, extras: [] },
            { name: "Φιάλη Ροζέ", price: 30.00, extras: [] },
            { name: "Sangria", price: 7.00, extras: [] }
        ]}
    ],
    'pizzeria': [
        { order: 1, name: "PIZZA", items: [
            { name: "Margherita", price: 10.00, extras: [{name:"Extra Cheese",price:1.50}] },
            { name: "Special", price: 13.50, extras: [] },
            { name: "Pepperoni", price: 12.00, extras: [] },
            { name: "Carbonara", price: 12.50, extras: [] },
            { name: "BBQ Chicken", price: 13.00, extras: [] },
            { name: "Vegetarian", price: 11.50, extras: [] },
            { name: "Ελληνική", price: 12.00, extras: [] },
            { name: "4 Τυριά", price: 12.50, extras: [] },
            { name: "Prosciutto & Rucola", price: 14.00, extras: [] },
            { name: "Hawaiian", price: 12.00, extras: [] },
            { name: "Truffle & Mushroom", price: 15.00, extras: [] },
            { name: "Spicy (Kafteri)", price: 12.50, extras: [] }
        ]},
        { order: 2, name: "ΖΥΜΑΡΙΚΑ", items: [
            { name: "Napoli", price: 9.00, extras: [{name:"Parmesan",price:1.00}] },
            { name: "Bolognese", price: 10.50, extras: [{name:"Parmesan",price:1.00}] },
            { name: "Carbonara", price: 11.00, extras: [] },
            { name: "Pesto Genovese", price: 10.50, extras: [] },
            { name: "4 Τυριά", price: 11.50, extras: [] },
            { name: "Arrabbiata", price: 10.00, extras: [] },
            { name: "Salmon (Σολομός)", price: 13.00, extras: [] },
            { name: "Truffle Pasta", price: 14.00, extras: [] }
        ]},
        { order: 3, name: "ΣΑΛΑΤΕΣ", items: [
            { name: "Caesar's", price: 10.00, extras: [] },
            { name: "Chef", price: 9.50, extras: [] },
            { name: "Χωριάτικη", price: 9.00, extras: [] },
            { name: "Rucola-Parmesan", price: 10.50, extras: [] },
            { name: "Caprese", price: 10.00, extras: [] },
            { name: "Tuna Salad", price: 10.50, extras: [] },
            { name: "Pasta Salad", price: 9.50, extras: [] }
        ]},
        { order: 4, name: "ΟΡΕΚΤΙΚΑ", items: [
            { name: "Σκορδόψωμο", price: 4.00, extras: [{name:"Με Τυρί",price:1.00}] },
            { name: "Bruschetta", price: 6.00, extras: [] },
            { name: "Πατάτες Τηγανητές", price: 4.50, extras: [{name:"Cheddar/Bacon",price:2.00}] },
            { name: "Chicken Nuggets", price: 7.00, extras: [] },
            { name: "Mozzarella Sticks", price: 7.50, extras: [] },
            { name: "Onion Rings", price: 6.00, extras: [] },
            { name: "Φέτα Ψητή", price: 5.50, extras: [] },
            { name: "Chicken Wings", price: 8.00, extras: [] }
        ]},
        { order: 5, name: "ΓΛΥΚΑ", items: [
            { name: "Σουφλέ Σοκολάτας", price: 7.00, extras: [{name:"Παγωτό",price:1.50}] },
            { name: "Cheesecake", price: 6.50, extras: [] },
            { name: "Tiramisu", price: 6.50, extras: [] },
            { name: "Panna Cotta", price: 6.00, extras: [] },
            { name: "Calzone Sweet (Nutella)", price: 8.00, extras: [] }
        ]},
        { order: 6, name: "ΑΝΑΨΥΚΤΙΚΑ", items: [
            { name: "Coca Cola 330ml", price: 2.00, extras: [] },
            { name: "Coca Cola 1.5L", price: 4.00, extras: [] },
            { name: "Fanta 330ml", price: 2.00, extras: [] },
            { name: "Sprite 330ml", price: 2.00, extras: [] },
            { name: "Νερό 1L", price: 1.50, extras: [] },
            { name: "Beer 500ml", price: 4.50, extras: [] },
            { name: "Κρασί (Ποτήρι)", price: 5.00, extras: [] }
        ]}
    ],
    'souvlaki': [
        { order: 1, name: "ΤΥΛΙΧΤΑ", items: [
            { name: "Πίτα Γύρος Χοιρινό", price: 4.30, extras: [{name:"Απ'όλα",price:0},{name:"Χωρίς Κρεμμύδι",price:0},{name:"Χωρίς Τζατζίκι",price:0}] },
            { name: "Πίτα Γύρος Κοτόπουλο", price: 4.30, extras: [{name:"Απ'όλα",price:0},{name:"Σως",price:0}] },
            { name: "Πίτα Καλαμάκι Χοιρινό", price: 4.30, extras: [] },
            { name: "Πίτα Καλαμάκι Κοτόπουλο", price: 4.30, extras: [] },
            { name: "Πίτα Κεμπάπ", price: 4.40, extras: [] },
            { name: "Πίτα Λουκάνικο", price: 4.20, extras: [] },
            { name: "Πίτα Μπιφτέκι", price: 4.40, extras: [] },
            { name: "Πίτα Χαλούμι", price: 4.20, extras: [] },
            { name: "Πίτα Μανιτάρια (Veggie)", price: 4.00, extras: [] },
            { name: "Πίτα Οικολογική (Χωρίς Κρέας)", price: 2.80, extras: [] },
            { name: "Πίτα ΦαλάFEL", price: 4.20, extras: [] }
        ]},
        { order: 2, name: "ΜΕΡΙΔΕΣ", items: [
            { name: "Μερίδα Γύρος Χοιρινό", price: 11.50, extras: [] },
            { name: "Μερίδα Γύρος Κοτόπουλο", price: 11.50, extras: [] },
            { name: "Μερίδα Καλαμάκια Χοιρινά (3τμχ)", price: 11.00, extras: [] },
            { name: "Μερίδα Καλαμάκια Κοτόπουλο (3τμχ)", price: 11.00, extras: [] },
            { name: "Μερίδα Κεμπάπ Γιαουρτλού", price: 12.50, extras: [] },
            { name: "Μερίδα Μπιφτέκι Γεμιστό", price: 12.00, extras: [] },
            { name: "Mix Grill (2 Ατόμων)", price: 26.00, extras: [] },
            { name: "Σκεπαστή Γύρος Χοιρινό", price: 11.00, extras: [] },
            { name: "Σκεπαστή Γύρος Κοτόπουλο", price: 11.00, extras: [] }
        ]},
        { order: 3, name: "ΤΕΜΑΧΙΑ", items: [
            { name: "Καλαμάκι Χοιρινό", price: 2.40, extras: [{name:"Ψωμάκι",price:0}] },
            { name: "Καλαμάκι Κοτόπουλο", price: 2.40, extras: [{name:"Ψωμάκι",price:0}] },
            { name: "Κεμπάπ", price: 2.50, extras: [] },
            { name: "Λουκάνικο", price: 2.20, extras: [] },
            { name: "Μπιφτέκι", price: 2.60, extras: [] }
        ]},
        { order: 4, name: "ΟΡΕΚΤΙΚΑ", items: [
            { name: "Πατάτες Τηγανητές", price: 4.00, extras: [{name:"Σως",price:0.50},{name:"Τυρί",price:1.00}] },
            { name: "Τζατζίκι", price: 4.00, extras: [] },
            { name: "Τυροκαυτερή", price: 4.50, extras: [] },
            { name: "Φέτα (Λάδι/Ρίγανη)", price: 4.50, extras: [] },
            { name: "Σαγανάκι", price: 5.00, extras: [] },
            { name: "Κολοκυθοκεφτέδες", price: 5.50, extras: [] },
            { name: "Τυροκροκέτες", price: 5.00, extras: [] },
            { name: "Πίτα Σκέτη", price: 0.60, extras: [] },
            { name: "Ψωμί Ψητό", price: 1.20, extras: [] },
            { name: "Ντοματοκεφτέδες", price: 5.50, extras: [] }
        ]},
        { order: 5, name: "ΣΑΛΑΤΕΣ", items: [
            { name: "Χωριάτικη", price: 8.50, extras: [] },
            { name: "Ντάκος", price: 8.00, extras: [] },
            { name: "Μαρούλι", price: 6.50, extras: [] },
            { name: "Λάχανο-Καρότο", price: 6.00, extras: [] },
            { name: "Caesar's", price: 9.50, extras: [] }
        ]},
        { order: 6, name: "ΑΝΑΨΥΚΤΙΚΑ", items: [
            { name: "Coca Cola 330ml", price: 2.00, extras: [] },
            { name: "Coca Cola 500ml", price: 2.50, extras: [] },
            { name: "Coca Cola 1.5L", price: 4.00, extras: [] },
            { name: "Fanta 330ml", price: 2.00, extras: [] },
            { name: "Sprite 330ml", price: 2.00, extras: [] },
            { name: "Νερό 500ml", price: 0.50, extras: [] },
            { name: "Amstel 500ml", price: 4.00, extras: [] },
            { name: "Heineken 500ml", price: 4.20, extras: [] },
            { name: "Fix 500ml", price: 4.00, extras: [] },
            { name: "Kaiser 500ml", price: 4.50, extras: [] },
            { name: "Mamos 500ml", price: 4.20, extras: [] }
        ]}
    ],
    'burger_house': [
        { order: 1, name: "BURGERS", items: [
            { name: "Hamburger", price: 6.00, extras: [{name:"Extra Patty",price:2.00},{name:"Bacon",price:1.00}] },
            { name: "Cheeseburger", price: 6.50, extras: [{name:"Extra Cheese",price:0.50}] },
            { name: "Bacon Burger", price: 7.50, extras: [] },
            { name: "Mushroom Burger", price: 7.50, extras: [] },
            { name: "BBQ Burger", price: 7.80, extras: [] },
            { name: "Chicken Burger", price: 7.00, extras: [] },
            { name: "Veggie Burger", price: 7.00, extras: [] },
            { name: "Double Burger", price: 9.50, extras: [] },
            { name: "Truffle Burger", price: 10.00, extras: [] }
        ]},
        { order: 2, name: "SIDES", items: [
            { name: "French Fries", price: 3.50, extras: [{name:"Cheddar/Bacon",price:2.00}] },
            { name: "Onion Rings", price: 4.50, extras: [] },
            { name: "Mozzarella Sticks", price: 5.50, extras: [] },
            { name: "Chicken Wings", price: 6.50, extras: [] },
            { name: "Coleslaw", price: 3.00, extras: [] },
            { name: "Sweet Potato Fries", price: 4.50, extras: [] }
        ]},
        { order: 3, name: "SAUCES", items: [
            { name: "Mayo", price: 0.50, extras: [] },
            { name: "Ketchup", price: 0.50, extras: [] },
            { name: "Mustard", price: 0.50, extras: [] },
            { name: "BBQ Sauce", price: 0.80, extras: [] },
            { name: "Truffle Mayo", price: 1.00, extras: [] },
            { name: "Spicy Mayo", price: 0.80, extras: [] }
        ]},
        { order: 4, name: "DRINKS", items: [
            { name: "Coca Cola 330ml", price: 2.00, extras: [] },
            { name: "Coca Cola Zero 330ml", price: 2.00, extras: [] },
            { name: "Fanta 330ml", price: 2.00, extras: [] },
            { name: "Sprite 330ml", price: 2.00, extras: [] },
            { name: "Water 500ml", price: 0.50, extras: [] },
            { name: "Beer 330ml", price: 3.50, extras: [] },
            { name: "Beer 500ml", price: 4.50, extras: [] }
        ]}
    ]
};

export const Menu = {
    handlePlusButton: function() {
        const App = window.App;
        if (App.currentCategoryIndex === null) {
            let order = prompt("Αριθμός Σειράς (π.χ. 1, 2):");
            if(!order) return;
            let name = prompt("Όνομα Κατηγορίας (π.χ. ΚΑΦΕΔΕΣ):");
            if(!name) return;
            App.pendingAction = () => {
                App.menuData.push({ id: Date.now(), order: parseInt(order) || 99, name: name.toUpperCase(), items: [] });
            };
            App.openSaveModal(); 
        } else {
            App.addItemInput('');
        }
    },

    renderMenu: function() {
        const App = window.App;
        const container = document.getElementById('menuInputContainer');
        if (!container) return; // ✅ Αποτρέπει το error αν δεν υπάρχει το HTML element (π.χ. στην Κουζίνα)
        container.innerHTML = '';
        App.menuData.sort((a,b) => a.order - b.order);
        if (App.currentCategoryIndex === null) {
            const btnBack = document.getElementById('btnBackCat');
            if (btnBack) btnBack.style.display = 'none';
            App.menuData.forEach((cat, index) => {
                const div = document.createElement('div');
                div.className = 'category-box';
                div.innerHTML = `<span class="category-order">${cat.order}</span>${cat.name}`;
                const delBtn = document.createElement('button');
                delBtn.className = 'btn-delete-cat';
                delBtn.innerText = 'X';
                delBtn.onclick = (e) => {
                    e.stopPropagation();
                    App.pendingAction = () => { App.menuData.splice(index, 1); };
                    App.openSaveModal();
                };
                div.appendChild(delBtn);
                div.onclick = () => { App.currentCategoryIndex = index; App.renderMenu(); };
                container.appendChild(div);
            });
        } else {
            const cat = App.menuData[App.currentCategoryIndex];
            if(!cat) { App.currentCategoryIndex = null; App.renderMenu(); return; }
            const btnBack = document.getElementById('btnBackCat');
            if (btnBack) btnBack.style.display = 'block';
            cat.items.forEach((item, itemIdx) => { App.addItemInput(item, itemIdx); });
        }
    },

    addItemInput: function(val, index = null) {
        const App = window.App;
        const container = document.getElementById('menuInputContainer');
        const wrapper = document.createElement('div');
        wrapper.className = 'item-wrapper';
        
        let displayText = "";
        let itemObj = null;

        if (typeof val === 'object' && val !== null) {
            itemObj = val;
            displayText = `${itemObj.name}:${itemObj.price}`;
        } else {
            displayText = val;
        }

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'menu-input-box';
        input.value = displayText;
        input.placeholder = "Προϊόν:Τιμή"; 

        const vatInput = document.createElement('input');
        vatInput.type = 'number';
        vatInput.placeholder = 'ΦΠΑ';
        const vatDisplay = App.einvoicingEnabled ? 'inline-block' : 'none';
        vatInput.style.cssText = `width:50px; padding:10px; margin-left:5px; background:#222; border:1px solid #444; color:#fff; border-radius:4px; text-align:center; font-size:14px; display:${vatDisplay};`;
        
        if (itemObj && itemObj.vat !== undefined) vatInput.value = itemObj.vat;
        else vatInput.value = 24;
        
        const extrasBtn = document.createElement('button');
        extrasBtn.className = 'btn-item-extras';
        extrasBtn.innerHTML = '+';
        if (itemObj && itemObj.extras && itemObj.extras.length > 0) extrasBtn.classList.add('has-extras');
        extrasBtn.onclick = () => { App.openExtrasModal(App.currentCategoryIndex, index); };

        const delBtn = document.createElement('button');
        delBtn.className = 'btn-item-del';
        delBtn.innerText = 'X';
        delBtn.onclick = () => {
            wrapper.remove();
            App.pendingAction = () => {
                const cat = App.menuData[App.currentCategoryIndex];
                if (index !== null) cat.items.splice(index, 1);
            };
            App.openSaveModal();
        };
        
        const updateItem = (e) => {
            if (e.relatedTarget === input || e.relatedTarget === vatInput) return;
            const newVal = input.value.trim();
            if (!newVal) return;
            
            const cat = App.menuData[App.currentCategoryIndex];
            const parts = newVal.split(':');
            let price = 0; 
            let name = newVal;
            if(parts.length > 1) {
                 name = parts.slice(0, -1).join(':').trim();
                 price = parseFloat(parts[parts.length-1]) || 0;
            }
            const vat = parseInt(vatInput.value) || 24;
            let newItem;
            if (index !== null && typeof cat.items[index] === 'object') {
                newItem = { ...cat.items[index], name: name, price: price, vat: vat };
            } else {
                newItem = { name: name, price: price, vat: vat, extras: [] };
            }
            App.pendingAction = () => {
                if(index === null) cat.items.push(newItem); 
                else cat.items[index] = newItem;
            };
            App.openSaveModal();
        };
        
        input.addEventListener('blur', updateItem);
        vatInput.addEventListener('blur', updateItem);
        
        wrapper.appendChild(input);
        wrapper.appendChild(vatInput);
        wrapper.appendChild(extrasBtn);
        if (index !== null) wrapper.appendChild(delBtn); 
        container.appendChild(wrapper);
        if(index === null) input.focus();
    },
    
    goBackToCategories: function() { window.App.currentCategoryIndex = null; window.App.renderMenu(); },
    openSaveModal: function() { document.getElementById('saveModeModal').style.display = 'flex'; },
    
    executeSave: function(mode) {
        const App = window.App;
        if (App.pendingAction) { App.pendingAction(); App.pendingAction = null; }
        App.menuData.forEach(cat => { 
            cat.items = cat.items.filter(i => {
                if(typeof i === 'string') return i.trim() !== '';
                return i.name && i.name.trim() !== '';
            }); 
        });
        window.socket.emit('save-menu', { menu: App.menuData, mode: mode });
        document.getElementById('saveModeModal').style.display = 'none';
        App.renderMenu(); 
    }
};