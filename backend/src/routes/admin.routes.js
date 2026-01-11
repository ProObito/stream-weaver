const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { startGlobalCrawl } = require('../services/crawler.service');

// Dashboard Summary
router.get('/summary', async (req, res) => {
    try {
        const Series = mongoose.model('Series');
        const total = await Series.countDocuments({ isPublished: true });
        const pending = await Series.countDocuments({ isPublished: false });
        res.json({ total, pending });
    } catch (err) { res.status(500).json({ total: 0, pending: 0 }); }
});

// Pending List
router.get('/pending', async (req, res) => {
    try {
        const Series = mongoose.model('Series');
        const drafts = await Series.find({ isPublished: false }).sort({ updatedAt: -1 });
        res.json(drafts);
    } catch (err) { res.status(500).json([]); }
});

// Trigger Global Crawl
router.post('/start-extract', async (req, res) => {
    console.log("📩 Global Crawl Triggered by Admin");
    startGlobalCrawl(); // Background mein chalne do
    res.json({ message: "Crawler started! Check drafts in a few minutes." });
});

// Publish to Live
router.post('/publish/:id', async (req, res) => {
    try {
        const Series = mongoose.model('Series');
        await Series.findByIdAndUpdate(req.params.id, { isPublished: true });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// Delete Draft
router.delete('/delete/:id', async (req, res) => {
    try {
        const Series = mongoose.model('Series');
        await Series.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

module.exports = router;
