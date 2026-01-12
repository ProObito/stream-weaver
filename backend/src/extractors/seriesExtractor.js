const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');

// Helper to wait between requests
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * TRIGGER REMOTE UPLOAD TO STREAMTAPE
 * Streamtape ko sirf link bhejte hain, download wo khud karega
 */
const addRemoteUpload = async (videoUrl) => {
    const login = process.env.STREAMTAPE_LOGIN;
    const key = process.env.STREAMTAPE_KEY;

    if (!login || !key) {
        throw new Error("Streamtape API credentials missing in Environment Variables");
    }

    // URL ko encode karna zaroori hai
    const apiUrl = `https://api.streamtape.com/remotedl/add?login=${login}&key=${key}&url=${encodeURIComponent(videoUrl)}`;
    
    const { data } = await axios.get(apiUrl);

    if (data.status === 200 && data.result) {
        return data.result.id; // Yeh Ticket ID hai (processing ke liye)
    } else {
        console.error("Streamtape Error Response:", data);
        throw new Error(data.msg || "Remote Upload Failed to initiate");
    }
};

/**
 * GET EPISODE LIST & SOURCE LINKS FROM HIANIME
 */
const getHiAnimeData = async (mainUrl) => {
    const animeId = mainUrl.split('-').pop();
    const { data: listData } = await axios.get(`https://hianime.to/ajax/v2/episode/list/${animeId}`, {
        headers: { 
            'X-Requested-With': 'XMLHttpRequest',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
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
};

/**
 * MAIN FUNCTION: EXTRACT & SYNC
 */
const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    try {
        // Models ko fetch karo (Ensure models are registered)
        const Episode = mongoose.model('Episode');
        const Series = mongoose.model('Series');

        console.log(`🚀 Starting Global Sync for: ${animeName} (${languageTag})`);

        // 1. Series Check/Create
        let series = await Series.findOne({ title: new RegExp(`^${animeName}`, 'i') });
        if (!series) {
            series = await Series.create({ 
                title: `${animeName} (${languageTag})`, 
                sourceUrl: mainUrl, 
                language: languageTag 
            });
        }

        // 2. Fetch Episodes from HiAnime
        const episodes = await getHiAnimeData(mainUrl);
        console.log(`🔍 Found ${episodes.length} episodes on source.`);

        for (let ep of episodes) {
            try {
                // Pehle check karo agar ye episode already completed hai?
                const existing = await Episode.findOne({ seriesId: series._id, episodeNumber: ep.number });
                if (existing && existing.status === 'completed') {
                    console.log(`⏭️ Skipping Ep ${ep.number} (Already exists)`);
                    continue;
                }

                // 3. Get Fresh Video Source Link
                const { data: sourceData } = await axios.get(`https://hianime.to/ajax/v2/episode/sources?id=${ep.id}`);
                const videoLink = sourceData.link;

                if (!videoLink) {
                    console.log(`⚠️ No source link found for Ep ${ep.number}`);
                    continue;
                }

                // 4. Send to Streamtape
                console.log(`📡 Sending Ep ${ep.number} to Streamtape Remote Queue...`);
                const ticketId = await addRemoteUpload(videoLink);

                // 5. Save Ticket ID to Database (Status: Processing)
                await Episode.findOneAndUpdate(
                    { seriesId: series._id, episodeNumber: ep.number },
                    { 
                        remoteId: ticketId, 
                        status: 'processing', // "processing" means Streamtape is still downloading it
                        title: ep.title 
                    },
                    { upsert: true }
                );

                console.log(`✅ Ep ${ep.number} Queued! Ticket ID: ${ticketId}`);

            } catch (err) {
                console.error(`❌ Error on Ep ${ep.number}: ${err.message}`);
            }

            // Streamtape API limits aur site ban se bachne ke liye 10 sec ka gap
            await sleep(10000); 
        }

        console.log(`🏁 Finished processing all episodes for ${animeName}`);

    } catch (err) {
        console.error(`💥 CRITICAL EXTRACTOR ERROR: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
