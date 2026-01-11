const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');

// Extraction Logic
const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    try {
        const Series = mongoose.model('Series');
        const Episode = mongoose.model('Episode');

        console.log(`📡 Processing: ${animeName} (${languageTag})`);

        // Check if already exists
        const uniqueTitle = `${animeName} (${languageTag})`;
        let series = await Series.findOne({ title: uniqueTitle });

        if (!series) {
            // Hum abhi simple metadata create kar rahe hain
            series = await Series.create({
                title: uniqueTitle,
                sourceUrl: mainUrl,
                language: languageTag,
                isPublished: false, // Admin review ke liye false
                poster: "https://via.placeholder.com/300x450?text=Processing...",
                description: "Metadata will be updated shortly."
            });
        }

        // --- Basic Episode Scraping ---
        const res = await axios.get(mainUrl, { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' },
            timeout: 10000
        });
        const $ = cheerio.load(res.data);
        
        // Yahan tere site specific selectors aayenge episodes ke liye
        // Abhi ke liye hum status update kar rahe hain
        console.log(`✅ ${animeName} added to Drafts.`);

    } catch (err) {
        console.error(`❌ Extractor Error [${animeName}]: ${err.message}`);
    }
};

// IMPORTANT: Named export
module.exports = { extractAndUpload };
