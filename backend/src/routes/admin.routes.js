const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { extractAndUpload } = require('../extractors/seriesExtractor');

// Manual Start
router.post('/manual-extract', async (req, res) => {
    const { url, animeName, language } = req.body;
    const API_KEY = 'ff36f8749fb231991d6381abac9c4ec0';
    // Background execution
    extractAndUpload(url, animeName, "Manual", API_KEY, language);
    res.json({ message: "Extraction process started!" });
});

// Drafts List
router.get('/pending', async (req, res) => {
    try {
        const Series = mongoose.model('Series');
        const drafts = await Series.find({ isPublished: false }).sort({ updatedAt: -1 });
        res.json(drafts);
    } catch (e) { res.status(500).json([]); }
});

// Publish
router.post('/publish/:id', async (req, res) => {
    try {
        const Series = mongoose.model('Series');
        await Series.findByIdAndUpdate(req.params.id, { isPublished: true });
        res.json({ success: true, message: "Live on App!" });
    } catch (e) { res.status(500).json({ success: false }); }
});

module.exports = router;
