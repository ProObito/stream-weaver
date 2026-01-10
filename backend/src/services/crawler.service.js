const axios = require('axios');
const { extractAndUpload } = require('../extractors/seriesExtractor');
const mongoose = require('mongoose');

async function crawlAllSites() {
    const Series = mongoose.model('Series');
    const Episode = mongoose.model('Episode');
    
    // Exact Sequence as per your requirement
    const sites = [
        { name: 'DesiDub', url: 'https://www.desidubanime.me/', selector: 'article a, .post-title a', lang: 'Multi', forceAll: true },
        { name: 'HindiSubbed', url: 'http://HindiSubAnime.co', selector: '.post-title a, article a', lang: 'Hindi Sub', forceAll: true },
        { name: 'LordsAnime', url: 'https://www.lordsanime.in/all-anime-list/', selector: '.entry-title a, .post-title a', lang: 'Hindi Sub', forceAll: false },
        { name: 'YBXAnime', url: 'https://ybxanime.com/', selector: 'a[href*="/anime/"]', lang: 'Hindi Sub', forceAll: false }
    ];

    console.log("🚀 Sequential Scraping Started...");

    for (const site of sites) {
        try {
            console.log(`📡 Scanning Site [${site.name}]...`);
            
            // Step 1: Get all Anime Links from the current site
            const res = await axios.get('https://api.zenrows.com/v1/', {
                params: { 
                    'url': site.url, 
                    'apikey': '700c782d212580adba1fd15d82df6257ecb8701c',
                    'premium_proxy': 'true' // Anti-bot bypass
                }
            });

            const $ = require('cheerio').load(res.data);
            let animeLinks = [];

            $(site.selector).each((i, el) => {
                const title = $(el).text().trim();
                const link = $(el).attr('href');
                if (link && link.includes('http') && title.length > 5) {
                    if (!animeLinks.find(a => a.link === link)) animeLinks.push({ title, link });
                }
            });

            console.log(`✅ Found ${animeLinks.length} titles on ${site.name}`);

            // Step 2: Process each anime link one by one
            for (const item of animeLinks) {
                let series = await Series.findOne({ title: { $regex: new RegExp(`^${item.title}$`, 'i') } });
                
                let skipCount = 0;
                // Lords/YBX ke liye check karo kitne ep pehle se hain
                if (!site.forceAll && series) {
                    skipCount = await Episode.countDocuments({ seriesId: series._id });
                }

                console.log(`🔥 Extracting: ${item.title} from ${site.name} (Skip: ${skipCount})`);
                
                // Yahan asali extraction hogi
                await extractAndUpload(item.link, item.title, site.name, '700c782d212580adba1fd15d82df6257ecb8701c', skipCount, site.lang);
                
                // Thoda gap taaki site block na kare
                await new Promise(r => setTimeout(r, 4000));
            }

            console.log(`🏁 Finished Site: ${site.name}. Moving to next...`);

        } catch (err) {
            console.log(`❌ Site ${site.name} Failed: ${err.message}`);
        }
    }
}

module.exports = { crawlAllSites };
