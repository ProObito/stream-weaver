
const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');
const { getUniversalMeta } = require('../services/mapper.service');

/**
 * @param {string} mainUrl - Site ka link (HiAnime, TPX, etc.)
 * @param {string} animeName - User dwara diya gaya naam
 * @param {string} languageTag - Hindi Sub/Dub selection
 */
const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    try {
        const Series = mongoose.model('Series');
        const Episode = mongoose.model('Episode');

        console.log(`🚀 Extraction Started: ${animeName}`);

        // --- STEP 1: METADATA FETCHING (Anilist + HiAnime Mapper) ---
        // HiAnime ID extract karo agar English link hai
        let hiId = mainUrl.includes('hianime.to') || mainUrl.includes('zoro.to') 
                   ? mainUrl.split('/').pop().split('?')[0] 
                   : null;

        const meta = await getUniversalMeta(animeName, hiId);

        // Database mein save karo as DRAFT (isPublished: false)
        const series = await Series.findOneAndUpdate(
            { title: animeName },
            { 
                poster: meta.poster, 
                description: meta.description, 
                sourceUrl: mainUrl,
                rating: meta.rating || "N/A",
                genres: meta.genres || [],
                isPublished: false // Hamesha false taaki admin approval chahiye ho
            },
            { upsert: true, new: true }
        );

        console.log(`✅ Draft Created: ${series.title}`);

        // --- STEP 2: SCRAPING EPISODE LINKS ---
        const headers = { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
        };

        const res = await axios.get(mainUrl, { headers, timeout: 15000 });
        const $ = cheerio.load(res.data);

        let epLinks = [];
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            // Common patterns for anime episodes
            if (href && (href.includes('/episode') || href.includes('/episodio/') || href.includes('-episode-'))) {
                const fullLink = href.startsWith('http') ? href : new URL(href, mainUrl).href;
                epLinks.push(fullLink);
            }
        });

        // Unique links aur order sahi karna (Oldest to Newest)
        const uniqueEps = [...new Set(epLinks)].reverse();
        console.log(`📦 Found ${uniqueEps.length} episodes for ${animeName}`);

        // --- STEP 3: VIDEO EXTRACTION & STREAMTAPE UPLOAD ---
        for (let i = 0; i < uniqueEps.length; i++) {
            const epNum = i + 1;

            // Check if episode already exists to avoid double upload
            const existing = await Episode.findOne({ seriesId: series._id, episodeNumber: epNum });
            if (existing) continue;

            try {
                const epPage = await axios.get(uniqueEps[i], { headers });
                const $ep = cheerio.load(epPage.data);
                let vLink = "";

                // Find Video Source (Pixeldrain, Streamtape, etc.)
                $ep('a, iframe').each((j, el) => {
                    const l = $(el).attr('href') || $(el).attr('src');
                    if (l && /pixeldrain|streamtape|dood|file|drive/i.test(l)) {
                        vLink = l;
                    }
                });

                if (vLink) {
                    console.log(`⬆️ Uploading Ep ${epNum}...`);
                    
                    // Streamtape Remote Upload API
                    const up = await axios.get('https://api.streamtape.com/file/remoteupload/add', {
                        params: {
                            login: process.env.STREAMTAPE_LOGIN,
                            key: process.env.STREAMTAPE_KEY,
                            url: vLink,
                            name: `${animeName} - S01E${epNum}`
                        }
                    });

                    if (up.data && up.data.status === 200) {
                        await Episode.create({
                            seriesId: series._id,
                            title: `Episode ${epNum}`,
                            episodeNumber: epNum,
                            remoteId: up.data.result.id, // Streamtape File ID
                            language: languageTag
                        });
                        console.log(`✅ Ep ${epNum} Saved to DB`);
                    }
                }
            } catch (epErr) {
                console.log(`❌ Error in Ep ${epNum}: ${epErr.message}`);
            }

            // Anti-Ban Delay (1.5 seconds)
            await new Promise(r => setTimeout(r, 1500));
        }

        console.log(`✨ Extraction Finished for ${animeName}. Ready for Approval!`);

    } catch (err) {
        console.error(`🛑 Global Extractor Error: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
