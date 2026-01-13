const axios = require('axios');
const mongoose = require('mongoose');

// --- CONFIGURATION ---
const API_BASE_URL = "https://hianime-api-seven-teal.vercel.app"; 

// Helper: Delay to prevent rate limits
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 🛠️ DATA NORMALIZER
 * API ke alag-alag JSON structures ko ek standard format mein convert karta hai.
 */
function normalizeData(data, type) {
    if (!data) return null;

    if (type === 'episodes') {
        // Case 1: hianime-api format (Flat: res.episodes)
        if (data.episodes && Array.isArray(data.episodes)) return data.episodes;
        
        // Case 2: Standard/Nested format (res.data.episodes)
        if (data.data?.episodes?.data) return data.data.episodes.data;
        if (data.data?.episodes) return data.data.episodes;
        
        // Case 3: Consumet/Other formats
        if (data.anime?.episodes) return data.anime.episodes;
    }

    if (type === 'sources') {
        // Case 1: Flat format (res.sources)
        if (data.sources && Array.isArray(data.sources)) return data.sources;
        
        // Case 2: Nested format (res.data.sources)
        if (data.data?.sources) return data.data.sources;
    }

    return null;
}

/**
 * 🚀 1. DOODSTREAM REMOTE UPLOAD
 * Video URL bhejta hai aur DoodStream se file_code leta hai.
 */
const addRemoteUpload = async (videoUrl) => {
    const key = process.env.DOODSTREAM_KEY;
    if (!key) {
        console.error("❌ DoodStream Key Missing in Config!");
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
        console.error("DoodStream Upload Error:", err.message);
        return null;
    }
};

/**
 * 🔗 2. GET DIRECT VIDEO LINK
 * Multiple routes try karta hai aur response ko normalize karta hai.
 */
const getLinkFromApi = async (episodeId) => {
    const routes = [
        (id) => `${API_BASE_URL}/hianime/episode/sources?animeEpisodeId=${id}&server=vidstreaming&category=sub`,
        (id) => `${API_BASE_URL}/api/v2/hianime/episode/sources?animeEpisodeId=${id}`,
        (id) => `${API_BASE_URL}/anime/episode-srcs?id=${id}`
    ];

    for (const builder of routes) {
        try {
            const { data: rawResponse } = await axios.get(builder(episodeId));
            const sources = normalizeData(rawResponse, 'sources');

            if (sources && sources.length > 0) {
                // Priority: auto > default > first
                const source = sources.find(s => s.quality === 'auto') || 
                               sources.find(s => s.quality === 'default') || 
                               sources[0];
                return source.url;
            }
        } catch (e) { continue; }
    }
    return null;
};

/**
 * 📋 3. GET EPISODE LIST
 * Sabse pehle info fetch karta hai aur episodes array nikalta hai.
 */
const getEpisodesFromApi = async (animeId) => {
    const routes = [
        (id) => `${API_BASE_URL}/hianime/anime/${id}`,
        (id) => `${API_BASE_URL}/hianime/anime?id=${id}`,
        (id) => `${API_BASE_URL}/api/v2/hianime/anime?id=${id}`
    ];

    console.log(`📡 Probing API for Anime ID: ${animeId}`);

    for (const builder of routes) {
        try {
            const { data: rawResponse } = await axios.get(builder(animeId));
            const episodes = normalizeData(rawResponse, 'episodes');

            if (episodes && episodes.length > 0) {
                console.log(`✅ Success! Found ${episodes.length} episodes on route: ${builder(animeId)}`);
                return episodes;
            }
        } catch (e) { continue; }
    }
    return [];
};

/**
 * 🎮 4. MAIN CONTROLLER
 * Admin panel se call hota hai poora process start karne ke liye.
 */
const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    try {
        const Episode = mongoose.model('Episode');
        const Series = mongoose.model('Series');

        console.log(`🚀 Starting Global Sync: ${animeName}`);

        // --- ID EXTRACTION ---
        let animeId = mainUrl.split('/').pop().split('?')[0];
        if (mainUrl.includes('/watch/')) {
            animeId = mainUrl.split('/watch/')[1].split('?')[0];
        }

        console.log(`ℹ️ Normalized Anime ID: ${animeId}`);

        // 1. Database mein Series check/create
        let series = await Series.findOne({ title: new RegExp(`^${animeName}`, 'i') });
        if (!series) {
            series = await Series.create({ 
                title: `${animeName} (${languageTag})`, 
                sourceUrl: mainUrl, 
                language: languageTag 
            });
        }

        // 2. Fetch episodes list from API
        const episodes = await getEpisodesFromApi(animeId);

        if (!episodes || episodes.length === 0) {
            console.log("⚠️ API active hai par structure match nahi hua ya ID galat hai.");
            return;
        }

        // 3. Process each episode
        for (let ep of episodes) {
            try {
                // 'number' ya 'num' handle karo
                const epNum = ep.number || ep.num;
                
                // Skip if already done
                const existing = await Episode.findOne({ seriesId: series._id, episodeNumber: epNum });
                if (existing && existing.status === 'completed') {
                    console.log(`⏭️ Skipping Ep ${epNum} (Already Live)`);
                    continue;
                }

                // 'episodeId' ya 'id' handle karo
                const targetId = ep.episodeId || ep.id;
                
                // A. Get direct .m3u8 link
                const directLink = await getLinkFromApi(targetId);
                
                if (directLink) {
                    // B. Send to DoodStream
                    console.log(`📡 Sending Ep ${epNum} to DoodStream...`);
                    const fileCode = await addRemoteUpload(directLink);

                    if (fileCode) {
                        // C. Update Database
                        await Episode.findOneAndUpdate(
                            { seriesId: series._id, episodeNumber: epNum },
                            { 
                                remoteId: fileCode,
                                downloadLink: `https://dood.li/d/${fileCode}`,
                                status: 'processing', 
                                title: ep.title || `Episode ${epNum}`
                            },
                            { upsert: true }
                        );
                        console.log(`✅ Ep ${epNum} Queued! Code: ${fileCode}`);
                    }
                } else {
                    console.log(`❌ No link found for Ep ${epNum}`);
                }

            } catch (err) {
                console.error(`❌ Error processing Ep: ${err.message}`);
            }
            // 2 second gap API ko block hone se bachane ke liye
            await sleep(2000); 
        }

        console.log(`🏁 Sync Finished for ${animeName}`);

    } catch (err) {
        console.error(`💥 CRITICAL GLOBAL ERROR: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
