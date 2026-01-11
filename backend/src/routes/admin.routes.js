const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { extractAndUpload } = require('../extractors/seriesExtractor');

// Manual Start
router.post('/manual-extract', async (req, res) => {
    const { url, animeName, language } = req.body;
    const API_KEY = 'ff36f8749fb231991d6381abac9c4ec0';
    extractAndUpload(url, animeName, "Manual", API_KEY, language);
    res.json({ message: "Full Series extraction started in background!" });
});

// Drafts list
router.get('/pending', async (req, res) => {
    const Series = mongoose.model('Series');
    const drafts = await Series.find({ isPublished: false });
    res.json(drafts);
});

// Publish (Live)
router.post('/publish/:id', async (req, res) => {
    const Series = mongoose.model('Series');
    await Series.findByIdAndUpdate(req.params.id, { isPublished: true });
    res.json({ success: true, message: "Published to App!" });
});

module.exports = router;
