const axios = require('axios');
const { extractAndUpload } = require('../extractors/seriesExtractor');
const mongoose = require('mongoose');
const cron = require('node-cron');

async function crawlAllSites() {
    const Series = mongoose.model('Series');
    const Episode = mongoose.model('Episode');
    
    // Priority wise sites: 1. HindiSub, 2. Lords, 3. YBX
    const sites = [
        { name: 'HindiSubAnime', url: 'http://HindiSubAnime.co', apiKey: '700c782d212580adba1fd15d82df6257ecb8701c', selector: '.post-title a' },
        { name: 'Lords Anime', url: 'https://www.lordsanime.in/all-anime-list/', apiKey: '700c782d212580adba1fd15d82df6257ecb8701c', selector: '.post-title a' },
        { name: 'YBX Anime', url: 'https://ybxanime.com/', apiKey: '700c782d212580adba1fd15d82df6257ecb8701c', selector: 'a[href*="/anime/"]' }
    ];

    console.log("🚀 Starting Smart Priority Crawl...");

    for (const site of sites) {
        try {
            const res = await axios.get('https://api.zenrows.com/v1/', {
                params: { 'url': site.url, 'apikey': site.apiKey, 'js_render': 'true' }
            });
            const $ = require('cheerio').load(res.data);
            const links = [];

            $(site.selector).each((i, el) => {
                const title = $(el).text().trim();
                const link = $(el).attr('href');
                if (link && title.length > 5) links.push({ title, link });
            });

            for (const item of links) {
                // 1. Check if Series exists
                let series = await Series.findOne({ title: item.title });
                let existingEpCount = 0;
                
                if (series) {
                    existingEpCount = await Episode.countDocuments({ seriesId: series._id });
                }

                console.log(`🧐 Checking ${item.title} on ${site.name}. Current EPs: ${existingEpCount}`);

                // 2. Extract episodes from current site
                // extractAndUpload ab sirf wahi episodes save karega jo existingEpCount se zyada honge
                await extractAndUpload(item.link, item.title, site.name, site.apiKey, existingEpCount);
            }
        } catch (err) { console.log(`❌ Error scanning ${site.name}`); }
    }
}

// --- CRON JOB: Raat 12 Baje Auto Run ---
cron.schedule('0 0 * * *', () => {
    console.log("🌙 Midnight Strike! Auto-extracting new episodes...");
    crawlAllSites();
}, { timezone: "Asia/Kolkata" });

module.exports = { crawlAllSites };
