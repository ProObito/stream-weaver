const axios = require('axios');
const mongoose = require('mongoose');

// --- CONFIGURATION ---
const API_BASE_URL = "https://hianime-api-seven-teal.vercel.app"; 

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

// --- 2. BRUTE-FORCE FETCH HELPER ---
const fetchWithFallbacks = async (urlBuilders, id) => {
    for (const builder of urlBuilders) {
        try {
            const url = builder(id);
            // console.log(`👉 Checking: ${url}`); // Debugging
            
            const { data } = await axios.get(url);
            
            // Agar data mila, toh yahi sahi route hai!
            if (data) {
                console.log(`✅ Success on route: ${url}`);
                return data;
            }
        } catch (e) {
            // 404 ignore karo, agla route try karo
            continue;
        }
    }
    return null; // Sab fail
};

// --- 3. GET VIDEO LINK (Try ALL Patterns) ---
const getLinkFromApi = async (episodeId) => {
    const routes = [
        // Ryanwtf88 / Zxyu Patterns
        (id) => `${API_BASE_URL}/hianime/episode/sources?animeEpisodeId=${id}&server=vidstreaming&category=sub`,
        (id) => `${API_BASE_URL}/api/v2/hianime/episode/sources?animeEpisodeId=${id}&server=vidstreaming&category=sub`,
        
        // Consumet Patterns
        (id) => `${API_BASE_URL}/anime/hianime/watch/${id}`,
        (id) => `${API_BASE_URL}/hianime/watch?episodeId=${id}`,
        
        // Standard Patterns
        (id) => `${API_BASE_URL}/anime/episode-srcs?id=${id}`
    ];

    const data = await fetchWithFallbacks(routes, episodeId);

    // Extraction Logic
    let sources = [];
    if (data?.data?.sources) sources = data.data.sources; // v2
    else if (data?.sources) sources = data.sources;       // v1

    if (sources.length > 0) {
        const source = sources.find(s => s.quality === 'auto') || 
                       sources.find(s => s.quality === 'default') || 
                       sources[0];
        return source.url; 
    }
    return null;
};

// --- 4. GET EPISODE LIST (Try ALL Patterns) ---
const getEpisodesFromApi = async (animeId) => {
    const routes = [
        // Ryanwtf88 / Zxyu Patterns
        (id) => `${API_BASE_URL}/hianime/anime/${id}`,            // Path Param
        (id) => `${API_BASE_URL}/hianime/anime?id=${id}`,          // Query Param
        (id) => `${API_BASE_URL}/api/v2/hianime/anime?id=${id}`,   // API Prefix
        
        // Consumet Patterns
        (id) => `${API_BASE_URL}/anime/hianime/info/${id}`,
        (id) => `${API_BASE_URL}/hianime/info?id=${id}`,
        
        // Standard Patterns
        (id) => `${API_BASE_URL}/anime/info?id=${id}`
    ];

    console.log(`📡 Probing API for ID: ${animeId}`);
    const data = await fetchWithFallbacks(routes, animeId);

    if (!data) {
        console.log(`❌ Failed to fetch info. (Tried 6 different routes)`);
        return [];
    }

    // Extraction Logic (Deep Search)
    if (data?.data?.episodes?.data) return data.data.episodes.data; // Deepest nesting
    if (data?.data?.episodes) return data.data.episodes;            // v2 nesting
    if (data?.episodes) return data.episodes;                       // v1 standard
    if (data?.anime?.episodes) return data.anime.episodes;          // Consumet

    return [];
};

// --- 5. MAIN CONTROLLER ---
const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    try {
        const Episode = mongoose.model('Episode');
        const Series = mongoose.model('Series');

        console.log(`🚀 Starting Sync (Brute-Force Mode): ${animeName}`);

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
        } catch (e) { return; }

        console.log(`ℹ️ Extracted ID: ${animeId}`);

        // Series Check
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
            console.log("⚠️ 0 Episodes. API active hai par structure match nahi hua.");
            return;
        }

        for (let ep of episodes) {
            try {
                const epNum = ep.number; 
                const existing = await Episode.findOne({ seriesId: series._id, episodeNumber: epNum });
                if (existing && existing.status === 'completed') {
                    console.log(`⏭️ Skipping Ep ${epNum}`);
                    continue;
                }

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
                    }
                } else {
                    console.log(`❌ No Link Ep ${epNum}`);
                }
            } catch (err) { console.error(err.message); }
            await sleep(2000); 
        }
        console.log(`🏁 Sync Finished`);

    } catch (err) {
        console.error(`💥 GLOBAL CRASH: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
