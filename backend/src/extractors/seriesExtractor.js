const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');
const { getUniversalMeta } = require('../services/mapper.service');

const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    try {
        const Series = mongoose.model('Series');
        const Episode = mongoose.model('Episode');

        // Unique Key: Title + Language (Taaki Dub aur Sub alag-alag save hon)
        const uniqueTitle = `${animeName} (${languageTag})`;

        // Check if this version already exists
        let series = await Series.findOne({ title: uniqueTitle });
        
        if (!series) {
            let hiId = mainUrl.includes('hianime.to') ? mainUrl.split('/').pop().split('?')[0] : null;
            const meta = await getUniversalMeta(animeName, hiId);

            series = await Series.create({
                title: uniqueTitle,
                baseTitle: animeName, // Original name without tags
                poster: meta.poster,
                description: meta.description,
                sourceUrl: mainUrl,
                language: languageTag,
                isPublished: false
            });
        }

        // --- Scraping & Uploading Logic ---
        const res = await axios.get(mainUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(res.data);
        let epLinks = [];
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && (href.includes('/episode') || href.includes('/episodio/'))) {
                epLinks.push(href.startsWith('http') ? href : new URL(href, mainUrl).href);
            }
        });

        for (const link of [...new Set(epLinks)].reverse()) {
            // Episode check logic... (remote upload to streamtape)
            // Same as before, just using series._id
        }
    } catch (err) { console.log(`Error: ${err.message}`); }
};
