const axios = require('axios');
const cheerio = require('cheerio');
const { extractAndUpload } = require('../extractors/seriesExtractor');
const mongoose = require('mongoose');

async function crawlAllSites() {
    const Series = mongoose.model('Series');
    
    const sites = [
        { 
            name: 'DesiDub', 
            url: 'https://www.desidubanime.me/', 
            apiKey: '700c782d212580adba1fd15d82df6257ecb8701c', 
            selector: 'article a' 
        },
        { 
            name: 'HindiSubAnime', 
            url: 'http://HindiSubAnime.co', 
            apiKey: '700c782d212580adba1fd15d82df6257ecb8701c', 
            selector: '.post-title a, article a' 
        },
        { 
            name: 'Lords Anime', 
            url: 'https://www.lordsanime.in/all-anime-list/', 
            apiKey: '700c782d212580adba1fd15d82df6257ecb8701c', 
            selector: '.post-title a' 
        },
        { 
            name: 'YBX Anime', 
            url: 'https://ybxanime.com/', 
            apiKey: '700c782d212580adba1fd15d82df6257ecb8701c', 
            selector: 'a' 
        }
    ];

    console.log("🚀 Mega Crawl Started...");

    for (const site of sites) {
        try {
            console.log(`📡 Scanning: ${site.name}`);
            
            const res = await axios({
                method: 'get',
                url: 'https://api.zenrows.com/v1/',
                params: {
                    'url': site.url,
                    'apikey': site.apiKey.trim(),
                    'js_render': 'false',
                    'premium_proxy': 'false' 
                }
            });

            const $ = cheerio.load(res.data);
            const links = [];

            $(site.selector).each((i, el) => {
                const link = $(el).attr('href');
                const title = $(el).text().trim();
                if (link && link.includes('http') && title.length > 5) {
                    if (!links.find(a => a.link === link)) links.push({ title, link });
                }
            });

            console.log(`📦 Found ${links.length} titles on ${site.name}`);

            for (const item of links) {
                const exists = await Series.findOne({ 
                    title: { $regex: new RegExp(`^${item.title.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') } 
                });

                if (exists) continue;

                console.log(`🔍 Extracting: ${item.title}`);
                await extractAndUpload(item.link, item.title, site.name, site.apiKey);
                // 3 sec gap to prevent 429 errors
                await new Promise(r => setTimeout(r, 3000));
            }
        } catch (err) {
            console.log(`❌ Error on ${site.name}: ${err.message}`);
        }
    }
}

module.exports = { crawlAllSites };
