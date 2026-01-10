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
            if (link && /pixeldrain|gdrive|drive|stream|720p|1080p|download/.test(link.toLowerCase())) {
                foundLinks.push(link);
            }
        });

        let uniqueLinks = [...new Set(foundLinks)];
        if (uniqueLinks.length === 0) return;

        // Series dhundo ya banao (Same name = Same Series ID)
        let series = await Series.findOneAndUpdate(
            { title: { $regex: new RegExp(`^${animeName}$`, 'i') } },
            { $set: { lastUpdated: new Date() } },
            { upsert: true, new: true }
        );

        for (let i = 0; i < uniqueLinks.length; i++) {
            const epNum = i + 1; // Direct episode number mapping
            const finalTitle = `${animeName} - Ep ${epNum} [${languageTag}]`;

            // Check if this specific language version already exists
            const exists = await Episode.findOne({ 
                seriesId: series._id, 
                episodeNumber: epNum, 
                language: languageTag 
            });

            if (exists) {
                console.log(`⏩ Already have ${languageTag} for Ep ${epNum}`);
                continue;
            }

            console.log(`⏳ Uploading ${languageTag} version of Ep ${epNum}...`);
            
            try {
                const stUrl = `https://api.streamtape.com/file/remoteupload/add?login=${process.env.STREAMTAPE_LOGIN}&key=${process.env.STREAMTAPE_KEY}&url=${encodeURIComponent(uniqueLinks[i])}&name=${encodeURIComponent(finalTitle)}`;
                const up = await axios.get(stUrl);
                
                if (up.data.status === 200) {
                    await Episode.create({
                        seriesId: series._id,
                        title: finalTitle,
                        remoteId: up.data.result.id,
                        episodeNumber: epNum,
                        language: languageTag, // 'Multi' or 'Hindi Sub'
                        status: 'pending'
                    });
                    console.log(`✨ Added to DB: Ep ${epNum} (${languageTag})`);
                }
            } catch (err) { console.log("Upload Error"); }
            
            await new Promise(r => setTimeout(r, 2000));
        }
    } catch (err) { console.log(`❌ Fail: ${animeName}`); }
}

module.exports = { extractAndUpload };
