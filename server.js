// server.js
const express = require('express');
const path = require('path');
const app = express();

// Ορίζουμε το port που δίνει το Render
const PORT = process.env.PORT || 3000;

// Λέμε στον server να βλέπει τον φάκελο 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Για οποιαδήποτε άλλη διαδρομή, στείλε το index.html (αν υπάρχει) ή 404
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
