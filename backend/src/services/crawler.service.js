const axios = require('axios');
const mongoose = require('mongoose');
const { extractAndUpload } = require('../extractors/seriesExtractor');

async function crawlAllSites() {
    const Series = mongoose.model('Series');
    const Episode = mongoose.model('Episode');
    const API_KEY = '201c680bb6922b8860eeb532fa93efe21c195146';
    
    const sites = [
        { name: 'DesiDub', url: 'https://www.desidubanime.me', lang: 'Multi', forceAll: true, proxy: true },
        { name: 'HindiSubAnime', url: 'http://HindiSubAnime.co', lang: 'Hindi Sub', forceAll: true, proxy: false },
        { name: 'LordsAnime', url: 'https://www.lordsanime.in/all-anime-list/', lang: 'Hindi Sub', forceAll: false, proxy: true },
        { name: 'YBXAnime', url: 'https://ybxanime.com/', lang: 'Hindi Sub', forceAll: false, proxy: true }
    ];

    console.log("🚀 Power Sync: Resume Mode Active...");

    for (const site of sites) {
        try {
            console.log(`📡 Checking Site: ${site.name}`);
            
            const params = { 'url': site.url, 'apikey': API_KEY, 'autoparse': 'true' };
            if (site.proxy) params.premium_proxy = 'true';

            const res = await axios.get('https://api.zenrows.com/v1/', { params });

            let animeLinks = [];
            if (res.data && res.data.links) {
                res.data.links.forEach(l => {
                    if (l.text && l.href && l.href.includes('http') && l.text.length > 5) {
                        const isJunk = /category|tag|contact|about|disclaimer|dmca/.test(l.href.toLowerCase());
                        if (!isJunk) animeLinks.push({ title: l.text, link: l.href });
                    }
                });
            }

            for (const item of animeLinks) {
                // 🔍 RESUME CHECK: Kya is site ka ye anime pehle hi poora extract ho chuka hai?
                let series = await Series.findOne({ title: { $regex: new RegExp(`^${item.title}$`, 'i') } });
                
                if (series) {
                    // Check karo ki kya is language ke episodes pehle se hain
                    const existingEpisodes = await Episode.countDocuments({ 
                        seriesId: series._id, 
                        language: site.lang 
                    });

                    // Agar existing episodes milte hain aur site archive mode mein nahi hai, toh skip karo
                    // Ya agar skipCount handle karna hai toh extractAndUpload ko bhej do
                    if (existingEpisodes > 0 && !site.forceAll) {
                        console.log(`⏩ Skipping: ${item.title} (Already Syncing/Synced)`);
                        continue; 
                    }
                    
                    // Agar archive site hai (DesiDub/HindiSubAnime), toh extractAndUpload andar check karega
                    // ki kaunsa episode bacha hai.
                    console.log(`🔄 Resuming/Checking: ${item.title}`);
                } else {
                    console.log(`🎬 New Entry: ${item.title}`);
                }

                await extractAndUpload(item.link, item.title, site.name, API_KEY, 0, site.lang);
                
                // Rate limiting
                await new Promise(r => setTimeout(r, 2000));
            }
        } catch (err) {
            console.error(`❌ ${site.name} Stop: API Limit or Error.`);
            break; // Agar key fail hui, toh loop yahi rok do taaki agle site ka try na kare
        }
    }
}

module.exports = { crawlAllSites };
