const axios = require('axios');
const mongoose = require('mongoose');

// --- CONFIGURATION ---
// Tera Working Render API (Jo Watanuki use kar raha hai)
const API_BASE_URL = "https://hianimeapi-1vww.onrender.com"; 

// Helper: Delay function to prevent rate limits
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 🚀 1. DOODSTREAM REMOTE UPLOAD
 * Video URL bhejta hai aur File Code return karta hai
 */
const addRemoteUpload = async (videoUrl) => {
    const key = process.env.DOODSTREAM_KEY;
    if (!key) throw new Error("DoodStream API Key missing in Heroku Config Vars!");

    // DoodStream Remote Upload API
    const apiUrl = `https://doodapi.com/api/upload/url?key=${key}&url=${encodeURIComponent(videoUrl)}`;
    
    try {
        const { data } = await axios.get(apiUrl);
        if (data.status === 200 && data.result && data.result.filecode) {
            return data.result.filecode; // Ye code important hai
        }
        return null;
    } catch (err) {
        console.error("DoodStream Upload Error:", err.message);
        return null;
    }
};

/**
 * 🔗 2. GET DIRECT VIDEO LINK (.m3u8)
 * Render API se Best Quality Link nikalta hai
 */
const getLinkFromApi = async (episodeId) => {
    try {
        const apiUrl = `${API_BASE_URL}/hianime/watch?episodeId=${episodeId}`;
        
        const { data } = await axios.get(apiUrl);

        if (data && data.sources && data.sources.length > 0) {
            // Priority: Auto > Default > First Available
            const source = data.sources.find(s => s.quality === 'auto') || 
                           data.sources.find(s => s.quality === 'default') || 
                           data.sources[0];
            return source.url; 
        }
        return null;

    } catch (err) {
        console.error(`❌ API Watch Error (${episodeId}):`, err.message);
        return null;
    }
};

/**
 * 📋 3. GET EPISODE LIST
 * Render API se saare episodes ki list lata hai
 */
const getEpisodesFromApi = async (animeId) => {
    try {
        const apiUrl = `${API_BASE_URL}/hianime/info?id=${animeId}`;
        console.log(`📡 Fetching Info: ${apiUrl}`);

        const { data } = await axios.get(apiUrl);
        
        // Smart Check for Episodes Array
        if (data && data.episodes) return data.episodes;
        if (data && data.anime && data.anime.episodes) return data.anime.episodes;
        
        console.log("⚠️ API Response valid but 'episodes' key missing.", Object.keys(data || {}));
        return [];

    } catch (err) {
        console.error(`❌ Episode List Error (${animeId}):`, err.message);
        return [];
    }
};

/**
 * 🎮 4. MAIN CONTROLLER
 * Ye function Admin Panel se call hota hai
 */
const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    try {
        const Episode = mongoose.model('Episode');
        const Series = mongoose.model('Series');

        console.log(`🚀 Starting Sync via Render API: ${animeName}`);

        // --- ID EXTRACTION LOGIC (Robust) ---
        // https://hianime.to/one-piece-100 -> one-piece-100
        // https://hianime.to/watch/one-piece-100?ep=123 -> one-piece-100
        let animeId = "";
        try {
            const urlObj = new URL(mainUrl);
            const pathSegments = urlObj.pathname.split('/').filter(Boolean);
            
            if (pathSegments.includes('watch')) {
                // watch ke baad wala segment ID hota hai
                animeId = pathSegments[pathSegments.indexOf('watch') + 1];
            } else {
                // Last segment ID hota hai
                animeId = pathSegments[pathSegments.length - 1];
            }
            
            // Clean ID (remove query params)
            if (animeId.includes('?')) animeId = animeId.split('?')[0];

        } catch (e) {
            console.error("❌ Invalid URL Format");
            return;
        }

        console.log(`ℹ️ Extracted ID: ${animeId}`);

        if (!animeId) {
            console.error("❌ Could not extract Anime ID from URL.");
            return;
        }

        // 1. Series Check/Create (Database)
        let series = await Series.findOne({ title: new RegExp(`^${animeName}`, 'i') });
        if (!series) {
            series = await Series.create({ 
                title: `${animeName} (${languageTag})`, 
                sourceUrl: mainUrl, 
                language: languageTag 
            });
        }

        // 2. Get Episodes from API
        const episodes = await getEpisodesFromApi(animeId);
        console.log(`🔍 Found ${episodes.length} episodes via API.`);

        if (episodes.length === 0) {
            console.log("⚠️ No episodes found. Render API might be waking up (Cold Start). Try again in 1 min.");
            return;
        }

        // 3. Loop through episodes
        for (let ep of episodes) {
            try {
                const epNum = ep.number; 

                // Check DB if already exists
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
                        // STEP C: Save to Database (Stream + Download)
                        await Episode.findOneAndUpdate(
                            { seriesId: series._id, episodeNumber: epNum },
                            { 
                                remoteId: fileCode, // Streaming ke liye
                                downloadLink: `https://dood.li/d/${fileCode}`, // Download ke liye
                                status: 'processing', // Processing = Background downloading
                                title: ep.title || `Episode ${epNum}`
                            },
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
            
            // 2 Second delay (Politeness)
            await sleep(2000); 
        }
        console.log(`🏁 Sync Finished for ${animeName}`);

    } catch (err) {
        console.error(`💥 GLOBAL CRASH: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
