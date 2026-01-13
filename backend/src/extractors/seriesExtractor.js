const axios = require('axios');
const mongoose = require('mongoose');

// ==========================================
// ⚙️ SYSTEM CONFIGURATION
// ==========================================
const API_BASE_URL = "https://hianime-api-seven-teal.vercel.app"; 
const START_PAGE = 1;        
const MAX_PAGES = 500;       
const MIN_YEAR = 2010;       
const RETRY_LIMIT = 3;       

// 🔒 GLOBAL LOCK (To prevent multiple clicks/starts)
let isCrawling = false;

// ==========================================
// 🛠️ HELPER FUNCTIONS
// ==========================================

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
// 🌐 API FETCHING (SMART ROUTE DETECTION)
// ==========================================

// 🔍 Find Working List Endpoint
const determineListEndpoint = async () => {
    const candidates = [
        "/hianime/most-popular",  // Standard
        "/hianime/trending",      // Fallback 1
        "/hianime/popular",       // Fallback 2
        "/anime/most-popular"     // Legacy
    ];

    console.log("🔍 Detecting valid API endpoint...");

    for (const path of candidates) {
        try {
            const url = `${API_BASE_URL}${path}?page=1`;
            const { data } = await axios.get(url);
            if (data && (data.animes || data.data?.animes || data.results)) {
                console.log(`✅ Valid Endpoint Found: ${path}`);
                return path; // Working path mil gaya
            }
        } catch (e) {
            // console.log(`❌ Failed: ${path}`);
        }
    }
    return null;
};

// 1. Fetch Anime List
const fetchAnimeList = async (endpoint, page) => {
    const url = `${API_BASE_URL}${endpoint}?page=${page}`;
    try {
        console.log(`\n📑 [PAGE ${page}] Fetching list...`);
        const { data } = await axios.get(url);
        return normalizeData(data, 'list') || [];
    } catch (e) {
        if (e.response && e.response.status === 404) {
            console.error(`❌ Page ${page} Not Found (End of List?)`);
            return null; // Return null to signal stop
        }
        console.error(`❌ Error fetching page ${page}: ${e.message}`);
        return [];
    }
};

// 2. Fetch Details
const getAnimeDetails = async (animeId) => {
    const url = `${API_BASE_URL}/hianime/anime/${animeId}`;
    try {
        const { data } = await axios.get(url);
        return normalizeData(data, 'info');
    } catch (e) { return null; }
};

// 3. Fetch Episodes
const getEpisodesFromApi = async (animeId) => {
    const url = `${API_BASE_URL}/hianime/anime/episodes/${animeId}`;
    try {
        const { data } = await axios.get(url);
        return normalizeData(data, 'episodes') || [];
    } catch (e) { return []; }
};

// 4. Fetch Video Link
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
    }

    const episodes = await getEpisodesFromApi(id);
    if (!episodes || episodes.length === 0) {
        return;
    }

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
            await sleep(2000);
        }
    } else {
        await syncSingleSeason(id, title);
    }
};

// ==========================================
// 🚀 MAIN EXECUTION (LOCKED)
// ==========================================
const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    // 🔒 LOCK CHECK
    if (isCrawling) {
        console.log("⚠️ CRAWLER IS BUSY! Ignore click.");
        return;
    }

    isCrawling = true; // Lock laga diya

    try {
        console.log(`\n🚀 INITIALIZING CRAWLER...`);
        
        // Step 1: Find Working Endpoint
        const workingEndpoint = await determineListEndpoint();
        if (!workingEndpoint) {
            console.error("❌ CRITICAL: No working API endpoint found. Check API URL.");
            isCrawling = false; // Release lock
            return;
        }

        console.log(`🎯 Target: Pages ${START_PAGE} to ${MAX_PAGES} via ${workingEndpoint}`);

        for (let page = START_PAGE; page <= MAX_PAGES; page++) {
            const animeList = await fetchAnimeList(workingEndpoint, page);
            
            // 🛑 Agar Page 1 pe hi null/empty aaya, toh RUK JAO
            if (!animeList || animeList.length === 0) {
                console.log(`⚠️ Data ended at Page ${page}. Stopping.`);
                break;
            }

            console.log(`📦 Page ${page}: Found ${animeList.length} Animes.`);

            for (let anime of animeList) {
                await processAnimeFilter(anime);
                await sleep(4000); 
            }
        }
        
        console.log("\n🎉 MISSION ACCOMPLISHED!");

    } catch (err) {
        console.error(`💥 CRASH: ${err.message}`);
    } finally {
        isCrawling = false; // Lock hata diya (chahe success ho ya fail)
        console.log("🔓 Crawler Lock Released.");
    }
};

module.exports = { extractAndUpload };
