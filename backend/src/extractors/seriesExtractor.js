const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');
const { processEpisodes } = require('./videoExtractor');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- SOURCE HELPERS ---

// 1. HiAnime Logic (Direct Link Extraction)
const getHiAnimeData = async (mainUrl) => {
    const animeId = mainUrl.split('-').pop();
    const { data } = await axios.get(`https://hianime.to/ajax/v2/episode/list/${animeId}`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
    const $ = cheerio.load(data.html);
    const eps = [];
    
    const items = $('.ep-item').get();
    for (const el of items) {
        const id = $(el).attr('data-id');
        const num = parseInt($(el).attr('data-number'));
        // Har episode ka asali source link nikalna padega
        try {
            const { data: src } = await axios.get(`https://hianime.to/ajax/v2/episode/sources?id=${id}`);
            eps.push({ episode: num, link: src.link, title: $(el).attr('title') || `Episode ${num}` });
        } catch (e) { console.log(`Skip Ep ${num} due to link error`); }
    }
    return eps;
};

// 2. TPXSub & DesiDub Logic (Anchor Link Extraction)
const getGeneralSourceData = async (url) => {
    try {
        const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(data);
        const eps = [];
        
        // Targetting links that look like video hosts
        $('.entry-content a, .content a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && (href.includes('streamtape') || href.includes('drive.google') || href.includes('mega.nz'))) {
                eps.push({
                    episode: i + 1,
                    link: href,
                    title: $(el).text().trim() || `Episode ${i + 1}`
                });
            }
        });
        return eps;
    } catch (e) { return []; }
};

// --- MAIN FUNCTION ---

const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    try {
        const Series = mongoose.model('Series');
        console.log(`📡 Processing: ${animeName} (${languageTag})`);

        // Series setup
        let series = await Series.findOne({ title: `${animeName} (${languageTag})` });
        if (!series) {
            series = await Series.create({
                title: `${animeName} (${languageTag})`,
                sourceUrl: mainUrl,
                language: languageTag,
                isPublished: false
            });
        }

        let episodeList = [];

        // Determine Source
        if (mainUrl.includes('hianime.to')) {
            episodeList = await getHiAnimeData(mainUrl);
        } else {
            episodeList = await getGeneralSourceData(mainUrl);
        }

        if (episodeList.length === 0) {
            console.log(`❌ No episodes found for ${animeName}`);
            return;
        }

        console.log(`🔍 Total ${episodeList.length} episodes ready for processing.`);

        // Loop and Force Upload
        for (let i = 0; i < episodeList.length; i++) {
            const ep = episodeList[i];

            // FORCE MODE: Hum database check skip kar rahe hain taaki Streamtape pe dobara jaye
            await processEpisodes(series, [{
                episode: ep.episode,
                link: ep.link,
                title: ep.title,
                season: 1
            }]);

            console.log(`✅ [${i+1}/${episodeList.length}] Ep ${ep.episode} triggered for ${animeName}`);
            
            // 85 seconds delay to stay under Streamtape's hourly limit
            if (i < episodeList.length - 1) {
                console.log(`⏳ Waiting 85s for next episode...`);
                await sleep(85000);
            }
        }

        console.log(`🏁 All episodes for ${animeName} have been sent to queue.`);

    } catch (err) {
        console.error(`❌ Extractor Crash: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
