const axios = require('axios');
const mongoose = require('mongoose');

// ==========================================
// ⚙️ SYSTEM CONFIGURATION
// ==========================================
// User provided API URL
const API_BASE_URL = "https://hianime-api-seven-teal.vercel.app"; 

const MIN_YEAR = 2010;             // 2010 se purane anime SKIP honge
const MAX_PAGES_PER_LETTER = 10;   // Har letter (A, B...) ke liye kitne pages deep jana hai
const RETRY_LIMIT = 3;             // Upload fail hone par kitni baar try kare
const DELAY_BETWEEN_EPS = 2000;    // 2 Seconds wait between episodes
const DELAY_BETWEEN_ANIMES = 4000; // 4 Seconds wait between animes

// Crawl Order: a-z aur 0-9 sab search karega
const SEARCH_KEYWORDS = "abcdefghijklmnopqrstuvwxyz0123456789".split(""); 

// 🔒 GLOBAL LOCK (Taaki multiple clicks se server crash na ho)
let isCrawling = false;

// ==========================================
// 🛠️ DATA NORMALIZER & HELPERS
// ==========================================

// Sleep function to prevent rate limits
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Extract Year from metadata string (e.g., "Apr 2016")
const extractYear = (info) => {
    try {
        let yearString = "";
        if (info.moreInfo && info.moreInfo.aired) yearString = info.moreInfo.aired;
        else if (info.anime?.info?.stats?.aired) yearString = info.anime.info.stats.aired;

        const match = yearString.match(/\d{4}/);
        if (match) return parseInt(match[0]);
    } catch (e) {}
    return 0;
};

// Handle different API response structures
function normalizeData(data, type) {
    if (!data) return null;

    if (type === 'list') { 
        if (data.data?.animes) return data.data.animes;
        if (data.animes) return data.animes;
        if (data.results) return data.results;
    }
    if (type === 'info') { 
        if (data.data?.anime) return data.data.anime;
        if (data.anime) return data.anime;
    }
    if (type === 'episodes') {
        if (data.data?.episodes) return data.data.episodes;
        if (data.episodes) return data.episodes;
        if (data.data?.episodes?.data) return data.data.episodes.data;
    }
    if (type === 'sources') {
        if (data.data?.sources) return data.data.sources;
        if (data.sources) return data.sources;
    }
    return null;
}

// ==========================================
// 🌐 API FETCHING FUNCTIONS
// ==========================================

// 1. Search Anime (List Replacement)
const searchAnime = async (keyword, page) => {
    // Search endpoint usually always works
    const url = `${API_BASE_URL}/hianime/search?q=${keyword}&page=${page}`;
    try {
        console.log(`\n📑 [SEARCH: '${keyword.toUpperCase()}'] Fetching Page ${page}...`);
        const { data } = await axios.get(url);
        return normalizeData(data, 'list') || [];
    } catch (e) {
        // 404 means page doesn't exist (end of list)
        return []; 
    }
};

// 2. Get Anime Details (For Year & Seasons Check)
const getAnimeDetails = async (animeId) => {
    const url = `${API_BASE_URL}/hianime/anime/${animeId}`;
    try {
        const { data } = await axios.get(url);
        return normalizeData(data, 'info');
    } catch (e) { return null; }
};

// 3. Get Episodes List
const getEpisodesFromApi = async (animeId) => {
    // Try multiple endpoints to be safe
    const routes = [
        `${API_BASE_URL}/hianime/anime/episodes/${animeId}`,
        `${API_BASE_URL}/hianime/episodes/${animeId}`
    ];
    for (const url of routes) {
        try {
            const { data } = await axios.get(url);
            const eps = normalizeData(data, 'episodes');
            if (eps && eps.length > 0) return eps;
        } catch(e) {}
    }
    return [];
};

// 4. Get Streaming Link (Source Extraction)
const getLinkFromApi = async (episodeId) => {
    const url = `${API_BASE_URL}/hianime/episode/sources?animeEpisodeId=${episodeId}&server=vidstreaming&category=sub`;
    try {
        const { data } = await axios.get(url);
        const sources = normalizeData(data, 'sources');
        if (sources?.length > 0) {
            // Priority: Auto > 1080p > Default > First available
            const source = sources.find(s => s.quality === 'auto') || 
                           sources.find(s => s.quality === '1080p') || 
                           sources.find(s => s.quality === 'default') || 
                           sources[0];
            return source.url;
        }
    } catch (e) { return null; }
    return null;
};

// 5. Upload to DoodStream (With Retry Logic)
const addRemoteUpload = async (videoUrl) => {
    const key = process.env.DOODSTREAM_KEY;
    if (!key) {
        console.error("❌ DoodStream API Key Missing!");
        return null;
    }
    const apiUrl = `https://doodapi.com/api/upload/url?key=${key}&url=${encodeURIComponent(videoUrl)}`;
    
    for (let i = 0; i < RETRY_LIMIT; i++) {
        try {
            const { data } = await axios.get(apiUrl);
            if (data.status === 200 && data.result && data.result.filecode) {
                return data.result.filecode;
            }
            // Wait 1 sec before retry
            await sleep(1000); 
        } catch (e) {
            // Retry silently
        }
    }
    return null;
};

// ==========================================
// ⚙️ CORE LOGIC (Process Single Season)
// ==========================================
const syncSingleSeason = async (id, title) => {
    const Episode = mongoose.model('Episode');
    const Series = mongoose.model('Series');

    console.log(`🎬 [SYNC START] ${title} (ID: ${id})`);

    // 1. Create or Find Series
    let series = await Series.findOne({ title: new RegExp(`^${title}`, 'i') });
    if (!series) {
        series = await Series.create({ 
            title: title, 
            sourceUrl: `https://hianime.to/${id}`, 
            language: "Sub" 
        });
        console.log(`🆕 Series Created: ${title}`);
    }

    // 2. Fetch Episodes
    const episodes = await getEpisodesFromApi(id);
    if (!episodes || episodes.length === 0) {
        console.log(`⚠️ No episodes found for ${title}. Skipping.`);
        return;
    }

    // 3. Process Episodes
    for (let ep of episodes) {
        try {
            const epNum = ep.number || ep.num;
            
            // Check if already exists
            const existing = await Episode.findOne({ seriesId: series._id, episodeNumber: epNum });
            if (existing && existing.status === 'completed') {
                continue; // Skip silently
            }

            // Fetch Direct Link
            const targetId = ep.episodeId || ep.id;
            const directLink = await getLinkFromApi(targetId);
            
            if (directLink) {
                // Upload to DoodStream
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
                    console.log(`✅ Ep ${epNum} Queued (Code: ${fileCode})`);
                }
            } else {
                console.log(`❌ No link for Ep ${epNum}`);
            }
            await sleep(DELAY_BETWEEN_EPS); // Polite delay
        } catch (err) { }
    }
    console.log(`✅ Season Done: ${title}`);
};

// ==========================================
// ⚙️ FILTER & TREE LOGIC
// ==========================================
const processAnimeFilter = async (anime) => {
    const id = anime.id;
    const title = anime.name || anime.title;

    // 1. Fetch Details (for Year check)
    const info = await getAnimeDetails(id);
    if (!info) return;

    // 2. Year Filter
    const year = extractYear(info);
    if (year > 0 && year < MIN_YEAR) {
        console.log(`🛑 [SKIP] Old Anime: ${title} (${year})`);
        return;
    }

    console.log(`🟢 [PASS] ${title} (${year || 'Unknown'})`);

    // 3. Seasons Check (Chronological Order)
    if (info.seasons && info.seasons.length > 0) {
        console.log(`📚 Found ${info.seasons.length} seasons.`);
        for (let season of info.seasons) {
            await syncSingleSeason(season.id, season.name || season.title);
            await sleep(3000);
        }
    } else {
        await syncSingleSeason(id, title);
    }
};

// ==========================================
// 🚀 MAIN EXECUTION (ENTRY POINT)
// ==========================================
const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    // 🔒 LOCK CHECK
    if (isCrawling) {
        console.log("⚠️ CRAWLER IS BUSY! Request ignored.");
        return;
    }
    isCrawling = true; // Lock

    try {
        console.log(`\n🚀 INITIALIZING A-Z ARCHIVE CRAWLER...`);
        console.log(`🎯 Strategy: Search A-Z (Pages 1-${MAX_PAGES_PER_LETTER})`);
        console.log(`📅 Filter: Year >= ${MIN_YEAR}`);

        // Loop through A-Z and 0-9
        for (const letter of SEARCH_KEYWORDS) {
            console.log(`\n🔠 STARTING LETTER: ${letter.toUpperCase()}`);

            for (let page = 1; page <= MAX_PAGES_PER_LETTER; page++) {
                
                // Fetch Search Results
                const animeList = await searchAnime(letter, page);
                
                if (!animeList || animeList.length === 0) {
                    console.log(`⚠️ No more data for letter '${letter}' at page ${page}. Moving to next letter.`);
                    break; 
                }

                console.log(`📦 Letter '${letter}' Page ${page}: Found ${animeList.length} Animes.`);

                for (let anime of animeList) {
                    await processAnimeFilter(anime);
                    await sleep(DELAY_BETWEEN_ANIMES); 
                }
            }
        }
        
        console.log("\n🎉 ARCHIVE SYNC COMPLETE!");

    } catch (err) {
        console.error(`💥 CRASH: ${err.message}`);
    } finally {
        isCrawling = false; // Release Lock
        console.log("🔓 Crawler Lock Released.");
    }
};

module.exports = { extractAndUpload };
