const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');

const extractAndUpload = async (url, animeName, siteName, siteKey, languageTag) => {
    try {
        const Episode = mongoose.model('Episode');
        const Series = mongoose.model('Series');

        // ScraperAPI call
        const targetUrl = `https://api.scraperapi.com/?api_key=${siteKey}&url=${encodeURIComponent(url)}&render=true&premium=true&wait_until=networkidle2`;
        const response = await axios.get(targetUrl, { timeout: 120000 });
        const $ = cheerio.load(response.data);

        // 1. SMART TITLE LOGIC: Agar animeName "Watch Series" hai, toh page se asli naam nikalo
        let finalTitle = animeName;
        if (animeName.toLowerCase().includes("watch series") || animeName.length < 3) {
            finalTitle = $('h1').first().text().replace(/Watch|Series|Hindi|Sub|Dub/gi, '').trim();
        }

        console.log(`🎯 Actual Name Identified: ${finalTitle}`);

        let linkData = [];
        $('a').each((i, el) => {
            const link = $(el).attr('href');
            const text = $(el).text().toLowerCase();
            if (link && /pixeldrain|drive|stream|1080p|720p|4k|download|sharer/i.test(link + text)) {
                let weight = link.includes('1080') ? 1080 : link.includes('720') ? 720 : 480;
                linkData.push({ link, weight });
            }
        });

        if (linkData.length === 0) {
            console.log(`❌ No video links found for: ${finalTitle}`);
            return;
        }

        linkData.sort((a, b) => b.weight - a.weight);

        // 2. DUPLICATE FIX: findOneAndUpdate mein sourceUrl handle karna
        let series = await Series.findOne({ 
            $or: [{ title: new RegExp(`^${finalTitle}$`, 'i') }, { sourceUrl: url }] 
        });

        if (!series) {
            series = await Series.create({
                title: finalTitle,
                sourceUrl: url,
                status: 'ongoing',
                lastUpdated: new Date()
            }).catch(err => {
                // Agar index error aaye toh existing series utha lo
                if (err.code === 11000) return Series.findOne({ sourceUrl: url });
                throw err;
            });
        }

        // 3. STREAMTAPE UPLOAD
        console.log(`☁️ Uploading to Streamtape: ${finalTitle}`);
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
                title: `${finalTitle} - Episode 1`,
                remoteId: up.data.result.id,
                language: languageTag,
                status: 'ready'
            });
            console.log(`✨ Mission Success: ${finalTitle}`);
        }

    } catch (err) {
        console.error(`❌ Extraction Failed for ${animeName}: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
