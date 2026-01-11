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

// Static folder (public)
const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath));

// Admin Route - Seedha admin.html ko point kar raha hai
app.get('/admin', (req, res) => {
    res.sendFile(path.join(publicPath, 'admin.html'), (err) => {
        if (err) {
            console.error("File Load Error:", err);
            res.status(404).send("Bhai, 'backend/public/admin.html' nahi mili. Folder check kar!");
        }
    });
});

// API Routes
const adminRoutes = require('./routes/admin.routes');
app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => {
    res.send('Backend is Live! Go to /admin to access the panel.');
});

module.exports = app;
