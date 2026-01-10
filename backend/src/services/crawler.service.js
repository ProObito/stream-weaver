const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');
const { extractAndUpload } = require('../extractors/seriesExtractor');

async function crawlAllSites() {
    const Series = mongoose.model('Series');
    const Episode = mongoose.model('Episode');
    const API_KEY = '201c680bb6922b8860eeb532fa93efe21c195146';
    
    const sites = [
        { name: 'DesiDub', url: 'https://www.desidubanime.me', selector: 'article a, .post-title a', lang: 'Multi', forceAll: true },
        { name: 'HindiSubAnime', url: 'http://HindiSubAnime.co', selector: '.post-title a, article a, h2 a', lang: 'Hindi Sub', forceAll: true },
        { name: 'LordsAnime', url: 'https://www.lordsanime.in/all-anime-list/', selector: '.entry-title a, li a', lang: 'Hindi Sub', forceAll: false },
        { name: 'YBXAnime', url: 'https://ybxanime.com/anime-list/', selector: 'a[href*="/anime/"]', lang: 'Hindi Sub', forceAll: false }
    ];

    console.log("🚀 Power Sync: Manual Selector + Resume Mode...");

    for (const site of sites) {
        try {
            console.log(`📡 Scanning: ${site.name}`);
            
            const res = await axios.get('https://api.zenrows.com/v1/', {
                params: { 
                    'url': site.url, 
                    'apikey': API_KEY, 
                    'premium_proxy': 'true',
                    'js_render': 'true' // Selectors ke liye JS render zaroori hai
                }
            });

            const $ = cheerio.load(res.data);
            let animeLinks = [];

            $(site.selector).each((i, el) => {
                const title = $(el).text().trim();
                const link = $(el).attr('href');
                if (link && link.includes('http') && title.length > 3) {
                    if (!/category|tag|contact|about|disclaimer|dmca/.test(link.toLowerCase())) {
                        if (!animeLinks.find(a => a.link === link)) animeLinks.push({ title, link });
                    }
                }
            });

            console.log(`✅ ${site.name}: Found ${animeLinks.length} Titles`);

            for (const item of animeLinks) {
                let series = await Series.findOne({ title: { $regex: new RegExp(`^${item.title}$`, 'i') } });
                
                if (series) {
                    const existingCount = await Episode.countDocuments({ seriesId: series._id, language: site.lang });
                    if (existingCount > 0 && !site.forceAll) {
                        console.log(`⏩ Skip: ${item.title} (Already exists)`);
                        continue;
                    }
                }

                console.log(`🎬 Extracting: ${item.title}`);
                await extractAndUpload(item.link, item.title, site.name, API_KEY, 0, site.lang);
                await new Promise(r => setTimeout(r, 2000));
            }
        } catch (err) {
            console.error(`❌ ${site.name} Error:`, err.message);
        }
    }
}

module.exports = { crawlAllSites };
