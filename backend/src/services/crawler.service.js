const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');
const { extractAndUpload } = require('../extractors/seriesExtractor');

/**
 * Main Crawler Function
 * Priority: DesiDub (Multi) > HindiSubbed (Hindi Sub) > Lords/YBX (Gap Fill)
 */
async function crawlAllSites() {
    // Models ko function ke andar fetch kar rahe hain taaki initialization error na ho
    const Series = mongoose.model('Series');
    const Episode = mongoose.model('Episode');
    
    const sites = [
        { name: 'DesiDub', url: 'https://www.desidubanime.me/', selector: 'article a', lang: 'Multi', forceAll: true },
        { name: 'HindiSubbed', url: 'http://HindiSubAnime.co', selector: '.post-title a', lang: 'Hindi Sub', forceAll: true },
        { name: 'LordsAnime', url: 'https://www.lordsanime.in/all-anime-list/', selector: '.entry-title a', lang: 'Hindi Sub', forceAll: false },
        { name: 'YBXAnime', url: 'https://ybxanime.com/', selector: 'a[href*="/anime/"]', lang: 'Hindi Sub', forceAll: false }
    ];

    console.log("🚀 Starting Global Sync (Sequential Mode)...");

    for (const site of sites) {
        try {
            console.log(`📡 Current Site: ${site.name}`);
            
            // ZenRows API to get the list of anime
            const res = await axios.get('https://api.zenrows.com/v1/', {
                params: { 
                    'url': site.url, 
                    'apikey': '700c782d212580adba1fd15d82df6257ecb8701c', 
                    'premium_proxy': 'true' 
                }
            });

            const $ = cheerio.load(res.data);
            let animeLinks = [];

            $(site.selector).each((i, el) => {
                const title = $(el).text().trim();
                const link = $(el).attr('href');
                if (link && link.includes('http') && title.length > 5) {
                    // Duplicate links filter within the same site list
                    if (!animeLinks.find(a => a.link === link)) {
                        animeLinks.push({ title, link });
                    }
                }
            });

            console.log(`✅ Found ${animeLinks.length} titles on ${site.name}`);

            // One-by-one Series Loop
            for (const item of animeLinks) {
                // Find or create the Series entry
                let series = await Series.findOne({ title: { $regex: new RegExp(`^${item.title}$`, 'i') } });
                
                let skipCount = 0;
                // Lords aur YBX ke liye check karo kitne episodes hamare paas aa chuke hain
                if (!site.forceAll && series) {
                    skipCount = await Episode.countDocuments({ seriesId: series._id });
                }

                console.log(`🎬 Processing: ${item.title} (Skip: ${skipCount})`);
                
                // One-by-one Episode extraction and upload
                await extractAndUpload(
                    item.link, 
                    item.title, 
                    site.name, 
                    '700c782d212580adba1fd15d82df6257ecb8701c', 
                    skipCount, 
                    site.lang
                );
                
                // 3 second break between different animes
                await new Promise(r => setTimeout(r, 3000));
            }

            console.log(`🏁 Completed Site: ${site.name}`);

        } catch (err) {
            console.error(`❌ Error scanning site ${site.name}:`, err.message);
        }
    }
}

// YEH LINE SABSE IMPORTANT HAI
module.exports = { crawlAllSites };
