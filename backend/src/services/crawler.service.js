const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');
const { extractAndUpload } = require('../extractors/seriesExtractor');

async function crawlAllSites() {
    const Series = mongoose.model('Series');
    const Episode = mongoose.model('Episode');
    const API_KEY = 'ff36f8749fb231991d6381abac9c4ec0';
    
    const sites = [
        { 
            name: 'HindiSubAnime', 
            url: 'https://hindisubanime.co/anime-list/', 
            selector: '.entry-title a, .post-title a', 
            lang: 'Hindi Sub',
            active: true 
        }
    ];

    console.log("🚀 ScraperAPI Mode: On");

    for (const site of sites) {
        if (!site.active) continue;

        try {
            console.log(`📡 Requesting ${site.name}...`);
            
            const res = await axios.get('https://api.scraperapi.com/', {
                params: { 
                    api_key: API_KEY,
                    url: site.url, 
                    render: 'true',   // ✅ JS Rendering ON
                    premium: 'true'   // ✅ Cloudflare Bypass ke liye
                },
                timeout: 60000 // ScraperAPI thoda time leta hai JS render mein
            });

            const $ = cheerio.load(res.data);
            let animeLinks = [];

            $(site.selector).each((i, el) => {
                const title = $(el).text().trim();
                const link = $(el).attr('href');
                if (link && link.includes('http') && title.length > 5) {
                    if (!animeLinks.find(a => a.link === link)) animeLinks.push({ title, link });
                }
            });

            console.log(`✅ Found ${animeLinks.length} Titles`);

            for (const item of animeLinks) {
                let series = await Series.findOne({ title: { $regex: new RegExp(`^${item.title}$`, 'i') } });
                if (series) {
                    const count = await Episode.countDocuments({ seriesId: series._id });
                    if (count > 0) continue;
                }
                
                await extractAndUpload(item.link, item.title, site.name, API_KEY, site.lang);
                await new Promise(r => setTimeout(r, 5000)); // Rate limit safe
            }
        } catch (err) {
            console.error(`❌ ScraperAPI Scan Fail: ${err.message}`);
        }
    }
}

module.exports = { crawlAllSites };
