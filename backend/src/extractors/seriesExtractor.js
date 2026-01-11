const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');

const extractAndUpload = async (url, animeName, siteName, siteKey, languageTag) => {
    try {
        const Episode = mongoose.model('Episode');
        const Series = mongoose.model('Series');

        const targetUrl = `https://api.scraperapi.com/?api_key=${siteKey}&url=${encodeURIComponent(url)}&render=true&premium=true&wait_until=networkidle2`;
        const response = await axios.get(targetUrl, { timeout: 120000 });
        const $ = cheerio.load(response.data);

        // Name Cleanup
        let finalTitle = animeName;
        if (animeName.toLowerCase().includes("watch series") || animeName.length < 3) {
            finalTitle = $('h1').first().text().replace(/Watch|Series|Hindi|Sub|Dub|Anime/gi, '').trim();
        }

        console.log(`🎯 Target: ${finalTitle}`);

        // MAL se Info aur Image nikalna (Jikan API - Free)
        let coverImage = "";
        let description = "No description available.";
        try {
            const malRes = await axios.get(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(finalTitle)}&limit=1`);
            if (malRes.data.data.length > 0) {
                coverImage = malRes.data.data[0].images.jpg.large_image_url;
                description = malRes.data.data[0].synopsis;
            }
        } catch (e) { console.log("MAL Info Fetch Failed"); }

        let linkData = [];
        $('a').each((i, el) => {
            const link = $(el).attr('href');
            const text = $(el).text().toLowerCase();
            if (link && /pixeldrain|drive|stream|1080p|720p|4k|download|sharer/i.test(link + text)) {
                linkData.push({ link, weight: link.includes('1080') ? 1080 : 720 });
            }
        });

        if (linkData.length === 0) return console.log(`❌ No links for ${finalTitle}`);

        linkData.sort((a, b) => b.weight - a.weight);

        // DB Update (Status hata diya hai taaki validation error na aaye)
        let series = await Series.findOneAndUpdate(
            { title: { $regex: new RegExp(`^${finalTitle}$`, 'i') } },
            { 
                $set: { 
                    sourceUrl: url,
                    poster: coverImage,
                    description: description,
                    lastUpdated: new Date()
                } 
            },
            { upsert: true, new: true, runValidators: false } // runValidators false kar diya
        );

        console.log(`☁️ Uploading to Streamtape...`);
        const up = await axios.get('https://api.streamtape.com/file/remoteupload/add', {
            params: {
                login: process.env.STREAMTAPE_LOGIN,
                key: process.env.STREAMTAPE_KEY,
                url: linkData[0].link,
                name: `${finalTitle} [${languageTag}]`
            }
        });

        if (up.data && up.data.status === 200) {
            await Episode.create({
                seriesId: series._id,
                title: `${finalTitle} - Main`,
                remoteId: up.data.result.id,
                language: languageTag
            });
            console.log(`✨ DONE: ${finalTitle} is now LIVE with info/image!`);
        }

    } catch (err) {
        console.error(`❌ Fail: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
