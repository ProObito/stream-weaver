const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');

async function extractAndUpload(url, animeName, siteName, siteKey, skipCount = 0) {
    try {
        const Series = mongoose.model('Series');
        const Episode = mongoose.model('Episode');

        const response = await axios.get('https://api.zenrows.com/v1/', {
            params: { 'url': url, 'apikey': siteKey, 'premium_proxy': 'true' }
        });
        const $ = cheerio.load(response.data);
        
        let allPotentialLinks = [];
        $('a').each((i, el) => {
            const link = $(el).attr('href');
            if (link && link.includes('http') && !link.includes('google.com')) {
                allPotentialLinks.push(link);
            }
        });

        // Duplicates remove karo
        let uniqueLinks = [...new Set(allPotentialLinks)];

        // --- SMART FILTER: Sirf naye episodes uthao ---
        if (uniqueLinks.length <= skipCount) {
            console.log(`⏩ No new episodes on ${siteName} for ${animeName}`);
            return;
        }

        const newLinks = uniqueLinks.slice(skipCount); // Pehle wale skip kar diye
        console.log(`✨ Found ${newLinks.length} new episodes on ${siteName}`);

        let series = await Series.findOneAndUpdate(
            { title: animeName },
            { sourceSite: siteName, status: 'processing' },
            { upsert: true, new: true }
        );

        for (let i = 0; i < newLinks.length; i++) {
            const epNumber = skipCount + i + 1;
            const epTitle = `${animeName} - Episode ${epNumber}`;
            
            console.log(`📤 Uploading New EP ${epNumber} to Streamtape...`);
            
            const stUrl = `https://api.streamtape.com/file/remoteupload/add?login=${process.env.STREAMTAPE_LOGIN}&key=${process.env.STREAMTAPE_KEY}&url=${encodeURIComponent(newLinks[i])}&name=${encodeURIComponent(epTitle)}`;
            
            try {
                const up = await axios.get(stUrl);
                if (up.data.status === 200) {
                    await Episode.create({
                        seriesId: series._id,
                        title: epTitle,
                        remoteId: up.data.result.id,
                        status: 'pending'
                    });
                }
            } catch (e) { console.log("Streamtape Error"); }
            await new Promise(r => setTimeout(r, 2000));
        }

        await Series.findByIdAndUpdate(series._id, { status: 'completed' });
    } catch (err) { console.log("Extraction Failed"); }
}

module.exports = { extractAndUpload };
