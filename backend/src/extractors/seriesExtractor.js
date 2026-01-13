const axios = require('axios');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const FormData = require('form-data');

// ==========================================
// ⚙️ SYSTEM CONFIGURATION
// ==========================================
const API_BASE_URL = "https://hianime-api-seven-teal.vercel.app"; 
const MIN_YEAR = 2010;             
const MAX_PAGES_PER_LETTER = 10;   
const RETRY_LIMIT = 3;             
const DELAY_BETWEEN_EPS = 3000;    
const DELAY_BETWEEN_ANIMES = 6000; // ✅ FIXED: Defined variable

// State File Path (Yaad rakhne ke liye hum kahan the)
const STATE_FILE = path.join(__dirname, 'crawler_state.json');
const TEMP_DIR = path.join(__dirname, 'temp_downloads');

// Crawl Order: 0-9 then A-Z
const SEARCH_KEYWORDS = "0123456789abcdefghijklmnopqrstuvwxyz".split(""); 

let isCrawling = false;

// ==========================================
// 💾 STATE MANAGEMENT (RESUME CAPABILITY)
// ==========================================

const loadState = () => {
    if (fs.existsSync(STATE_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        } catch (e) {
            console.error("⚠️ State file corrupt. Starting fresh.");
        }
    }
    return { letterIndex: 0, page: 1 };
};

const saveState = (letterIndex, page) => {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify({ letterIndex, page }));
    } catch (e) {
        console.error("⚠️ Failed to save state.");
    }
};

// ==========================================
// 🧹 CLEANUP & HELPERS
// ==========================================

const initTempDir = () => {
    if (fs.existsSync(TEMP_DIR)) {
        fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEMP_DIR);
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================
// 🛠️ FFMPEG & UPLOAD (WITH RETRY & BACKOFF)
// ==========================================

const downloadM3U8 = (m3u8Url, filename, attempt = 1) => {
    return new Promise((resolve, reject) => {
        const outputPath = path.join(TEMP_DIR, filename);
        
        console.log(`⬇️ Stream Download (Attempt ${attempt}): ${filename}`);
        
        // Timeout: 10 mins
        const cmd = `ffmpeg -i "${m3u8Url}" -c copy -bsf:a aac_adtstoasc "${outputPath}" -y -hide_banner -loglevel error`;

        exec(cmd, { timeout: 600000 }, async (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ FFmpeg Fail: ${error.message}`);
                if (attempt < RETRY_LIMIT) {
                    console.log(`🔄 Retrying download in 5s...`);
                    await sleep(5000);
                    // Recursively retry
                    resolve(downloadM3U8(m3u8Url, filename, attempt + 1)); 
                } else {
                    reject(error);
                }
            } else {
                resolve(outputPath);
            }
        });
    });
};

const uploadLocalFile = async (filePath) => {
    const key = process.env.DOODSTREAM_KEY;
    if (!key) return null;

    let attempts = 0;
    
    while (attempts < RETRY_LIMIT) {
        try {
            const serverReq = await axios.get(`https://doodapi.com/api/upload/server?key=${key}`);
            const uploadUrl = serverReq.data?.result;

            if (!uploadUrl) throw new Error("No upload server");

            const form = new FormData();
            form.append('api_key', key);
            form.append('file', fs.createReadStream(filePath));

            console.log(`⬆️ Uploading to Dood (Attempt ${attempts + 1})...`);
            
            const uploadRes = await axios.post(uploadUrl, form, {
                headers: form.getHeaders(),
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            });

            if (uploadRes.data?.status === 200) {
                return uploadRes.data.result[0].filecode;
            } else {
                throw new Error(`Dood API Error: ${uploadRes.data?.msg || 'Unknown'}`);
            }

        } catch (e) {
            attempts++;
            console.error(`❌ Upload Fail: ${e.message}`);
            
            // Smart Backoff: Agar fail hua to wait time badhao (30s, 60s, 90s)
            const waitTime = attempts * 30000;
            console.log(`⏳ Pausing for ${waitTime/1000}s before retry...`);
            await sleep(waitTime);
        }
    }
    return null;
};

// ==========================================
// 🌐 API FETCHING
// ==========================================

function normalizeData(data, type) {
    if (!data) return null;
    if (type === 'list') { 
        if (data.data?.animes) return data.data.animes;
        if (data.animes) return data.animes;
        if (data.results) return data.results;
        if (Array.isArray(data)) return data;
    }
    if (type === 'info') { 
        if (data.data?.anime) return data.data.anime;
        if (data.anime) return data.anime;
    }
    if (type === 'episodes') {
        if (data.data?.episodes) return data.data.episodes;
        if (data.episodes) return data.episodes;
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

const searchAnime = async (keyword, page) => {
    // Retry Logic for API Search
    for (let i = 0; i < 3; i++) {
        try {
            const url = `${API_BASE_URL}/hianime/search?q=${keyword}&page=${page}`;
            const { data } = await axios.get(url);
            return normalizeData(data, 'list') || [];
        } catch (e) {
            await sleep(2000);
        }
    }
    return [];
};

const getAnimeDetails = async (animeId) => {
    try {
        const { data } = await axios.get(`${API_BASE_URL}/hianime/anime/${animeId}`);
        return normalizeData(data, 'info');
    } catch (e) { return null; }
};

const getEpisodesFromApi = async (animeId) => {
    try {
        const { data } = await axios.get(`${API_BASE_URL}/hianime/anime/episodes/${animeId}`);
        return normalizeData(data, 'episodes') || [];
    } catch(e) { return []; }
};

const getLinkFromApi = async (episodeId) => {
    try {
        const { data } = await axios.get(`${API_BASE_URL}/hianime/episode/sources?animeEpisodeId=${episodeId}&server=vidstreaming&category=sub`);
        const sources = normalizeData(data, 'sources');
        if (sources?.length > 0) {
            const source = sources.find(s => s.quality === 'auto') || sources[0];
            return source.url;
        }
    } catch (e) { return null; }
    return null;
};

// ==========================================
// ⚙️ SYNC LOGIC
// ==========================================

const syncSingleSeason = async (id, title) => {
    const Episode = mongoose.model('Episode');
    const Series = mongoose.model('Series');

    console.log(`🎬 [SYNC] ${title} (ID: ${id})`);

    let series = await Series.findOne({ 
        $or: [
            { sourceUrl: `https://hianime.to/${id}` }, 
            { title: title, language: "Sub" }
        ]
    });

    if (!series) {
        series = await Series.create({ 
            title: title, 
            sourceUrl: `https://hianime.to/${id}`, 
            language: "Sub",
            source: 'hianime' 
        });
        console.log(`🆕 Series Created: ${title}`);
    }

    const episodes = await getEpisodesFromApi(id);
    if (!episodes || episodes.length === 0) return;

    for (let ep of episodes) {
        const epNum = ep.number || ep.num;
        let localPath = null;

        try {
            const existing = await Episode.findOne({ seriesId: series._id, episodeNumber: epNum });
            // Strict check: Status must be uploaded AND remoteId must exist
            if (existing && existing.status === 'uploaded' && existing.remoteId) {
                continue;
            }

            const targetId = ep.episodeId || ep.id;
            const m3u8Link = await getLinkFromApi(targetId);
            
            if (m3u8Link) {
                const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                const fileName = `${safeTitle}_ep${epNum}_${Date.now()}.mp4`;
                
                // 1. Download
                localPath = await downloadM3U8(m3u8Link, fileName);

                // 2. Upload
                const fileCode = await uploadLocalFile(localPath);

                if (fileCode) {
                    await Episode.findOneAndUpdate(
                        { seriesId: series._id, episodeNumber: epNum },
                        { 
                            remoteId: fileCode,
                            downloadLink: `https://dood.li/d/${fileCode}`,
                            status: 'uploaded', 
                            title: ep.title || `Episode ${epNum}`
                        },
                        { upsert: true }
                    );
                    console.log(`✅ Ep ${epNum} Success: ${fileCode}`);
                }
            } else {
                console.log(`❌ No Stream for Ep ${epNum}`);
            }
            await sleep(DELAY_BETWEEN_EPS); 

        } catch (err) { 
            console.error(`⚠️ Error Ep ${epNum}: ${err.message}`);
        } finally {
            // ALWAYS Cleanup
            if (localPath && fs.existsSync(localPath)) {
                fs.unlinkSync(localPath);
            }
        }
    }
};

const processAnimeFilter = async (anime) => {
    const id = anime.id;
    const title = anime.name || anime.title;

    const info = await getAnimeDetails(id);
    if (!info) return;

    const year = extractYear(info);
    if (year > 0 && year < MIN_YEAR) {
        console.log(`🛑 [SKIP] Old: ${title} (${year})`);
        return;
    }

    console.log(`🟢 [PASS] ${title} (${year})`);

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
// 🚀 MAIN EXECUTION (RESUME ENABLED)
// ==========================================
const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    if (isCrawling) {
        console.log("⚠️ CRAWLER BUSY.");
        return;
    }
    isCrawling = true; 
    initTempDir();

    try {
        // Load previous state
        const state = loadState();
        console.log(`\n🚀 RESUMING FROM: Letter Index ${state.letterIndex} ('${SEARCH_KEYWORDS[state.letterIndex]}'), Page ${state.page}`);
        console.log(`📅 Filter: Year >= ${MIN_YEAR}`);

        // Outer Loop: Letters (using index to skip processed ones)
        for (let i = state.letterIndex; i < SEARCH_KEYWORDS.length; i++) {
            const letter = SEARCH_KEYWORDS[i];
            
            // Determine start page for this letter
            // If it's a resumed letter, use saved page. Else start from 1.
            let startPage = (i === state.letterIndex) ? state.page : 1;

            console.log(`\n🔠 LETTER: ${letter.toUpperCase()}`);

            // Inner Loop: Pages
            for (let page = startPage; page <= MAX_PAGES_PER_LETTER; page++) {
                
                const animeList = await searchAnime(letter, page);
                if (!animeList || animeList.length === 0) {
                    console.log(`⚠️ End of letter '${letter}'.`);
                    break; 
                }

                console.log(`📦 Letter '${letter}' Page ${page}: ${animeList.length} Animes`);

                for (let anime of animeList) {
                    await processAnimeFilter(anime);
                    await sleep(DELAY_BETWEEN_ANIMES); 
                }

                // ✅ Checkpoint: Save State after every page success
                // Next time, if crash, we start from Next Page or Current Page
                saveState(i, page + 1);
            }
            
            // Letter complete, reset page for next letter
            saveState(i + 1, 1);
        }
        console.log("\n🎉 SYNC COMPLETE!");
        
        // Reset State on Completion
        if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);

    } catch (err) {
        console.error(`💥 CRASH: ${err.message}`);
    } finally {
        isCrawling = false; 
    }
};

module.exports = { extractAndUpload };
