const axios = require('axios');
const mongoose = require('mongoose');

// --- CONFIGURATION ---
const API_BASE_URL = "https://hianime-api-seven-teal.vercel.app"; 

// Helper: Delay to prevent rate limits
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 🛠️ NORMALIZER: Sabse Important Part
 * Ye function kisi bhi tarah ke API response ko Stream-Weaver ke format mein badal dega.
 */
function normalizeData(data, type) {
    if (!data) return null;

    if (type === 'episodes') {
        // Case 1: hianime-api format (Flat)
        if (data.episodes && Array.isArray(data.episodes)) return data.episodes;
        
        // Case 2: Deep nesting (data.data.episodes.data)
        if (data.data?.episodes?.data) return data.data.episodes.data;
        
        // Case 3: Standard nesting (data.data.episodes)
        if (data.data?.episodes) return data.data.episodes;
        
        // Case 4: Consumet style
        if (data.anime?.episodes) return data.anime.episodes;
    }

    if (type === 'sources') {
        // Case 1: hianime-api (Flat sources array)
        if (data.sources && Array.isArray(data.sources)) return data.sources;
        
        // Case 2: Nested (data.data.sources)
        if (data.data?.sources) return data.data.sources;
    }

    return null;
}

/**
 * 🚀 1. DOODSTREAM REMOTE UPLOAD
 */
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
        return null;
    }
};

/**
 * 🔗 2. GET VIDEO LINK (With Normalizer)
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
                const source = sources.find(s => s.quality === 'auto') || sources[0];
                return source.url;
            }
        } catch (e) { continue; }
    }
    return null;
};

/**
 * 📋 3. GET EPISODE LIST (With Normalizer)
 */
const getEpisodesFromApi = async (animeId) => {
    const routes = [
        (id) => `${API_BASE_URL}/hianime/anime/${id}`,
        (id) => `${API_BASE_URL}/hianime/anime?id=${id}`,
        (id) => `${API_BASE_URL}/api/v2/hianime/anime?id=${id}`
    ];

    console.log(`📡 Probing API with Normalizer for: ${animeId}`);

    for (const builder of routes) {
        try {
            const { data: rawResponse } = await axios.get(builder(animeId));
            const episodes = normalizeData(rawResponse, 'episodes');

            if (episodes && episodes.length > 0) {
                console.log(`✅ Success! Found ${episodes.length} episodes.`);
                return episodes;
            }
        } catch (e) { continue; }
    }
    return [];
};

/**
 * 🎮 4. MAIN CONTROLLER
 */
const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    try {
        const Episode = mongoose.model('Episode');
        const Series = mongoose.model('Series');

        // Extract ID
        let animeId = mainUrl.split('/').pop().split('?')[0];
        if (mainUrl.includes('/watch/')) {
            animeId = mainUrl.split('/watch/')[1].split('?')[0];
        }

        // DB Series check
        let series = await Series.findOne({ title: new RegExp(`^${animeName}`, 'i') });
        if (!series) {
            series = await Series.create({ 
                title: `${animeName} (${languageTag})`, 
                sourceUrl: mainUrl, 
                language: languageTag 
            });
        }

        const episodes = await getEpisodesFromApi(animeId);

        if (!episodes || episodes.length === 0) {
            console.log("⚠️ 0 Episodes. Normalizer failed to find episodes key.");
            return;
        }

        for (let ep of episodes) {
            try {
                const epNum = ep.number || ep.num;
                const existing = await Episode.findOne({ seriesId: series._id, episodeNumber: epNum });
                if (existing && existing.status === 'completed') continue;

                // Important: Kuch APIs me 'episodeId' hota hai, kuch me 'id'
                const targetId = ep.episodeId || ep.id;
                const directLink = await getLinkFromApi(targetId);
                
                if (directLink) {
                    const fileCode = await addRemoteUpload(directLink);
                    if (fileCode) {
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
                        console.log(`✅ Ep ${epNum} Queued!`);
                    }
                }
            } catch (err) { console.error("Loop Error:", err.message); }
            await sleep(2000);
        }
    } catch (err) {
        console.error("Global Error:", err.message);
    }
};

module.exports = { extractAndUpload };
