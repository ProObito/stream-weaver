const axios = require('axios');
const mongoose = require('mongoose');

// --- CONFIGURATION ---
// Tera Vercel API URL
const API_BASE_URL = "https://hianimeapi-ochre.vercel.app"; 

// Helper: Delay to prevent rate limits or IP bans
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 🚀 1. DOODSTREAM REMOTE UPLOAD
 * Send the direct video link to DoodStream
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
 * 🔗 2. GET DIRECT VIDEO LINK (From Vercel API)
 * Route: /hianime/watch?episodeId=...
 */
const getLinkFromApi = async (episodeId) => {
    try {
        const apiUrl = `${API_BASE_URL}/hianime/watch?episodeId=${episodeId}`;
        
        const { data } = await axios.get(apiUrl);

        // API Response: { sources: [{ url: "...", quality: "default", isM3U8: true }] }
        if (data && data.sources && data.sources.length > 0) {
            // Find the best source (usually 'auto' or 'default')
            const source = data.sources.find(s => s.quality === 'auto') || 
                           data.sources.find(s => s.quality === 'default') || 
                           data.sources[0];
            return source.url; 
        }
        return null;

    } catch (err) {
        console.error(`API Watch Error (${episodeId}):`, err.message);
        return null;
    }
};

/**
 * 📋 3. GET EPISODE LIST (From Vercel API)
 * Route: /hianime/info?id=...
 */
const getEpisodesFromApi = async (animeId) => {
    try {
        const apiUrl = `${API_BASE_URL}/hianime/info?id=${animeId}`;
        const { data } = await axios.get(apiUrl);
        
        // Response format check
        if (data && data.episodes) {
            return data.episodes; 
        } else if (data && data.anime && data.anime.episodes) {
            return data.anime.episodes;
        }
        return [];
    } catch (err) {
        console.error(`Episode List Error (${animeId}):`, err.message);
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

        console.log(`🚀 Starting Sync via API: ${animeName}`);

        // --- ID EXTRACTION LOGIC ---
        // URL Example 1: https://hianime.to/one-piece-100
        // URL Example 2: https://hianime.to/watch/one-piece-100?ep=123
        let animeId = '';

        if (mainUrl.includes('/watch/')) {
            animeId = mainUrl.split('/watch/')[1].split('?')[0];
        } else {
            animeId = mainUrl.split('/').pop().split('?')[0];
        }

        console.log(`ℹ️ Extracted ID: ${animeId}`);

        if (!animeId) {
            console.error("❌ Could not extract Anime ID from URL.");
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
            console.log("⚠️ No episodes found. Logs check karo ki API URL sahi hai ya Anime ID.");
            return;
        }

        for (let ep of episodes) {
            try {
                // Determine Episode Number
                const epNum = ep.number; 

                // Check if exists
                const existing = await Episode.findOne({ seriesId: series._id, episodeNumber: epNum });
                if (existing && existing.status === 'completed') {
                    console.log(`⏭️ Skipping Ep ${epNum} (Already Live)`);
                    continue;
                }

                // STEP A: Get Link from API
                // Note: API returns 'episodeId' inside the episode object
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
                                title: ep.title 
                            },
                            { upsert: true }
                        );
                        console.log(`✅ Ep ${epNum} Queued! FileCode: ${fileCode}`);
                    } else {
                        console.log(`❌ DoodStream Failed for Ep ${epNum}`);
                    }
                } else {
                    console.log(`❌ No Link found for Ep ${epNum} (API return null)`);
                }

            } catch (err) {
                console.error(`❌ Ep Error: ${err.message}`);
            }
            
            // 2 Second delay is enough for API
            await sleep(2000); 
        }
        console.log(`🏁 Sync Finished for ${animeName}`);

    } catch (err) {
        console.error(`💥 GLOBAL CRASH: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
