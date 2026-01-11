const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');

const extractAndUpload = async (url, animeName, siteName, siteKey, skipCount = 0, languageTag) => {
    try {
        const Episode = mongoose.model('Episode');
        const Series = mongoose.model('Series');

        const response = await axios.get('https://api.zenrows.com/v1/', {
            params: { 'url': url, 'apikey': siteKey, 'js_render': 'true', 'premium_proxy': 'true' }
        });

        const $ = cheerio.load(response.data);
        let linkData = [];

        $('a').each((i, el) => {
            const link = $(el).attr('href');
            const text = $(el).text().toLowerCase();
            if (link && /pixeldrain|gdrive|drive|stream|720p|1080p|2160p|4k|download|sharer/i.test(link + text)) {
                let weight = link.includes('4k') ? 4000 : link.includes('1080') ? 1080 : link.includes('720') ? 720 : 480;
                linkData.push({ link, weight });
            }
        });

        if (linkData.length === 0) return;
        linkData.sort((a, b) => b.weight - a.weight);

        let series = await Series.findOneAndUpdate(
            { title: { $regex: new RegExp(`^${animeName}$`, 'i') } },
            { $set: { lastUpdated: new Date() } },
            { upsert: true, new: true }
        );

        const bestLink = linkData[0].link;
        const finalTitle = `${animeName} - Full [${languageTag}]`;

        const stUrl = `https://api.streamtape.com/file/remoteupload/add`;
        const up = await axios.get(stUrl, {
            params: {
                login: process.env.STREAMTAPE_LOGIN,
                key: process.env.STREAMTAPE_KEY,
                url: bestLink,
                name: finalTitle
            }
        });

        if (up.data && up.data.status === 200) {
            await Episode.create({
                seriesId: series._id,
                title: finalTitle,
                remoteId: up.data.result.id,
                episodeNumber: 1,
                language: languageTag,
                status: 'ready'
            });
            console.log(`✅ Success: ${animeName}`);
        }
    } catch (err) {
        console.log(`❌ Fail: ${animeName}`);
    }
};

module.exports = { extractAndUpload };
