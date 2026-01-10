const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');
const { extractAndUpload } = require('../extractors/seriesExtractor');

async function crawlAllSites() {
    const Series = mongoose.model('Series');
    const Episode = mongoose.model('Episode');
    
    // Priority List: Pehle DesiDub (Multi), Phir HindiSubbed (Sub), Phir Lords/YBX (Missing)
    const sites = [
        { 
            name: 'DesiDub', 
            url: 'https://www.desidubanime.me/', 
            selector: '.post-title a, article a, h2 a', 
            lang: 'Multi', 
            forceAll: true 
        },
        { 
            name: 'HindiSubbed', 
            url: 'https://hindisubbed.co/', 
            selector: '.entry-title a, .post-title a, article a', 
            lang: 'Hindi Sub', 
            forceAll: true 
        },
        { 
            name: 'LordsAnime', 
            url: 'https://www.lordsanime.in/all-anime-list/', 
            selector: '.entry-title a, li a', 
            lang: 'Hindi Sub', 
            forceAll: false 
        },
        { 
            name: 'YBXAnime', 
            url: 'https://ybxanime.com/anime-list/', 
            selector: 'a[href*="/anime/"]', 
            lang: 'Hindi Sub', 
            forceAll: false 
        }
    ];

    console.log("🚀 Power Sync Started: Searching for Old & New Content...");

    for (const site of sites) {
        try {
            console.log(`📡 Scanning Site: ${site.name}`);
            
            // ZenRows with JS Render taaki dynamic titles load ho jayein
            const res = await axios.get('https://api.zenrows.com/v1/', {
                params: { 
                    'url': site.url, 
                    'apikey': '700c782d212580adba1fd15d82df6257ecb8701c', 
                    'premium_proxy': 'true',
                    'js_render': 'true',
                    'wait_for': 'a' 
                }
            });

            const $ = cheerio.load(res.data);
            let animeLinks = [];

            $(site.selector).each((i, el) => {
                const title = $(el).text().trim();
                const link = $(el).attr('href');
                
                if (link && link.includes('http') && title.length > 5) {
                    // In links ko skip karna hai (Tags, Pages, Categories)
                    const isJunk = /category|tag|contact|about|disclaimer|dmca/.test(link.toLowerCase());
                    if (!isJunk && !animeLinks.find(a => a.link === link)) {
                        animeLinks.push({ title, link });
                    }
                }
            });

            console.log(`✅ ${site.name}: Found ${animeLinks.length} Anime Titles`);

            // --- ONE-BY-ONE SERIES PROCESSING ---
            for (const item of animeLinks) {
                // Same Anime Name = Same Series in DB
                let series = await Series.findOne({ title: { $regex: new RegExp(`^${item.title}$`, 'i') } });
                
                let skipCount = 0;
                // Agar DesiDub aur HindiSubbed nahi hai, toh count check karo bache hue episodes ke liye
                if (!site.forceAll && series) {
                    skipCount = await Episode.countDocuments({ seriesId: series._id });
                }

                console.log(`🎬 Extracting: ${item.title} from ${site.name}`);
                
                // One-by-one Episode Upload (wait for each episode to finish)
                await extractAndUpload(
                    item.link, 
                    item.title, 
                    site.name, 
                    '700c782d212580adba1fd15d82df6257ecb8701c', 
                    skipCount, 
                    site.lang
                );
                
                // Gap between Series to avoid IP Ban
                await new Promise(r => setTimeout(r, 3000));
            }

            console.log(`🏁 Finished scanning ${site.name}. Moving to next site...`);

        } catch (err) {
            console.error(`❌ Error on site ${site.name}:`, err.message);
        }
    }
    console.log("🏆 Full Sync Cycle Complete!");
}

module.exports = { crawlAllSites };
