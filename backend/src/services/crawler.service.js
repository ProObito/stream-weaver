const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');
const { extractAndUpload } = require('../extractors/seriesExtractor');

async function crawlAllSites() {
    const Series = mongoose.model('Series');
    const Episode = mongoose.model('Episode');
    const API_KEY = 'c3a27fd2ab87b6c7da47577e5c4a61c94d4f6ba8';
    
    const sites = [
        { 
            name: 'HindiSubAnime', 
            url: 'http://hindisubanime.co/anime-list/', 
            selector: '.entry-title a, .post-title a', 
            lang: 'Hindi Sub',
            active: true // ✅ Sirf ye chalega
        },
        { 
            name: 'DesiDub', 
            url: 'https://www.desidubanime.me', 
            selector: '.entry-title a', 
            lang: 'Multi',
            active: false // ❌ Skip ho jayega, error nahi aayega
        },
        { 
            name: 'LordsAnime', 
            url: 'https://www.lordsanime.in/all-anime-list/', 
            selector: '.entry-title a', 
            lang: 'Hindi Sub',
            active: false 
        },
        { 
            name: 'YBXAnime', 
            url: 'https://ybxanime.com/anime-list/', 
            selector: '.entry-title a', 
            lang: 'Hindi Sub',
            active: false 
        }
    ];

    console.log("🚀 Focused Sync: HindiSubAnime (Highest Quality Only)");

    for (const site of sites) {
        // Agar site active nahi hai toh agle pe jao
        if (!site.active) {
            console.log(`⏸️ Site ${site.name} is disabled. Skipping...`);
            continue; 
        }

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
                
                const junkWords = /watch|download|now|series|episode|okamura|hirata|ai|cast|voice|policy|dmca|contact/i;
                if (link && link.includes('http') && title.length > 5 && !junkWords.test(title)) {
                    if (!animeLinks.find(a => a.link === link)) {
                        animeLinks.push({ title, link });
                    }
                }
            });

            console.log(`✅ ${site.name}: Found ${animeLinks.length} Titles`);

            for (const item of animeLinks) {
                let series = await Series.findOne({ title: { $regex: new RegExp(`^${item.title}$`, 'i') } });
                if (series) {
                    const count = await Episode.countDocuments({ seriesId: series._id, language: site.lang });
                    if (count > 0) continue;
                }

                await extractAndUpload(item.link, item.title, site.name, API_KEY, 0, site.lang);
                await new Promise(r => setTimeout(r, 2000));
            }
        } catch (err) {
            console.error(`❌ Error scanning ${site.name}: API Key missing or limit reached.`);
        }
    }
}

module.exports = { crawlAllSites };
