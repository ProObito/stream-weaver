const axios = require('axios');
const mongoose = require('mongoose');

// --- CONFIGURATION ---
const API_BASE_URL = "https://hianimeapi-1vww.onrender.com/"; 

// Helper: Delay function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 🚀 1. DOODSTREAM UPLOAD
 */
const addRemoteUpload = async (videoUrl) => {
    const key = process.env.DOODSTREAM_KEY;
    if (!key) throw new Error("DoodStream API Key missing!");

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
 * 🔗 2. GET DIRECT VIDEO LINK
 * Route: /hianime/watch?episodeId={id}
 */
const getLinkFromApi = async (episodeId) => {
    try {
        const apiUrl = `${API_BASE_URL}/hianime/watch?episodeId=${episodeId}`;
        const { data } = await axios.get(apiUrl);

        if (data && data.sources) {
            const source = data.sources.find(s => s.quality === 'auto') || 
                           data.sources.find(s => s.quality === 'default') || 
                           data.sources[0];
            return source ? source.url : null;
        }
        return null;
    } catch (err) {
        console.error(`API Watch Error (${episodeId}):`, err.message);
        return null;
    }
};

/**
 * 📋 3. GET EPISODE LIST (SMART FETCH)
 * Route: /hianime/info?id={id}
 */
const getEpisodesFromApi = async (animeId) => {
    try {
        const apiUrl = `${API_BASE_URL}/hianime/info?id=${animeId}`;
        console.log(`📡 Fetching Info from: ${apiUrl}`);

        const { data } = await axios.get(apiUrl);
        
        // --- DEBUGGING LOG (Zaroori hai) ---
        // Ye batayega ki API kya bhej rahi hai agar episodes nahi mile
        if (!data) console.log("⚠️ API returned empty data.");
        else console.log("✅ API Response Keys:", Object.keys(data));

        // --- SMART EXTRACTION ---
        // Alag-alag jagah check karo jahan episodes chhupe ho sakte hain
        let episodes = [];
        
        if (Array.isArray(data.episodes)) {
            episodes = data.episodes;
        } else if (data.anime && Array.isArray(data.anime.episodes)) {
            episodes = data.anime.episodes;
        } else if (data.data && Array.isArray(data.data.episodes)) {
            episodes = data.data.episodes;
        }

        return episodes;

    } catch (err) {
        console.error(`Episode List Request Error:`, err.message);
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

        console.log(`🚀 Starting Sync: ${animeName}`);

        // --- ID EXTRACTION ---
        // URL se ID nikalne ka foolproof tareeka
        let animeId = "";
        try {
            const urlObj = new URL(mainUrl);
            const pathSegments = urlObj.pathname.split('/').filter(Boolean); // Remove empty strings
            
            // hianime.to/watch/attack-on-titan-112?ep=3 -> attack-on-titan-112
            if (pathSegments.includes('watch')) {
                animeId = pathSegments[pathSegments.indexOf('watch') + 1];
            } else {
                // hianime.to/attack-on-titan-112 -> attack-on-titan-112
                animeId = pathSegments[pathSegments.length - 1];
            }
        } catch (e) {
            console.error("❌ Invalid URL format");
            return;
        }

        console.log(`ℹ️ Extracted ID: ${animeId}`);

        if (!animeId) {
            console.error("❌ Could not extract Anime ID.");
            return;
        }

        // 1. Series Check/Create
        let series = await Series.findOne({ title: new RegExp(`^${animeName}`, 'i') });
        if (!series) {
            series = await Series.create({ title: `${animeName} (${languageTag})`, sourceUrl: mainUrl, language: languageTag });
        }

        // 2. Get Episodes
        const episodes = await getEpisodesFromApi(animeId);
        console.log(`🔍 Found ${episodes.length} episodes via API.`);

        if (episodes.length === 0) {
            console.log("⚠️ 0 Episodes found. Logs check karo 'API Response Keys' ke liye.");
            return;
        }

        for (let ep of episodes) {
            try {
                const epNum = ep.number; 
                
                const existing = await Episode.findOne({ seriesId: series._id, episodeNumber: epNum });
                if (existing && existing.status === 'completed') {
                    console.log(`⏭️ Skipping Ep ${epNum} (Already Live)`);
                    continue;
                }

                const directLink = await getLinkFromApi(ep.episodeId);
                
                if (directLink) {
                    console.log(`📡 Sending Ep ${epNum} to DoodStream...`);
                    const fileCode = await addRemoteUpload(directLink);

                    if (fileCode) {
                        await Episode.findOneAndUpdate(
                            { seriesId: series._id, episodeNumber: epNum },
                            { remoteId: fileCode, status: 'processing', title: ep.title },
                            { upsert: true }
                        );
                        console.log(`✅ Ep ${epNum} Queued! FileCode: ${fileCode}`);
                    } else {
                        console.log(`❌ DoodStream Failed for Ep ${epNum}`);
                    }
                } else {
                    console.log(`❌ No Link found for Ep ${epNum}`);
                }

            } catch (err) {
                console.error(`❌ Ep Error: ${err.message}`);
            }
            await sleep(2000); 
        }
        console.log(`🏁 Sync Finished for ${animeName}`);

    } catch (err) {
        console.error(`💥 GLOBAL CRASH: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
