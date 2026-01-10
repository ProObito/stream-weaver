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
        $('a, button, [data-link]').each((i, el) => {
            const link = $(el).attr('href') || $(el).attr('data-link');
            if (link && link.includes('http') && /pixeldrain|gdrive|drive|stream|720p|1080p|download/.test(link.toLowerCase())) {
                foundLinks.push(link);
            }
        });

        let uniqueLinks = [...new Set(foundLinks)];
        const linksToProcess = (skipCount > 0) ? uniqueLinks.slice(skipCount) : uniqueLinks;

        if (linksToProcess.length === 0) return;

        let series = await Series.findOneAndUpdate(
            { title: animeName },
            { $set: { lastUpdated: new Date() } },
            { upsert: true, new: true }
        );

        // --- ONE-BY-ONE EPISODE LOOP ---
        for (let i = 0; i < linksToProcess.length; i++) {
            const epNum = skipCount + i + 1;
            const finalTitle = `${animeName} - Ep ${epNum} [${languageTag}]`;

            // Duplicate check
            const exists = await Episode.findOne({ seriesId: series._id, title: finalTitle });
            if (exists) {
                console.log(`⏩ Skipping existing: ${finalTitle}`);
                continue;
            }

            console.log(`⏳ Uploading EP ${epNum} from ${siteName}...`);
            
            try {
                const stUrl = `https://api.streamtape.com/file/remoteupload/add?login=${process.env.STREAMTAPE_LOGIN}&key=${process.env.STREAMTAPE_KEY}&url=${encodeURIComponent(linksToProcess[i])}&name=${encodeURIComponent(finalTitle)}`;
                
                // Hum wait karenge jab tak Streamtape 'OK' na bole
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
                    console.log(`✨ DONE: ${finalTitle}`);
                }
            } catch (err) { console.log(`⚠️ Streamtape upload failed for Ep ${epNum}`); }

            // Har episode ke baad 3 second ka break taaki Streamtape API limit hit na ho
            await new Promise(r => setTimeout(r, 3000));
        }
    } catch (err) { console.log(`❌ Error in ${animeName}`); }
}

module.exports = { extractAndUpload };
