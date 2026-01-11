const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');
const { getUniversalMeta } = require('../services/mapper.service');

const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    try {
        const Series = mongoose.model('Series');
        const Episode = mongoose.model('Episode');

        // Browser jaise Headers (block hone se bachne ke liye)
        const headers = { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        };

        // 1. Get Metadata & Save Series
        const meta = await getUniversalMeta(animeName, mainUrl);

        const series = await Series.findOneAndUpdate(
            { title: animeName },
            { 
                poster: meta.poster, 
                description: meta.description, 
                sourceUrl: mainUrl,
                rating: meta.rating,
                genres: meta.genres,
                isPublished: false // Admin approval ke baad true hoga
            },
            { upsert: true, new: true }
        );

        console.log(`✅ Series Saved: ${meta.title}`);

        // 2. Scrape Episode Links directly
        console.log(`🌐 Scraping URL: ${mainUrl}`);
        const res = await axios.get(mainUrl, { headers, timeout: 15000 });
        const $ = cheerio.load(res.data);

        let epLinks = [];
        // TPX/DesiDub/HiAnime Links Logic
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && (href.includes('/episode') || href.includes('/episodio/') || href.includes('-episode-'))) {
                const fullLink = href.startsWith('http') ? href : new URL(href, mainUrl).href;
                epLinks.push(fullLink);
            }
        });

        // Unique Links Reverse Order (Episode 1 pehle aaye)
        const uniqueEps = [...new Set(epLinks)].reverse();
        console.log(`📦 Found ${uniqueEps.length} episodes.`);

        // 3. Process Episodes
        for (let i = 0; i < uniqueEps.length; i++) {
            const epNum = i + 1;
            
            // Skip if already exists
            const existing = await Episode.findOne({ seriesId: series._id, episodeNumber: epNum });
            if (existing) {
                console.log(`⏩ Skipping Ep ${epNum} (Already exists)`);
                continue;
            }

            try {
                const epRes = await axios.get(uniqueEps[i], { headers });
                const $ep = cheerio.load(epRes.data);
                let vLink = "";

                // Video Link Finder (Pixeldrain/Streamtape/Doodstream)
                $ep('a, iframe').each((j, el) => {
                    const l = $(el).attr('href') || $(el).attr('src');
                    // Add logic to prioritize downloadable links
                    if (l && /pixeldrain|streamtape|dood|file|drive/i.test(l)) vLink = l;
                });

                if (vLink) {
                    console.log(`⬆️ Uploading Ep ${epNum} to Streamtape...`);
                    const up = await axios.get('https://api.streamtape.com/file/remoteupload/add', {
                        params: {
                            login: process.env.STREAMTAPE_LOGIN,
                            key: process.env.STREAMTAPE_KEY,
                            url: vLink,
                            name: `${animeName} - Episode ${epNum}`
                        }
                    });

                    if (up.data && up.data.status === 200) {
                        // Remote Upload ID save kar lo (Processing time lagta hai, ID zaroori hai)
                        await Episode.create({
                            seriesId: series._id,
                            title: `Episode ${epNum}`,
                            episodeNumber: epNum,
                            remoteId: up.data.result.id, // Ye Streamtape ID hai
                            language: languageTag
                        });
                        console.log(`✅ Success: Ep ${epNum} added to DB.`);
                    } else {
                        console.log(`⚠️ Streamtape Error: ${up.data.msg}`);
                    }
                } else {
                    console.log(`❌ No video link found for Ep ${epNum}`);
                }
            } catch (err) { console.log(`❌ Error Processing Ep ${epNum}: ${err.message}`); }
            
            // Thoda wait karo taaki site block na kare (2 sec delay)
            await new Promise(r => setTimeout(r, 2000));
        }
    } catch (err) {
        console.error(`🛑 Critical Error: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
