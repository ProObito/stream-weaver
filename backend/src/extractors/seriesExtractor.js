const axios = require('axios');
const mongoose = require('mongoose');

// ==========================================
// ⚙️ SYSTEM CONFIGURATION
// ==========================================
const API_BASE_URL = "https://hianime-api-seven-teal.vercel.app"; 
const START_PAGE = 1;        
const MAX_PAGES = 200;       // Recently Updated mein 200 pages bohot hote hain
const MIN_YEAR = 2010;       
const RETRY_LIMIT = 3;       

// 🔒 GLOBAL LOCK (Fixes Multiple Start Issue)
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
        // Handle Home Page Structure
        if (data.data?.trendingAnimes) return data.data.trendingAnimes;
        if (data.data?.latestEpisodeAnimes) return data.data.latestEpisodeAnimes;
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
    // Priority List: Recently Updated is best for "New Content"
    const candidates = [
        "/hianime/recently-updated", // Best for automated scraping
        "/hianime/most-popular",     // Often broken on some forks
        "/hianime/trending",         
        "/hianime/top-airing"
    ];

    console.log("🔍 Detecting valid API endpoint...");

    for (const path of candidates) {
        try {
            const url = `${API_BASE_URL}${path}?page=1`;
            // console.log(`Testing: ${url}`);
            const { data } = await axios.get(url);
            
            // Check if response has array of animes
            const list = normalizeData(data, 'list');
            if (list && list.length > 0) {
                console.log(`✅ Valid Endpoint Found: ${path}`);
                return path; 
            }
        } catch (e) {
            // console.log(`❌ Failed: ${path} (${e.message})`);
        }
    }
    
    // Last Resort: Home Page (No pagination usually, but gets data)
    try {
        const url = `${API_BASE_URL}/hianime/home`;
        const { data } = await axios.get(url);
        if (data.data?.trendingAnimes) {
            console.log(`✅ Fallback Endpoint Found: /hianime/home`);
            return '/hianime/home';
        }
    } catch(e) {}

    return null;
};

// 1. Fetch Anime List
const fetchAnimeList = async (endpoint, page) => {
    let url = `${API_BASE_URL}${endpoint}`;
    
    // Home endpoint doesn't support pagination usually
    if (endpoint !== '/hianime/home') {
        url += `?page=${page}`;
    }

    try {
        console.log(`\n📑 [PAGE ${page}] Fetching list from ${endpoint}...`);
        const { data } = await axios.get(url);
        return normalizeData(data, 'list') || [];
    } catch (e) {
        if (e.response && e.response.status === 404) {
            console.error(`❌ Page ${page} Not Found.`);
            return null; 
        }
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
    // Try multiple episode endpoints
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
        // console.log(`⚠️ No episodes found for ${title}`);
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
            await sleep(3000);
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

    isCrawling = true; 

    try {
        console.log(`\n🚀 INITIALIZING HI-ANIME CRAWLER...`);
        
        // Step 1: Find Working Endpoint
        const workingEndpoint = await determineListEndpoint();
        if (!workingEndpoint) {
            console.error("❌ CRITICAL: No working API endpoint found on HiAnime API.");
            console.error("👉 Please verify the API URL in Config.");
            isCrawling = false; 
            return;
        }

        console.log(`🎯 Using Endpoint: ${workingEndpoint}`);

        for (let page = START_PAGE; page <= MAX_PAGES; page++) {
            const animeList = await fetchAnimeList(workingEndpoint, page);
            
            // Special handler for Home endpoint (No pagination)
            if (workingEndpoint === '/hianime/home') {
                if (animeList && animeList.length > 0) {
                    console.log(`📦 Home Page: Found ${animeList.length} Animes.`);
                    for (let anime of animeList) await processAnimeFilter(anime);
                }
                break; // Home has only 1 page
            }

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
        
        console.log("\n🎉 HI-ANIME SYNC COMPLETE!");

    } catch (err) {
        console.error(`💥 CRASH: ${err.message}`);
    } finally {
        isCrawling = false; 
        console.log("🔓 Crawler Lock Released.");
    }
};

module.exports = { extractAndUpload };
