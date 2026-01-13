const axios = require('axios');
const mongoose = require('mongoose');

// --- CONFIGURATION ---
const API_BASE_URL = "https://hianimeapi-1vww.onrender.com"; 

// Helper: Delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- 1. DOODSTREAM UPLOAD ---
const addRemoteUpload = async (videoUrl) => {
    const key = process.env.DOODSTREAM_KEY;
    if (!key) return null;

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

// --- 2. SUPER SMART FETCH (Handles /id and ?id=id) ---
const fetchWithFallbacks = async (builders, id) => {
    for (const buildUrl of builders) {
        try {
            const url = buildUrl(id);
            // console.log(`👉 Trying URL: ${url}`); // Debugging check
            
            const { data } = await axios.get(url);
            if (data) return data;
        } catch (e) {
            // Ignore 404, try next format
            continue;
        }
    }
    return null;
};

// --- 3. GET VIDEO LINK ---
const getLinkFromApi = async (episodeId) => {
    // Sab tarah ke formats try karenge
    const urlBuilders = [
        (id) => `${API_BASE_URL}/anime/hianime/watch/${id}`,      // Consumet Style (Slash)
        (id) => `${API_BASE_URL}/hianime/watch?episodeId=${id}`, // Standard (Query)
        (id) => `${API_BASE_URL}/anime/episode-srcs?id=${id}`,   // Zxyu Style
        (id) => `${API_BASE_URL}/anime/hianime/watch?episodeId=${id}`
    ];

    const data = await fetchWithFallbacks(urlBuilders, episodeId);

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
    // Sab tarah ke formats try karenge
    const urlBuilders = [
        (id) => `${API_BASE_URL}/anime/hianime/info/${id}`,   // Consumet Style (Slash)
        (id) => `${API_BASE_URL}/hianime/info?id=${id}`,      // Standard (Query)
        (id) => `${API_BASE_URL}/anime/info?id=${id}`,        // Common
        (id) => `${API_BASE_URL}/info/${id}`                  // Simple
    ];

    console.log(`📡 Probing API for ID: ${animeId}`);
    const data = await fetchWithFallbacks(urlBuilders, animeId);

    if (!data) {
        console.log(`❌ Failed to fetch info for ${animeId} (Checked all route formats)`);
        return [];
    }

    // Data extraction strategy
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

        console.log(`🚀 Starting Sync (Universal Mode): ${animeName}`);

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

        // Series Check
        let series = await Series.findOne({ title: new RegExp(`^${animeName}`, 'i') });
        if (!series) {
            series = await Series.create({ title: `${animeName} (${languageTag})`, sourceUrl: mainUrl, language: languageTag });
        }

        // Get Episodes
        const episodes = await getEpisodesFromApi(animeId);
        console.log(`🔍 Found ${episodes.length} episodes via API.`);

        if (episodes.length === 0) {
            console.log("⚠️ 0 Episodes found. API ID match nahi ho raha ya API structure alag hai.");
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
