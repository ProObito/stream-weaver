const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');
const { extractAndUpload } = require('../extractors/seriesExtractor');

async function crawlAllSites() {
    const Series = mongoose.model('Series');
    const Episode = mongoose.model('Episode');
    const API_KEY = 'c3a27fd2ab87b6c7da47577e5c4a61c94d4f6ba8'; // Teri New Key
    
    const sites = [
        { 
            name: 'HindiSubAnime', 
            url: 'http://hindisubanime.co/anime-list/', // Direct List Page
            selector: '.entry-title a, .post-title a', 
            lang: 'Hindi Sub' 
        }
    ];

    console.log("🚀 Targeting HindiSubAnime.co - Full Archive Mode...");

    for (const site of sites) {
        try {
            console.log(`📡 Scanning: ${site.name}`);
            const res = await axios.get('https://api.zenrows.com/v1/', {
                params: { 
                    'url': site.url, 
                    'apikey': API_KEY, 
                    'premium_proxy': 'true',
                    'js_render': 'true' 
                }
            });

            const $ = cheerio.load(res.data);
            let animeLinks = [];

            $(site.selector).each((i, el) => {
                const title = $(el).text().trim();
                const link = $(el).attr('href');
                
                // Filtering: Sirf real anime titles uthao
                const junkWords = /watch|download|now|series|episode|okamura|hirata|ai|cast|voice|policy|dmca|contact/i;
                if (link && link.includes('http') && title.length > 5 && !junkWords.test(title)) {
                    if (!animeLinks.find(a => a.link === link)) {
                        animeLinks.push({ title, link });
                    }
                }
            });

            console.log(`✅ Found ${animeLinks.length} Anime Titles on HindiSubAnime`);

            for (const item of animeLinks) {
                // Resume Logic: Skip if already in DB
                let series = await Series.findOne({ title: { $regex: new RegExp(`^${item.title}$`, 'i') } });
                if (series) {
                    const count = await Episode.countDocuments({ seriesId: series._id, language: site.lang });
                    if (count > 0) {
                        console.log(`⏩ Skipping: ${item.title} (Already Synced)`);
                        continue;
                    }
                }

                console.log(`🎬 Extracting Episodes: ${item.title}`);
                await extractAndUpload(item.link, item.title, site.name, API_KEY, 0, site.lang);
                
                // API Health Gap
                await new Promise(r => setTimeout(r, 2500));
            }
        } catch (err) {
            console.error(`❌ HindiSubAnime Error:`, err.message);
        }
    }
}

module.exports = { crawlAllSites };
