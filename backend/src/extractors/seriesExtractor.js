const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');

const extractAndUpload = async (mainUrl, animeName, siteName, siteKey, languageTag) => {
    try {
        // Models late-load kar rahe hain taaki connection error na aaye
        const Series = mongoose.model('Series');
        const Episode = mongoose.model('Episode');

        console.log(`🚀 Mission: ${animeName} - Deep Scan Started`);

        // 1. Fetch Main Page for Episode List
        const scraperUrl = `https://api.scraperapi.com/?api_key=${siteKey}&url=${encodeURIComponent(mainUrl)}&render=true`;
        const mainRes = await axios.get(scraperUrl, { timeout: 60000 });
        const $main = cheerio.load(mainRes.data);

        // 2. Fetch Info from MAL (Jikan API)
        let poster = "", description = "";
        try {
            const malRes = await axios.get(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(animeName)}&limit=1`);
            if (malRes.data.data && malRes.data.data.length > 0) {
                poster = malRes.data.data[0].images.jpg.large_image_url;
                description = malRes.data.data[0].synopsis;
            }
        } catch (e) { console.log("⚠️ MAL Info fetch skipped"); }

        // 3. Create/Update Series as Draft
        const series = await Series.findOneAndUpdate(
            { title: { $regex: new RegExp(`^${animeName}$`, 'i') } },
            { 
                poster, 
                description, 
                sourceUrl: mainUrl, 
                isPublished: false, // Draft mode
                lastUpdated: new Date()
            },
            { upsert: true, new: true, runValidators: false }
        );

        // 4. Collect Episode Links
        let episodeLinks = [];
        $main('a').each((i, el) => {
            const href = $main(el).attr('href');
            if (href && (href.includes('/episodio/') || href.includes('/episode/'))) {
                episodeLinks.push(href);
            }
        });

        // Unique links only
        const uniqueLinks = [...new Set(episodeLinks)];
        console.log(`📦 Found ${uniqueLinks.length} episodes for ${animeName}`);

        // 5. Loop through episodes
        for (let i = 0; i < uniqueLinks.length; i++) {
            const epUrl = uniqueLinks[i];
            const epNum = i + 1;

            try {
                console.log(`⏳ Processing Ep ${epNum}...`);
                const epScrapeUrl = `https://api.scraperapi.com/?api_key=${siteKey}&url=${encodeURIComponent(epUrl)}&render=true`;
                const epRes = await axios.get(epScrapeUrl, { timeout: 60000 });
                const $ep = cheerio.load(epRes.data);

                let videoLink = "";
                $ep('a').each((j, el) => {
                    const link = $ep(el).attr('href');
                    if (link && /pixeldrain|drive|stream|sharer/i.test(link)) {
                        videoLink = link;
                    }
                });

                if (videoLink) {
                    const up = await axios.get('https://api.streamtape.com/file/remoteupload/add', {
                        params: {
                            login: process.env.STREAMTAPE_LOGIN,
                            key: process.env.STREAMTAPE_KEY,
                            url: videoLink,
                            name: `${animeName} - Ep ${epNum}`
                        }
                    });

                    if (up.data && up.data.status === 200) {
                        await Episode.findOneAndUpdate(
                            { seriesId: series._id, episodeNumber: epNum },
                            { 
                                title: `Episode ${epNum}`, 
                                remoteId: up.data.result.id, 
                                language: languageTag 
                            },
                            { upsert: true }
                        );
                        console.log(`✅ Episode ${epNum} Uploaded`);
                    }
                }
            } catch (epErr) {
                console.error(`❌ Skip Ep ${epNum}: ${epErr.message}`);
                continue; // Ek episode fail ho toh agle pe jao
            }
        }
        console.log(`✨ Loop Finished for ${animeName}`);

    } catch (err) {
        console.error(`🛑 Global Extractor Error: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
