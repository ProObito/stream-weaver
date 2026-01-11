const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');

const extractAndUpload = async (mainUrl, animeName, siteName, siteKey, languageTag) => {
    try {
        const Series = mongoose.model('Series');
        const Episode = mongoose.model('Episode');

        console.log(`🚀 Starting Full Scan: ${animeName}`);

        const scraperUrl = `https://api.scraperapi.com/?api_key=${siteKey}&url=${encodeURIComponent(mainUrl)}&render=true`;
        const mainRes = await axios.get(scraperUrl);
        const $main = cheerio.load(mainRes.data);

        let poster = "", description = "";
        try {
            const mal = await axios.get(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(animeName)}&limit=1`);
            if (mal.data.data && mal.data.data.length > 0) {
                poster = mal.data.data[0].images.jpg.large_image_url;
                description = mal.data.data[0].synopsis;
            }
        } catch (e) { 
            console.log("MAL Skip"); 
        }

        const series = await Series.findOneAndUpdate(
            { title: { $regex: new RegExp(`^${animeName}$`, 'i') } },
            { poster, description, sourceUrl: mainUrl, isPublished: false },
            { upsert: true, new: true }
        );

        let epLinks = [];
        $main('a').each((i, el) => {
            const href = $main(el).attr('href');
            if (href && (href.includes('/episodio/') || href.includes('/episode/'))) {
                epLinks.push(href);
            }
        });

        const uniqueEps = [...new Set(epLinks)];
        console.log(`📦 Found ${uniqueEps.length} episodes.`);

        for (let i = 0; i < uniqueEps.length; i++) {
            try {
                const epNum = i + 1;
                const epScrapeUrl = `https://api.scraperapi.com/?api_key=${siteKey}&url=${encodeURIComponent(uniqueEps[i])}&render=true`;
                const epRes = await axios.get(epScrapeUrl);
                const $ep = cheerio.load(epRes.data);

                let vLink = "";
                $ep('a').each((j, el) => {
                    const l = $ep(el).attr('href');
                    if (l && /pixeldrain|drive|stream|sharer/i.test(l)) {
                        vLink = l;
                    }
                });

                if (vLink) {
                    const up = await axios.get('https://api.streamtape.com/file/remoteupload/add', {
                        params: {
                            login: process.env.STREAMTAPE_LOGIN,
                            key: process.env.STREAMTAPE_KEY,
                            url: vLink,
                            name: `${animeName} - E${epNum}`
                        }
                    });

                    if (up.data && up.data.status === 200) {
                        await Episode.findOneAndUpdate(
                            { seriesId: series._id, episodeNumber: epNum },
                            { title: `Episode ${epNum}`, remoteId: up.data.result.id, language: languageTag },
                            { upsert: true }
                        );
                        console.log(`✅ Ep ${epNum} Done`);
                    }
                }
            } catch (err) { 
                console.log(`Error in Loop: ${err.message}`); 
            }
        }
    } catch (err) { 
        console.error(`Global Error: ${err.message}`); 
    }
};

module.exports = { extractAndUpload };
