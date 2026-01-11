const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');

const extractAndUpload = async (mainUrl, animeName, siteName, siteKey, languageTag) => {
    try {
        const Episode = mongoose.model('Episode');
        const Series = mongoose.model('Series');

        console.log(`🚀 Deep Scan Started for: ${animeName}`);

        // 1. Pehle Main Page fetch karo saare episodes ki list nikalne ke liye
        const scraperUrl = `https://api.scraperapi.com/?api_key=${siteKey}&url=${encodeURIComponent(mainUrl)}&render=true`;
        const mainRes = await axios.get(scraperUrl);
        const $main = cheerio.load(mainRes.data);

        // 2. Anime Info (Poster/Desc) from MAL
        let poster = "", description = "";
        try {
            const mal = await axios.get(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(animeName)}&limit=1`);
            poster = mal.data.data[0].images.jpg.large_image_url;
            description = mal.data.data[0].synopsis;
        } catch (e) { console.log("MAL fetch failed"); }

        // 3. Series Entry in DB
        const series = await Series.findOneAndUpdate(
            { title: animeName },
            { poster, description, sourceUrl: mainUrl, isPublished: false },
            { upsert: true, new: true }
        );

        // 4. Saare Episode Links dhundna (Common for HindiSubAnime)
        let episodeLinks = [];
        $main('a').each((i, el) => {
            const href = $main(el).attr('href');
            const text = $main(el).text().toLowerCase();
            // Agar link mein 'episode' word hai ya text mein number hai
            if (href && (href.includes('/episodio/') || href.includes('/episode/'))) {
                episodeLinks.push({ url: href, num: i + 1 });
            }
        });

        // Duplicate links saaf karna
        episodeLinks = [...new Map(episodeLinks.map(item => [item.url, item])).values()];

        console.log(`📦 Found ${episodeLinks.length} episodes. Starting extraction...`);

        // 5. LOOP: Har episode ko extract karke upload karna
        for (const ep of episodeLinks) {
            try {
                console.log(`⏳ Processing Episode ${ep.num}...`);
                const epScrapeUrl = `https://api.scraperapi.com/?api_key=${siteKey}&url=${encodeURIComponent(ep.url)}&render=true`;
                const epRes = await axios.get(epScrapeUrl);
                const $ep = cheerio.load(epRes.data);

                let videoLink = "";
                $ep('a').each((j, el) => {
                    const link = $ep(el).attr('href');
                    if (link && /pixeldrain|drive|stream/i.test(link)) {
                        videoLink = link;
                    }
                });

                if (videoLink) {
                    // Streamtape Upload
                    const up = await axios.get('https://api.streamtape.com/file/remoteupload/add', {
                        params: {
                            login: process.env.STREAMTAPE_LOGIN,
                            key: process.env.STREAMTAPE_KEY,
                            url: videoLink,
                            name: `${animeName} - Ep ${ep.num}`
                        }
                    });

                    if (up.data.status === 200) {
                        await Episode.create({
                            seriesId: series._id,
                            title: `Episode ${ep.num}`,
                            remoteId: up.data.result.id,
                            episodeNumber: ep.num,
                            language: languageTag
                        });
                        console.log(`✅ Ep ${ep.num} Done!`);
                    }
                }
            } catch (err) {
                console.log(`❌ Error in Ep ${ep.num}: ${err.message}`);
            }
        }
        console.log(`✨ ALL DONE! ${animeName} is ready for approval.`);

    } catch (err) {
        console.error(`❌ Global Error: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
