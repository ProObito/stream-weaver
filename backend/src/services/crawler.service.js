const axios = require('axios');
const cheerio = require('cheerio');
const { extractAndUpload } = require('../extractors/seriesExtractor');
const mongoose = require('mongoose');

async function crawlAllSites() {
    // Model yahan load kar rahe hain taaki "Schema not found" error na aaye
    const Series = mongoose.model('Series');
    
    const sites = [
        { name: 'DesiDub', url: 'https://www.desidubanime.me/', selector: 'article a' },
        { name: 'HindiSubAnime', url: 'http://HindiSubAnime.co', selector: '.post-title a, article a' },
        { name: 'Lords Anime', url: 'https://www.lordsanime.in/all-anime-list/', selector: '.post-title a' },
        { name: 'YBX Anime', url: 'https://ybxanime.com/', selector: 'a' }
    ];

    console.log("🚀 Starting Mega Crawl...");

    for (const site of sites) {
        try {
            console.log(`📡 Scanning Site: ${site.name}`);
            
            const res = await axios.get('https://api.zenrows.com/v1/', {
                params: { 
                    'url': site.url, 
                    'apikey': process.env.ZENROWS_API_KEY, 
                    'premium_proxy': 'true',
                    'mode': 'auto' 
                }
            });

            const $ = cheerio.load(res.data);
            const links = [];

            $(site.selector).each((i, el) => {
                const link = $(el).attr('href');
                const title = $(el).text().trim();
                
                // Sirf valid links uthao jo 5 characters se bade hon
                if (link && link.includes('http') && title.length > 5) {
                    if (!links.find(a => a.link === link)) {
                        links.push({ title, link });
                    }
                }
            });

            console.log(`📦 Found ${links.length} potential series on ${site.name}`);

            for (const item of links) {
                // 🔥 STRICT DUPLICATE CHECK: Title match (Case Insensitive)
                // Agar "Naruto" DB mein hai, toh "naruto" ko bhi skip karega
                const exists = await Series.findOne({ 
                    title: { $regex: new RegExp(`^${item.title.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') } 
                });

                if (exists) {
                    console.log(`⏩ [SKIP] ${item.title} - Already exists in your library.`);
                    continue;
                }

                console.log(`🔥 [NEW] Extracting from ${site.name}: ${item.title}`);
                await extractAndUpload(item.link, item.title, site.name);
                
                // 5 seconds delay taaki APIs block na karein
                await new Promise(r => setTimeout(r, 5000));
            }
        } catch (err) {
            console.log(`❌ Error scanning ${site.name}: ${err.message}`);
        }
    }
    console.log("🏁 All sites finished. Database is clean!");
}

module.exports = { crawlAllSites };
