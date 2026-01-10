const axios = require('axios');
const cheerio = require('cheerio');
const Anime = require('../models/Anime'); // Check kar lena tera Model name 'Anime' hai ya 'Series'

async function extractAndUpload(url, animeName) {
    try {
        console.log(`🎬 Processing: ${animeName}`);

        // 1. MAL (MyAnimeList) se Info Fetch karna
        let animeInfo = { poster: '', plot: '', rating: '' };
        try {
            const malRes = await axios.get(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(animeName)}&limit=1`);
            if (malRes.data.data[0]) {
                const data = malRes.data.data[0];
                animeInfo = {
                    poster: data.images.jpg.large_image_url,
                    plot: data.synopsis,
                    rating: data.score
                };
            }
        } catch (e) { console.log("⚠️ MAL Info not found, proceeding without it."); }

        // 2. Page Scrape karna (ZenRows se)
        const response = await axios.get(`https://api.zenrows.com/v1/?key=${process.env.ZENROWS_API_KEY}&url=${encodeURIComponent(url)}&wait_for=.post-content`);
        const $ = cheerio.load(response.data);
        
        const episodes = [];
        // Desidubanime ke links nikalna (Direct / Hdrive / GDF)
        $('.post-content a').each((i, el) => {
            const linkUrl = $(el).attr('href');
            const linkText = $(el).text().toLowerCase();
            
            // Logic: Agar link hai aur video quality ya direct likha hai
            if (linkUrl && linkUrl.includes('http')) {
                 // Duplicate filtering simple logic
                 if (!episodes.find(e => e.sourceUrl === linkUrl)) {
                    episodes.push({
                        episodeNum: episodes.length + 1,
                        sourceUrl: linkUrl
                    });
                 }
            }
        });

        console.log(`📦 Found ${episodes.length} episodes for ${animeName}`);

        // 3. Database Entry Create karna
        // Dhyan dena: Tera model 'Series' hai ya 'Anime', wo yahan adjust karna
        // Agar tera model file 'Series.js' hai, toh upar import bhi 'Series' karna
        /* Example: const newSeries = await Series.create({ title: animeName, ...animeInfo });
        */

        // 4. Streamtape Remote Upload Trigger
        for (const ep of episodes) {
            const remoteUrl = `https://api.streamtape.com/file/remoteupload/add?login=${process.env.STREAMTAPE_LOGIN}&key=${process.env.STREAMTAPE_KEY}&url=${encodeURIComponent(ep.sourceUrl)}&name=${encodeURIComponent(animeName + ' Ep ' + ep.episodeNum)}`;
            
            try {
                const uploadRes = await axios.get(remoteUrl);
                if (uploadRes.data.status === 200) {
                    console.log(`✅ Queued on Streamtape: Episode ${ep.episodeNum}`);
                }
            } catch (err) {
                console.error(`❌ Upload Failed for Ep ${ep.episodeNum}`);
            }
            // 2 sec gap taaki API limit hit na ho
            await new Promise(r => setTimeout(r, 2000));
        }

        return { success: true };
    } catch (error) {
        console.error("Extraction Failed:", error.message);
        return { success: false, error: error.message };
    }
}

module.exports = { extractAndUpload };
