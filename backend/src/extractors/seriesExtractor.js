const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');
const { processEpisodes } = require('./videoExtractor');

// Helper to get Best Quality Server Link
const getBestServerLink = async (episodeId) => {
    try {
        const { data } = await axios.get(`https://hianime.to/ajax/v2/episode/servers?episodeId=${episodeId}`, {
            headers: { 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(data.html);
        
        // Priority Servers for Highest Bitrate: MegaCloud (HD-1) or VidStreaming (HD-2)
        const serverId = $('.server-item[data-name="megacloud"]').attr('data-id') || 
                         $('.server-item[data-name="vidstreaming"]').attr('data-id') ||
                         $('.server-item').first().attr('data-id');

        return serverId ? `https://hianime.to/ajax/v2/episode/sources?id=${serverId}` : null;
    } catch (err) {
        return null;
    }
};

const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    try {
        const Series = mongoose.model('Series');
        const animeId = mainUrl.split('-').pop(); // Get HiAnime ID

        console.log(`📡 Processing: ${animeName} (${languageTag})`);

        // 1. Check/Create Series Draft
        let series = await Series.findOne({ title: `${animeName} (${languageTag})` });
        if (!series) {
            series = await Series.create({
                title: `${animeName} (${languageTag})`,
                sourceUrl: mainUrl,
                language: languageTag,
                isPublished: false,
                poster: "https://via.placeholder.com/300x450?text=Fetching+Poster...",
                description: "Metadata will be updated automatically."
            });
        }

        // 2. Fetch Episode List via Ajax (HiAnime specific)
        const ajaxUrl = `https://hianime.to/ajax/v2/episode/list/${animeId}`;
        const { data: ajaxRes } = await axios.get(ajaxUrl, {
            headers: { 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': 'Mozilla/5.0' }
        });

        const $ = cheerio.load(ajaxRes.html);
        let episodeList = [];

        // 3. Loop through episodes and get Highest Quality links
        const epElements = $('.ep-item');
        console.log(`🔍 Found ${epElements.length} episodes. Extracting High Quality links...`);

        for (let i = 0; i < epElements.length; i++) {
            const el = epElements[i];
            const epNum = parseInt($(el).attr('data-number'));
            const epId = $(el).attr('data-id');

            // Get the best source link for this episode
            const bestLink = await getBestServerLink(epId);

            if (bestLink) {
                episodeList.push({
                    episode: epNum,
                    link: bestLink,
                    title: $(el).attr('title') || `Episode ${epNum}`,
                    season: 1 // Default to Season 1, can be edited in Admin
                });
            }
        }

        if (episodeList.length > 0) {
            // Sort: Pehle Old (Ep 1) phir New (Ep 100)
            episodeList.sort((a, b) => a.episode - b.episode);

            // 4. Send to Video Extractor for Streamtape Upload
            await processEpisodes(series, episodeList);
            console.log(`✅ Success: ${episodeList.length} HQ episodes queued for ${animeName}`);
        } else {
            console.log(`⚠️ No valid episode links found for ${animeName}`);
        }

    } catch (err) {
        console.error(`❌ Extractor Failed [${animeName}]: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
