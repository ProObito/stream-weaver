const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { extractAndUpload } = require('../extractors/seriesExtractor');

// Manual Extract Trigger
router.post('/manual-extract', async (req, res) => {
    const { url, animeName, language } = req.body;
    
    if(!url || !animeName) return res.status(400).json({ message: "URL and Name Required" });

    // Background process start karo (User ko wait mat karao)
    extractAndUpload(url, animeName, language || 'Hindi Sub');
    
    res.json({ message: `Extraction started for ${animeName}. Check logs/dashboard in 2 mins.` });
});

// Dashboard Stats
router.get('/summary', async (req, res) => {
    try {
        const Series = mongoose.model('Series');
        const total = await Series.countDocuments({ isPublished: true });
        const pending = await Series.countDocuments({ isPublished: false });
        res.json({ total, pending });
    } catch (e) { res.status(500).json({ total: 0, pending: 0 }); }
});

// Pending Drafts List
router.get('/pending', async (req, res) => {
    const Series = mongoose.model('Series');
    const drafts = await Series.find({ isPublished: false }).sort({ updatedAt: -1 });
    res.json(drafts);
});

// Publish Anime
router.post('/publish/:id', async (req, res) => {
    const Series = mongoose.model('Series');
    await Series.findByIdAndUpdate(req.params.id, { isPublished: true });
    res.json({ success: true });
});

module.exports = router;
