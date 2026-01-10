const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');

async function extractAndUpload(url, animeName, siteName, siteKey) {
    try {
        const Series = mongoose.model('Series');
        const Episode = mongoose.model('Episode');

        // 1. Fetch MAL Data for enrichment
        let malData = { poster: '', plot: '' };
        try {
            const malRes = await axios.get(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(animeName)}&limit=1`);
            if (malRes.data.data[0]) {
                malData.poster = malRes.data.data[0].images.jpg.large_image_url;
                malData.plot = malRes.data.data[0].synopsis;
            }
        } catch (e) {}

        // 2. Scrape the actual page
        const response = await axios.get('https://api.zenrows.com/v1/', {
            params: { 'url': url, 'apikey': siteKey.trim(), 'premium_proxy': 'false' }
        });
        const $ = cheerio.load(response.data);
        
        let lang = (siteName === "DesiDub") ? "Hindi Dubbed" : "Hindi Subbed";
        if (animeName.toLowerCase().includes("dubbed")) lang = "Hindi Dubbed";

        // 3. Save to DB with Poster and Plot
        let series = await Series.findOneAndUpdate(
            { title: animeName },
            { 
                sourceSite: siteName, 
                sourceUrl: url, 
                language: lang, 
                poster: malData.poster, 
                plot: malData.plot,
                status: 'processing' 
            },
            { upsert: true, new: true }
        );

        const episodes = [];
        $('a').each((i, el) => {
            const link = $(el).attr('href');
            const text = $(el).text().toLowerCase();
            if (link && link.includes('http') && (text.includes('720p') || text.includes('1080p') || text.includes('direct'))) {
                episodes.push({ title: `${animeName} - Ep ${episodes.length + 1}`, url: link });
            }
        });

        if (episodes.length === 0) return false;

        for (const ep of episodes) {
            try {
                const stUrl = `https://api.streamtape.com/file/remoteupload/add?login=${process.env.STREAMTAPE_LOGIN}&key=${process.env.STREAMTAPE_KEY}&url=${encodeURIComponent(ep.url)}&name=${encodeURIComponent(ep.title)} [${lang}]`;
                const up = await axios.get(stUrl);
                if (up.data.status === 200) {
                    await Episode.create({ seriesId: series._id, title: ep.title, remoteId: up.data.result.id, status: 'pending' });
                }
            } catch (err) {}
            await new Promise(r => setTimeout(r, 1000));
        }

        await Series.findByIdAndUpdate(series._id, { status: 'completed' });
        console.log(`✅ Extracted & Enriched: ${animeName}`);
        return true;
    } catch (err) { return false; }
}
module.exports = { extractAndUpload };
