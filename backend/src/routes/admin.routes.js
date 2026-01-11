const express = require('express');
const router = express.Router();
const { extractAndUpload } = require('../extractors/seriesExtractor');

// Manual Extract Endpoint
router.post('/manual-extract', async (req, res) => {
    const { url, animeName, language } = req.body;
    const API_KEY = 'ff36f8749fb231991d6381abac9c4ec0';

    if (!url || !animeName) {
        return res.status(400).json({ error: "URL aur Name dono bharna zaroori hai!" });
    }

    // Process start karke turant response dena taaki frontend hang na ho
    extractAndUpload(url, animeName, "Manual", API_KEY, language || "Hindi Sub");
    
    res.json({ message: "Extraction shuru ho gaya hai. Check Heroku logs!" });
});

module.exports = router;
