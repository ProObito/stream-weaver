const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const withRetry = async (fn, retries = 3, delay = 5000) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            if (i === retries - 1) throw err;
            console.log(`⚠️ Attempt ${i + 1} failed: ${err.message}. Retrying...`);
            await sleep(delay);
        }
    }
};

const uploadToStreamtape = async (filePath) => {
    const login = process.env.STREAMTAPE_LOGIN;
    const key = process.env.STREAMTAPE_KEY;

    // 1. Get Fresh Upload URL every time
    const { data: serverData } = await axios.get(`https://api.streamtape.com/file/ul?login=${login}&key=${key}`);
    if (!serverData || serverData.status !== 200 || !serverData.result) {
        throw new Error("Could not get Streamtape Upload URL");
    }

    const uploadUrl = serverData.result.url;

    // 2. Upload using Form Data
    const form = new FormData();
    form.append('file1', fs.createReadStream(filePath));

    const response = await axios.post(uploadUrl, form, {
        headers: { ...form.getHeaders() },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 600000 // 10 mins
    });

    // 3. Validation to prevent "reading id of null"
    if (response.data && response.data.result && response.data.result.id) {
        return response.data.result.id;
    } else {
        console.log("Full API Response:", JSON.stringify(response.data));
        throw new Error("Streamtape response missing result ID");
    }
};

const downloadVideo = async (url, dest) => {
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 300000
    });
    
    const writer = fs.createWriteStream(dest);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', () => {
            const stats = fs.statSync(dest);
            if (stats.size === 0) reject(new Error("Downloaded file is empty"));
            else resolve();
        });
        writer.on('error', reject);
    });
};

const getHiAnimeLinks = async (mainUrl) => {
    try {
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
                if (src && src.link) {
                    eps.push({ episode: num, link: src.link, title: $(el).attr('title') || `Episode ${num}` });
                }
            } catch (e) { console.log(`Link error Ep ${num}`); }
        }
        return eps;
    } catch (err) {
        return [];
    }
};

const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    try {
        const Episode = mongoose.model('Episode');
        const Series = mongoose.model('Series');
        
        console.log(`🚀 Starting Local Sync: ${animeName}`);

        let series = await Series.findOne({ title: `${animeName} (${languageTag})` });
        if (!series) {
            series = await Series.create({ title: `${animeName} (${languageTag})`, sourceUrl: mainUrl, language: languageTag });
        }

        let episodeList = await getHiAnimeLinks(mainUrl);
        if (episodeList.length === 0) return console.log("No episodes found.");

        for (let ep of episodeList) {
            // Safe filename
            const fileName = `temp_${Date.now()}_ep${ep.episode}.mp4`;
            const filePath = path.join('/tmp', fileName); // Using Heroku's /tmp folder

            try {
                console.log(`📥 Downloading Ep ${ep.episode}...`);
                await withRetry(() => downloadVideo(ep.link, filePath));

                console.log(`📤 Uploading Ep ${ep.episode} to Streamtape...`);
                const videoId = await withRetry(() => uploadToStreamtape(filePath));

                if (videoId) {
                    await Episode.findOneAndUpdate(
                        { seriesId: series._id, episodeNumber: ep.episode },
                        { remoteId: videoId, status: 'completed' },
                        { upsert: true }
                    );
                    console.log(`✅ Success Ep ${ep.episode}: ${videoId}`);
                }
            } catch (err) {
                console.error(`❌ Failure Ep ${ep.episode}: ${err.message}`);
            } finally {
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            }
            await sleep(5000); 
        }
    } catch (err) {
        console.error(`❌ Global Crash: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
