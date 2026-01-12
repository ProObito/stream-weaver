const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- RETRY LOGIC ---
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

// --- DIRECT UPLOAD TO STREAMTAPE ---
const uploadToStreamtape = async (filePath, fileName) => {
    const login = process.env.STREAMTAPE_LOGIN;
    const key = process.env.STREAMTAPE_KEY;

    // 1. Get Fresh Upload URL
    const { data: serverData } = await axios.get(`https://api.streamtape.com/file/ul?login=${login}&key=${key}`);
    if (!serverData || serverData.status !== 200) throw new Error("Streamtape API Error: No Upload URL");

    const uploadUrl = serverData.result.url;

    // 2. Prepare Form Data
    const form = new FormData();
    form.append('file1', fs.createReadStream(filePath), { filename: fileName });

    // 3. Post to Streamtape
    const response = await axios.post(uploadUrl, form, {
        headers: { ...form.getHeaders() },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 900000 // 15 mins for large files
    });

    if (response.data && response.data.result && response.data.result.id) {
        return response.data.result.id;
    } else {
        throw new Error(`Upload Failed: ${JSON.stringify(response.data)}`);
    }
};

// --- DOWNLOADER (SERVER SIDE) ---
const downloadVideo = async (url, dest) => {
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const writer = fs.createWriteStream(dest);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', () => {
            const stats = fs.statSync(dest);
            if (stats.size < 1024) reject(new Error("File too small/invalid download"));
            else resolve();
        });
        writer.on('error', reject);
    });
};

// --- HIANIME SCRAPER ---
const getHiAnimeData = async (mainUrl) => {
    const animeId = mainUrl.split('-').pop();
    const { data } = await axios.get(`https://hianime.to/ajax/v2/episode/list/${animeId}`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
    const $ = cheerio.load(data.html);
    const eps = [];
    $('.ep-item').each((i, el) => {
        eps.push({
            id: $(el).attr('data-id'),
            number: parseInt($(el).attr('data-number')),
            title: $(el).attr('title') || `Episode ${$(el).attr('data-number')}`
        });
    });
    return eps;
};

// --- MAIN CONTROLLER ---
const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    try {
        const Episode = mongoose.model('Episode');
        const Series = mongoose.model('Series');

        console.log(`📡 Processing: ${animeName} (${languageTag})`);

        let series = await Series.findOne({ title: `${animeName} (${languageTag})` });
        if (!series) {
            series = await Series.create({ title: `${animeName} (${languageTag})`, sourceUrl: mainUrl, language: languageTag });
        }

        const episodes = await getHiAnimeData(mainUrl);
        console.log(`🔍 Found ${episodes.length} episodes.`);

        for (let ep of episodes) {
            // Skip check hata diya hai taaki "Force Upload" ho
            const safeName = `${animeName.replace(/\s+/g, '_')}_Ep${ep.number}.mp4`;
            const filePath = path.join('/tmp', `temp_${Date.now()}.mp4`);

            try {
                // 1. Get Fresh Source Link
                const { data: sourceData } = await axios.get(`https://hianime.to/ajax/v2/episode/sources?id=${ep.id}`);
                const videoLink = sourceData.link;

                if (!videoLink) {
                    console.log(`❌ No link for Ep ${ep.number}`);
                    continue;
                }

                // 2. Download to Server
                console.log(`📥 Downloading Ep ${ep.number}...`);
                await withRetry(() => downloadVideo(videoLink, filePath));

                // 3. Upload to Streamtape
                console.log(`📤 Uploading Ep ${ep.number}...`);
                const streamtapeId = await withRetry(() => uploadToStreamtape(filePath, safeName));

                // 4. Update Database
                await Episode.findOneAndUpdate(
                    { seriesId: series._id, episodeNumber: ep.number },
                    { 
                        remoteId: streamtapeId, 
                        status: 'completed', 
                        title: ep.title 
                    },
                    { upsert: true }
                );

                console.log(`✅ Ep ${ep.number} Success: ${streamtapeId}`);

            } catch (err) {
                console.error(`❌ Failed Ep ${ep.number}: ${err.message}`);
            } finally {
                // Har episode ke baad file delete karo taaki storage na bhare
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            }

            // Sleep taaki IP ban na ho
            await sleep(5000);
        }

        console.log(`🏁 All work done for ${animeName}`);

    } catch (err) {
        console.error(`💥 GLOBAL CRASH: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
