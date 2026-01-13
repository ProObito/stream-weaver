const axios = require('axios');
const mongoose = require('mongoose');

// --- CONFIGURATION ---
const API_BASE_URL = "https://hianimeapi-1vww.onrender.com"; 

// Helper: Delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- 1. DOODSTREAM UPLOAD ---
const addRemoteUpload = async (videoUrl) => {
    const key = process.env.DOODSTREAM_KEY;
    if (!key) {
        console.error("❌ DoodStream Key Missing!");
        return null;
    }

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

// --- 2. SMART API FETCH (Trying Multiple Routes) ---
const fetchFromApi = async (paths, idParamName, idValue) => {
    for (const path of paths) {
        try {
            // URL construct karo
            const url = `${API_BASE_URL}${path}?${idParamName}=${idValue}`;
            // console.log(`👉 Trying: ${url}`); // Debug ke liye
            
            const { data } = await axios.get(url);
            
            // Agar data mila toh return karo
            if (data) return data;
        } catch (e) {
            // 404 aaya toh ignore karo, next path try karo
            continue;
        }
    }
    return null; // Sab fail ho gaye
};

// --- 3. GET VIDEO LINK ---
const getLinkFromApi = async (episodeId) => {
    // Ye endpoints try karega baari-baari
    const potentialRoutes = [
        '/hianime/watch',          // Common
        '/anime/episode-srcs',     // Standard
        '/anime/hianime/watch',    // Consumet
        '/watch'                   // Simple
    ];

    const data = await fetchFromApi(potentialRoutes, 'episodeId', episodeId);

    if (data && data.sources && data.sources.length > 0) {
        const source = data.sources.find(s => s.quality === 'auto') || 
                       data.sources.find(s => s.quality === 'default') || 
                       data.sources[0];
        return source.url; 
    }
    return null;
};

// --- 4. GET EPISODE LIST ---
const getEpisodesFromApi = async (animeId) => {
    // Ye endpoints try karega
    const potentialRoutes = [
        '/hianime/info',           // Common
        '/anime/info',             // Standard
        '/anime/hianime/info',     // Consumet
        '/info'                    // Simple
    ];

    const data = await fetchFromApi(potentialRoutes, 'id', animeId);

    if (!data) return [];

    // Data kahan chupa hai dhoondo
    if (data.episodes) return data.episodes;
    if (data.anime && data.anime.episodes) return data.anime.episodes;
    if (data.data && data.data.episodes) return data.data.episodes;

    return [];
};

// --- 5. MAIN CONTROLLER ---
const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    try {
        const Episode = mongoose.model('Episode');
        const Series = mongoose.model('Series');

        console.log(`🚀 Starting Sync (Smart Mode): ${animeName}`);

        // ID Extraction
        let animeId = "";
        try {
            const urlObj = new URL(mainUrl);
            const pathSegments = urlObj.pathname.split('/').filter(Boolean);
            if (pathSegments.includes('watch')) {
                animeId = pathSegments[pathSegments.indexOf('watch') + 1];
            } else {
                animeId = pathSegments[pathSegments.length - 1];
            }
            if (animeId.includes('?')) animeId = animeId.split('?')[0];
        } catch (e) {
            console.error("❌ Invalid URL");
            return;
        }

        console.log(`ℹ️ Extracted ID: ${animeId}`);

        // Series Create
        let series = await Series.findOne({ title: new RegExp(`^${animeName}`, 'i') });
        if (!series) {
            series = await Series.create({ 
                title: `${animeName} (${languageTag})`, 
                sourceUrl: mainUrl, 
                language: languageTag 
            });
        }

        // Get Episodes
        const episodes = await getEpisodesFromApi(animeId);
        console.log(`🔍 Found ${episodes.length} episodes via API.`);

        if (episodes.length === 0) {
            console.log("⚠️ 0 Episodes found. Sab paths try kiye par 404 mila. (Check ID or API status)");
            return;
        }

        // Processing
        for (let ep of episodes) {
            try {
                const epNum = ep.number; 
                
                const existing = await Episode.findOne({ seriesId: series._id, episodeNumber: epNum });
                if (existing && existing.status === 'completed') {
                    console.log(`⏭️ Skipping Ep ${epNum} (Already Live)`);
                    continue;
                }

                // Get Link
                const directLink = await getLinkFromApi(ep.episodeId);
                
                if (directLink) {
                    console.log(`📡 Sending Ep ${epNum} to DoodStream...`);
                    const fileCode = await addRemoteUpload(directLink);

                    if (fileCode) {
                        await Episode.findOneAndUpdate(
                            { seriesId: series._id, episodeNumber: epNum },
                            { 
                                remoteId: fileCode,
                                downloadLink: `https://dood.li/d/${fileCode}`,
                                status: 'processing', 
                                title: ep.title 
                            },
                            { upsert: true }
                        );
                        console.log(`✅ Ep ${epNum} Queued! Code: ${fileCode}`);
                    } else {
                        console.log(`❌ DoodStream Failed Ep ${epNum}`);
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
