const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');
const { processEpisodes } = require('./videoExtractor');

const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    try {
        const Series = mongoose.model('Series');
        const id = mainUrl.split('-').pop(); // HiAnime ID nikalne ke liye

        // 1. Series Entry (Draft)
        let series = await Series.findOne({ title: `${animeName} (${languageTag})` });
        if (!series) {
            series = await Series.create({
                title: `${animeName} (${languageTag})`,
                sourceUrl: mainUrl,
                language: languageTag,
                isPublished: false,
                poster: "https://via.placeholder.com/300x450", 
                description: "Fetching details..."
            });
        }

        // 2. HI-ANIME EPISODE AJAX FETCH (The Fix)
        // HiAnime episodes direct HTML mein nahi hote, Ajax se aate hain
        const ajaxUrl = `https://hianime.to/ajax/v2/episode/list/${id}`;
        const { data: ajaxData } = await axios.get(ajaxUrl, {
            headers: { 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': 'Mozilla/5.0' }
        });

        const $ = cheerio.load(ajaxData.html);
        let episodeList = [];

        $('.ep-item').each((i, el) => {
            const epNum = $(el).attr('data-number');
            const epId = $(el).attr('data-id'); // Stream link ke liye ID
            const epTitle = $(el).attr('title');

            episodeList.push({
                episode: parseInt(epNum),
                link: `https://hianime.to/ajax/v2/episode/servers?episodeId=${epId}`,
                title: epTitle || `Episode ${epNum}`,
                season: 1 // Default 1, isko tu manual bhi edit kar sakega
            });
        });

        if (episodeList.length > 0) {
            // "Pehle Old pir New" - Sort by episode number
            episodeList.sort((a, b) => a.episode - b.episode);
            
            console.log(`📦 Queueing ${episodeList.length} episodes for ${animeName}`);
            await processEpisodes(series, episodeList);
        } else {
            console.log(`⚠️ No episodes found for ${animeName}. Retrying with alternate logic...`);
        }

    } catch (err) {
        console.error(`❌ Extractor Error: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
