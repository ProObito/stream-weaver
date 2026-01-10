const axios = require('axios');
const cheerio = require('cheerio');
const { extractAndUpload } = require('../extractors/seriesExtractor');
const mongoose = require('mongoose');

async function crawlAllSites() {
    const Series = mongoose.model('Series');
    
    const sites = [
        { name: 'DesiDub', url: 'https://www.desidubanime.me/', skipCheck: true, selector: 'article a' },
        { name: 'HindiSubAnime', url: 'http://HindiSubAnime.co', skipCheck: false, selector: '.post-title a, article a' },
        { name: 'Lords Anime', url: 'https://www.lordsanime.in/all-anime-list/', skipCheck: false, selector: '.post-title a' },
        { name: 'YBX Anime', url: 'https://ybxanime.com/', skipCheck: false, selector: 'a' }
    ];

    console.log("🚀 Starting Mega Crawl (4 Sites - TPX Main Removed)...");

    for (const site of sites) {
        try {
            console.log(`📡 Scanning: ${site.name}`);
            
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
                
                if (link && link.includes('http') && title.length > 5) {
                    if (!links.find(a => a.link === link)) {
                        links.push({ title, link });
                    }
                }
            });

            console.log(`📦 Found ${links.length} potential series on ${site.name}`);

            for (const item of links) {
                // DesiDub ke alawa baaki sab par duplicate check chalega
                if (!site.skipCheck) {
                    const exists = await Series.findOne({ title: new RegExp(`^${item.title}$`, 'i') });
                    if (exists) {
                        console.log(`⏩ Skipping: ${item.title} (Already in DB)`);
                        continue;
                    }
                }

                console.log(`🔥 Extracting [${site.name}]: ${item.title}`);
                await extractAndUpload(item.link, item.title, site.name);
                
                // 5 sec rest to avoid getting blocked
                await new Promise(r => setTimeout(r, 5000));
            }
        } catch (err) {
            console.log(`❌ Error on ${site.name}: ${err.message}`);
        }
    }
    console.log("🏁 All 4 sites processed successfully!");
}

module.exports = { crawlAllSites };
