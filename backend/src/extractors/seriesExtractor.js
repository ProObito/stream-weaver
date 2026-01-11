const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');

const extractAndUpload = async (url, animeName, siteName, siteKey, languageTag) => {
    try {
        const Episode = mongoose.model('Episode');
        const Series = mongoose.model('Series');

        console.log(`🧪 Extracting: ${animeName}`);

        const response = await axios.get('https://api.scraperapi.com/', {
            params: { 
                api_key: siteKey,
                url: url, 
                render: 'true',
                premium: 'true'
            },
            timeout: 60000
        });

        const $ = cheerio.load(response.data);
        let linkData = [];

        // Quality Priority Logic
        $('a').each((i, el) => {
            const link = $(el).attr('href');
            const text = $(el).text().toLowerCase();
            if (link && /pixeldrain|gdrive|drive|stream|720p|1080p|2160p|4k|download|sharer/i.test(link + text)) {
                let weight = link.includes('4k') ? 4000 : link.includes('1080') ? 1080 : link.includes('720') ? 720 : 480;
                linkData.push({ link, weight });
            }
        });

        if (linkData.length === 0) {
            console.log(`⚠️ No links found for ${animeName}`);
            return;
        }

        linkData.sort((a, b) => b.weight - a.weight);

        let series = await Series.findOneAndUpdate(
            { title: animeName },
            { $set: { lastUpdated: new Date() } },
            { upsert: true, new: true }
        );

        // Uploading best quality
        const bestLink = linkData[0].link;
        const up = await axios.get('https://api.streamtape.com/file/remoteupload/add', {
            params: {
                login: process.env.STREAMTAPE_LOGIN,
                key: process.env.STREAMTAPE_KEY,
                url: bestLink,
                name: `${animeName} [${languageTag}]`
            }
        });

        if (up.data && up.data.status === 200) {
            await Episode.create({
                seriesId: series._id,
                title: `${animeName} - Best Quality`,
                remoteId: up.data.result.id,
                episodeNumber: 1,
                language: languageTag,
                status: 'ready'
            });
            console.log(`✨ Success: ${animeName}`);
        }
    } catch (err) {
        console.log(`❌ Link Extraction Fail: ${animeName}`);
    }
};

module.exports = { extractAndUpload };
