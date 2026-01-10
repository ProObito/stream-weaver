const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');

async function extractAndUpload(url, animeName, siteName, siteKey, skipCount = 0, languageTag) {
    try {
        const Series = mongoose.model('Series');
        const Episode = mongoose.model('Episode');

        const response = await axios.get('https://api.zenrows.com/v1/', {
            params: { 'url': url, 'apikey': siteKey, 'js_render': 'true', 'premium_proxy': 'true' }
        });
        const $ = cheerio.load(response.data);
        
        let availableLinks = [];
        $('a, button, [href]').each((i, el) => {
            const link = $(el).attr('href') || $(el).attr('data-link');
            if (link && link.includes('http') && /gdrive|pixeldrain|stream|720p|1080p|download/.test(link.toLowerCase())) {
                availableLinks.push(link);
            }
        });

        let uniqueLinks = [...new Set(availableLinks)];

        // Skip logic for Lords/YBX
        if (skipCount > 0 && uniqueLinks.length <= skipCount) return;
        const linksToExtract = (skipCount > 0) ? uniqueLinks.slice(skipCount) : uniqueLinks;

        let series = await Series.findOneAndUpdate(
            { title: animeName },
            { $set: { lastUpdated: new Date() } },
            { upsert: true, new: true }
        );

        for (let i = 0; i < linksToExtract.length; i++) {
            const epNumber = (skipCount > 0) ? (skipCount + i + 1) : (i + 1);
            const finalTitle = `${animeName} - Ep ${epNumber} [${languageTag}]`;

            // Check if this exact episode from this exact site already exists
            const exists = await Episode.findOne({ seriesId: series._id, title: finalTitle });
            if (exists) continue;

            console.log(`📤 Uploading Ep ${epNumber} (${languageTag}) from ${siteName}`);
            
            try {
                const stUrl = `https://api.streamtape.com/file/remoteupload/add?login=${process.env.STREAMTAPE_LOGIN}&key=${process.env.STREAMTAPE_KEY}&url=${encodeURIComponent(linksToExtract[i])}&name=${encodeURIComponent(finalTitle)}`;
                const up = await axios.get(stUrl);
                
                if (up.data.status === 200) {
                    await Episode.create({
                        seriesId: series._id,
                        title: finalTitle,
                        remoteId: up.data.result.id,
                        episodeNumber: epNumber,
                        language: languageTag,
                        status: 'pending'
                    });
                }
            } catch (err) { }
        }
    } catch (err) { console.log(`❌ Error: ${err.message}`); }
}

module.exports = { extractAndUpload };
