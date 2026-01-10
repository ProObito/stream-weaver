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

        // Saare links scan karo jo download ya stream se related hain
        $('a, button, [data-link]').each((i, el) => {
            const link = $(el).attr('href') || $(el).attr('data-link') || '';
            if (link && /pixeldrain|gdrive|drive|stream|720p|1080p|download|sharer|file/.test(link.toLowerCase())) {
                foundLinks.push(link);
            }
        });

        let uniqueLinks = [...new Set(foundLinks)];
        console.log(`🔗 Found ${uniqueLinks.length} links for ${animeName}`);

        if (uniqueLinks.length === 0) return;

        let series = await Series.findOneAndUpdate(
            { title: { $regex: new RegExp(`^${animeName}$`, 'i') } },
            { $set: { lastUpdated: new Date() } },
            { upsert: true, new: true }
        );

        for (let i = 0; i < uniqueLinks.length; i++) {
            const epNum = i + 1;
            const exists = await Episode.findOne({ seriesId: series._id, episodeNumber: epNum, language: languageTag });

            if (exists) continue;

            const finalTitle = `${animeName} - Ep ${epNum} [${languageTag}]`;
            console.log(`⏳ Uploading: ${finalTitle}`);
            
            try {
                const stUrl = `https://api.streamtape.com/file/remoteupload/add?login=${process.env.STREAMTAPE_LOGIN}&key=${process.env.STREAMTAPE_KEY}&url=${encodeURIComponent(uniqueLinks[i])}&name=${encodeURIComponent(finalTitle)}`;
                const up = await axios.get(stUrl);
                
                if (up.data.status === 200) {
                    await Episode.create({
                        seriesId: series._id,
                        title: finalTitle,
                        remoteId: up.data.result.id,
                        episodeNumber: epNum,
                        language: languageTag,
                        status: 'pending'
                    });
                }
            } catch (err) { console.log("Upload Err"); }
            await new Promise(r => setTimeout(r, 1000));
        }
    } catch (err) { console.log(`❌ Error in ${animeName}`); }
}

module.exports = { extractAndUpload };
