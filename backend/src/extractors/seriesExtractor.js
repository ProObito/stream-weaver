const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- RETRY WRAPPER ---
const withRetry = async (fn, retries = 3, delay = 5000) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            if (i === retries - 1) throw err;
            console.log(`⚠️ Attempt ${i + 1} failed. Retrying...`);
            await sleep(delay);
        }
    }
};

// --- STREAMTAPE UPLOAD ---
const uploadToStreamtape = async (filePath) => {
    const login = process.env.STREAMTAPE_LOGIN;
    const key = process.env.STREAMTAPE_KEY;
    const { data: serverData } = await axios.get(`https://api.streamtape.com/file/ul?login=${login}&key=${key}`);
    if (serverData.status !== 200) throw new Error("Streamtape API Error");

    const form = new FormData();
    form.append('file1', fs.createReadStream(filePath));
    const { data: uploadResult } = await axios.post(serverData.result.url, form, {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity
    });
    return uploadResult.result.id;
};

// --- DOWNLOADER ---
const downloadVideo = async (url, dest) => {
    const response = await axios({ url, method: 'GET', responseType: 'stream', timeout: 600000 });
    const writer = fs.createWriteStream(dest);
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
};

// --- SOURCE HELPERS ---
const getHiAnimeLinks = async (mainUrl) => {
    const animeId = mainUrl.split('-').pop();
    const { data } = await axios.get(`https://hianime.to/ajax/v2/episode/list/${animeId}`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
    const $ = cheerio.load(data.html);
    const eps = [];
    const items = $('.ep-item').get();
    for (const el of items) {
        const id = $(el).attr('data-id');
        const num = parseInt($(el).attr('data-number'));
        try {
            const { data: src } = await axios.get(`https://hianime.to/ajax/v2/episode/sources?id=${id}`);
            if(src.link) eps.push({ episode: num, link: src.link, title: $(el).attr('title') || `Episode ${num}` });
        } catch (e) { console.log(`Link error for Ep ${num}`); }
    }
    return eps;
};

// --- MAIN EXTRACTOR ---
const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    try {
        const Episode = mongoose.model('Episode');
        const Series = mongoose.model('Series');
        
        console.log(`🚀 Starting Local Sync: ${animeName}`);

        let series = await Series.findOne({ title: `${animeName} (${languageTag})` });
        if (!series) {
            series = await Series.create({ title: `${animeName} (${languageTag})`, sourceUrl: mainUrl, language: languageTag });
        }

        // FETCH EPISODES
        let episodeList = [];
        if (mainUrl.includes('hianime.to')) {
            episodeList = await getHiAnimeLinks(mainUrl);
        } else {
            // Add General Scraper logic here if needed
            console.log("Only HiAnime is fully supported for direct download right now.");
            return;
        }

        console.log(`🔍 Found ${episodeList.length} episodes for ${animeName}`);

        for (let ep of episodeList) {
            const fileName = `${animeName.replace(/[^a-zA-Z0-9]/g, '_')}_Ep${ep.episode}.mp4`;
            const filePath = path.join(__dirname, fileName);

            try {
                console.log(`📥 Downloading: ${fileName}`);
                await withRetry(() => downloadVideo(ep.link, filePath));

                console.log(`📤 Uploading: ${fileName}`);
                const videoId = await withRetry(() => uploadToStreamtape(filePath));

                if (videoId) {
                    await Episode.findOneAndUpdate(
                        { seriesId: series._id, episodeNumber: ep.episode },
                        { remoteId: videoId, status: 'completed' },
                        { upsert: true }
                    );
                    console.log(`✅ Success Ep ${ep.episode}: ID ${videoId}`);
                }
            } catch (err) {
                console.error(`❌ Permanent Failure Ep ${ep.episode}: ${err.message}`);
            } finally {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log(`🗑️ Storage Cleared: ${fileName}`);
                }
            }
            await sleep(2000); 
        }
    } catch (err) {
        console.error(`❌ Global Extractor Crash: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
