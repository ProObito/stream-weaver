const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { extractAndUpload } = require('../extractors/seriesExtractor');

// 1. Manual Auto-Extraction (Saves as Draft)
router.post('/manual-extract', async (req, res) => {
    const { url, animeName, language } = req.body;
    const API_KEY = 'ff36f8749fb231991d6381abac9c4ec0';
    
    // Background mein process chalega, user ko wait nahi karwayenge
    extractAndUpload(url, animeName, "Manual", API_KEY, language);
    res.json({ message: "Auto-Extraction Started! Draft will appear below shortly." });
});

// 2. Publish to Frontend (Button click par)
router.post('/publish/:id', async (req, res) => {
    try {
        const Series = mongoose.model('Series');
        await Series.findByIdAndUpdate(req.params.id, { isPublished: true });
        res.json({ success: true, message: "🚀 Anime is now LIVE on Frontend!" });
    } catch (err) {
        res.status(500).json({ error: "Publish failed" });
    }
});

// 3. Pending List (Drafts)
router.get('/pending', async (req, res) => {
    const Series = mongoose.model('Series');
    const drafts = await Series.find({ isPublished: false }).sort({ createdAt: -1 });
    res.json(drafts);
});

module.exports = router;
