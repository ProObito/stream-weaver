const axios = require('axios');
const mongoose = require('mongoose');

// ==========================================
// ⚙️ SYSTEM CONFIGURATION (Yahan control karo)
// ==========================================
const API_BASE_URL = "https://hianime-api-seven-teal.vercel.app"; 
const START_PAGE = 1;        // Kahan se shuru karein?
const MAX_PAGES = 1000;      // Kitna deep jana hai? (Total pages to scan)
const MIN_YEAR = 2010;       // Is saal se purana anime skip ho jayega
const RETRY_LIMIT = 3;       // Agar fail ho toh kitni baar try kare?
const DELAY_BETWEEN_EPS = 2000; // 2 Seconds (API block na ho)
const DELAY_BETWEEN_ANIMES = 5000; // 5 Seconds (Server thanda rahe)

// ==========================================
// 🛠️ HELPER FUNCTIONS
// ==========================================

// Sleep function taaki server crash na ho
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Data Normalizer: API ke alag-alag mood ko handle karne ke liye
function normalizeData(data, type) {
    if (!data) return null;

    if (type === 'list') { // Anime List
        if (data.data?.animes) return data.data.animes;
        if (data.animes) return data.animes;
        if (data.results) return data.results;
    }
    if (type === 'info') { // Details
        if (data.data?.anime) return data.data.anime;
        if (data.anime) return data.anime;
    }
    if (type === 'episodes') { // Episodes List
        if (data.data?.episodes) return data.data.episodes;
        if (data.episodes) return data.episodes;
        if (data.data?.episodes?.data) return data.data.episodes.data;
    }
    if (type === 'sources') { // Video Links
        if (data.data?.sources) return data.data.sources;
        if (data.sources) return data.sources;
    }
    return null;
}

// Year Extractor: "Apr 2016" mein se "2016" nikalne ke liye
const extractYear = (info) => {
    try {
        let yearString = "";
        if (info.moreInfo && info.moreInfo.aired) yearString = info.moreInfo.aired;
        else if (info.anime?.info?.stats?.aired) yearString = info.anime.info.stats.aired;

        const match = yearString.match(/\d{4}/);
        if (match) return parseInt(match[0]);
    } catch (e) {}
    return 0; // Year nahi mila
};

// ==========================================
// 🌐 API FETCHING FUNCTIONS
// ==========================================

// 1. Fetch Anime List (Most Popular / Recently Updated)
const fetchAnimeList = async (page) => {
    const url = `${API_BASE_URL}/hianime/most-popular?page=${page}`;
    try {
        console.log(`\n📑 [PAGE ${page}] Fetching list...`);
        const { data } = await axios.get(url);
        return normalizeData(data, 'list') || [];
    } catch (e) {
        console.error(`❌ Page ${page} Error: ${e.message}`);
        return [];
    }
};

// 2. Fetch Anime Details (Year aur Seasons check karne ke liye)
const getAnimeDetails = async (animeId) => {
    const url = `${API_BASE_URL}/hianime/anime/${animeId}`;
    try {
        const { data } = await axios.get(url);
        return normalizeData(data, 'info');
    } catch (e) { return null; }
};

// 3. Fetch Episodes List
const getEpisodesFromApi = async (animeId) => {
    const url = `${API_BASE_URL}/hianime/anime/episodes/${animeId}`;
    try {
        const { data } = await axios.get(url);
        return normalizeData(data, 'episodes') || [];
    } catch (e) { return []; }
};

// 4. Fetch Streaming Link (High Quality Priority)
const getLinkFromApi = async (episodeId) => {
    const url = `${API_BASE_URL}/hianime/episode/sources?animeEpisodeId=${episodeId}&server=vidstreaming&category=sub`;
    try {
        const { data } = await axios.get(url);
        const sources = normalizeData(data, 'sources');
        if (sources?.length > 0) {
            // Priority: Auto > 1080p > Default > First
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
    if (!key) {
        console.error("❌ ERROR: DoodStream Key Missing!");
        return null;
    }
    const apiUrl = `https://doodapi.com/api/upload/url?key=${key}&url=${encodeURIComponent(videoUrl)}`;
    
    // Retry Logic for Upload
    for (let i = 0; i < RETRY_LIMIT; i++) {
        try {
            const { data } = await axios.get(apiUrl);
            if (data.status === 200 && data.result && data.result.filecode) {
                return data.result.filecode;
            }
            // Agar DoodStream busy hai toh thoda ruk kar try karo
            await sleep(1000); 
        } catch (e) {
            console.error(`⚠️ Upload Retry ${i+1}/${RETRY_LIMIT} Failed`);
        }
    }
    return null;
};

// ==========================================
// ⚙️ CORE PROCESSING LOGIC
// ==========================================

// Function to Sync a Single Season (Episodes Upload)
const syncSingleSeason = async (id, title) => {
    const Episode = mongoose.model('Episode');
    const Series = mongoose.model('Series');

    console.log(`🎬 [SYNC START] Processing: ${title} (ID: ${id})`);

    // 1. Database mein Series banao ya dhoondo
    let series = await Series.findOne({ title: new RegExp(`^${title}`, 'i') });
    if (!series) {
        series = await Series.create({ 
            title: title, 
            sourceUrl: `https://hianime.to/${id}`, 
            language: "Sub" 
        });
        console.log(`🆕 New Series Created in DB: ${title}`);
    }

    // 2. Episodes ki list mangao
    const episodes = await getEpisodesFromApi(id);
    if (!episodes || episodes.length === 0) {
        console.log(`⚠️ No episodes found for ${title}. Skipping.`);
        return;
    }

    console.log(`📊 Found ${episodes.length} episodes for ${title}.`);

    // 3. Har episode ko process karo
    for (let ep of episodes) {
        try {
            const epNum = ep.number || ep.num;
            
            // Check agar episode pehle se done hai
            const existing = await Episode.findOne({ seriesId: series._id, episodeNumber: epNum });
            if (existing && existing.status === 'completed') {
                // Agar done hai toh skip karo (Logs spam mat karo)
                process.stdout.write("."); // Progress dot
                continue;
            }

            console.log(`\n⬇️ Processing Ep ${epNum}...`);

            // Video Link Nikalo
            const targetId = ep.episodeId || ep.id;
            const directLink = await getLinkFromApi(targetId);
            
            if (directLink) {
                // Upload to DoodStream
                const fileCode = await addRemoteUpload(directLink);

                if (fileCode) {
                    // DB Save
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
                    console.log(`✅ SUCCESS: Ep ${epNum} Queued! (Code: ${fileCode})`);
                } else {
                    console.log(`❌ FAILED: Upload rejected for Ep ${epNum}`);
                }
            } else {
                console.log(`❌ ERROR: Source link not found for Ep ${epNum}`);
            }
        } catch (err) {
            console.error(`💥 Loop Crash: ${err.message}`);
        }
        
        // Thoda break taaki API block na kare
        await sleep(DELAY_BETWEEN_EPS);
    }
    console.log(`\n🏁 Completed Season: ${title}`);
};

// Function to Handle Filters & Seasons
const processAnimeFilter = async (anime) => {
    const id = anime.id;
    const title = anime.name || anime.title;

    // 1. Details fetch karo (Year aur Seasons ke liye)
    const info = await getAnimeDetails(id);
    
    if (!info) {
        console.log(`⚠️ Info fetch failed for ${title}, skipping safe side.`);
        return;
    }

    // 2. YEAR FILTER: 2010 se purana skip karo
    const year = extractYear(info);
    if (year > 0 && year < MIN_YEAR) {
        console.log(`🛑 [SKIP] Too Old: ${title} (${year})`);
        return;
    }

    console.log(`🟢 [PASS] Valid Anime: ${title} (${year || 'Unknown'})`);

    // 3. SEASON CHECK: Agar Prequels/Sequels hain toh unhe bhi karo
    if (info.seasons && info.seasons.length > 0) {
        console.log(`📚 Collection Detected (${info.seasons.length} Seasons). Syncing Orderly...`);
        
        for (let season of info.seasons) {
            await syncSingleSeason(season.id, season.name || season.title);
            console.log(`⏳ Season Break (3s)...`);
            await sleep(3000);
        }
    } else {
        // Single Season Anime
        await syncSingleSeason(id, title);
    }
};

// ==========================================
// 🚀 MAIN EXECUTION (ENTRY POINT)
// ==========================================
const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    try {
        console.log(`\n=============================================`);
        console.log(`🚀 STARTING MASSIVE ARCHIVE CRAWL (2010-2026)`);
        console.log(`🎯 Target: Pages ${START_PAGE} to ${MAX_PAGES}`);
        console.log(`=============================================\n`);

        for (let page = START_PAGE; page <= MAX_PAGES; page++) {
            
            // Step 1: List leke aao
            const animeList = await fetchAnimeList(page);
            
            if (!animeList || animeList.length === 0) {
                console.log("⚠️ No more data found. Stopping crawler.");
                break;
            }

            console.log(`📦 Page ${page} contains ${animeList.length} Animes.`);

            // Step 2: Har anime ko filter aur process karo
            for (let anime of animeList) {
                await processAnimeFilter(anime);
                
                console.log("☕ Cooldown between animes...");
                await sleep(DELAY_BETWEEN_ANIMES); 
            }
        }
        
        console.log("\n🎉 MISSION ACCOMPLISHED: ALL DATA SYNCED! 🎉");

    } catch (err) {
        console.error(`💥 CRITICAL SYSTEM FAILURE: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
