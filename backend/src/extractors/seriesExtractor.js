const axios = require('axios');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const FormData = require('form-data');
const rimraf = require('rimraf'); // Ensure npm install rimraf

// ==========================================
// ⚙️ SYSTEM CONFIGURATION
// ==========================================
const API_BASE_URL = "https://hianime-api-seven-teal.vercel.app"; 
const MIN_YEAR = 2010;             
const MAX_PAGES_PER_LETTER = 5;    // Keep low to prevent ban
const RETRY_LIMIT = 3;             
const DELAY_BETWEEN_EPS = 3000;    
const TEMP_DIR = path.join(__dirname, 'temp_downloads');

// Crawl Order: 0-9 then A-Z
const SEARCH_KEYWORDS = "0123456789abcdefghijklmnopqrstuvwxyz".split(""); 

let isCrawling = false;

// ==========================================
// 🧹 CLEANUP & SETUP (CRITICAL FIX)
// ==========================================

// Server start hote hi purani zombie files uda do
const initTempDir = () => {
    if (fs.existsSync(TEMP_DIR)) {
        console.log("🧹 Cleaning up old temp files...");
        fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEMP_DIR);
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================
// 🛠️ FFMPEG & UPLOAD HANDLERS
// ==========================================

const downloadM3U8 = (m3u8Url, filename) => {
    return new Promise((resolve, reject) => {
        const outputPath = path.join(TEMP_DIR, filename);
        
        console.log(`⬇️ Stream Start: ${filename}`);
        
        // Timeout protection: 10 mins max per file
        const cmd = `ffmpeg -i "${m3u8Url}" -c copy -bsf:a aac_adtstoasc "${outputPath}" -y -hide_banner -loglevel error`;

        exec(cmd, { timeout: 600000 }, (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ FFmpeg Fail: ${error.message}`);
                // Agar corrupt file ban gayi hai toh uda do
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                reject(error);
            } else {
                resolve(outputPath);
            }
        });
    });
};

const uploadLocalFile = async (filePath) => {
    const key = process.env.DOODSTREAM_KEY;
    if (!key) return null;

    try {
        const serverReq = await axios.get(`https://doodapi.com/api/upload/server?key=${key}`);
        const uploadUrl = serverReq.data?.result;

        if (!uploadUrl) throw new Error("No DoodStream upload server");

        const form = new FormData();
        form.append('api_key', key);
        form.append('file', fs.createReadStream(filePath));

        console.log(`⬆️ Uploading to Dood...`);
        
        const uploadRes = await axios.post(uploadUrl, form, {
            headers: form.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        if (uploadRes.data?.status === 200) {
            return uploadRes.data.result[0].filecode;
        } else {
            console.error(`❌ Dood Error: ${uploadRes.data?.msg}`);
        }
    } catch (e) {
        console.error(`❌ Upload Network Error: ${e.message}`);
    }
    // Note: Cleanup happens in the main loop finally block
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

// Robust Search with Fallback
const searchAnime = async (keyword, page) => {
    const urls = [
        `${API_BASE_URL}/hianime/search?q=${keyword}&page=${page}`,
        `${API_BASE_URL}/api/v2/hianime/search?q=${keyword}&page=${page}`,
        `${API_BASE_URL}/search?q=${keyword}&page=${page}`
    ];

    for (const url of urls) {
        try {
            const { data } = await axios.get(url);
            const list = normalizeData(data, 'list');
            if (list) return list;
        } catch (e) {}
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
// ⚙️ SYNC LOGIC (Strict Matching)
// ==========================================

const syncSingleSeason = async (id, title) => {
    const Episode = mongoose.model('Episode');
    const Series = mongoose.model('Series');

    console.log(`🎬 [SYNC] ${title} (ID: ${id})`);

    // FIX 5: Strict Matching (Title + Source URL ID)
    // Sirf Title se match nahi karenge, ID check zaroori hai
    let series = await Series.findOne({ 
        $or: [
            { sourceUrl: `https://hianime.to/${id}` }, // Precise Match
            { title: title, language: "Sub" }          // Fallback
        ]
    });

    if (!series) {
        series = await Series.create({ 
            title: title, 
            sourceUrl: `https://hianime.to/${id}`, 
            language: "Sub",
            source: 'hianime' // Add source flag
        });
        console.log(`🆕 Series Created: ${title}`);
    }

    const episodes = await getEpisodesFromApi(id);
    if (!episodes || episodes.length === 0) return;

    for (let ep of episodes) {
        const epNum = ep.number || ep.num;
        let localPath = null;

        try {
            // Check Exists
            const existing = await Episode.findOne({ seriesId: series._id, episodeNumber: epNum });
            if (existing && existing.status === 'uploaded') {
                continue;
            }

            // Fetch -> Download -> Upload Pipeline
            const targetId = ep.episodeId || ep.id;
            const m3u8Link = await getLinkFromApi(targetId);
            
            if (m3u8Link) {
                // Generate Safe Filename (remove special chars)
                const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                const fileName = `${safeTitle}_ep${epNum}_${Date.now()}.mp4`;
                
                // 1. Download (Immediate)
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
            // FIX 4: Safety Cleanup (Always delete temp file)
            if (localPath && fs.existsSync(localPath)) {
                fs.unlinkSync(localPath);
                // console.log("🗑️ Temp file cleaned.");
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
// 🚀 MAIN EXECUTION
// ==========================================
const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    if (isCrawling) {
        console.log("⚠️ CRAWLER BUSY.");
        return;
    }
    isCrawling = true; 
    
    // Initialize Temp Directory on Start
    initTempDir();

    try {
        console.log(`\n🚀 INITIALIZING VPS-GRADE CRAWLER...`);
        console.log(`📅 Filter: Year >= ${MIN_YEAR}`);

        for (const letter of SEARCH_KEYWORDS) {
            console.log(`\n🔠 LETTER: ${letter.toUpperCase()}`);

            for (let page = 1; page <= MAX_PAGES_PER_LETTER; page++) {
                
                const animeList = await searchAnime(letter, page);
                if (!animeList || animeList.length === 0) break; 

                console.log(`📦 Page ${page}: ${animeList.length} Animes`);

                for (let anime of animeList) {
                    await processAnimeFilter(anime);
                    await sleep(DELAY_BETWEEN_ANIMES); 
                }
            }
        }
        console.log("\n🎉 SYNC COMPLETE!");
    } catch (err) {
        console.error(`💥 CRASH: ${err.message}`);
    } finally {
        isCrawling = false; 
    }
};

module.exports = { extractAndUpload };
