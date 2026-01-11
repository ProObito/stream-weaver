const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');

const extractAndUpload = async (url, animeName, siteName, siteKey, languageTag) => {
    try {
        const Episode = mongoose.model('Episode');
        const Series = mongoose.model('Series');

        const targetUrl = `https://api.scraperapi.com/?api_key=${siteKey}&url=${encodeURIComponent(url)}&render=true`;
        
        const response = await axios.get(targetUrl, { timeout: 60000 });
        const $ = cheerio.load(response.data);
        let linkData = [];

        $('a').each((i, el) => {
            const link = $(el).attr('href');
            const text = $(el).text().toLowerCase();
            if (link && /pixeldrain|gdrive|drive|stream|720p|1080p|4k|download/i.test(link + text)) {
                let weight = link.includes('4k') ? 4000 : link.includes('1080') ? 1080 : 720;
                linkData.push({ link, weight });
            }
        });

        if (linkData.length === 0) return;
        linkData.sort((a, b) => b.weight - a.weight);

        let series = await Series.findOneAndUpdate(
            { title: animeName },
            { $set: { lastUpdated: new Date() } },
            { upsert: true, new: true }
        );

        const up = await axios.get('https://api.streamtape.com/file/remoteupload/add', {
            params: {
                login: process.env.STREAMTAPE_LOGIN,
                key: process.env.STREAMTAPE_KEY,
                url: linkData[0].link,
                name: `${animeName} [${languageTag}]`
            }
        });

        if (up.data.status === 200) {
            await Episode.create({
                seriesId: series._id,
                title: `${animeName}`,
                remoteId: up.data.result.id,
                episodeNumber: 1,
                language: languageTag,
                status: 'ready'
            });
            console.log(`✨ Success: ${animeName}`);
        }
    } catch (err) {
        console.log(`❌ Fail: ${animeName}`);
    }
};

module.exports = { extractAndUpload };
