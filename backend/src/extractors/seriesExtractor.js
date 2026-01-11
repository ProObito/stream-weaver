const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');
const { getUniversalMeta } = require('../services/mapper.service');
const { processEpisodes } = require('./videoExtractor'); // Video Logic Connect kiya

const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    try {
        const Series = mongoose.model('Series');
        
        console.log(`📡 Starting: ${animeName} [${languageTag}]`);

        // 1. UNIQUE TITLE LOGIC (Taaki Sub/Dub alag entries banein)
        const uniqueTitle = `${animeName} (${languageTag})`;
        
        // 2. SERIES CHECK OR CREATE
        let series = await Series.findOne({ title: uniqueTitle });

        if (!series) {
            console.log(`🔍 Fetching Meta for: ${animeName}`);
            // Universal Meta fetcher (Anilist/MAL)
            const meta = await getUniversalMeta(animeName, mainUrl);
            
            series = await Series.create({
                title: uniqueTitle,
                poster: meta.poster,
                description: meta.description,
                sourceUrl: mainUrl,
                language: languageTag,
                isPublished: false // Hamesha Draft mein rahega
            });
            console.log(`✅ Draft Created: ${uniqueTitle}`);
        }

        // 3. SCRAPING EPISODES FROM SOURCE
        const res = await axios.get(mainUrl, { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' },
            timeout: 10000
        });
        const $ = cheerio.load(res.data);
        
        let episodeList = [];

        // Yahan har site ke liye selector logic (HiAnime/TPX/DesiDub)
        // Common logic: Link mein 'episode' ya 'episodio' dhundho
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && (href.includes('/episode-') || href.includes('/episode/'))) {
                const fullUrl = href.startsWith('http') ? href : new URL(href, mainUrl).href;
                
                // Episode Number nikalne ki koshish (e.g. episode-12 -> 12)
                const epMatch = fullUrl.match(/episode-(\d+)/) || fullUrl.match(/\/(\d+)\/?$/);
                const epNum = epMatch ? parseInt(epMatch[1]) : i + 1;

                episodeList.push({
                    episode: epNum,
                    link: fullUrl,
                    title: `Episode ${epNum}`
                });
            }
        });

        // Duplicates hatao aur order sahi karo
        const uniqueEps = Array.from(new Set(episodeList.map(a => a.episode)))
            .map(ep => episodeList.find(a => a.episode === ep))
            .sort((a, b) => a.episode - b.episode);

        if (uniqueEps.length > 0) {
            console.log(`📦 Found ${uniqueEps.length} episodes. Sending to Video Extractor...`);
            
            // 4. CALL VIDEO EXTRACTOR (Background process)
            // Ye episodes ko Streamtape pe queue kar dega
            await processEpisodes(series, uniqueEps);
            
            console.log(`🚀 All episodes for ${animeName} are being processed!`);
        } else {
            console.log(`⚠️ No episodes found for ${animeName}. Link check karein.`);
        }

    } catch (err) {
        console.error(`❌ Global Extractor Error [${animeName}]: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
