const axios = require('axios');
const cheerio = require('cheerio');
const { extractAndUpload } = require('../extractors/seriesExtractor');
const mongoose = require('mongoose');

async function crawlAllSites() {
    const Series = mongoose.model('Series');
    const sites = [
        { name: 'DesiDub', url: 'https://www.desidubanime.me/', apiKey: '700c782d212580adba1fd15d82df6257ecb8701c', selector: 'article a' },
        { name: 'HindiSubAnime', url: 'http://HindiSubAnime.co', apiKey: '700c782d212580adba1fd15d82df6257ecb8701c', selector: '.post-title a, article a' },
        { name: 'Lords Anime', url: 'https://www.lordsanime.in/all-anime-list/', apiKey: '700c782d212580adba1fd15d82df6257ecb8701c', selector: '.post-title a' },
        { name: 'YBX Anime', url: 'https://ybxanime.com/', apiKey: '700c782d212580adba1fd15d82df6257ecb8701c', selector: 'a' }
    ];

    console.log("🚀 Smart Mega Crawl Started (MAL Filter Active)...");

    for (const site of sites) {
        try {
            console.log(`📡 Scanning: ${site.name}`);
            const res = await axios.get('https://api.zenrows.com/v1/', {
                params: { 'url': site.url, 'apikey': site.apiKey.trim(), 'js_render': 'false', 'premium_proxy': 'false' }
            });

            const $ = cheerio.load(res.data);
            const links = [];

            $(site.selector).each((i, el) => {
                const link = $(el).attr('href');
                const title = $(el).text().trim();
                
                // Sirf unhi links ko lo jinme 'anime', 'series' ya post type keywords ho
                // Actors aur Genres ko skip karne ke liye:
                if (link && link.includes('http') && title.length > 5 && !link.includes('/tag/') && !link.includes('/category/')) {
                    if (!links.find(a => a.link === link)) links.push({ title, link });
                }
            });

            for (const item of links) {
                // Check if already in DB
                const exists = await Series.findOne({ title: item.title });
                if (exists) continue;

                // --- MAL VALIDATION ---
                try {
                    const malCheck = await axios.get(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(item.title)}&limit=1`);
                    if (!malCheck.data.data || malCheck.data.data.length === 0) {
                        console.log(`⏩ Skipping (Not an Anime): ${item.title}`);
                        continue; 
                    }
                    // Agar MAL score/data mil gaya, tabhi aage badho
                    console.log(`🎯 Verified Anime: ${item.title}`);
                } catch (e) {
                    console.log(`⚠️ MAL skip for ${item.title} (Rate limit/Network)`);
                }

                await extractAndUpload(item.link, item.title, site.name, site.apiKey);
                await new Promise(r => setTimeout(r, 4000)); // Rate limit safety
            }
        } catch (err) { console.log(`❌ Error on ${site.name}: ${err.message}`); }
    }
}
module.exports = { crawlAllSites };
