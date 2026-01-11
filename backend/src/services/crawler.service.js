const axios = require('axios');
const cheerio = require('cheerio');
const { extractAndUpload } = require('../extractors/seriesExtractor'); 

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Referer': 'https://www.google.com/'
};

const startGlobalCrawl = async () => {
    console.log("🚀 Global Crawling Started...");

    // 1. TPXSub (Hindi Sub)
    try {
        const res = await axios.get('https://tpxsub.com/', { headers: HEADERS, timeout: 8000 });
        const $ = cheerio.load(res.data);
        $('.entry-title a').slice(0, 5).each((i, el) => {
            const link = $(el).attr('href');
            const title = $(el).text().trim();
            if (link) extractAndUpload(link, title, "Hindi Sub");
        });
        console.log("✅ TPX: Scanned");
    } catch (e) { console.log(`❌ TPX Error: 403 or Timeout`); }

    // 2. DesiDubAnime (Multi Audio) - NEW DOMAIN
    try {
        const res = await axios.get('https://www.desidubanime.me/', { headers: HEADERS, timeout: 8000 });
        const $ = cheerio.load(res.data);
        // DesiDub latest posts often use 'article h2 a' or '.entry-title a'
        $('.entry-title a, .post-title a').slice(0, 5).each((i, el) => {
            const link = $(el).attr('href');
            const title = $(el).text().trim();
            // Category links filter out karna zaroori hai
            if (link && !link.includes('/category/')) {
                extractAndUpload(link, title, "Multi Audio");
            }
        });
        console.log("✅ DesiDubAnime: Scanned");
    } catch (e) { console.log(`❌ DesiDub Error: Domain Issue`); }

    // 3. HiAnime (English Sub/Dub)
    try {
        const res = await axios.get('https://hianime.to/recently-updated', { headers: HEADERS, timeout: 8000 });
        const $ = cheerio.load(res.data);
        $('.film_list-wrap .flw-item .film-name a').slice(0, 5).each((i, el) => {
            const path = $(el).attr('href');
            const title = $(el).attr('title') || $(el).text().trim();
            if (path) {
                const fullLink = `https://hianime.to${path}`;
                extractAndUpload(fullLink, title, "English Sub/Dub");
            }
        });
        console.log("✅ HiAnime: Scanned");
    } catch (e) { console.log(`❌ HiAnime Error: ${e.message}`); }
};

module.exports = { startGlobalCrawl };
