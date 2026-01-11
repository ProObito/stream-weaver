const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { extractAndUpload } = require('../extractors/seriesExtractor');

// 1. DASHBOARD SUMMARY: Stats dikhane ke liye
router.get('/summary', async (req, res) => {
    try {
        const Series = mongoose.model('Series');
        const total = await Series.countDocuments({ isPublished: true });
        // Pending count client-side list.length se bhi nikal raha hai, par yahan 0 bhej sakte hain
        res.json({ total });
    } catch (err) {
        res.status(500).json({ total: 0 });
    }
});

// 2. GET PENDING: Drafts ki list load karne ke liye
router.get('/pending', async (req, res) => {
    try {
        const Series = mongoose.model('Series');
        // Sirf wahi anime jo abhi live nahi huye (Drafts)
        const drafts = await Series.find({ isPublished: false }).sort({ updatedAt: -1 });
        res.json(drafts);
    } catch (err) {
        res.status(500).json([]);
    }
});

// 3. MANUAL EXTRACT: Naya anime backend mein save karne ke liye
router.post('/manual-extract', async (req, res) => {
    const { url, animeName, language } = req.body;
    
    if (!url || !animeName) {
        return res.status(400).json({ message: "Bhai, details adhuri hain!" });
    }

    // Background process: Database mein save aur episodes upload
    // Humne extractor mein isPublished: false rakha hai taaki ye seedha pending mein jaye
    extractAndUpload(url, animeName, language || 'Hindi Sub');
    
    res.json({ message: "Extraction process started! 🚀 Thoda wait karke refresh karein." });
});

// 4. PUBLISH TO LIVE: Draft ko frontend par bhejne ke liye
router.post('/publish/:id', async (req, res) => {
    try {
        const Series = mongoose.model('Series');
        const updated = await Series.findByIdAndUpdate(
            req.params.id, 
            { isPublished: true }, 
            { new: true }
        );
        
        if (updated) {
            res.json({ success: true, message: "Series is now live!" });
        } else {
            res.status(404).json({ success: false, message: "Anime not found" });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

module.exports = router;
