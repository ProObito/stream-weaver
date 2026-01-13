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
const DELAY_BETWEEN_ANIMES = 5000; 

// Crawl Order: 0-9 then A-Z
const SEARCH_KEYWORDS = "0123456789abcdefghijklmnopqrstuvwxyz".split(""); 

let isCrawling = false;

// ==========================================
// 🛠️ FFMPEG & UPLOAD HANDLERS (THE REAL FIX)
// ==========================================

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 1. Download & Convert m3u8 to MP4 (Stream Copy - Fast)
const downloadM3U8 = (m3u8Url, filename) => {
    return new Promise((resolve, reject) => {
        const outputPath = path.join(__dirname, 'temp', filename);
        
        // Ensure temp folder exists
        if (!fs.existsSync(path.join(__dirname, 'temp'))) {
            fs.mkdirSync(path.join(__dirname, 'temp'));
        }

        console.log(`⬇️ Downloading Stream: ${filename}...`);
        
        // FFmpeg command: -c copy makes it super fast (no re-encoding)
        const cmd = `ffmpeg -i "${m3u8Url}" -c copy -bsf:a aac_adtstoasc "${outputPath}" -y`;

        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ FFmpeg Error: ${error.message}`);
                reject(error);
            } else {
                console.log(`✅ Download Complete: ${filename}`);
                resolve(outputPath);
            }
        });
    });
};

// 2. Upload Local File to DoodStream
const uploadLocalFile = async (filePath) => {
    const key = process.env.DOODSTREAM_KEY;
    if (!key) return null;

    try {
        // Step A: Get Upload Server URL
        const serverReq = await axios.get(`https://doodapi.com/api/upload/server?key=${key}`);
        const uploadUrl = serverReq.data?.result;

        if (!uploadUrl) throw new Error("No upload server found");

        // Step B: Upload File
        const form = new FormData();
        form.append('api_key', key);
        form.append('file', fs.createReadStream(filePath));

        console.log(`⬆️ Uploading to DoodStream...`);
        
        const uploadRes = await axios.post(uploadUrl, form, {
            headers: form.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        if (uploadRes.data?.status === 200) {
            return uploadRes.data.result[0].filecode;
        }
    } catch (e) {
        console.error(`❌ Upload Failed: ${e.message}`);
    } finally {
        // Step C: Cleanup Temp File
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    return null;
};

// ==========================================
// 🌐 API FETCHING LOGIC
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

const searchAnime = async (keyword, page) => {
    const url = `${API_BASE_URL}/hianime/search?q=${keyword}&page=${page}`;
    try {
        console.log(`\n📑 [SEARCH: '${keyword.toUpperCase()}'] Fetching Page ${page}...`);
        const { data } = await axios.get(url);
        return normalizeData(data, 'list') || [];
    } catch (e) { return []; }
};

const getAnimeDetails = async (animeId) => {
    const url = `${API_BASE_URL}/hianime/anime/${animeId}`;
    try {
        const { data } = await axios.get(url);
        return normalizeData(data, 'info');
    } catch (e) { return null; }
};

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

// ==========================================
// ⚙️ SYNC LOGIC
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
            
            if (existing && (existing.status === 'completed' || existing.status === 'uploaded')) {
                continue;
            }

            const targetId = ep.episodeId || ep.id;
            const m3u8Link = await getLinkFromApi(targetId);
            
            if (m3u8Link) {
                // 1. Download m3u8 to local MP4
                const fileName = `${id}-ep${epNum}.mp4`;
                const localPath = await downloadM3U8(m3u8Link, fileName);

                // 2. Upload to DoodStream
                const fileCode = await uploadLocalFile(localPath);

                if (fileCode) {
                    await Episode.findOneAndUpdate(
                        { seriesId: series._id, episodeNumber: epNum },
                        { 
                            remoteId: fileCode,
                            downloadLink: `https://dood.li/d/${fileCode}`,
                            status: 'uploaded', // Updated status
                            title: ep.title || `Episode ${epNum}`
                        },
                        { upsert: true }
                    );
                    console.log(`✅ Ep ${epNum} Uploaded (Code: ${fileCode})`);
                } else {
                    console.log(`❌ Upload Failed for Ep ${epNum}`);
                }
            } else {
                console.log(`❌ No stream found for Ep ${epNum}`);
            }
            await sleep(DELAY_BETWEEN_EPS); 
        } catch (err) { 
            console.error(`⚠️ Error Ep ${ep.number}: ${err.message}`);
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

    try {
        console.log(`\n🚀 INITIALIZING DOWNLOAD-UPLOAD PIPELINE...`);
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
