const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');
const { processEpisodes } = require('./videoExtractor');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// GogoAnime se direct stream link nikalne ka function
const getGogoDirectLink = async (animeTitle, epNum) => {
    try {
        // Anime title ko URL friendly banao
        const formattedTitle = animeTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const gogoUrl = `https://anitaku.pe/${formattedTitle}-episode-${epNum}`;
        
        const { data } = await axios.get(gogoUrl);
        const $ = cheerio.load(data);
        
        // Streamtape ya asali file link uthao (Gogo ke servers list se)
        const directLink = $('.streamsb a').attr('data-video') || $('.standard a').attr('data-video');
        return directLink || null;
    } catch (err) {
        return null;
    }
};

const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    try {
        const Series = mongoose.model('Series');
        const Episode = mongoose.model('Episode');

        console.log(`📡 Processing: ${animeName}`);

        // 1. Series dhoondo ya banao
        let series = await Series.findOne({ title: `${animeName} (${languageTag})` });
        if (!series) {
            series = await Series.create({
                title: `${animeName} (${languageTag})`,
                sourceUrl: mainUrl,
                language: languageTag,
                isPublished: false
            });
        }

        // HiAnime se episode list uthao (Numbers ke liye)
        const animeId = mainUrl.split('-').pop();
        const { data: ajaxRes } = await axios.get(`https://hianime.to/ajax/v2/episode/list/${animeId}`, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });

        const $ = cheerio.load(ajaxRes.html);
        const epElements = $('.ep-item');

        console.log(`🔍 Found ${epElements.length} episodes. Starting Force Upload...`);

        for (let i = 0; i < epElements.length; i++) {
            const epNum = parseInt($(epElements[i]).attr('data-number'));

            // CHECK: Kya ye episode pehle se Streamtape pe "ready" hai?
            const existingEp = await Episode.findOne({ seriesId: series._id, episodeNumber: epNum });
            
            // Agar episode nahi hai, ya failed hai, ya remoteId khali hai -> TOH RE-UPLOAD KARO
            if (!existingEp || existingEp.status === 'failed' || !existingEp.remoteId) {
                
                const finalLink = await getGogoDirectLink(animeName, epNum);

                if (finalLink) {
                    await processEpisodes(series, [{
                        episode: epNum,
                        link: finalLink,
                        title: `Episode ${epNum}`,
                        season: 1
                    }]);

                    console.log(`✅ [Re-uploading] Ep ${epNum} Sent to Streamtape.`);
                    await sleep(85000); // Streamtape Limit Protection
                }
            } else {
                console.log(`⏭️ Ep ${epNum} already exists, skipping...`);
            }
        }
    } catch (err) {
        console.error(`❌ Extractor Error: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
