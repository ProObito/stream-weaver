
const axios = require('axios');
const mongoose = require('mongoose');

// ==========================================
// ⚙️ SYSTEM CONFIGURATION
// ==========================================
const API_BASE_URL = "https://hianime-api-seven-teal.vercel.app"; 
const MIN_YEAR = 2010;             
const MAX_PAGES_PER_LETTER = 20;   
const RETRY_LIMIT = 3;             
const DELAY_BETWEEN_EPS = 2000;    
const DELAY_BETWEEN_ANIMES = 4000; 

// Crawl Order: 0-9 then A-Z
const SEARCH_KEYWORDS = "0123456789abcdefghijklmnopqrstuvwxyz".split(""); 

// 🔒 GLOBAL LOCK
let isCrawling = false;
// 🛣️ DYNAMIC ENDPOINT STORAGE
let WORKING_SEARCH_ENDPOINT = null;

// ==========================================
// 🛠️ DATA NORMALIZER & HELPERS
// ==========================================

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Robust Data Normalizer
function normalizeData(data, type) {
    if (!data) return null;

    if (type === 'list') { 
        // Ryanwtf88 / Consumet / Zxyu variations
        if (data.data?.animes) return data.data.animes;
        if (data.data?.results) return data.data.results;
        if (data.animes) return data.animes;
        if (data.results) return data.results;
        if (Array.isArray(data)) return data; // Sometimes direct array
    }
    if (type === 'info') { 
        if (data.data?.anime) return data.data.anime;
        if (data.anime) return data.anime;
        if (data.data?.info) return data.data.info;
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

// ==========================================
// 🔍 SMART API DIAGNOSTICS
// ==========================================

const determineSearchEndpoint = async () => {
    const candidates = [
        "/hianime/search",       // Standard
        "/anime/search",         // Consumet
        "/search",               // Root
        "/api/v2/hianime/search" // Versioned
    ];

    console.log("🔍 Diagnosing Search API...");

    for (const path of candidates) {
        try {
            // Test with a common query like "naruto"
            const url = `${API_BASE_URL}${path}?q=naruto&page=1`;
            // console.log(`👉 Testing: ${url}`);
            const { data } = await axios.get(url);
            
            const list = normalizeData(data, 'list');
            if (list && list.length > 0) {
                console.log(`✅ WORKING ENDPOINT FOUND: ${path}`);
                return path;
            }
        } catch (e) {
            // console.log(`❌ Failed: ${path} (${e.response?.status || e.message})`);
        }
    }
    return null;
};

// ==========================================
// 🌐 API FETCHING FUNCTIONS
// ==========================================

// 1. Search Anime (Using the detected endpoint)
const searchAnime = async (keyword, page) => {
    if (!WORKING_SEARCH_ENDPOINT) return [];
    
    const url = `${API_BASE_URL}${WORKING_SEARCH_ENDPOINT}?q=${keyword}&page=${page}`;
    try {
        console.log(`\n📑 [SEARCH: '${keyword.toUpperCase()}'] Fetching Page ${page}...`);
        const { data } = await axios.get(url);
        return normalizeData(data, 'list') || [];
    } catch (e) {
        if (e.response?.status === 404) {
            // End of pagination likely
            return [];
        }
        console.error(`❌ Search Error: ${e.message}`);
        return []; 
    }
};

// 2. Get Details
const getAnimeDetails = async (animeId) => {
    const url = `${API_BASE_URL}/hianime/anime/${animeId}`;
    try {
        const { data } = await axios.get(url);
        return normalizeData(data, 'info');
    } catch (e) { return null; }
};

// 3. Get Episodes
const getEpisodesFromApi = async (animeId) => {
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

// 4. Get Streaming Link
const getLinkFromApi = async (episodeId) => {
    const url = `${API_BASE_URL}/hianime/episode/sources?animeEpisodeId=${episodeId}&server=vidstreaming&category=sub`;
    try {
        const { data } = await axios.get(url);
        const sources = normalizeData(data, 'sources');
        if (sources?.length > 0) {
            const source = sources.find(s => s.quality === 'auto') || 
                           sources.find(s => s.quality === '1080p') || 
                           sources.find(s => s.quality === 'default') || 
                           sources[0];
            return source.url;
        }
    } catch (e) { return null; }
    return null;
};

// 5. Upload to DoodStream
const addRemoteUpload = async (videoUrl) => {
    const key = process.env.DOODSTREAM_KEY;
    if (!key) return null;
    const apiUrl = `https://doodapi.com/api/upload/url?key=${key}&url=${encodeURIComponent(videoUrl)}`;
    
    for (let i = 0; i < RETRY_LIMIT; i++) {
        try {
            const { data } = await axios.get(apiUrl);
            if (data.status === 200 && data.result && data.result.filecode) {
                return data.result.filecode;
            }
            await sleep(1000); 
        } catch (e) {}
    }
    return null;
};

// ==========================================
// ⚙️ CORE PROCESSING
// ==========================================

const syncSingleSeason = async (id, title) => {
    const Episode = mongoose.model('Episode');
    const Series = mongoose.model('Series');

    console.log(`🎬 [SYNC] ${title} (ID: ${id})`);

    let series = await Series.findOne({ title: new RegExp(`^${title}`, 'i') });
    if (!series) {
        series = await Series.create({ 
            title: title, 
            sourceUrl: `https://hianime.to/${id}`, 
            language: "Sub" 
        });
        console.log(`🆕 Series Created: ${title}`);
    }

    const episodes = await getEpisodesFromApi(id);
    if (!episodes || episodes.length === 0) return;

    for (let ep of episodes) {
        try {
            const epNum = ep.number || ep.num;
            const existing = await Episode.findOne({ seriesId: series._id, episodeNumber: epNum });
            
            if (existing && existing.status === 'completed') continue;

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
                    console.log(`✅ Ep ${epNum} Queued`);
                }
            }
            await sleep(1500); 
        } catch (err) { }
    }
};

const processAnimeFilter = async (anime) => {
    const id = anime.id;
    const title = anime.name || anime.title;

    const info = await getAnimeDetails(id);
    if (!info) return;

    const year = extractYear(info);
    if (year > 0 && year < MIN_YEAR) {
        console.log(`🛑 [SKIP] Old Anime: ${title} (${year})`);
        return;
    }

    console.log(`🟢 [PASS] ${title} (${year || 'Unknown'})`);

    if (info.seasons && info.seasons.length > 0) {
        for (let season of info.seasons) {
            await syncSingleSeason(season.id, season.name || season.title);
            await sleep(3000);
        }
    } else {
        await syncSingleSeason(id, title);
    }
};

// ==========================================
// 🚀 MAIN EXECUTION
// ==========================================
const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    // 🔒 LOCK SYSTEM
    if (isCrawling) {
        console.log("⚠️ CRAWLER IS BUSY! Request ignored.");
        return;
    }
    isCrawling = true; 

    try {
        console.log(`\n🚀 INITIALIZING A-Z ARCHIVE CRAWLER...`);
        console.log(`📅 Filter: Year >= ${MIN_YEAR}`);

        // STEP 1: FIND WORKING ENDPOINT
        WORKING_SEARCH_ENDPOINT = await determineSearchEndpoint();
        
        if (!WORKING_SEARCH_ENDPOINT) {
            console.error("❌ CRITICAL: No working Search API found. Check URL configuration.");
            isCrawling = false;
            return;
        }

        // STEP 2: START LOOP
        for (const letter of SEARCH_KEYWORDS) {
            console.log(`\n🔠 STARTING LETTER: ${letter.toUpperCase()}`);

            for (let page = 1; page <= MAX_PAGES_PER_LETTER; page++) {
                
                const animeList = await searchAnime(letter, page);
                
                if (!animeList || animeList.length === 0) {
                    console.log(`⚠️ End of letter '${letter}'. Next...`);
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
        isCrawling = false; 
        console.log("🔓 Crawler Lock Released.");
    }
};

module.exports = { extractAndUpload };
