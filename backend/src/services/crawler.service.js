const axios = require('axios');
const cheerio = require('cheerio');
const { extractAndUpload } = require('../extractors/seriesExtractor');
const mongoose = require('mongoose');

async function crawlAllSites() {
    const Series = mongoose.model('Series');
    
    // Yahan apni alag-alag accounts ki keys daal de
    const sites = [
        { 
            name: 'DesiDub', 
            url: 'https://www.desidubanime.me/', 
            apiKey: '700c782d212580adba1fd15d82df6257ecb8701c', // Account 1
            selector: 'article a' 
        },
        { 
            name: 'HindiSubAnime', 
            url: 'http://HindiSubAnime.co', 
            apiKey: '201c680bb6922b8860eeb532fa93efe21c195146', // Account 2
            selector: '.post-title a, article a' 
        },
        { 
            name: 'Lords Anime', 
            url: 'https://www.lordsanime.in/all-anime-list/', 
            apiKey: '700c782d212580adba1fd15d82df6257ecb8701c', // Account 3
            selector: '.post-title a' 
        },
        { 
            name: 'YBX Anime', 
            url: 'https://ybxanime.com/', 
            apiKey: '700c782d212580adba1fd15d82df6257ecb8701c', // Account 4
            selector: 'a' 
        }
    ];

    console.log("🚀 Multi-Key Mega Crawl Started...");

    for (const site of sites) {
        try {
            console.log(`📡 Scanning: ${site.name} using Key: ${site.apiKey.substring(0,5)}...`);
            
            const res = await axios.get('https://api.zenrows.com/v1/', {
                params: { 
                    'url': site.url, 
                    'apikey': site.apiKey, // Har site ki apni alag key use ho rahi hai
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
                    if (!links.find(a => a.link === link)) links.push({ title, link });
                }
            });

            for (const item of links) {
                const exists = await Series.findOne({ 
                    title: { $regex: new RegExp(`^${item.title.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') } 
                });

                if (exists) {
                    console.log(`⏩ Skipping: ${item.title}`);
                    continue;
                }

                // Extractor ko bhi wahi key bhej rahe hain jo is site ki hai
                await extractAndUpload(item.link, item.title, site.name, site.apiKey);
                await new Promise(r => setTimeout(r, 5000));
            }
        } catch (err) {
            console.log(`❌ Error on ${site.name}: ${err.message}`);
        }
    }
}

module.exports = { crawlAllSites };
