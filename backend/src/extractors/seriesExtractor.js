const axios = require('axios');
const mongoose = require('mongoose');

// --- CONFIGURATION ---
// Apna Current API URL yahan daalo
const API_BASE_URL = "https://hianimeapi-1vww.onrender.com"; 

// Helper: Delay to prevent rate limits
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- 1. DOODSTREAM UPLOAD ---
const addRemoteUpload = async (videoUrl) => {
    const key = process.env.DOODSTREAM_KEY;
    if (!key) {
        console.error("❌ DoodStream API Key Missing!");
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

// --- 2. SMART FETCH HELPER (The Magic Logic) ---
// Ye function alag-alag URL patterns try karta hai jab tak data na mile
const fetchWithFallbacks = async (urlBuilders, id) => {
    for (const builder of urlBuilders) {
        try {
            const url = builder(id);
            // console.log(`👉 Probing: ${url}`); // Debugging line
            
            const { data } = await axios.get(url);
            
            // Validate Data
            if (data) return data;
        } catch (e) {
            // 404 aaya toh ignore karo aur next pattern try karo
            continue;
        }
    }
    return null; // Sab fail
};

// --- 3. GET VIDEO LINK (Supports All API Versions) ---
const getLinkFromApi = async (episodeId) => {
    // List of all known route patterns
    const routes = [
        (id) => `${API_BASE_URL}/anime/episode-srcs?id=${id}`,          // Standard HiAnime
        (id) => `${API_BASE_URL}/hianime/watch?episodeId=${id}`,         // Consumet Query
        (id) => `${API_BASE_URL}/anime/hianime/watch/${id}`,             // Consumet Path
        (id) => `${API_BASE_URL}/api/v2/hianime/episode/sources?animeEpisodeId=${id}` // Ryanwtf88/New
    ];

    const data = await fetchWithFallbacks(routes, episodeId);

    // Extract Link logic (handles 'data.data' wrapper used by some APIs)
    let sources = [];
    if (data && data.sources) sources = data.sources;
    else if (data && data.data && data.data.sources) sources = data.data.sources;

    if (sources.length > 0) {
        const source = sources.find(s => s.quality === 'auto') || 
                       sources.find(s => s.quality === 'default') || 
                       sources[0];
        return source.url; 
    }
    return null;
};

// --- 4. GET EPISODE LIST (Supports All API Versions) ---
const getEpisodesFromApi = async (animeId) => {
    // List of all known route patterns
    const routes = [
        (id) => `${API_BASE_URL}/anime/info?id=${id}`,            // Standard HiAnime
        (id) => `${API_BASE_URL}/hianime/info?id=${id}`,          // Consumet Query
        (id) => `${API_BASE_URL}/anime/hianime/info/${id}`,       // Consumet Path
        (id) => `${API_BASE_URL}/api/v2/hianime/anime?id=${id}`   // Ryanwtf88/New
    ];

    console.log(`📡 Scanning API for ID: ${animeId}`);
    const data = await fetchWithFallbacks(routes, animeId);

    if (!data) {
        console.log(`❌ Failed to fetch info. (Checked 4 different API routes)`);
        return [];
    }

    // Extract Episodes logic (handles different JSON structures)
    if (data.episodes) return data.episodes;
    if (data.data && data.data.episodes) return data.data.episodes; // For v2/v1 APIs
    if (data.anime && data.anime.episodes) return data.anime.episodes;

    return [];
};

// --- 5. MAIN CONTROLLER ---
const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    try {
        const Episode = mongoose.model('Episode');
        const Series = mongoose.model('Series');

        console.log(`🚀 Starting Sync (Smart Mode): ${animeName}`);

        // --- ID EXTRACTION ---
        let animeId = "";
        try {
            const urlObj = new URL(mainUrl);
            const pathSegments = urlObj.pathname.split('/').filter(Boolean);
            
            // Handle /watch/ URLs
            if (pathSegments.includes('watch')) {
                animeId = pathSegments[pathSegments.indexOf('watch') + 1];
            } else {
                animeId = pathSegments[pathSegments.length - 1];
            }
            
            // Remove Query Params
            if (animeId.includes('?')) animeId = animeId.split('?')[0];

        } catch (e) {
            console.error("❌ Invalid URL Format");
            return;
        }

        console.log(`ℹ️ Extracted ID: ${animeId}`);

        if (!animeId) {
            console.error("❌ Could not parse ID.");
            return;
        }

        // 1. Check/Create Series
        let series = await Series.findOne({ title: new RegExp(`^${animeName}`, 'i') });
        if (!series) {
            series = await Series.create({ 
                title: `${animeName} (${languageTag})`, 
                sourceUrl: mainUrl, 
                language: languageTag 
            });
        }

        // 2. Get Episodes
        const episodes = await getEpisodesFromApi(animeId);
        console.log(`🔍 Found ${episodes.length} episodes via API.`);

        if (episodes.length === 0) {
            console.log("⚠️ 0 Episodes found. Check Logs.");
            return;
        }

        // 3. Process Episodes
        for (let ep of episodes) {
            try {
                const epNum = ep.number; 
                
                // Check Database
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
                        // SAVE BOTH STREAM & DOWNLOAD LINKS
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
            
            await sleep(2000); // Polite delay
        }
        console.log(`🏁 Sync Finished for ${animeName}`);

    } catch (err) {
        console.error(`💥 GLOBAL CRASH: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
