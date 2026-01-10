const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');

async function extractAndUpload(url, animeName, siteName, siteKey) {
    try {
        const Series = mongoose.model('Series');
        const Episode = mongoose.model('Episode');

        // Step 1: Get Page Data
        const response = await axios.get('https://api.zenrows.com/v1/', {
            params: { 
                'url': url, 
                'apikey': siteKey.trim(),
                'premium_proxy': 'false' 
            }
        });

        const $ = cheerio.load(response.data);
        
        let lang = (siteName === "DesiDub") ? "Hindi Dubbed" : "Hindi Subbed";
        if (animeName.toLowerCase().includes("dubbed")) lang = "Hindi Dubbed";

        // Step 2: Save Series Initial Data
        let series = await Series.findOneAndUpdate(
            { title: animeName },
            { sourceSite: siteName, sourceUrl: url, language: lang, status: 'processing' },
            { upsert: true, new: true }
        );

        // Step 3: Find Quality Links
        const episodes = [];
        $('a').each((i, el) => {
            const link = $(el).attr('href');
            const text = $(el).text().toLowerCase();
            if (link && link.includes('http') && (text.includes('720p') || text.includes('1080p') || text.includes('download') || text.includes('direct'))) {
                episodes.push({ title: `${animeName} - Episode ${episodes.length + 1}`, url: link });
            }
        });

        if (episodes.length === 0) {
            console.log(`⚠️ No episodes found for ${animeName}`);
            return false;
        }

        // Step 4: Streamtape Remote Upload
        for (const ep of episodes) {
            try {
                const stUrl = `https://api.streamtape.com/file/remoteupload/add?login=${process.env.STREAMTAPE_LOGIN}&key=${process.env.STREAMTAPE_KEY}&url=${encodeURIComponent(ep.url)}&name=${encodeURIComponent(ep.title)} [${lang}]`;
                
                const up = await axios.get(stUrl);
                if (up.data.status === 200) {
                    await Episode.create({
                        seriesId: series._id,
                        title: ep.title,
                        remoteId: up.data.result.id,
                        status: 'pending'
                    });
                }
            } catch (err) {
                console.log(`   - Streamtape Skip: ${ep.title}`);
            }
            await new Promise(r => setTimeout(r, 1500));
        }

        await Series.findByIdAndUpdate(series._id, { status: 'completed' });
        console.log(`✅ Completed: ${animeName}`);
        return true;

    } catch (err) {
        console.log(`❌ Error extracting ${animeName}: ${err.message}`);
        return false;
    }
}

module.exports = { extractAndUpload };
