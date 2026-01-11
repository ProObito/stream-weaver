const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');

// Try-catch lagaya hai taaki agar extractor file mein error ho toh server na gire
let extractAndUpload;
try {
    const extractor = require('../extractors/seriesExtractor');
    extractAndUpload = extractor.extractAndUpload;
} catch (e) {
    console.error("❌ Critical: Could not load seriesExtractor.js - check for syntax errors!");
}

async function crawlAllSites() {
    // Models check
    const Series = mongoose.model('Series');
    const Episode = mongoose.model('Episode');
    const API_KEY = 'ff36f8749fb231991d6381abac9c4ec0';
    
    const sites = [
        { 
            name: 'HindiSubAnime', 
            url: 'https://hindisubanime.co/serie/', 
            lang: 'Hindi Sub',
            active: true 
        }
    ];

    console.log("🚀 Switching to Ultra-Scraper Mode...");

    for (const site of sites) {
        if (!site.active) continue;

        try {
            console.log(`📡 Requesting with Premium Proxies: ${site.url}`);
            
            const targetUrl = `https://api.scraperapi.com/?api_key=${API_KEY}&url=${encodeURIComponent(site.url)}&render=true&premium=true&country_code=us&device_type=desktop&wait_until=networkidle2`;
            
            const res = await axios.get(targetUrl, { timeout: 120000 });
            const $ = cheerio.load(res.data);
            
            let animeLinks = [];

            $('a').each((i, el) => {
                const title = $(el).text().trim();
                const link = $(el).attr('href');
                
                if (link && (link.includes('/serie/') || link.includes('/anime/')) && title.length > 5) {
                    if (link !== 'https://hindisubanime.co/serie/' && !animeLinks.find(a => a.link === link)) {
                        animeLinks.push({ title, link });
                    }
                }
            });

            if (animeLinks.length === 0) {
                console.log("⚠️ Site returned empty body. Trying backup selector...");
                $('h2, h3, h4').find('a').each((i, el) => {
                    const title = $(el).text().trim();
                    const link = $(el).attr('href');
                    if (link && title.length > 5) animeLinks.push({ title, link });
                });
            }

            console.log(`✅ Success! Found ${animeLinks.length} Titles`);

            for (const item of animeLinks) {
                try {
                    let series = await Series.findOne({ title: { $regex: new RegExp(`^${item.title}$`, 'i') } });
                    if (series) {
                        const count = await Episode.countDocuments({ seriesId: series._id });
                        if (count > 0) continue;
                    }
                    
                    console.log(`🎬 Processing: ${item.title}`);
                    if (typeof extractAndUpload === 'function') {
                        await extractAndUpload(item.link, item.title, site.name, API_KEY, site.lang);
                    }
                    await new Promise(r => setTimeout(r, 5000)); // 5 sec wait to prevent IP ban
                } catch (innerErr) {
                    console.error(`❌ Error processing ${item.title}:`, innerErr.message);
                }
            }
        } catch (err) {
            console.error(`❌ Ultra-Scraper Fail: ${err.message}`);
        }
    }
}

module.exports = { crawlAllSites };
