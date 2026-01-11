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
            url: 'https://hindisubanime.co', 
            // Broad selectors: Ab ye lagbhag har tarah ke link ko scan karega
            selector: 'a[href*="/anime/"], a[href*="/series/"], .post-title a, .entry-title a, h2 a', 
            lang: 'Hindi Sub',
            active: true 
        }
    ];

    console.log("🚀 ScraperAPI Mode: High Compatibility Sync");

    for (const site of sites) {
        if (!site.active) continue;

        try {
            console.log(`📡 Requesting ${site.name}: ${site.url}`);
            
            // Added wait_until=networkidle0 taaki poora page load ho
            const targetUrl = `https://api.scraperapi.com/?api_key=${API_KEY}&url=${encodeURIComponent(site.url)}&render=true&retry_404=true&wait_until=networkidle0`;
            
            const res = await axios.get(targetUrl, { timeout: 90000 });

            if (!res.data) {
                console.log("⚠️ Empty response from ScraperAPI");
                continue;
            }

            const $ = cheerio.load(res.data);
            let animeLinks = [];

            // Selector logic optimized
            $(site.selector).each((i, el) => {
                const title = $(el).text().trim();
                const link = $(el).attr('href');
                
                // Junk filter
                if (link && link.includes('http') && title.length > 3) {
                    if (!/login|register|cart|account|contact|dmca|policy/i.test(link)) {
                        if (!animeLinks.find(a => a.link === link)) {
                            animeLinks.push({ title, link });
                        }
                    }
                }
            });

            console.log(`✅ Found ${animeLinks.length} Titles`);

            // Agar titles mil gaye toh debug log dikhao
            if (animeLinks.length > 0) {
                console.log(`📌 Sample Title: ${animeLinks[0].title}`);
            }

            for (const item of animeLinks) {
                let series = await Series.findOne({ title: { $regex: new RegExp(`^${item.title}$`, 'i') } });
                if (series) {
                    const count = await Episode.countDocuments({ seriesId: series._id });
                    if (count > 0) continue;
                }
                
                await extractAndUpload(item.link, item.title, site.name, API_KEY, site.lang);
                await new Promise(r => setTimeout(r, 8000)); 
            }
        } catch (err) {
            console.error(`❌ ScraperAPI Error: ${err.message}`);
        }
    }
}

module.exports = { crawlAllSites };
