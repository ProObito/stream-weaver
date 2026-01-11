const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { extractAndUpload } = require('../extractors/seriesExtractor');
const { startGlobalCrawl } = require('../services/crawler.service');

// 1. DASHBOARD STATS: Live aur Pending count ke liye
router.get('/summary', async (req, res) => {
    try {
        const Series = mongoose.model('Series');
        const total = await Series.countDocuments({ isPublished: true });
        // Pending count hum yahan se bhi bhej sakte hain
        const pending = await Series.countDocuments({ isPublished: false });
        res.json({ total, pending });
    } catch (err) {
        res.status(500).json({ total: 0, pending: 0 });
    }
});

// 2. GET PENDING LIST: Review ke liye drafts load karna
router.get('/pending', async (req, res) => {
    try {
        const Series = mongoose.model('Series');
        // Drafts ko latest updated ke hisab se dikhayega
        const drafts = await Series.find({ isPublished: false }).sort({ updatedAt: -1 });
        res.json(drafts);
    } catch (err) {
        res.status(500).json([]);
    }
});

// 3. GLOBAL AUTO-EXTRACT: Ek click mein teeno sites scan karega
router.post('/start-extract', async (req, res) => {
    try {
        // Ye background mein crawler service ko trigger karega
        startGlobalCrawl(); 
        res.json({ message: "Global Crawler Started! TPX, DesiDub, aur HiAnime scan ho rahe hain. Drafts check karte rahein." });
    } catch (err) {
        res.status(500).json({ message: "Crawler trigger failed!" });
    }
});

// 4. MANUAL EXTRACT: Agar kisi specific anime ka link dalna ho
router.post('/manual-extract', async (req, res) => {
    const { url, animeName, language } = req.body;
    
    if (!url || !animeName) {
        return res.status(400).json({ message: "URL aur Name dono zaroori hain!" });
    }

    // Background extraction start (Default Language handles tags)
    extractAndUpload(url, animeName, language || 'Hindi Sub');
    
    res.json({ message: `Extraction started for ${animeName}! Draft list refresh karein.` });
});

// 5. UPLOAD TO FRONTEND (Publish): Draft ko live karna
router.post('/publish/:id', async (req, res) => {
    try {
        const Series = mongoose.model('Series');
        const updated = await Series.findByIdAndUpdate(
            req.params.id, 
            { isPublished: true }, 
            { new: true }
        );
        
        if (updated) {
            res.json({ success: true, message: "🚀 Anime ab Live hai frontend par!" });
        } else {
            res.status(404).json({ success: false, message: "Series nahi mili!" });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: "Publishing error" });
    }
});

// 6. DELETE DRAFT: Agar koi galat entry aa jaye toh
router.delete('/delete/:id', async (req, res) => {
    try {
        const Series = mongoose.model('Series');
        await Series.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Draft deleted successfully" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Delete failed" });
    }
});

module.exports = router;
