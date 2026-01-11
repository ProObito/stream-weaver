const express = require('express');
const router = express.Router();
const { extractAndUpload } = require('../extractors/seriesExtractor');

// Manual Extraction Route
router.post('/manual-extract', async (req, res) => {
    try {
        const { url, animeName, language } = req.body;
        const API_KEY = 'ff36f8749fb231991d6381abac9c4ec0';

        if (!url || !animeName) {
            return res.status(400).json({ success: false, message: "URL aur Name zaroori hai!" });
        }

        console.log(`🎯 Admin Triggered Manual Extract for: ${animeName}`);
        
        // Background mein extraction start kar do
        extractAndUpload(url, animeName, "Manual_Input", API_KEY, language || "Hindi Sub");

        res.json({ success: true, message: "Extraction process started! Check logs for progress." });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
