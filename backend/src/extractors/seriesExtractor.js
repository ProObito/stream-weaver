const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');

async function extractAndUpload(url, animeName, siteName, siteKey, skipCount = 0, languageTag) {
    try {
        const Episode = mongoose.model('Episode');
        const Series = mongoose.model('Series');

        // Lords/YBX ke pages pe JS Render hona zaroori hai
        const response = await axios.get('https://api.zenrows.com/v1/', {
            params: { 'url': url, 'apikey': siteKey, 'js_render': 'true', 'premium_proxy': 'true' },
            timeout: 60000
        });
        const $ = cheerio.load(response.data);
        
        let foundLinks = [];
        // Scan all possible link sources
        $('a, button, [onclick], [data-link]').each((i, el) => {
            const raw = $(el).attr('href') || $(el).attr('data-link') || $(el).attr('onclick') || '';
            const link = raw.match(/https?:\/\/[^\s'"]+/); // Extract URL from string
            
            if (link && /pixeldrain|gdrive|drive|stream|720p|1080p|download|sharer/.test(link[0].toLowerCase())) {
                foundLinks.push(link[0]);
            }
        });

        let uniqueLinks = [...new Set(foundLinks)];
        
        // Skip logic for Lords/YBX
        if (uniqueLinks.length <= skipCount && skipCount !== 0) {
            console.log(`⏩ No new episodes to add for ${animeName}`);
            return;
        }

        const linksToProcess = (skipCount > 0) ? uniqueLinks.slice(skipCount) : uniqueLinks;

        let series = await Series.findOneAndUpdate(
            { title: animeName },
            { $set: { lastUpdated: new Date() } },
            { upsert: true, new: true }
        );

        for (let i = 0; i < linksToProcess.length; i++) {
            const epNum = skipCount + i + 1;
            const finalTitle = `${animeName} - Ep ${epNum} [${languageTag}]`;

            // Anti-duplicate check
            const exists = await Episode.findOne({ seriesId: series._id, title: finalTitle });
            if (exists) continue;

            console.log(`📤 Uploading Ep ${epNum} [${languageTag}] to Streamtape...`);
            
            try {
                const stUrl = `https://api.streamtape.com/file/remoteupload/add?login=${process.env.STREAMTAPE_LOGIN}&key=${process.env.STREAMTAPE_KEY}&url=${encodeURIComponent(linksToProcess[i])}&name=${encodeURIComponent(finalTitle)}`;
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
            } catch (err) { console.log("Streamtape Err"); }
        }
    } catch (err) { console.log(`❌ Error extracting ${animeName}`); }
}

module.exports = { extractAndUpload };
