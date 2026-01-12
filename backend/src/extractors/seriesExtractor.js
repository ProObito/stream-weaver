const axios = require('axios');
const mongoose = require('mongoose');

// --- CONFIGURATION ---
// Tumhara hosted API URL
const API_BASE_URL = "https://hianimeapi-ochre.vercel.app"; 

// Helper: Delay to be safe
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 🚀 1. DOODSTREAM REMOTE UPLOAD
 * Send the direct .m3u8 link to DoodStream
 */
const addRemoteUpload = async (videoUrl) => {
    const key = process.env.DOODSTREAM_KEY;
    if (!key) throw new Error("DoodStream API Key missing in Heroku Config Vars!");

    const apiUrl = `https://doodapi.com/api/upload/url?key=${key}&url=${encodeURIComponent(videoUrl)}`;
    
    try {
        const { data } = await axios.get(apiUrl);
        if (data.status === 200 && data.result && data.result.filecode) {
            return data.result.filecode;
        }
        return null;
    } catch (err) {
        console.error("DoodStream Error:", err.message);
        return null;
    }
};

/**
 * 🔗 2. GET DIRECT VIDEO LINK (Using Your Vercel API)
 * No more scraping/decrypting locally. We ask the API.
 */
const getLinkFromApi = async (episodeId) => {
    try {
        // Endpoint: /anime/hianime/watch?episodeId=...&server=vidstreaming
        const apiUrl = `${API_BASE_URL}/anime/hianime/watch?episodeId=${episodeId}&server=vidstreaming`;
        
        const { data } = await axios.get(apiUrl);

        // API Response looks like: { sources: [{ url: "...", isM3U8: true }, ...] }
        if (data && data.sources && data.sources.length > 0) {
            // Prefer the "default" or first source
            return data.sources[0].url; 
        }
        return null;

    } catch (err) {
        console.error(`API Error for ${episodeId}:`, err.message);
        return null;
    }
};

/**
 * 📋 3. GET EPISODE LIST (Using Your Vercel API)
 */
const getEpisodesFromApi = async (animeId) => {
    try {
        // Endpoint: /anime/hianime/episodes/{id}
        const apiUrl = `${API_BASE_URL}/anime/hianime/episodes/${animeId}`;
        const { data } = await axios.get(apiUrl);
        
        if (data && data.episodes) {
            return data.episodes; // Returns array [{ episodeId: "...", number: 1, title: "..." }]
        }
        return [];
    } catch (err) {
        console.error("Episode List API Error:", err.message);
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

        console.log(`🚀 Starting Sync via Vercel API: ${animeName}`);

        // Extract ID from URL (e.g., https://hianime.to/one-piece-100 -> one-piece-100)
        // Split by '/' and take last part, remove query params if any
        const animeId = mainUrl.split('/').pop().split('?')[0];

        if (!animeId) {
            console.error("❌ Invalid HiAnime URL provided.");
            return;
        }

        // 1. Series Check/Create
        let series = await Series.findOne({ title: new RegExp(`^${animeName}`, 'i') });
        if (!series) {
            series = await Series.create({ title: `${animeName} (${languageTag})`, sourceUrl: mainUrl, language: languageTag });
        }

        // 2. Get Episodes from API
        const episodes = await getEpisodesFromApi(animeId);
        console.log(`🔍 Found ${episodes.length} episodes via API.`);

        if (episodes.length === 0) {
            console.log("⚠️ No episodes found. Check if Anime ID is correct.");
            return;
        }

        for (let ep of episodes) {
            try {
                // Ensure episode number is integer
                const epNum = parseInt(ep.number);

                // Check if exists
                const existing = await Episode.findOne({ seriesId: series._id, episodeNumber: epNum });
                if (existing && existing.status === 'completed') {
                    console.log(`⏭️ Skipping Ep ${epNum} (Already Live)`);
                    continue;
                }

                // STEP A: Get Direct Link from API
                const directLink = await getLinkFromApi(ep.episodeId);
                
                if (directLink) {
                    // STEP B: Upload to DoodStream
                    console.log(`📡 Sending Ep ${epNum} to DoodStream...`);
                    const fileCode = await addRemoteUpload(directLink);

                    if (fileCode) {
                        await Episode.findOneAndUpdate(
                            { seriesId: series._id, episodeNumber: epNum },
                            { 
                                remoteId: fileCode, 
                                status: 'processing', 
                                title: ep.title || `Episode ${epNum}`
                            },
                            { upsert: true }
                        );
                        console.log(`✅ Ep ${epNum} Queued! FileCode: ${fileCode}`);
                    } else {
                        console.log(`❌ DoodStream Failed for Ep ${epNum}`);
                    }
                } else {
                    console.log(`❌ API could not fetch link for Ep ${epNum}`);
                }

            } catch (err) {
                console.error(`❌ Ep ${ep.number} Error: ${err.message}`);
            }

            // API calls are fast, but 2s gap is good practice
            await sleep(2000); 
        }

        console.log(`🏁 Sync Finished for ${animeName}`);

    } catch (err) {
        console.error(`💥 GLOBAL CRASH: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
