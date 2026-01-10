const axios = require('axios');
const cheerio = require('cheerio');
const { extractAndUpload } = require('../extractors/seriesExtractor');
const mongoose = require('mongoose');

async function crawlAllSites() {
    const Series = mongoose.model('Series');
    const sites = [
        { name: 'DesiDub', url: 'https://www.desidubanime.me/', apiKey: '700c782d212580adba1fd15d82df6257ecb8701c', selector: 'article a' },
        { name: 'HindiSubAnime', url: 'http://HindiSubAnime.co', apiKey: '700c782d212580adba1fd15d82df6257ecb8701c', selector: '.post-title a, article a' }
    ];

    console.log("🚀 Smart Crawler v2.0 Started...");

    for (const site of sites) {
        try {
            console.log(`📡 Scanning: ${site.name}`);
            const res = await axios.get('https://api.zenrows.com/v1/', {
                params: { 'url': site.url, 'apikey': site.apiKey.trim(), 'js_render': 'false' }
            });

            const $ = cheerio.load(res.data);
            const links = [];

            $(site.selector).each((i, el) => {
                const link = $(el).attr('href');
                const title = $(el).text().trim();
                // Filter tags, categories, and short names (actors)
                if (link && link.includes('http') && title.split(' ').length > 1 && !link.includes('/tag/') && !link.includes('/category/')) {
                    if (!links.find(a => a.link === link)) links.push({ title, link });
                }
            });

            console.log(`📦 Found ${links.length} potential links on ${site.name}`);

            for (const item of links) {
                if (await Series.findOne({ title: item.title })) continue;

                // MAL Strict Check: Actor names usually don't have high 'members' count or 'TV' type in top result
                try {
                    const mal = await axios.get(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(item.title)}&limit=1`);
                    const result = mal.data.data[0];
                    
                    if (!result || result.score < 1 || result.members < 100) {
                        console.log(`⏩ Skipping junk/actor: ${item.title}`);
                        continue;
                    }
                } catch (e) { console.log("MAL Limit - Continuing anyway"); }

                console.log(`🔥 Starting Extraction: ${item.title}`);
                await extractAndUpload(item.link, item.title, site.name, site.apiKey);
                await new Promise(r => setTimeout(r, 3000));
            }
        } catch (err) { console.log(`❌ Error: ${err.message}`); }
    }
}
module.exports = { crawlAllSites };
