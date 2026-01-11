const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');
const { processEpisodes } = require('./videoExtractor');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 🔥 SABSE ZAROORI: Ye function asali embed link nikalega
const getFinalEmbedLink = async (episodeId) => {
    try {
        const { data: serverRes } = await axios.get(`https://hianime.to/ajax/v2/episode/servers?episodeId=${episodeId}`, {
            headers: { 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(serverRes.html);
        
        // MegaCloud (HD-1) ko priority do
        const serverId = $('.server-item[data-name="megacloud"]').attr('data-id') || 
                         $('.server-item[data-name="vidstreaming"]').attr('data-id') ||
                         $('.server-item').first().attr('data-id');

        if (!serverId) return null;

        // Yahan se asali embed URL milta hai
        const { data: sourceRes } = await axios.get(`https://hianime.to/ajax/v2/episode/sources?id=${serverId}`);
        
        // Agar link mil gaya toh return karo, warna null
        return sourceRes.link || null; 
    } catch (err) {
        return null;
    }
};

const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    try {
        const Series = mongoose.model('Series');
        const animeId = mainUrl.split('-').pop(); 

        console.log(`📡 Processing: ${animeName}`);

        let series = await Series.findOne({ title: `${animeName} (${languageTag})` });
        if (!series) {
            series = await Series.create({
                title: `${animeName} (${languageTag})`,
                sourceUrl: mainUrl,
                language: languageTag,
                isPublished: false
            });
        }

        const { data: ajaxRes } = await axios.get(`https://hianime.to/ajax/v2/episode/list/${animeId}`, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });

        const $ = cheerio.load(ajaxRes.html);
        const epElements = $('.ep-item');

        console.log(`🔍 Found ${epElements.length} episodes. Resolving links...`);

        for (let i = 0; i < epElements.length; i++) {
            const el = epElements[i];
            const epNum = parseInt($(el).attr('data-number'));
            const epId = $(el).attr('data-id');

            const finalLink = await getFinalEmbedLink(epId);

            if (finalLink) {
                // Ek episode process karo aur Streamtape pe bhejo
                await processEpisodes(series, [{
                    episode: epNum,
                    link: finalLink, // Ab ye https://megacloud.tv/... wala link hai
                    title: $(el).attr('title') || `Episode ${epNum}`,
                    season: 1 
                }]);

                console.log(`✅ [${i+1}/${epElements.length}] Ep ${epNum} Sent. Link: ${finalLink}`);
                
                // Streamtape hourly limit protection
                if (i < epElements.length - 1) {
                    console.log(`⏳ Sleeping for 85 seconds...`);
                    await sleep(85000); 
                }
            }
        }
    } catch (err) {
        console.error(`❌ Error: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
