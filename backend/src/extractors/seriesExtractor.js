const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');

async function extractAndUpload(url, animeName, siteName) {
    try {
        const Series = mongoose.model('Series');
        const Episode = mongoose.model('Episode');

        // 1. MAL se Poster aur Info lena
        let animeInfo = { poster: '', plot: '' };
        try {
            const mal = await axios.get(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(animeName)}&limit=1`);
            if (mal.data.data[0]) {
                animeInfo.poster = mal.data.data[0].images.jpg.large_image_url;
                animeInfo.plot = mal.data.data[0].synopsis;
            }
        } catch (e) { console.log("MAL info skip."); }

        // 2. Page Scrape (ZenRows)
        const response = await axios.get('https://api.zenrows.com/v1/', {
            params: { 'url': url, 'apikey': process.env.ZENROWS_API_KEY, 'premium_proxy': 'true', 'mode': 'auto' }
        });
        const $ = cheerio.load(response.data);
        
        // Dub/Sub Logic
        let lang = (siteName === "DesiDub") ? "Hindi Dubbed" : "Hindi Subbed";
        if (animeName.toLowerCase().includes("dubbed")) lang = "Hindi Dubbed";

        let series = await Series.findOneAndUpdate(
            { title: animeName },
            { ...animeInfo, sourceSite: siteName, sourceUrl: url, language: lang },
            { upsert: true, new: true }
        );

        // 3. Finding Episode Links
        const episodes = [];
        $('a').each((i, el) => {
            const link = $(el).attr('href');
            const text = $(el).text().toLowerCase();
            if (link && link.includes('http') && (text.includes('720p') || text.includes('1080p') || text.includes('direct') || link.includes('drive.google'))) {
                episodes.push({ title: `${animeName} - Ep ${episodes.length + 1}`, url: link });
            }
        });

        // 4. Streamtape Remote Upload
        for (const ep of episodes) {
            const streamtapeUrl = `https://api.streamtape.com/file/remoteupload/add?login=${process.env.STREAMTAPE_LOGIN}&key=${process.env.STREAMTAPE_KEY}&url=${encodeURIComponent(ep.url)}&name=${encodeURIComponent(ep.title)} [${lang}]`;
            const upRes = await axios.get(streamtapeUrl);
            if (upRes.data.status === 200) {
                await Episode.create({
                    seriesId: series._id,
                    title: ep.title,
                    remoteId: upRes.data.result.id,
                    status: 'pending'
                });
            }
            await new Promise(r => setTimeout(r, 2000));
        }

        await Series.findByIdAndUpdate(series._id, { status: 'completed' });
        return true;
    } catch (err) { console.error(err.message); return false; }
}

module.exports = { extractAndUpload };
