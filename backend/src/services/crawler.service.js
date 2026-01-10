const axios = require('axios');
const cheerio = require('cheerio');
const { extractAndUpload } = require('../extractors/seriesExtractor');
const mongoose = require('mongoose');

async function crawlAllSites() {
    const Series = mongoose.model('Series');
    
    // Yahan apni sahi keys dhyan se check karke daalna
    const sites = [
        { 
            name: 'DesiDub', 
            url: 'https://www.desidubanime.me/', 
            apiKey: '700c782d212580adba1fd15d82df6257ecb8701c', // Key 1
            selector: 'article a' 
        },
        { 
            name: 'HindiSubAnime', 
            url: 'http://HindiSubAnime.co', 
            apiKey: '201c680bb6922b8860eeb532fa93efe21c195146', // Key 2 (Agar same hai toh wahi rehne de)
            selector: '.post-title a, article a' 
        },
        { 
            name: 'Lords Anime', 
            url: 'https://www.lordsanime.in/all-anime-list/', 
            apiKey: '700c782d212580adba1fd15d82df6257ecb8701c', // Key 3
            selector: '.post-title a' 
        },
        { 
            name: 'YBX Anime', 
            url: 'https://ybxanime.com/', 
            apiKey: '700c782d212580adba1fd15d82df6257ecb8701c', // Key 4
            selector: 'a' 
        }
    ];

    console.log("🚀 Starting Mega Crawl with Fixed Headers...");

    for (const site of sites) {
        // Agar key placeholder hai toh skip karo
        if (site.apiKey.includes('YAHAN_')) {
            console.log(`⚠️ Skipping ${site.name}: API Key not set.`);
            continue;
        }

        try {
            console.log(`📡 Scanning: ${site.name}`);
            
            // ZenRows Fixed Request
            const res = await axios({
                method: 'get',
                url: 'https://api.zenrows.com/v1/',
                params: {
                    'url': site.url,
                    'apikey': site.apiKey.trim(), // Trim kiya taaki extra space na rahe
                    'premium_proxy': 'true',
                    'js_render': 'false' // 400 error se bachne ke liye js_render false rakha hai
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

                await extractAndUpload(item.link, item.title, site.name, site.apiKey);
                await new Promise(r => setTimeout(r, 3000));
            }
        } catch (err) {
            // Logs mein details dikhayega ki kyu fail hua
            const errorMsg = err.response ? `Status ${err.response.status}: ${JSON.stringify(err.response.data)}` : err.message;
            console.log(`❌ Error on ${site.name}: ${errorMsg}`);
        }
    }
}

module.exports = { crawlAllSites };
