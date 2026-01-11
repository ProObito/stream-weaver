const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Models
require('./models/Series');
require('./models/Episode');

// STATIC FILES CONFIG
// Ye line check kar, 'public' folder ko serve karne ke liye
app.use(express.static(path.join(__dirname, '../public')));

// Routes
const adminRoutes = require('./routes/admin.routes');
app.use('/api/admin', adminRoutes);

// Agar koi seedha /admin par jaye toh use index.html bhejo
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/index.html'));
});

app.get('/', (req, res) => {
    res.send('Stream Weaver Backend Running');
});

module.exports = app;
