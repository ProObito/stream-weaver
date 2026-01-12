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
            console.log(`⚠️ Attempt ${i + 1} failed. Retrying in ${delay / 1000}s...`);
            await sleep(delay);
        }
    }
};

// --- STREAMTAPE UPLOAD ---
const uploadToStreamtape = async (filePath) => {
    const login = process.env.STREAMTAPE_LOGIN;
    const key = process.env.STREAMTAPE_KEY;
    
    // 1. Get Upload URL
    const { data: serverData } = await axios.get(`https://api.streamtape.com/file/ul?login=${login}&key=${key}`);
    if (serverData.status !== 200) throw new Error("Streamtape API Error");
    
    // 2. Upload with Form Data
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
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        timeout: 300000 // 5 Minute timeout
    });
    const writer = fs.createWriteStream(dest);
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
};

// --- MAIN EXTRACTOR ---
const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    try {
        const Episode = mongoose.model('Episode');
        const Series = mongoose.model('Series');
        
        console.log(`🚀 Starting Local Sync for: ${animeName}`);
        let series = await Series.findOne({ title: new RegExp(animeName, 'i') });

        // Yahan episodeList fetch karne ka logic (HiAnime/Gogo/TPX) wahi purana use karein
        // Let's assume 'episodeList' is populated...

        for (let ep of episodeList) {
            const fileName = `${animeName.replace(/\s+/g, '_')}_Ep${ep.episode}.mp4`;
            const filePath = path.join(__dirname, fileName);

            try {
                // STEP 1: DOWNLOAD WITH RETRY
                console.log(`📥 Downloading: ${fileName}`);
                await withRetry(() => downloadVideo(ep.link, filePath));

                // STEP 2: UPLOAD WITH RETRY
                console.log(`📤 Uploading to Streamtape: ${fileName}`);
                const videoId = await withRetry(() => uploadToStreamtape(filePath));

                if (videoId) {
                    await Episode.findOneAndUpdate(
                        { seriesId: series._id, episodeNumber: ep.episode },
                        { remoteId: videoId, status: 'completed' },
                        { upsert: true }
                    );
                    console.log(`✅ Success: Ep ${ep.episode} (ID: ${videoId})`);
                }

            } catch (err) {
                console.error(`❌ Permanent Failure for Ep ${ep.episode}: ${err.message}`);
            } finally {
                // STEP 3: DELETE LOCAL FILE IMMEDIATELY
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log(`🗑️ Storage Cleared: ${fileName}`);
                }
            }
            
            await sleep(2000); // Small rest to avoid CPU spike
        }
    } catch (err) {
        console.error(`❌ Extractor Crash: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
