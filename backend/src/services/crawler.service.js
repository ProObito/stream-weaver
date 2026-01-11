const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');
// Import extractor directly
const { extractAndUpload } = require('../extractors/seriesExtractor');

async function crawlAllSites() {
    const Series = mongoose.model('Series');
    const Episode = mongoose.model('Episode');
    
    // YAHAN APNI FRESH KEY UPDATE KARO
    const API_KEY = 'c3a27fd2ab87b6c7da47577e5c4a61c94d4f6ba8';
    
    const sites = [
        { 
            name: 'HindiSubAnime', 
            url: 'http://hindisubanime.co/anime-list/', 
            selector: '.entry-title a, .post-title a', 
            lang: 'Hindi Sub',
            active: true 
        },
        { name: 'DesiDub', active: false },
        { name: 'LordsAnime', active: false },
        { name: 'YBXAnime', active: false }
    ];

    console.log("🚀 Starting Focused Sync...");

    for (const site of sites) {
        if (!site.active) continue;

        try {
            console.log(`📡 Scanning ${site.name} via ZenRows...`);
            
            const res = await axios.get('https://api.zenrows.com/v1/', {
                params: { 
                    'url': site.url, 
                    'apikey': API_KEY, 
                    'premium_proxy': 'true',
                    'js_render': 'true' 
                }
            });

            if (!res.data) throw new Error("No data received from ZenRows");

            const $ = cheerio.load(res.data);
            let animeLinks = [];

            $(site.selector).each((i, el) => {
                const title = $(el).text().trim();
                const link = $(el).attr('href');
                const junk = /watch|download|now|series|episode|okamura|hirata|ai|cast|voice|policy|dmca|contact/i;
                
                if (link && link.includes('http') && title.length > 5 && !junk.test(title)) {
                    if (!animeLinks.find(a => a.link === link)) animeLinks.push({ title, link });
                }
            });

            console.log(`✅ Found ${animeLinks.length} Titles`);

            for (const item of animeLinks) {
                let series = await Series.findOne({ title: { $regex: new RegExp(`^${item.title}$`, 'i') } });
                if (series) {
                    const count = await Episode.countDocuments({ seriesId: series._id, language: site.lang });
                    if (count > 0) continue;
                }
                
                // Call the extractor
                await extractAndUpload(item.link, item.title, site.name, API_KEY, 0, site.lang);
                await new Promise(r => setTimeout(r, 3000));
            }
        } catch (err) {
            console.error(`❌ ${site.name} Stop: ${err.message}`);
        }
    }
}

module.exports = { crawlAllSites };
