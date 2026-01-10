const axios = require('axios');
const { extractAndUpload } = require('../extractors/seriesExtractor');
const mongoose = require('mongoose');

async function crawlAllSites() {
    const Series = mongoose.model('Series');
    const Episode = mongoose.model('Episode');
    
    const sites = [
        { name: 'DesiDub', url: 'https://www.desidubanime.me/', selector: 'article a', lang: 'Multi', forceAll: true },
        { name: 'HindiSubbed', url: 'http://HindiSubAnime.co', selector: '.post-title a', lang: 'Hindi Sub', forceAll: true },
        { name: 'LordsAnime', url: 'https://www.lordsanime.in/all-anime-list/', selector: '.entry-title a', lang: 'Hindi Sub', forceAll: false },
        { name: 'YBXAnime', url: 'https://ybxanime.com/', selector: 'a[href*="/anime/"]', lang: 'Hindi Sub', forceAll: false }
    ];

    console.log("🚀 Starting Full Archive & Future Sync...");

    for (const site of sites) {
        try {
            console.log(`📡 Scanning: ${site.name}`);
            const res = await axios.get('https://api.zenrows.com/v1/', {
                params: { 'url': site.url, 'apikey': '700c782d212580adba1fd15d82df6257ecb8701c', 'premium_proxy': 'true' }
            });

            const $ = require('cheerio').load(res.data);
            let animeLinks = [];

            $(site.selector).each((i, el) => {
                const title = $(el).text().trim();
                const link = $(el).attr('href');
                if (link && title.length > 5) animeLinks.push({ title, link });
            });

            // One-by-one Processing
            for (const item of animeLinks) {
                let series = await Series.findOne({ title: { $regex: new RegExp(`^${item.title}$`, 'i') } });
                
                let skipCount = 0;
                // Agar forceAll false hai (Lords/YBX), toh check karo is series ke kitne ep DB mein hain
                if (!site.forceAll && series) {
                    skipCount = await Episode.countDocuments({ seriesId: series._id });
                }

                console.log(`📦 Series: ${item.title} | Site: ${site.name}`);
                // Sequential Episode Upload
                await extractAndUpload(item.link, item.title, site.name, '700c782d212580adba1fd15d82df6257ecb8701c', skipCount, site.lang);
                
                // Break to avoid blocking
                await new Promise(r => setTimeout(r, 3000));
            }
        } catch (err) { console.log(`❌ Error on ${site.name}`); }
    }
}
