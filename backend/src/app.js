const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const { crawlAllSites } = require('./services/crawler.service');

const app = express();

// 1. Basic Middlewares
app.use(cors());
app.use(express.json());

// 2. Models Load Karo (Schema Registration)
require('./models/Series');
require('./models/Episode');

// 3. Static Files (Public folder ko link karna)
// Ye line admin.html ko render karne ke liye zaroori hai
app.use(express.static(path.join(__dirname, '../public')));

// --- ROUTES ---

// A. Root Route (Cannot GET / ko fix karne ke liye)
app.get('/', (req, res) => {
    res.status(200).send(`
        <div style="text-align:center; padding:50px; font-family:sans-serif;">
            <h1>🚀 Anime Backend is Live!</h1>
            <p>Admin panel dekhne ke liye yahan click karein:</p>
            <a href="/admin" style="padding:10px 20px; background:#00d2ff; color:white; text-decoration:none; border-radius:5px;">Go to Admin Panel</a>
        </div>
    `);
});

// B. Admin HTML Page Route
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// C. Admin Summary API (Stats dikhane ke liye)
app.get('/api/admin/summary', async (req, res) => {
    try {
        const Series = mongoose.model('Series');
        
        // Site wise counts nikalne ke liye grouping
        const stats = await Series.aggregate([
            { $group: { _id: "$sourceSite", count: { $sum: 1 } } }
        ]);

        // Latest 10 anime nikalna logs ke liye
        const recent = await Series.find()
            .sort({ createdAt: -1 })
            .limit(10);
        
        const total = await Series.countDocuments();

        res.json({
            total: total,
            breakdown: stats,
            recentlyAdded: recent
        });
    } catch (err) {
        console.error("Summary API Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// D. Trigger Mega Crawl API
app.post('/api/admin/start-mega-crawl', (req, res) => {
    // Ye background mein chalega, response turant mil jayega
    crawlAllSites().catch(err => console.error("Crawler Error:", err));
    
    res.json({ 
        success: true, 
        message: "Mega Crawler started! Check dashboard stats in a few minutes." 
    });
});

// E. Frontend Gallery API (Agar tu site pe anime dikhana chahe)
app.get('/api/gallery', async (req, res) => {
    try {
        const series = await mongoose.model('Series').find().sort({ createdAt: -1 });
        res.json(series);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = app;
