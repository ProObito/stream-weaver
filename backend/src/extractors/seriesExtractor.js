const axios = require('axios');
const { extractAndUpload } = require('../extractors/seriesExtractor');
const mongoose = require('mongoose');

async function crawlAllSites() {
    const Series = mongoose.model('Series');
    const Episode = mongoose.model('Episode');
    
    const sites = [
        { name: 'DesiDub', url: 'https://www.desidubanime.me/', selector: 'article a', lang: 'Multi', forceAll: true },
        { name: 'HindiSubAnime', url: 'http://HindiSubAnime.co', selector: '.post-title a', lang: 'Hindi Sub', forceAll: true },
        { name: 'Lords Anime', url: 'https://www.lordsanime.in/all-anime-list/', selector: '.entry-title a', lang: 'Hindi Sub', forceAll: false },
        { name: 'YBX Anime', url: 'https://ybxanime.com/', selector: 'a[href*="/anime/"]', lang: 'Hindi Sub', forceAll: false }
    ];

    console.log("🚀 Custom Sequence Crawl Started...");

    for (const site of sites) {
        try {
            console.log(`📡 Targeting: ${site.name}`);
            const res = await axios.get('https://api.zenrows.com/v1/', {
                params: { 'url': site.url, 'apikey': '700c782d212580adba1fd15d82df6257ecb8701c', 'premium_proxy': 'true' }
            });

            const $ = require('cheerio').load(res.data);
            let links = [];

            $(site.selector).each((i, el) => {
                const title = $(el).text().trim();
                const link = $(el).attr('href');
                if (link && title.length > 5) links.push({ title, link });
            });

            for (const item of links) {
                let series = await Series.findOne({ title: { $regex: new RegExp(`^${item.title}$`, 'i') } });
                
                let skipCount = 0;
                if (!site.forceAll && series) {
                    // Lords aur YBX ke liye check karo kitne episodes already hain
                    skipCount = await Episode.countDocuments({ seriesId: series._id });
                }

                console.log(`🔍 [${site.name}] Processing: ${item.title} | Mode: ${site.forceAll ? 'Grab All' : 'Fill Gaps'}`);
                await extractAndUpload(item.link, item.title, site.name, '700c782d212580adba1fd15d82df6257ecb8701c', skipCount, site.lang);
                
                await new Promise(r => setTimeout(r, 2000));
            }
        } catch (err) { console.log(`❌ Error scanning ${site.name}`); }
    }
}

module.exports = { crawlAllSites };
