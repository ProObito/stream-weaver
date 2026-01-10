const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');

async function extractAndUpload(url, animeName, siteName, siteKey, skipCount = 0, languageTag) {
    try {
        const Episode = mongoose.model('Episode');
        const Series = mongoose.model('Series');

        const response = await axios.get('https://api.zenrows.com/v1/', {
            params: { 'url': url, 'apikey': siteKey, 'js_render': 'true', 'premium_proxy': 'true' }
        });

        const $ = cheerio.load(response.data);
        let foundLinks = [];

        // Exact pattern for download links
        $('a').each((i, el) => {
            const link = $(el).attr('href');
            if (link && /pixeldrain|gdrive|drive|streamtape|720p|1080p|download/i.test(link)) {
                foundLinks.push(link);
            }
        });

        let uniqueLinks = [...new Set(foundLinks)];
        if (uniqueLinks.length === 0) return;

        // Create Series
        let series = await Series.findOneAndUpdate(
            { title: animeName },
            { $set: { lastUpdated: new Date() } },
            { upsert: true, new: true }
        );

        for (let i = 0; i < uniqueLinks.length; i++) {
            const epNum = i + 1;
            const exists = await Episode.findOne({ seriesId: series._id, episodeNumber: epNum, language: languageTag });
            if (exists) continue;

            const finalTitle = `${animeName} - Ep ${epNum} [${languageTag}]`;
            
            // STREAMTAPE UPLOAD
            const stUrl = `https://api.streamtape.com/file/remoteupload/add`;
            try {
                const up = await axios.get(stUrl, {
                    params: {
                        login: process.env.STREAMTAPE_LOGIN,
                        key: process.env.STREAMTAPE_KEY,
                        url: uniqueLinks[i],
                        name: finalTitle
                    }
                });
                
                if (up.data && up.data.status === 200) {
                    await Episode.create({
                        seriesId: series._id,
                        title: finalTitle,
                        remoteId: up.data.result.id,
                        episodeNumber: epNum,
                        language: languageTag,
                        status: 'ready'
                    });
                    console.log(`✨ Success: ${finalTitle}`);
                } else {
                    console.log(`⚠️ Streamtape Rejected: ${up.data.msg}`);
                }
            } catch (uErr) {
                console.log(`❌ Upload Network Error`);
            }
            await new Promise(r => setTimeout(r, 1500));
        }
    } catch (err) { console.log(`❌ Extractor Error: ${animeName}`); }
}

module.exports = { extractAndUpload };
