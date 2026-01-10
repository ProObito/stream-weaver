const axios = require('axios');
const cheerio = require('cheerio');
const Anime = require('../models/Anime'); // Tera MongoDB model

async function extractAndUpload(url, animeName) {
    try {
        console.log(`🎬 Processing: ${animeName}`);

        // 1. MAL se Info Fetch karna (Poster, Genre etc.)
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
        } catch (e) { console.log("MAL Info not found, skipping..."); }

        // 2. Page Scrape karna (ZenRows)
        const response = await axios.get(`https://api.zenrows.com/v1/?key=${process.env.ZENROWS_API_KEY}&url=${encodeURIComponent(url)}`);
        const $ = cheerio.load(response.data);
        
        const episodes = [];
        // Desidubanime ke links nikalna (1080p/720p)
        $('.post-content a').each((i, el) => {
            const linkUrl = $(el).attr('href');
            if (linkUrl && linkUrl.includes('http')) {
                episodes.push({
                    episodeNum: i + 1,
                    sourceUrl: linkUrl
                });
            }
        });

        // 3. Database Entry Create karna
        const newAnime = await Anime.create({
            title: animeName,
            ...animeInfo,
            episodes: [] 
        });

        // 4. Streamtape Remote Upload Trigger
        for (const ep of episodes) {
            const remoteUrl = `https://api.streamtape.com/file/remoteupload/add?login=${process.env.STREAMTAPE_LOGIN}&key=${process.env.STREAMTAPE_KEY}&url=${encodeURIComponent(ep.sourceUrl)}&name=${encodeURIComponent(animeName + ' Ep ' + ep.episodeNum)}`;
            
            const uploadRes = await axios.get(remoteUrl);
            // Remote upload id save karna status check karne ke liye
            if (uploadRes.data.status === 200) {
                console.log(`✅ Queued: Episode ${ep.episodeNum}`);
            }
        }

        return { success: true };
    } catch (error) {
        console.error("Extraction Failed:", error.message);
    }
}
