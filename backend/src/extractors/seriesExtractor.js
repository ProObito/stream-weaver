const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');

// Delay Helper (Anti-Ban)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 🚀 DOODSTREAM REMOTE UPLOAD
 * Video URL bhejte hain, DoodStream khud download karega
 */
const addRemoteUpload = async (videoUrl) => {
    const key = process.env.DOODSTREAM_KEY; // Heroku Config Var se key lega

    if (!key) throw new Error("DoodStream API Key is missing in Environment Variables!");

    // DoodStream API Call
    const apiUrl = `https://doodapi.com/api/upload/url?key=${key}&url=${encodeURIComponent(videoUrl)}`;
    
    try {
        const { data } = await axios.get(apiUrl);

        if (data.status === 200 && data.result && data.result.filecode) {
            return data.result.filecode; // Success: FileCode mil gaya
        } else {
            console.error("DoodStream Error:", data);
            throw new Error(data.msg || "Remote Upload Failed");
        }
    } catch (err) {
        throw new Error(`API Request Error: ${err.message}`);
    }
};

/**
 * HIANIME DATA FETCHER
 */
const getHiAnimeData = async (mainUrl) => {
    try {
        const animeId = mainUrl.split('-').pop();
        const { data: listData } = await axios.get(`https://hianime.to/ajax/v2/episode/list/${animeId}`, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });

        const $ = cheerio.load(listData.html);
        const episodes = [];

        $('.ep-item').each((i, el) => {
            episodes.push({
                id: $(el).attr('data-id'),
                number: parseInt($(el).attr('data-number')),
                title: $(el).attr('title') || `Episode ${$(el).attr('data-number')}`
            });
        });

        return episodes;
    } catch (err) {
        console.error("Error fetching HiAnime list:", err.message);
        return [];
    }
};

/**
 * MAIN LOGIC
 */
const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    try {
        const Episode = mongoose.model('Episode');
        const Series = mongoose.model('Series');

        console.log(`🚀 Starting DoodStream Sync: ${animeName}`);

        // 1. Find or Create Series
        let series = await Series.findOne({ title: new RegExp(`^${animeName}`, 'i') });
        if (!series) {
            series = await Series.create({ 
                title: `${animeName} (${languageTag})`, 
                sourceUrl: mainUrl, 
                language: languageTag 
            });
        }

        // 2. Get Episodes
        const episodes = await getHiAnimeData(mainUrl);
        console.log(`🔍 Found ${episodes.length} episodes.`);

        for (let ep of episodes) {
            try {
                // Check if already completed
                const existing = await Episode.findOne({ seriesId: series._id, episodeNumber: ep.number });
                if (existing && existing.status === 'completed') {
                    console.log(`⏭️ Skipping Ep ${ep.number} (Already Live)`);
                    continue;
                }

                // 3. Get Fresh Direct Link
                const { data: sourceData } = await axios.get(`https://hianime.to/ajax/v2/episode/sources?id=${ep.id}`);
                const videoLink = sourceData.link;

                if (!videoLink) {
                    console.log(`⚠️ No link found for Ep ${ep.number}`);
                    continue;
                }

                // 4. Send to DoodStream
                console.log(`📡 Uploading Ep ${ep.number} to DoodStream...`);
                const fileCode = await addRemoteUpload(videoLink);

                // 5. Save as 'processing'
                await Episode.findOneAndUpdate(
                    { seriesId: series._id, episodeNumber: ep.number },
                    { 
                        remoteId: fileCode, 
                        status: 'processing', 
                        title: ep.title 
                    },
                    { upsert: true }
                );

                console.log(`✅ Ep ${ep.number} Queued! FileCode: ${fileCode}`);

            } catch (err) {
                console.error(`❌ Ep ${ep.number} Error: ${err.message}`);
            }

            // 5 Seconds Gap to be safe
            await sleep(5000); 
        }

        console.log(`🏁 Sync Finished for ${animeName}`);

    } catch (err) {
        console.error(`💥 GLOBAL CRASH: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
