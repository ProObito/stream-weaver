const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');

// Extractor import
let extractAndUpload;
try {
    const extractor = require('../extractors/seriesExtractor');
    extractAndUpload = extractor.extractAndUpload;
} catch (e) {
    console.error("❌ Extractor Load Error");
}

async function crawlAllSites() {
    const Series = mongoose.model('Series');
    const Episode = mongoose.model('Episode');
    const API_KEY = 'ff36f8749fb231991d6381abac9c4ec0';
    
    // Nayi Site Config
    const sites = [
        { 
            name: 'TPXSub', 
            url: 'https://www.tpxsub.com/animes-in-hindi-sub/', 
            lang: 'Hindi Sub',
            active: true 
        }
    ];

    console.log("🚀 Starting TPXSub Scraper...");

    for (const site of sites) {
        try {
            // ScraperAPI URL with retry_404=true as you provided
            const targetUrl = `https://api.scraperapi.com/?api_key=${API_KEY}&url=${encodeURIComponent(site.url)}&render=true&retry_404=true`;
            
            const res = await axios.get(targetUrl, { timeout: 120000 });
            const $ = cheerio.load(res.data);
            
            let animeLinks = [];

            // TPXSub specific selector: Ye log aksar 'article' ya 'entry-title' use karte hain
            $('.entry-title a, .post-title a').each((i, el) => {
                const title = $(el).text().trim();
                const link = $(el).attr('href');
                
                if (link && link.includes('/anime/') || link.includes('/series/')) {
                    if (!animeLinks.find(a => a.link === link)) {
                        animeLinks.push({ title, link });
                    }
                }
            });

            console.log(`✅ TPXSub: Found ${animeLinks.length} Titles`);

            // Sirf Top 5 check karte hain test ke liye
            for (const item of animeLinks.slice(0, 5)) {
                try {
                    let series = await Series.findOne({ title: { $regex: new RegExp(`^${item.title}$`, 'i') } });
                    if (series) continue; 
                    
                    console.log(`🎬 Processing: ${item.title}`);
                    if (typeof extractAndUpload === 'function') {
                        await extractAndUpload(item.link, item.title, site.name, API_KEY, site.lang);
                    }
                    await new Promise(r => setTimeout(r, 5000)); 
                } catch (err) {
                    console.error(`❌ Error on ${item.title}:`, err.message);
                }
            }
        } catch (err) {
            console.error(`❌ Scraper Fail: ${err.message}`);
        }
    }
}

module.exports = { crawlAllSites };
