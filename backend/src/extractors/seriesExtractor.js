const axios = require('axios');
const mongoose = require('mongoose');

async function extractAndUpload(url, animeName, siteName, siteKey, skipCount = 0, languageTag) {
    try {
        const Episode = mongoose.model('Episode');
        const Series = mongoose.model('Series');

        const response = await axios.get('https://api.zenrows.com/v1/', {
            params: { 'url': url, 'apikey': siteKey, 'autoparse': 'true', 'premium_proxy': 'true' }
        });

        let foundLinks = [];
        if (response.data && response.data.links) {
            response.data.links.forEach(l => {
                if (l.href && /pixeldrain|gdrive|drive|stream|720p|1080p|download/.test(l.href.toLowerCase())) {
                    foundLinks.push(l.href);
                }
            });
        }

        let uniqueLinks = [...new Set(foundLinks)];
        if (uniqueLinks.length === 0) return;

        let series = await Series.findOneAndUpdate(
            { title: { $regex: new RegExp(`^${animeName}$`, 'i') } },
            { $set: { lastUpdated: new Date() } },
            { upsert: true, new: true }
        );

        for (let i = 0; i < uniqueLinks.length; i++) {
            const epNum = i + 1;

            // 🔍 EPISODE RESUME CHECK:
            const exists = await Episode.findOne({ 
                seriesId: series._id, 
                episodeNumber: epNum, 
                language: languageTag 
            });

            if (exists) {
                // Agar episode pehle se hai, toh upload skip karo
                continue; 
            }

            console.log(`⏳ [NEW] Uploading: ${animeName} Ep ${epNum} [${languageTag}]`);
            
            try {
                const finalTitle = `${animeName} - Ep ${epNum} [${languageTag}]`;
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
            await new Promise(r => setTimeout(r, 2000));
        }
    } catch (err) { console.log(`❌ Error extracting ${animeName}`); }
}

module.exports = { extractAndUpload };
