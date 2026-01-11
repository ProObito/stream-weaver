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
            // URL ko ekdum simple rakho bina trailing slash ke
            url: 'http://hindisubanime.co/anime-list', 
            selector: '.entry-title a, .post-title a', 
            lang: 'Hindi Sub',
            active: true 
        }
    ];

    console.log("🚀 ScraperAPI Mode: On (Fixed URL Encoding)");

    for (const site of sites) {
        if (!site.active) continue;

        try {
            console.log(`📡 Requesting ${site.name}: ${site.url}`);
            
            // ScraperAPI setup with encoding
            const targetUrl = `https://api.scraperapi.com/?api_key=${API_KEY}&url=${encodeURIComponent(site.url)}&render=true`;
            
            const res = await axios.get(targetUrl, { timeout: 60000 });

            const $ = cheerio.load(res.data);
            let animeLinks = [];

            $(site.selector).each((i, el) => {
                const title = $(el).text().trim();
                const link = $(el).attr('href');
                if (link && title.length > 5) {
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
                // 5-10 second ka gap rakho taaki API block na ho
                await new Promise(r => setTimeout(r, 7000)); 
            }
        } catch (err) {
            // Error details check karne ke liye
            console.error(`❌ ScraperAPI Scan Fail: ${err.response ? err.response.status : err.message}`);
        }
    }
}

module.exports = { crawlAllSites };
