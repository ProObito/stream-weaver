const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const { crawlAllSites } = require('./services/crawler.service');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Models load karna (Schema errors se bachne ke liye)
require('./models/Series');
require('./models/Episode');

// Static files (Admin HTML ke liye)
app.use(express.static(path.join(__dirname, '../public')));

// --- ADMIN ROUTES ---

// Admin Page Load Karna
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// Summary API
app.get('/api/admin/summary', async (req, res) => {
    try {
        const Series = mongoose.model('Series');
        const stats = await Series.aggregate([
            { $group: { _id: "$sourceSite", count: { $sum: 1 } } }
        ]);
        const recent = await Series.find().sort({ createdAt: -1 }).limit(5);
        
        res.json({
            total: await Series.countDocuments(),
            breakdown: stats,
            recentlyAdded: recent
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Trigger Mega Crawl
app.post('/api/admin/start-mega-crawl', (req, res) => {
    crawlAllSites(); // Background mein start hoga
    res.json({ message: "Mega Crawler started successfully!" });
});

// Frontend Gallery API
app.get('/api/gallery', async (req, res) => {
    try {
        const series = await mongoose.model('Series').find().sort({ createdAt: -1 });
        res.json(series);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = app;
