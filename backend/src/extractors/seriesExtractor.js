const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');

const extractAndUpload = async (url, animeName, siteName, siteKey, languageTag) => {
    try {
        const Episode = mongoose.model('Episode');
        const Series = mongoose.model('Series');

        console.log(`🎯 Mission Start: Extracting ${animeName} from ${url}`);

        // ScraperAPI High-Level Settings
        const targetUrl = `https://api.scraperapi.com/?api_key=${siteKey}&url=${encodeURIComponent(url)}&render=true&premium=true&wait_until=networkidle2`;
        
        const response = await axios.get(targetUrl, { timeout: 120000 });
        const $ = cheerio.load(response.data);
        let linkData = [];

        // Quality aur Video host dhundna
        $('a').each((i, el) => {
            const link = $(el).attr('href');
            const text = $(el).text().toLowerCase();
            if (link && /pixeldrain|drive|stream|1080p|720p|4k|download/i.test(link + text)) {
                let weight = link.includes('4k') ? 4000 : link.includes('1080') ? 1080 : 720;
                linkData.push({ link, weight });
            }
        });

        if (linkData.length === 0) {
            console.log(`❌ Link nahi mila: ${animeName}`);
            return;
        }

        linkData.sort((a, b) => b.weight - a.weight);
        const bestLink = linkData[0].link;

        // DB Update
        let series = await Series.findOneAndUpdate(
            { title: { $regex: new RegExp(`^${animeName}$`, 'i') } },
            { $set: { lastUpdated: new Date() } },
            { upsert: true, new: true }
        );

        // Streamtape Upload
        console.log(`☁️ Uploading to Streamtape...`);
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
                title: `${animeName}`,
                remoteId: up.data.result.id,
                language: languageTag,
                status: 'ready'
            });
            console.log(`✨ Success: ${animeName} is live!`);
        }
    } catch (err) {
        console.error(`❌ Extraction Failed: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
