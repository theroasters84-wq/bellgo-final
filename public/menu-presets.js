/* ΑΡΧΕΙΟ ΠΡΟΤΥΠΩΝ ΚΑΤΑΛΟΓΩΝ (PRESETS)
   Εδώ μπορείς να αλλάξεις προϊόντα, τιμές και extras.
   
   ΠΡΟΣΟΧΗ: Μην σβήσεις τα άγκιστρα { } και τις αγκύλες [ ].
*/

window.PRESET_MENUS = {
    'coffee_takeaway': [
        { order: 1, name: "ΚΑΦΕΔΕΣ", items: [
            { name: "Freddo Espresso", price: 2.20, extras: [{name:"Μέτριο",price:0},{name:"Γλυκό",price:0},{name:"Σκέτο",price:0},{name:"Γάλα",price:0.30}] },
            { name: "Freddo Cappuccino", price: 2.50, extras: [{name:"Μέτριο",price:0},{name:"Γλυκό",price:0},{name:"Σκέτο",price:0},{name:"Κανέλα",price:0}] },
            { name: "Frappe", price: 1.80, extras: [{name:"Μέτριο",price:0},{name:"Γλυκό",price:0},{name:"Γάλα",price:0.30}] }
        ]},
        { order: 2, name: "ΣΦΟΛΙΑΤΕΣ", items: [
            { name: "Τυρόπιτα", price: 2.00, extras: [] },
            { name: "Σπανακόπιτα", price: 2.20, extras: [] },
            { name: "Μπουγάτσα", price: 2.50, extras: [{name:"Άχνη/Κανέλα",price:0}] }
        ]},
        { order: 3, name: "SNACKS", items: [
            { name: "Toast", price: 1.80, extras: [{name:"Γαλοπούλα",price:0},{name:"Ζαμπόν",price:0}] },
            { name: "Sandwich", price: 3.50, extras: [] }
        ]}
    ],
    'coffee_bar': [
        { order: 1, name: "ΚΑΦΕΔΕΣ", items: [
            { name: "Espresso", price: 2.50, extras: [] },
            { name: "Cappuccino", price: 3.50, extras: [] },
            { name: "Freddo Espresso", price: 3.50, extras: [] }
        ]},
        { order: 2, name: "ΠΟΤΑ", items: [
            { name: "Whiskey Simple", price: 7.00, extras: [] },
            { name: "Vodka Simple", price: 7.00, extras: [] },
            { name: "Gin Tonic", price: 8.00, extras: [] }
        ]},
        { order: 3, name: "COCKTAILS", items: [
            { name: "Mojito", price: 9.00, extras: [] },
            { name: "Margarita", price: 9.00, extras: [] },
            { name: "Negroni", price: 9.00, extras: [] }
        ]}
    ],
    'pizzeria': [
        { order: 1, name: "PIZZA", items: [
            { name: "Margherita", price: 8.00, extras: [{name:"Extra Cheese",price:1.50}] },
            { name: "Special", price: 10.00, extras: [] },
            { name: "Pepperoni", price: 9.00, extras: [] }
        ]},
        { order: 2, name: "ΣΑΛΑΤΕΣ", items: [
            { name: "Caesar's", price: 7.50, extras: [] },
            { name: "Chef", price: 7.00, extras: [] },
            { name: "Χωριάτικη", price: 6.50, extras: [] }
        ]},
        { order: 3, name: "ΑΝΑΨΥΚΤΙΚΑ", items: [
            { name: "Coca Cola 330ml", price: 1.50, extras: [] },
            { name: "Beer 500ml", price: 3.50, extras: [] }
        ]}
    ],
    'souvlaki': [
        { order: 1, name: "ΤΥΛΙΧΤΑ", items: [
            { name: "Πίτα Γύρος Χοιρινό", price: 3.50, extras: [{name:"Απ'όλα",price:0},{name:"Χωρίς Κρεμμύδι",price:0},{name:"Χωρίς Τζατζίκι",price:0}] },
            { name: "Πίτα Καλαμάκι Κοτόπουλο", price: 3.50, extras: [{name:"Απ'όλα",price:0},{name:"Σως",price:0}] }
        ]},
        { order: 2, name: "ΜΕΡΙΔΕΣ", items: [
            { name: "Μερίδα Γύρος", price: 9.00, extras: [] },
            { name: "Μερίδα Καλαμάκια", price: 9.00, extras: [] }
        ]},
        { order: 3, name: "ΟΡΕΚΤΙΚΑ", items: [
            { name: "Πατάτες", price: 3.00, extras: [] },
            { name: "Τζατζίκι", price: 3.50, extras: [] },
            { name: "Φέτα", price: 3.50, extras: [{name:"Λάδι/Ρίγανη",price:0}] }
        ]}
    ]
};
