const axios = require('axios');
const mongoose = require('mongoose');

// --- CONFIGURATION ---
// Tera Naya Deployed API URL
const API_BASE_URL = "https://hianime-api-seven-teal.vercel.app"; 

// Helper: Delay to be polite
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 🚀 1. DOODSTREAM REMOTE UPLOAD
 */
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

/**
 * 🔗 2. GET VIDEO LINK (Specific for Your New API)
 * Route: /hianime/episode/sources?animeEpisodeId={id}
 */
const getLinkFromApi = async (episodeId) => {
    try {
        const url = `${API_BASE_URL}/hianime/episode/sources?animeEpisodeId=${episodeId}&server=vidstreaming&category=sub`;
        
        const { data } = await axios.get(url);

        // Response Parse Logic
        let sources = [];
        if (data.data && data.data.sources) sources = data.data.sources; // Most likely structure
        else if (data.sources) sources = data.sources;

        if (sources.length > 0) {
            // Priority: Auto > Default > First
            const source = sources.find(s => s.quality === 'auto') || 
                           sources.find(s => s.quality === 'default') || 
                           sources[0];
            return source.url; 
        }
        return null;

    } catch (err) {
        console.error(`❌ Link Error (${episodeId}):`, err.message);
        return null;
    }
};

/**
 * 📋 3. GET EPISODE LIST (Specific for Your New API)
 * Route: /hianime/anime?id={id}
 */
const getEpisodesFromApi = async (animeId) => {
    try {
        const url = `${API_BASE_URL}/hianime/anime?id=${animeId}`;
        console.log(`📡 Fetching Info: ${url}`);

        const { data } = await axios.get(url);
        
        // Deep Parsing for Ryan's API Structure
        // Structure: { status: 200, data: { episodes: { data: [...] } } }
        if (data?.data?.episodes?.data) return data.data.episodes.data;
        if (data?.data?.episodes) return data.data.episodes;
        if (data?.episodes) return data.episodes;

        console.log("⚠️ API Response OK but episodes missing.", Object.keys(data?.data || {}));
        return [];

    } catch (err) {
        console.error(`❌ List Error (${animeId}):`, err.message);
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

        console.log(`🚀 Starting Sync (Custom API): ${animeName}`);

        // --- ID EXTRACTION ---
        let animeId = "";
        try {
            const urlObj = new URL(mainUrl);
            const pathSegments = urlObj.pathname.split('/').filter(Boolean);
            
            if (pathSegments.includes('watch')) {
                // url: .../watch/one-piece-100?ep=123
                // ID should be just 'one-piece-100' for the INFO call
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
        const episodes = await getEpisodesFromApi(animeId);
        console.log(`🔍 Found ${episodes.length} episodes via API.`);

        if (episodes.length === 0) {
            console.log("⚠️ 0 Episodes. Check ID or API logs.");
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
                        // SAVE STREAM & DOWNLOAD LINKS
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
            
            await sleep(2000); // 2 Sec Delay
        }
        console.log(`🏁 Sync Finished for ${animeName}`);

    } catch (err) {
        console.error(`💥 GLOBAL CRASH: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
