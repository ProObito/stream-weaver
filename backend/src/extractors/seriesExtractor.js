const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');

// Helper: Delay function to prevent bans (Anti-Ban)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 🚀 1. DOODSTREAM REMOTE UPLOAD
 * URL bhejte hain, DoodStream download karega
 */
const addRemoteUpload = async (videoUrl) => {
    const key = process.env.DOODSTREAM_KEY; 

    if (!key) throw new Error("DoodStream API Key missing in Heroku Config Vars!");

    // DoodStream API Call
    const apiUrl = `https://doodapi.com/api/upload/url?key=${key}&url=${encodeURIComponent(videoUrl)}`;
    
    try {
        const { data } = await axios.get(apiUrl);

        if (data.status === 200 && data.result && data.result.filecode) {
            return data.result.filecode; // Success: FileCode mil gaya
        } else {
            console.error("DoodStream Error:", data);
            return null;
        }
    } catch (err) {
        console.error(`DoodStream API Request Error: ${err.message}`);
        return null;
    }
};

/**
 * 🛠️ 2. GET SERVER ID (Ye Naya Step Hai)
 * Direct link nahi milta, pehle Server ID nikalna padta hai (VidStreaming/MegaCloud)
 */
const getServerId = async (epId) => {
    try {
        const { data: serverData } = await axios.get(`https://hianime.to/ajax/v2/episode/servers?episodeId=${epId}`, {
            headers: { 
                'X-Requested-With': 'XMLHttpRequest',
                'User-Agent': 'Mozilla/5.0'
            }
        });
        
        const $ = cheerio.load(serverData.html);
        
        // Priority: VidStreaming (4) -> MegaCloud (1)
        let serverId = $('.server-item[data-type="sub"][data-server-id="4"]').attr('data-id'); // VidStreaming
        
        if (!serverId) {
            serverId = $('.server-item[data-type="sub"][data-server-id="1"]').attr('data-id'); // MegaCloud
        }
        
        // Fallback: Jo bhi pehla mile
        if (!serverId) {
            serverId = $('.server-item').first().attr('data-id');
        }

        return serverId;
    } catch (err) {
        console.error(`Server Fetch Error: ${err.message}`);
        return null;
    }
};

/**
 * 📋 3. FETCH EPISODE LIST
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
                id: $(el).attr('data-id'), // Episode ID
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
 * 🎮 4. MAIN CONTROLLER
 */
const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    try {
        const Episode = mongoose.model('Episode');
        const Series = mongoose.model('Series');

        console.log(`🚀 Starting DoodStream Sync: ${animeName}`);

        // 1. Series Check/Create
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

                // STEP A: Get Server ID (Fix for "No link found")
                const serverId = await getServerId(ep.id);
                if (!serverId) {
                    console.log(`⚠️ No Server ID found for Ep ${ep.number}`);
                    continue;
                }

                // STEP B: Get Source Link using Server ID
                const { data: sourceData } = await axios.get(`https://hianime.to/ajax/v2/episode/sources?id=${serverId}`);
                const videoLink = sourceData.link;

                if (!videoLink) {
                    console.log(`⚠️ No source link found for Ep ${ep.number}`);
                    continue;
                }

                // STEP C: Upload to DoodStream
                console.log(`📡 Sending Ep ${ep.number} to DoodStream...`);
                const fileCode = await addRemoteUpload(videoLink);

                if (fileCode) {
                    // STEP D: Save as 'processing'
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
                } else {
                    console.log(`❌ DoodStream Failed for Ep ${ep.number}`);
                }

            } catch (err) {
                console.error(`❌ Ep ${ep.number} Error: ${err.message}`);
            }

            // 5 Seconds Gap to avoid server blocks
            await sleep(5000); 
        }

        console.log(`🏁 Sync Finished for ${animeName}`);

    } catch (err) {
        console.error(`💥 GLOBAL CRASH: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
