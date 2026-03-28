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
    'empty': [],
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

// ✅ NEW: ΕΤΟΙΜΕΣ ΛΙΣΤΕΣ ΓΙΑ EXTRAS (ΥΠΟΚΑΤΗΓΟΡΙΕΣ)
export const EXTRA_PRESETS = {
    'coffee': [
        { name: "Σκέτο", price: 0 }, { name: "Μέτριο", price: 0 }, { name: "Γλυκό", price: 0 },
        { name: "Γάλα", price: 0.30 }, { name: "Κανέλα", price: 0 }, { name: "Σαντιγύ", price: 0.50 }
    ],
    'souvlaki': [
        { name: "Απ'όλα", price: 0 }, { name: "Χωρίς Κρεμμύδι", price: 0 }, { name: "Χωρίς Τζατζίκι", price: 0 },
        { name: "Σως", price: 0 }, { name: "Πίτα Ολικής", price: 0.20 }
    ],
    'pizza': [
        { name: "Extra Τυρί", price: 1.50 }, { name: "Bacon", price: 1.00 }, { name: "Μανιτάρια", price: 1.00 },
        { name: "Πιπεριά", price: 0.50 }
    ],
    'crepe_sweet': [
        { name: "Μπισκότο", price: 0.50 }, { name: "Μπανάνα", price: 0.80 }, { name: "Φράουλα", price: 0.80 },
        { name: "Λευκή Σοκολάτα", price: 0.50 }, { name: "Caprice", price: 0.80 }
    ],
    'crepe_savory': [
        { name: "Τυρί", price: 0.80 }, { name: "Γαλοπούλα", price: 1.00 }, { name: "Ζαμπόν", price: 1.00 },
        { name: "Μπέικον", price: 1.00 }, { name: "Μανιτάρια", price: 0.80 }, { name: "Ομελέτα", price: 1.50 },
        { name: "Μαγιονέζα", price: 0.50 }
    ]
};

export const Menu = {
    handlePlusButton: function() {
        const App = window.App;
        if (App.currentCategoryIndex === null) {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.style.display = 'flex';
            overlay.style.zIndex = '10000';

            // Αυτόματος υπολογισμός της επόμενης σειράς (μπήκε στο τέλος)
            const maxOrder = App.menuData.reduce((max, cat) => Math.max(max, cat.order || 0), 0);
            const nextOrder = maxOrder + 1;

            const t = window.App && window.App.t ? window.App.t : (k) => k;
            const newCatTxt = t('new_category') || 'Νέα Κατηγορία';
            const catNamePlh = t('cat_name_placeholder') || 'Όνομα (π.χ. ΚΑΦΕΔΕΣ)';
            const createTxt = t('create') || 'ΔΗΜΙΟΥΡΓΙΑ';
            const cancelTxt = t('cancel') || 'ΑΚΥΡΩΣΗ';

            overlay.innerHTML = `
                <div class="modal-box" style="width:90%; max-width:350px; text-align:center;">
                    <h3 style="color:#10B981; margin-top:0;" data-i18n="new_category">${newCatTxt}</h3>
                    <input type="text" id="inpNewCatName" class="inp-settings" placeholder="${catNamePlh}" data-i18n-placeholder="cat_name_placeholder" style="margin-bottom:15px; text-align:center; font-weight:bold;">
                    <button id="btnCreateCat" class="modal-btn" style="background:#10B981; color:white; font-weight:bold; box-shadow:0 4px 10px rgba(16,185,129,0.3);" data-i18n="create">${createTxt}</button>
                    <button id="btnCancelCat" class="modal-btn" style="background:#f3f4f6; color:#1f2937; border:1px solid #d1d5db; font-weight:bold;" data-i18n="cancel">${cancelTxt}</button>
                </div>
            `;
            document.body.appendChild(overlay);
            document.getElementById('inpNewCatName').focus();

            document.getElementById('btnCreateCat').onclick = () => {
                const name = document.getElementById('inpNewCatName').value.trim();
                if (name) {
                    App.menuData.push({ id: Date.now(), order: nextOrder, name: name.toUpperCase(), items: [] });
                    App.renderMenu();
                }
                overlay.remove();
            };
            document.getElementById('btnCancelCat').onclick = () => overlay.remove();
        } else {
            App.addItemInput('');
        }
    },

    renderMenu: function() {
        const App = window.App;
        const t = App && App.t ? App.t : (k) => k;
        const container = document.getElementById('menuInputContainer');
        if (!container) return; // ✅ Αποτρέπει το error αν δεν υπάρχει το HTML element (π.χ. στην Κουζίνα)
        container.innerHTML = '';

        // ✅ Καθαρισμός του παλιού κουμπιού επάνω (αν υπάρχει ακόμα στη μνήμη)
        const oldBtn = document.getElementById('btnSaveCatalogTop');
        if (oldBtn) oldBtn.remove();

        // ✅ NEW: Έξυπνο FAB Κουμπί Αποθήκευσης (Κάτω Δεξιά)
        let saveBtn = document.getElementById('btnSaveCatalogFab');
        if (!saveBtn) {
            saveBtn = document.createElement('button');
            saveBtn.id = 'btnSaveCatalogFab';
            saveBtn.innerHTML = '💾';
            saveBtn.title = t('save_catalog') || 'Αποθήκευση Καταλόγου';
            saveBtn.style.cssText = 'position: fixed; bottom: max(30px, env(safe-area-inset-bottom)); right: 30px; background: #10B981; color: white; width: 60px; height: 60px; border-radius: 50%; font-size: 28px; display: none; align-items: center; justify-content: center; cursor: pointer; border: none; box-shadow: 0 6px 20px rgba(16, 185, 129, 0.6); z-index: 10500; transition: transform 0.2s;';
            saveBtn.onclick = () => {
                App.menuData.forEach(cat => { 
                    if (cat.items) {
                        cat.items = cat.items.filter(i => {
                            if(typeof i === 'string') return i.trim() !== '';
                            return i.name && i.name.trim() !== '';
                        }); 
                    }
                });
                window.socket.emit('save-menu', { menu: App.menuData, mode: 'permanent' });
                const successOverlay = document.createElement('div');
                successOverlay.className = 'modal-overlay';
                successOverlay.style.display = 'flex';
                successOverlay.style.zIndex = '15000';
                successOverlay.innerHTML = `<div class="modal-box" style="text-align:center; max-width:300px;"><div style="font-size:40px; margin-bottom:10px;">✅</div><h3 style="color:#10B981; margin:0 0 15px 0;">Επιτυχία!</h3><p style="color:#1f2937; font-size:14px; margin-bottom:15px;">Ο κατάλογος αποθηκεύτηκε επιτυχώς!</p><button class="modal-btn" style="background:#f3f4f6; color:#1f2937; border:1px solid #d1d5db; font-weight:bold;" onclick="this.parentElement.parentElement.remove()">ΚΛΕΙΣΙΜΟ</button></div>`;
                document.body.appendChild(successOverlay);
            };
            
            const menuPanel = document.getElementById('menuFullPanel');
            if (menuPanel) menuPanel.appendChild(saveBtn);
            else document.body.appendChild(saveBtn);
        }

        App.menuData.sort((a,b) => a.order - b.order);
        if (App.currentCategoryIndex === null) {
            if (saveBtn) saveBtn.style.display = 'flex'; // ✅ Το εμφανίζουμε ΠΑΝΤΑ, ώστε να αποθηκεύονται νέες κατηγορίες
            const btnBack = document.getElementById('btnBackCat');
            if (btnBack) btnBack.style.display = 'none';
            const btnBulk = document.getElementById('btnBulkPaste');
            if (btnBulk) btnBulk.style.display = 'none';
            App.menuData.forEach((cat, index) => {
                const div = document.createElement('div');
                div.className = 'category-box';
                div.draggable = true;
                div.innerHTML = `
                    <div style="position:absolute; left:10px; top:50%; transform:translateY(-50%); display:flex; align-items:center;">
                        <span style="cursor:grab; padding-right:10px; font-size:20px; color:#aaa;" onclick="event.stopPropagation()" title="Σύρετε για αλλαγή σειράς">☰</span>
                        <div style="display:flex; flex-direction:column; gap:2px;" onclick="event.stopPropagation()">
                            <button onclick="App.moveCategoryUp(${index}); event.stopPropagation();" style="background:none; border:none; padding:0; cursor:pointer; color:#6b7280; font-size:12px; ${index === 0 ? 'opacity:0.3; cursor:default;' : ''}">▲</button>
                            <button onclick="App.moveCategoryDown(${index}); event.stopPropagation();" style="background:none; border:none; padding:0; cursor:pointer; color:#6b7280; font-size:12px; ${index === App.menuData.length - 1 ? 'opacity:0.3; cursor:default;' : ''}">▼</button>
                        </div>
                    </div>
                    <span class="category-order">${cat.order}</span>${cat.name}
                `;

                // Drag & Drop Events (Κατηγορίες)
                div.addEventListener('dragstart', (e) => {
                    App.draggedCatIdx = index;
                    e.dataTransfer.effectAllowed = 'move';
                    setTimeout(() => div.style.opacity = '0.5', 0);
                });
                div.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    div.style.borderTop = '3px dashed #2196F3';
                });
                div.addEventListener('dragleave', () => { div.style.borderTop = ''; });
                div.addEventListener('drop', (e) => {
                    e.preventDefault();
                    div.style.borderTop = '';
                    const draggedIdx = App.draggedCatIdx;
                    if (draggedIdx !== undefined && draggedIdx !== index) {
                        const item = App.menuData.splice(draggedIdx, 1)[0];
                        App.menuData.splice(index, 0, item);
                        App.menuData.forEach((c, i) => c.order = i + 1); // Ενημέρωση αρίθμησης
                        App.renderMenu();
                    }
                });
                div.addEventListener('dragend', () => {
                    div.style.opacity = '1';
                    document.querySelectorAll('.category-box').forEach(r => r.style.borderTop = '');
                });
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
            if (saveBtn) saveBtn.style.display = 'flex'; // ✅ Εμφανίζουμε το 💾 ΜΟΝΟ όταν είμαστε μέσα σε προϊόντα
            
            const cat = App.menuData[App.currentCategoryIndex];
            if(!cat) { App.currentCategoryIndex = null; App.renderMenu(); return; }
            const btnBack = document.getElementById('btnBackCat');
            if (btnBack) {
                btnBack.style.display = 'block';
                btnBack.style.left = ''; // ✅ Επαναφορά στην αρχική του θέση (Αριστερά)
            }
            const btnBulk = document.getElementById('btnBulkPaste');
            if (btnBulk) btnBulk.style.display = 'block';

            cat.items.forEach((item, idx) => {
                App.addItemInput(item, idx);
            });
            App.addItemInput(''); // Κενό πεδίο για νέο

            // ✅ NEW: Κουμπί Μαζικής Αποθήκευσης (Τοποθετημένο στο πάνω μέρος - Header)
            let saveBtnTop = document.getElementById('btnSaveCatalogTop');
            if (!saveBtnTop) {
                saveBtnTop = document.createElement('button');
                saveBtnTop.id = 'btnSaveCatalogTop';
                saveBtnTop.innerHTML = '💾';
                saveBtnTop.title = t('save_catalog') || 'Αποθήκευση Καταλόγου';
                saveBtnTop.style.cssText = 'position: absolute; top: 15px; right: 60px; background: #10B981; color: white; width: 40px; height: 40px; border-radius: 8px; font-size: 20px; font-weight: bold; cursor: pointer; border: none; box-shadow: 0 4px 10px rgba(16, 185, 129, 0.4); z-index: 5000; display: flex; align-items: center; justify-content: center; padding: 0;';
                saveBtnTop.onclick = () => {
                // Καθαρισμός κενών προϊόντων πριν την αποθήκευση
                App.menuData.forEach(cat => { 
                    if (cat.items) {
                        cat.items = cat.items.filter(i => {
                            if(typeof i === 'string') return i.trim() !== '';
                            return i.name && i.name.trim() !== '';
                        }); 
                    }
                });
                // Αποστολή μόνιμης αποθήκευσης στον server
                window.socket.emit('save-menu', { menu: App.menuData, mode: 'permanent' });
                
                const successOverlay = document.createElement('div');
                successOverlay.className = 'modal-overlay';
                successOverlay.style.display = 'flex';
                successOverlay.style.zIndex = '15000';
                successOverlay.innerHTML = `<div class="modal-box" style="text-align:center; max-width:300px;"><div style="font-size:40px; margin-bottom:10px;">✅</div><h3 style="color:#10B981; margin:0 0 15px 0;">Επιτυχία!</h3><p style="color:#1f2937; font-size:14px; margin-bottom:15px;">Ο κατάλογος αποθηκεύτηκε επιτυχώς!</p><button class="modal-btn" style="background:#f3f4f6; color:#1f2937; border:1px solid #d1d5db; font-weight:bold;" onclick="this.parentElement.parentElement.remove()">ΚΛΕΙΣΙΜΟ</button></div>`;
                document.body.appendChild(successOverlay);
            };
            
            const menuPanel = document.getElementById('menuFullPanel');
            if (menuPanel) {
                menuPanel.appendChild(saveBtnTop);
            } else {
                container.appendChild(saveBtnTop);
            }
        } else if (!document.getElementById('menuFullPanel') || !document.getElementById('menuFullPanel').contains(saveBtnTop)) {
            container.appendChild(saveBtnTop);
        }
        }
    },

    addItemInput: function(val, index = null) {
        const App = window.App;
        const container = document.getElementById('menuInputContainer');
        const wrapper = document.createElement('div');
        wrapper.className = 'item-wrapper';
        
        let itemName = "";
        let itemPrice = "";
        let itemObj = null;
        let itemDesc = "";

        if (typeof val === 'object' && val !== null) {
            itemObj = val;
            itemName = itemObj.name || "";
            itemPrice = itemObj.price !== undefined ? itemObj.price : "";
            itemDesc = itemObj.desc || "";
        } else if (typeof val === 'string' && val.trim() !== "") {
            const parts = val.split(':');
            if (parts.length > 1) {
                itemName = parts.slice(0, -1).join(':').trim();
                itemPrice = parseFloat(parts[parts.length - 1]) || 0;
            } else {
                itemName = val.trim();
            }
        }

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'menu-input-box';
        nameInput.style.flex = '1.5';
        nameInput.style.paddingRight = '10px'; // Override default CSS 40px
        nameInput.value = itemName;
        nameInput.placeholder = "Όνομα Προϊόντος"; 

        const descInput = document.createElement('input');
        descInput.type = 'text';
        descInput.className = 'menu-input-box';
        descInput.style.flex = '1.5';
        descInput.value = itemDesc;
        descInput.placeholder = "Περιγραφή/Αλλεργιογόνα";

        const priceInput = document.createElement('input');
        priceInput.type = 'number';
        priceInput.step = '0.01';
        priceInput.className = 'menu-input-box';
        priceInput.style.flex = '1';
        priceInput.value = itemPrice;
        priceInput.placeholder = "Τιμή"; 

        const vatInput = document.createElement('input');
        vatInput.type = 'number';
        vatInput.placeholder = 'ΦΠΑ';
        const vatDisplay = App.einvoicingEnabled ? 'inline-block' : 'none';
        vatInput.style.cssText = `width:60px; padding:12px; margin-left:5px; background:#ffffff; border:1px solid #d1d5db; color:#1f2937; border-radius:12px; text-align:center; font-size:15px; display:${vatDisplay}; box-shadow:inset 0 1px 2px rgba(0,0,0,0.05);`;
        
        if (itemObj && itemObj.vat !== undefined) vatInput.value = itemObj.vat;
        else vatInput.value = 24;
        
        const silentUpdate = () => {
            const newName = nameInput.value.trim();
            const newDesc = descInput.value.trim();
            const newPrice = parseFloat(priceInput.value) || 0;
            const newVat = parseInt(vatInput.value) || 24;
            
            const cat = App.menuData[App.currentCategoryIndex];
            if (!cat) return;

            let existingExtras = (itemObj && itemObj.extras) ? itemObj.extras : [];
            if (index !== null && typeof cat.items[index] === 'object' && cat.items[index].extras) {
                existingExtras = cat.items[index].extras;
            }
            let newItem;

            if (index !== null && typeof cat.items[index] === 'object') {
                newItem = { ...cat.items[index], name: newName, price: newPrice, vat: newVat, desc: newDesc };
            } else {
                newItem = { name: newName, price: newPrice, vat: newVat, extras: existingExtras, desc: newDesc };
            }

            if (index === null) {
                index = cat.items.length;
                cat.items.push(newItem);
            } else {
                cat.items[index] = newItem;
            }
        };

        // Προσθήκη Drag & Drop Handle στα Προϊόντα
        let handleDiv = null;
        if (index !== null) {
            wrapper.draggable = true;
            const cat = App.menuData[App.currentCategoryIndex];
            
            handleDiv = document.createElement('div');
            handleDiv.style.cssText = "display:flex; align-items:center; margin-right:5px;";
            handleDiv.innerHTML = `
                <span style="cursor:grab; padding-right:5px; font-size:20px; color:#aaa; user-select:none;" title="Σύρετε για αλλαγή σειράς">☰</span>
                <div style="display:flex; flex-direction:column; gap:2px; margin-right:5px;">
                    <button onclick="App.moveItemUp(${index})" style="background:none; border:none; padding:0; cursor:pointer; color:#6b7280; font-size:12px; ${index === 0 ? 'opacity:0.3; cursor:default;' : ''}">▲</button>
                    <button onclick="App.moveItemDown(${index})" style="background:none; border:none; padding:0; cursor:pointer; color:#6b7280; font-size:12px; ${index === cat.items.length - 1 ? 'opacity:0.3; cursor:default;' : ''}">▼</button>
                </div>
            `;
            
            wrapper.addEventListener('dragstart', (e) => {
                App.draggedItemIdx = index;
                e.dataTransfer.effectAllowed = 'move';
                setTimeout(() => wrapper.style.opacity = '0.5', 0);
                if (App.showCategoryDropZones) App.showCategoryDropZones();
            });
            wrapper.addEventListener('dragover', (e) => {
                e.preventDefault();
                wrapper.style.borderTop = '2px dashed #2196F3';
            });
            wrapper.addEventListener('dragleave', () => { wrapper.style.borderTop = ''; });
            wrapper.addEventListener('drop', (e) => {
                e.preventDefault();
                wrapper.style.borderTop = '';
                const draggedIdx = App.draggedItemIdx;
                if (draggedIdx !== undefined && draggedIdx !== index) {
                    const item = cat.items.splice(draggedIdx, 1)[0];
                    cat.items.splice(index, 0, item);
                    App.renderMenu();
                }
            });
            wrapper.addEventListener('dragend', () => {
                wrapper.style.opacity = '1';
                document.querySelectorAll('.item-wrapper').forEach(r => r.style.borderTop = '');
                if (App.hideCategoryDropZones) App.hideCategoryDropZones();
            });
        }
        
        const extrasBtn = document.createElement('button');
        extrasBtn.className = 'btn-item-extras';
        extrasBtn.innerHTML = '+';
        extrasBtn.style.cssText = 'position: relative !important; right: auto !important; top: auto !important; margin-left: 2px; flex-shrink: 0;';
        if (itemObj && itemObj.extras && itemObj.extras.length > 0) extrasBtn.classList.add('has-extras');
        extrasBtn.onclick = () => { 
            silentUpdate(); // Διασφαλίζει ότι το νέο προϊόν "γράφτηκε" στη μνήμη πριν ανοίξουν τα extras
            App.openExtrasModal(App.currentCategoryIndex, index); 
        };

        const delBtn = document.createElement('button');
        delBtn.className = 'btn-item-del';
        delBtn.innerText = 'X';
        delBtn.onclick = () => {
            wrapper.remove();
            const cat = App.menuData[App.currentCategoryIndex];
            if (index !== null && cat && cat.items) {
                cat.items[index] = { name: '' };
            }
        };
        
        nameInput.addEventListener('input', silentUpdate);
        descInput.addEventListener('input', silentUpdate);
        priceInput.addEventListener('input', silentUpdate);
        vatInput.addEventListener('input', silentUpdate);
        
        if (handleDiv) wrapper.appendChild(handleDiv);
        wrapper.appendChild(nameInput);
        wrapper.appendChild(descInput);
        wrapper.appendChild(priceInput);
        wrapper.appendChild(vatInput);
        wrapper.appendChild(extrasBtn);
        if (index !== null) wrapper.appendChild(delBtn); 
        container.appendChild(wrapper);
        if(index === null) nameInput.focus();
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
    },

    // --- BULK PASTE LOGIC ---
    openBulkPasteModal: function() {
        const App = window.App;
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'bulkPasteModal';
        overlay.style.display = 'flex';
        overlay.style.zIndex = '10000';

        const t = window.App && window.App.t ? window.App.t : (k) => k;
        const titleTxt = t('bulk_insert_title') || 'Γρήγορη Εισαγωγή';
        const helpTxt = t('bulk_insert_help') || '💡 Κάντε επικόλληση τα προϊόντα σας...';
        const pastePlh = t('paste_here') || 'Επικόλληση εδώ...';
        const insertTxt = t('bulk_insert_btn') || 'Εισαγωγή';
        const cancelTxt = t('cancel') || 'Ακύρωση';

        overlay.innerHTML = `
            <div class="modal-box" style="width:90%; max-width:500px; text-align:left;">
                <h3 style="color:#635BFF; margin-top:0; text-align:center;" data-i18n="bulk_insert_title">${titleTxt}</h3>
                <div style="background:#f3f4f6; color:#1f2937; padding:12px; border-radius:8px; font-size:13px; margin-bottom:15px; line-height:1.5; border:1px solid #e5e7eb;" data-i18n="bulk_insert_help">
                    ${helpTxt}
                </div>
                <textarea id="inpBulkPaste" class="order-text" style="width:100%; height:200px; margin-top:10px; margin-bottom:15px; border-radius:8px; resize:vertical;" placeholder="${pastePlh}" data-i18n-placeholder="paste_here"></textarea>
                <div style="display:flex; gap:10px;">
                    <button id="btnBulkInsert" class="modal-btn" style="background:#10B981; color:white; margin:0; box-shadow:0 4px 10px rgba(16,185,129,0.3);" data-i18n="bulk_insert_btn">${insertTxt}</button>
                    <button id="btnBulkCancel" class="modal-btn" style="background:#f3f4f6; color:#1f2937; border:1px solid #d1d5db; margin:0;" data-i18n="cancel">${cancelTxt}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        document.getElementById('inpBulkPaste').focus();

        document.getElementById('btnBulkInsert').onclick = () => {
            const text = document.getElementById('inpBulkPaste').value;
            const lines = text.split('\n');
            const cat = App.menuData[App.currentCategoryIndex];
            
            if (cat) {
                lines.forEach(line => {
                    const trimmed = line.trim();
                    if (!trimmed) return;
                    // Regex: Βρίσκει αριθμό (με . ή ,) στο τέλος, αγνοώντας σύμβολα νομίσματος
                    const match = trimmed.match(/^(.*?)\s*([0-9]+[.,]?[0-9]*)\s*(?:€|euro|ευρώ)?\s*$/i);
                    let name = trimmed, price = 0;
                    if (match) { name = match[1].trim() || "Προϊόν"; price = parseFloat(match[2].replace(',', '.')) || 0; }
                    cat.items.push({ name: name, price: price, vat: 24, extras: [] });
                });
            }
            overlay.remove();
            App.renderMenu();
        };

        document.getElementById('btnBulkCancel').onclick = () => overlay.remove();
    },

    // --- EXTRAS LOGIC ---
    openExtrasModal: function(catIndex, itemIndex) {
        const App = window.App;
        App.currentExtrasCatIndex = catIndex;
        App.currentExtrasItemIndex = itemIndex;

        const cat = App.menuData[catIndex];
        if (!cat || !cat.items[itemIndex]) return;

        const item = cat.items[itemIndex];
        
        if (typeof item === 'string') {
            const parts = item.split(':');
            let price = 0; let name = item;
            if (parts.length > 1) { name = parts.slice(0, -1).join(':').trim(); price = parseFloat(parts[parts.length - 1]) || 0; }
            cat.items[itemIndex] = { name: name, price: price, vat: 24, extras: [] };
        } else if (!item.extras) {
            cat.items[itemIndex].extras = [];
        }

        App.tempExtras = JSON.parse(JSON.stringify(cat.items[itemIndex].extras));
        
        const title = document.getElementById('extrasModalTitle') || document.querySelector('#extrasModal h3');
        if (title) title.innerText = `EXTRAS: ${cat.items[itemIndex].name}`;
        
        if(App.renderExtraPresetsDropdown) App.renderExtraPresetsDropdown();
        App.renderExtrasList();
        const modal = document.getElementById('extrasModal');
        if(modal) modal.style.display = 'flex';
    },

    renderExtrasList: function() {
        const App = window.App;
        const container = document.getElementById('extrasListContainer') || document.getElementById('extrasList');
        if (!container) return;

        container.innerHTML = '';
        App.tempExtras.forEach((ex, idx) => {
            const row = document.createElement('div');
            row.className = 'extra-item-row';
            row.draggable = true;
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            
            row.innerHTML = `
                <span style="cursor:grab; padding-right:10px; font-size:20px; color:#aaa; user-select:none;" title="Σύρετε για αλλαγή σειράς">☰</span>
                <div style="display:flex; flex-direction:column; gap:2px; margin-right:10px;">
                    <button onclick="App.moveExtraUp(${idx})" style="background:none; border:none; padding:0; cursor:pointer; color:#6b7280; font-size:12px; ${idx === 0 ? 'opacity:0.3; cursor:default;' : ''}">▲</button>
                    <button onclick="App.moveExtraDown(${idx})" style="background:none; border:none; padding:0; cursor:pointer; color:#6b7280; font-size:12px; ${idx === App.tempExtras.length - 1 ? 'opacity:0.3; cursor:default;' : ''}">▼</button>
                </div>
                <span style="flex:1; cursor:pointer; display:flex; align-items:center;" onclick="App.editExtra(${idx})" title="Πατήστε για επεξεργασία">✏️ ${ex.name} ${ex.price > 0 ? `(+${ex.price}€)` : ''}</span>
                <button onclick="App.removeExtra(${idx})" style="background:#EF4444; color:white; border:none; padding:4px 10px; border-radius:6px; cursor:pointer; font-weight:bold; box-shadow:0 2px 4px rgba(239,68,68,0.3);">X</button>
            `;
            
            // Drag & Drop Events (Για υπολογιστή / ποντίκι)
            row.addEventListener('dragstart', (e) => {
                App.draggedExtraIdx = idx;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/html', row.innerHTML);
                setTimeout(() => row.style.opacity = '0.5', 0);
            });
            row.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                row.style.borderTop = '2px dashed #2196F3';
            });
            row.addEventListener('dragleave', () => {
                row.style.borderTop = '';
            });
            row.addEventListener('drop', (e) => {
                e.preventDefault();
                row.style.borderTop = '';
                const draggedIdx = App.draggedExtraIdx;
                if (draggedIdx !== undefined && draggedIdx !== idx) {
                    const item = App.tempExtras.splice(draggedIdx, 1)[0];
                    App.tempExtras.splice(idx, 0, item);
                    App.renderExtrasList();
                }
            });
            row.addEventListener('dragend', () => {
                row.style.opacity = '1';
                const rows = container.querySelectorAll('.extra-item-row');
                rows.forEach(r => r.style.borderTop = '');
            });

            container.appendChild(row);
        });
    },

    moveExtraUp: function(idx) {
        const App = window.App;
        if (idx > 0) {
            const temp = App.tempExtras[idx];
            App.tempExtras[idx] = App.tempExtras[idx - 1];
            App.tempExtras[idx - 1] = temp;
            App.renderExtrasList();
        }
    },

    moveExtraDown: function(idx) {
        const App = window.App;
        if (idx < App.tempExtras.length - 1) {
            const temp = App.tempExtras[idx];
            App.tempExtras[idx] = App.tempExtras[idx + 1];
            App.tempExtras[idx + 1] = temp;
            App.renderExtrasList();
        }
    },

    // ✅ NEW: Δυναμικό Dropdown για Extras Presets (Συστήματος + Προσωπικά)
    renderExtraPresetsDropdown: function() {
        const App = window.App;
        const sel = document.getElementById('selExtraPreset');
        if (!sel) return;
        sel.innerHTML = '<option value="" disabled selected>Επιλέξτε για προσθήκη...</option>';
        
        const hardcoded = [
            {val: 'coffee', text: '☕ Καφέδες (Γλυκό, Μέτριο...)'},
            {val: 'souvlaki', text: '🍖 Σουβλάκι (Απ\'όλα, Χωρίς...)'},
            {val: 'pizza', text: '🍕 Πίτσα (Extra Τυρί, Μπέικον...)'},
            {val: 'crepe_sweet', text: '🍫 Κρέπα Γλυκιά (Μπισκότο...)'},
            {val: 'crepe_savory', text: '🧀 Κρέπα Αλμυρή (Τυρί, Γαλοπούλα...)'}
        ];
        
        const group1 = document.createElement('optgroup');
        group1.label = "ΒΑΣΙΚΑ PRESETS";
        hardcoded.forEach(hc => {
            const opt = document.createElement('option');
            opt.value = `hc_${hc.val}`;
            opt.innerText = hc.text;
            group1.appendChild(opt);
        });
        sel.appendChild(group1);
        
        if (App.customExtraPresets && App.customExtraPresets.length > 0) {
            const group2 = document.createElement('optgroup');
            group2.label = "ΤΑ ΔΙΚΑ ΜΟΥ PRESETS";
            App.customExtraPresets.forEach((cp, idx) => {
                const opt = document.createElement('option');
                opt.value = `custom_${idx}`;
                opt.innerText = `⭐ ${cp.name}`;
                group2.appendChild(opt);
            });
            sel.appendChild(group2);
        }
    },

    applyExtraPreset: function(value) {
        const App = window.App;
        if (!value) return;
        
        let itemsToAdd = [];
        if (value.startsWith('hc_')) {
            const key = value.replace('hc_', '');
            itemsToAdd = EXTRA_PRESETS[key] || [];
        } else if (value.startsWith('custom_')) {
            const idx = parseInt(value.replace('custom_', ''));
            if (App.customExtraPresets && App.customExtraPresets[idx]) {
                itemsToAdd = App.customExtraPresets[idx].items || [];
            }
        }
        
        itemsToAdd.forEach(nx => {
            if (!App.tempExtras.some(e => e.name === nx.name)) {
                App.tempExtras.push({ name: nx.name, price: nx.price });
            }
        });
        App.renderExtrasList();
    },

    saveCurrentExtrasAsPreset: function() {
        const App = window.App;
        if (!App.tempExtras || App.tempExtras.length === 0) {
            const errOverlay = document.createElement('div');
            errOverlay.className = 'modal-overlay';
            errOverlay.style.display = 'flex';
            errOverlay.style.zIndex = '15000';
            errOverlay.innerHTML = `<div class="modal-box" style="text-align:center; max-width:300px;"><div style="font-size:40px; margin-bottom:10px;">⚠️</div><h3 style="color:#EF4444; margin:0 0 10px 0;">Άδεια Λίστα</h3><p style="color:#1f2937; font-size:14px; margin-bottom:15px;">Η λίστα είναι κενή! Προσθέστε πρώτα επιλογές (extras).</p><button class="modal-btn" style="background:#f3f4f6; color:#1f2937; border:1px solid #d1d5db; font-weight:bold;" onclick="this.parentElement.parentElement.remove()">ΚΛΕΙΣΙΜΟ</button></div>`;
            document.body.appendChild(errOverlay);
            return;
        }
        
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.display = 'flex';
        overlay.style.zIndex = '15000';
        
        overlay.innerHTML = `
            <div class="modal-box" style="width:90%; max-width:350px; text-align:center;">
                <h3 style="color:#10B981; margin-top:0;">Όνομα Preset</h3>
                <p style="font-size:13px; color:#6b7280; margin-bottom:15px;">Δώστε ένα όνομα για αυτό το Preset (π.χ. 'Υλικά Burger'):</p>
                <input type="text" id="inpPresetNameSave" class="inp-settings" placeholder="Όνομα Preset..." style="text-align:center; font-weight:bold; margin-bottom:15px;">
                <button id="btnSavePresetName" class="modal-btn" style="background:#10B981; color:white; font-weight:bold; box-shadow:0 4px 10px rgba(16,185,129,0.3);">ΑΠΟΘΗΚΕΥΣΗ</button>
                <button id="btnCancelPresetSave" class="modal-btn" style="background:#f3f4f6; color:#1f2937; border:1px solid #d1d5db; font-weight:bold; margin-top:10px;">ΑΚΥΡΩΣΗ</button>
            </div>
        `;
        document.body.appendChild(overlay);
        document.getElementById('inpPresetNameSave').focus();
        
        document.getElementById('btnSavePresetName').onclick = () => {
            const name = document.getElementById('inpPresetNameSave').value;
            if (!name || name.trim() === '') return;
            
            if (!App.customExtraPresets) App.customExtraPresets = [];
            App.customExtraPresets.push({
                name: name.trim(),
                items: JSON.parse(JSON.stringify(App.tempExtras))
            });
            
            window.socket.emit('save-store-settings', { customExtraPresets: App.customExtraPresets });
            App.renderExtraPresetsDropdown();
            overlay.remove();
            
            const successOverlay = document.createElement('div');
            successOverlay.className = 'modal-overlay';
            successOverlay.style.display = 'flex';
            successOverlay.style.zIndex = '15000';
            successOverlay.innerHTML = `<div class="modal-box" style="text-align:center; max-width:300px;"><div style="font-size:40px; margin-bottom:10px;">✅</div><h3 style="color:#10B981; margin:0 0 15px 0;">Επιτυχία!</h3><p style="color:#1f2937; font-size:14px; margin-bottom:15px;">Το Preset αποθηκεύτηκε επιτυχώς!</p><button class="modal-btn" style="background:#f3f4f6; color:#1f2937; border:1px solid #d1d5db; font-weight:bold;" onclick="this.parentElement.parentElement.remove()">ΚΛΕΙΣΙΜΟ</button></div>`;
            document.body.appendChild(successOverlay);
        };
        document.getElementById('btnCancelPresetSave').onclick = () => overlay.remove();
    },

    addExtraRow: function() {
        const App = window.App;
        const nameInp = document.getElementById('inpExtraName');
        const priceInp = document.getElementById('inpExtraPrice');
        const name = nameInp ? nameInp.value.trim() : '';
        const price = priceInp ? parseFloat(priceInp.value) || 0 : 0;

        if (!name) {
            const errOverlay = document.createElement('div');
            errOverlay.className = 'modal-overlay';
            errOverlay.style.display = 'flex';
            errOverlay.style.zIndex = '15000';
            errOverlay.innerHTML = `<div class="modal-box" style="text-align:center; max-width:300px;"><div style="font-size:40px; margin-bottom:10px;">⚠️</div><h3 style="color:#EF4444; margin:0 0 10px 0;">Προσοχή</h3><p style="color:#1f2937; font-size:14px; margin-bottom:15px;">Παρακαλώ εισάγετε όνομα extra!</p><button class="modal-btn" style="background:#f3f4f6; color:#1f2937; border:1px solid #d1d5db; font-weight:bold;" onclick="this.parentElement.parentElement.remove()">ΚΛΕΙΣΙΜΟ</button></div>`;
            document.body.appendChild(errOverlay);
            return;
        }

        App.tempExtras.push({ name: name, price: price });
        
        if (nameInp) nameInp.value = '';
        if (priceInp) priceInp.value = '';
        
        App.renderExtrasList();
    },

    addExtraToItem: function() { window.App.addExtraRow(); },

    removeExtra: function(idx) {
        window.App.tempExtras.splice(idx, 1);
        window.App.renderExtrasList();
    },

    editExtra: function(idx) {
        const App = window.App;
        const ex = App.tempExtras[idx];
        if (!ex) return;
        
        const nameInp = document.getElementById('inpExtraName');
        const priceInp = document.getElementById('inpExtraPrice');
        
        if (nameInp) nameInp.value = ex.name;
        if (priceInp) priceInp.value = ex.price;
        
        App.tempExtras.splice(idx, 1);
        App.renderExtrasList();
        
        if (nameInp) nameInp.focus();
    },

    saveExtras: function() {
        const App = window.App;
        
        // ✅ NEW: Αποθήκευση αν βρισκόμαστε σε λειτουργία επεξεργασίας κεντρικού Preset
        if (App.currentExtrasCatIndex === 'preset') {
            if (!App.customExtraPresets) App.customExtraPresets = [];
            if (App.currentExtrasItemIndex === 'new') {
                App.customExtraPresets.push({
                    name: App.tempPresetName,
                    items: JSON.parse(JSON.stringify(App.tempExtras))
                });
            } else {
                App.customExtraPresets[App.currentExtrasItemIndex].items = JSON.parse(JSON.stringify(App.tempExtras));
            }
            window.socket.emit('save-store-settings', { customExtraPresets: App.customExtraPresets });
            
            const modal = document.getElementById('extrasModal');
            if (modal) modal.style.display = 'none';
            if (App.renderExtraPresetsDropdown) App.renderExtraPresetsDropdown();
            if (App.renderManagePresetsList) App.renderManagePresetsList();
            return;
        }

        const cat = App.menuData[App.currentExtrasCatIndex];
        if (cat && cat.items[App.currentExtrasItemIndex]) {
            cat.items[App.currentExtrasItemIndex].extras = JSON.parse(JSON.stringify(App.tempExtras));
        }
        const modal = document.getElementById('extrasModal');
        if (modal) modal.style.display = 'none';
        App.renderMenu(); 
    },

    // --- MANAGE CUSTOM PRESETS LOGIC ---
    openManagePresetsModal: function() {
        const App = window.App;
        App.renderManagePresetsList();
        document.getElementById('managePresetsModal').style.display = 'flex';
    },

    renderManagePresetsList: function() {
        const App = window.App;
        const container = document.getElementById('managePresetsList');
        if (!container) return;
        container.innerHTML = '';
        
        if (!App.customExtraPresets || App.customExtraPresets.length === 0) {
            container.innerHTML = '<div style="color:#aaa; text-align:center; padding:20px;">Δεν έχετε δημιουργήσει δικά σας Presets.</div>';
            return;
        }

        App.customExtraPresets.forEach((cp, idx) => {
            const row = document.createElement('div');
            row.style.cssText = "display:flex; justify-content:space-between; align-items:center; background:#f9fafb; padding:10px; border-radius:8px; margin-bottom:5px; border:1px solid #e5e7eb;";
            row.innerHTML = `
                <div>
                    <strong style="color:#1f2937; cursor:pointer; display:flex; align-items:center; gap:5px;" onclick="App.renameCustomPreset(${idx})" title="Πατήστε για μετονομασία">✏️ ${cp.name}</strong>
                    <div style="font-size:11px; color:#6b7280; margin-top:3px;">${cp.items ? cp.items.length : 0} επιλογές</div>
                </div>
                <div style="display:flex; gap:5px;">
                    <button onclick="App.editCustomPreset(${idx})" style="background:#2196F3; color:white; border:none; padding:6px 12px; border-radius:5px; cursor:pointer;" title="Επεξεργασία Υλικών">📋</button>
                    <button onclick="App.deleteCustomPreset(${idx})" style="background:#EF4444; color:white; border:none; padding:6px 12px; border-radius:5px; cursor:pointer;" title="Διαγραφή">🗑️</button>
                </div>
            `;
            container.appendChild(row);
        });
    },

    renameCustomPreset: function(idx) {
        const App = window.App;
        const cp = App.customExtraPresets[idx];
        if (!cp) return;

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.display = 'flex';
        overlay.style.zIndex = '15000';

        overlay.innerHTML = `
            <div class="modal-box" style="width:90%; max-width:350px; text-align:center;">
                <h3 style="color:#2196F3; margin-top:0;">Μετονομασία Preset</h3>
                <input type="text" id="inpRenamePreset" class="inp-settings" value="${cp.name}" style="text-align:center; font-weight:bold; margin-bottom:15px;">
                <button id="btnSaveRename" class="modal-btn" style="background:#2196F3; color:white; font-weight:bold; box-shadow:0 4px 10px rgba(33,150,243,0.3);">ΑΠΟΘΗΚΕΥΣΗ</button>
                <button id="btnCancelRename" class="modal-btn" style="background:#f3f4f6; color:#1f2937; border:1px solid #d1d5db; font-weight:bold; margin-top:10px;">ΑΚΥΡΩΣΗ</button>
            </div>
        `;
        document.body.appendChild(overlay);
        document.getElementById('inpRenamePreset').focus();

        document.getElementById('btnSaveRename').onclick = () => {
            const newName = document.getElementById('inpRenamePreset').value.trim();
            if (newName) {
                App.customExtraPresets[idx].name = newName;
                window.socket.emit('save-store-settings', { customExtraPresets: App.customExtraPresets });
                App.renderManagePresetsList();
                if (App.renderExtraPresetsDropdown) App.renderExtraPresetsDropdown();
            }
            overlay.remove();
        };
        document.getElementById('btnCancelRename').onclick = () => overlay.remove();
    },

    deleteCustomPreset: function(idx) {
        const App = window.App;
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.display = 'flex';
        overlay.style.zIndex = '15000';
        
        overlay.innerHTML = `
            <div class="modal-box" style="width:90%; max-width:320px; text-align:center;">
                <div style="font-size:40px; margin-bottom:10px;">🗑️</div>
                <h3 style="color:#EF4444; margin:0 0 10px 0;">Διαγραφή</h3>
                <p style="color:#1f2937; font-size:14px; margin-bottom:20px;">Είστε σίγουροι ότι θέλετε να διαγράψετε αυτό το Preset;</p>
                <button id="btnConfirmDelete" class="modal-btn" style="background:#EF4444; color:white; font-weight:bold; box-shadow:0 4px 10px rgba(239,68,68,0.3);">ΝΑΙ, ΔΙΑΓΡΑΦΗ</button>
                <button id="btnCancelDelete" class="modal-btn" style="background:#f3f4f6; color:#1f2937; border:1px solid #d1d5db; font-weight:bold; margin-top:10px;">ΑΚΥΡΩΣΗ</button>
            </div>
        `;
        document.body.appendChild(overlay);
        
        document.getElementById('btnConfirmDelete').onclick = () => {
            App.customExtraPresets.splice(idx, 1);
            window.socket.emit('save-store-settings', { customExtraPresets: App.customExtraPresets });
            App.renderManagePresetsList();
            if (App.renderExtraPresetsDropdown) App.renderExtraPresetsDropdown();
            overlay.remove();
        };
        
        document.getElementById('btnCancelDelete').onclick = () => overlay.remove();
    },

    editCustomPreset: function(idx) {
        const App = window.App;
        App.currentExtrasCatIndex = 'preset';
        App.currentExtrasItemIndex = idx;
        App.tempExtras = JSON.parse(JSON.stringify(App.customExtraPresets[idx].items || []));
        
        const title = document.getElementById('extrasModalTitle');
        if (title) title.innerText = `ΕΠΕΞΕΡΓΑΣΙΑ PRESET: ${App.customExtraPresets[idx].name}`;
        
        App.renderExtrasList();
        document.getElementById('extrasModal').style.display = 'flex';
    },

    createNewCustomPreset: function() {
        const App = window.App;
        
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.display = 'flex';
        overlay.style.zIndex = '15000';
        
        overlay.innerHTML = `
            <div class="modal-box" style="width:90%; max-width:350px; text-align:center;">
                <h3 style="color:#9C27B0; margin-top:0;">Νέο Preset</h3>
                <p style="font-size:13px; color:#6b7280; margin-bottom:15px;">Δώστε όνομα για το νέο Preset (π.χ. Υλικά Burger):</p>
                <input type="text" id="inpNewPresetName" class="inp-settings" placeholder="Όνομα Preset..." style="text-align:center; font-weight:bold; margin-bottom:15px;">
                <button id="btnCreateNewPreset" class="modal-btn" style="background:#9C27B0; color:white; font-weight:bold; box-shadow:0 4px 10px rgba(156,39,176,0.3);">ΔΗΜΙΟΥΡΓΙΑ</button>
                <button id="btnCancelNewPreset" class="modal-btn" style="background:#f3f4f6; color:#1f2937; border:1px solid #d1d5db; font-weight:bold; margin-top:10px;">ΑΚΥΡΩΣΗ</button>
            </div>
        `;
        document.body.appendChild(overlay);
        document.getElementById('inpNewPresetName').focus();

        document.getElementById('btnCreateNewPreset').onclick = () => {
            const name = document.getElementById('inpNewPresetName').value;
            if (!name || name.trim() === '') return;
            
            App.currentExtrasCatIndex = 'preset';
            App.currentExtrasItemIndex = 'new';
            App.tempPresetName = name.trim();
            App.tempExtras = [];
            
            const title = document.getElementById('extrasModalTitle');
            if (title) title.innerText = `ΝΕΟ PRESET: ${App.tempPresetName}`;
            
            App.renderExtrasList();
            document.getElementById('extrasModal').style.display = 'flex';
            
            overlay.remove();
        };
        
        document.getElementById('btnCancelNewPreset').onclick = () => overlay.remove();
    },

    saveExtrasAndClose: function() { window.App.saveExtras(); },

    // --- REORDERING LOGIC ---
    moveCategoryUp: function(idx) {
        const App = window.App;
        if (idx > 0) {
            const temp = App.menuData[idx];
            App.menuData[idx] = App.menuData[idx - 1];
            App.menuData[idx - 1] = temp;
            App.menuData.forEach((c, i) => c.order = i + 1);
            App.renderMenu();
        }
    },
    moveCategoryDown: function(idx) {
        const App = window.App;
        if (idx < App.menuData.length - 1) {
            const temp = App.menuData[idx];
            App.menuData[idx] = App.menuData[idx + 1];
            App.menuData[idx + 1] = temp;
            App.menuData.forEach((c, i) => c.order = i + 1);
            App.renderMenu();
        }
    },
    moveItemUp: function(idx) {
        const App = window.App;
        const cat = App.menuData[App.currentCategoryIndex];
        if (idx > 0) {
            const temp = cat.items[idx];
            cat.items[idx] = cat.items[idx - 1];
            cat.items[idx - 1] = temp;
            App.renderMenu();
        }
    },
    moveItemDown: function(idx) {
        const App = window.App;
        const cat = App.menuData[App.currentCategoryIndex];
        if (idx < cat.items.length - 1) {
            const temp = cat.items[idx];
            cat.items[idx] = cat.items[idx + 1];
            cat.items[idx + 1] = temp;
            App.renderMenu();
        }
    },

    // --- CROSS-CATEGORY D&D LOGIC ---
    showCategoryDropZones: function() {
        const App = window.App;
        let dzContainer = document.getElementById('categoryDropZones');
        if (!dzContainer) {
            dzContainer = document.createElement('div');
            dzContainer.id = 'categoryDropZones';
            dzContainer.style.cssText = "position:fixed; bottom:0; left:0; width:100%; background:rgba(31, 41, 55, 0.95); padding:15px; display:flex; flex-wrap:wrap; gap:10px; z-index:10000; justify-content:center; align-items:center; box-shadow:0 -5px 20px rgba(0,0,0,0.5); backdrop-filter:blur(5px); transition:transform 0.3s ease-out; transform:translateY(100%);";
            document.body.appendChild(dzContainer);
        }
        dzContainer.innerHTML = '<div style="width:100%; text-align:center; color:#FFD700; font-weight:bold; margin-bottom:5px; font-size:14px;">📂 Σύρετε εδώ για μετακίνηση σε άλλη κατηγορία:</div>';
        
        let hasOther = false;
        App.menuData.forEach((cat, catIdx) => {
            if (catIdx === App.currentCategoryIndex) return; 
            hasOther = true;
            const dz = document.createElement('div');
            dz.innerText = cat.name;
            dz.style.cssText = "background:#374151; color:white; border:2px dashed #10B981; padding:10px 15px; border-radius:8px; font-size:13px; font-weight:bold; transition:all 0.2s; cursor:default;";
            
            dz.addEventListener('dragover', (e) => {
                e.preventDefault();
                dz.style.background = '#10B981';
                dz.style.color = 'black';
                dz.style.transform = 'scale(1.05)';
            });
            dz.addEventListener('dragleave', () => {
                dz.style.background = '#374151';
                dz.style.color = 'white';
                dz.style.transform = 'scale(1)';
            });
            dz.addEventListener('drop', (e) => {
                e.preventDefault();
                const itemIdx = App.draggedItemIdx;
                if (itemIdx !== undefined && App.menuData[App.currentCategoryIndex]) {
                    const currentCat = App.menuData[App.currentCategoryIndex];
                    const itemToMove = currentCat.items.splice(itemIdx, 1)[0];
                    if (!App.menuData[catIdx].items) App.menuData[catIdx].items = [];
                    App.menuData[catIdx].items.push(itemToMove);
                    App.hideCategoryDropZones();
                    App.renderMenu();
                }
            });
            dzContainer.appendChild(dz);
        });
        
        if (!hasOther) { dzContainer.innerHTML += '<div style="color:#aaa; font-size:12px;">Δεν υπάρχουν άλλες κατηγορίες.</div>'; }
        dzContainer.style.display = 'flex';
        void dzContainer.offsetWidth; // Force reflow
        dzContainer.style.transform = 'translateY(0)';
    },
    hideCategoryDropZones: function() {
        const dz = document.getElementById('categoryDropZones');
        if (dz) {
            dz.style.transform = 'translateY(100%)';
            setTimeout(() => dz.style.display = 'none', 300);
        }
    }
};