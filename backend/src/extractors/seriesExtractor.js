const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');
const { processEpisodes } = require('./videoExtractor');

// Helper: Delay function taaki Streamtape block na kare (80 seconds gap)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Final Video Embed Link nikalne ke liye
const getFinalEmbedLink = async (episodeId) => {
    try {
        const { data: serverRes } = await axios.get(`https://hianime.to/ajax/v2/episode/servers?episodeId=${episodeId}`, {
            headers: { 
                'X-Requested-With': 'XMLHttpRequest', 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
            }
        });
        const $ = cheerio.load(serverRes.html);
        
        // Priority: MegaCloud (Best Quality) or VidStreaming
        const serverId = $('.server-item[data-name="megacloud"]').attr('data-id') || 
                         $('.server-item[data-name="vidstreaming"]').attr('data-id') ||
                         $('.server-item').first().attr('data-id');

        if (!serverId) return null;

        const { data: sourceRes } = await axios.get(`https://hianime.to/ajax/v2/episode/sources?id=${serverId}`, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });

        // sourceRes.link is the actual embed URL (e.g. megacloud.tv/embed-2/...)
        return sourceRes.link || null;
    } catch (err) {
        console.error(`⚠️ Link Fetch Error (ID: ${episodeId}):`, err.message);
        return null;
    }
};

const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    try {
        const Series = mongoose.model('Series');
        const animeId = mainUrl.split('-').pop(); 

        console.log(`📡 Processing: ${animeName} (${languageTag})`);

        // 1. Series Entry Check
        let series = await Series.findOne({ title: `${animeName} (${languageTag})` });
        if (!series) {
            series = await Series.create({
                title: `${animeName} (${languageTag})`,
                sourceUrl: mainUrl,
                language: languageTag,
                isPublished: false,
                poster: "https://via.placeholder.com/300x450?text=Fetching...",
                description: "Metadata auto-fetching..."
            });
        }

        // 2. Get Episode List
        const { data: ajaxRes } = await axios.get(`https://hianime.to/ajax/v2/episode/list/${animeId}`, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });

        const $ = cheerio.load(ajaxRes.html);
        const epElements = $('.ep-item');

        console.log(`🔍 Found ${epElements.length} episodes. Starting Throttled Extraction (80s Delay)...`);

        // 3. Loop with Throttling (Limit Protection)
        for (let i = 0; i < epElements.length; i++) {
            const el = epElements[i];
            const epNum = parseInt($(el).attr('data-number'));
            const epId = $(el).attr('data-id');

            const finalLink = await getFinalEmbedLink(epId);

            if (finalLink) {
                // Ek episode process karo
                await processEpisodes(series, [{
                    episode: epNum,
                    link: finalLink,
                    title: $(el).attr('title') || `Episode ${epNum}`,
                    season: 1 
                }]);

                console.log(`✅ [${i+1}/${epElements.length}] Ep ${epNum} sent to Streamtape.`);
                
                // 4. Rate Limit Protection: Wait 80 seconds before next episode
                if (i < epElements.length - 1) {
                    console.log(`⏳ Waiting 80 seconds to avoid Streamtape Hourly Limit...`);
                    await sleep(80000); 
                }
            }
        }

        console.log(`🏁 Successfully queued all episodes for ${animeName}`);

    } catch (err) {
        console.error(`❌ Extractor Failed [${animeName}]: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
