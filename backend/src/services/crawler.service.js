const axios = require('axios');
const cheerio = require('cheerio');
const { extractAndUpload } = require('../extractors/seriesExtractor');

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' };

const startGlobalCrawl = async () => {
    console.log("🚀 Global Crawling Started...");

    // 1. TPXSub (Hindi Subbed)
    try {
        const res = await axios.get('https://tpxsub.com/', { headers: HEADERS });
        const $ = cheerio.load(res.data);
        $('.entry-title a').slice(0, 5).each((i, el) => {
            extractAndUpload($(el).attr('href'), $(el).text().trim(), "Hindi Sub");
        });
    } catch (e) { console.log("TPX Crawl Failed"); }

    // 2. DesiDub (Multi Audio / Hindi Dub)
    try {
        const res = await axios.get('https://desidub.to/', { headers: HEADERS }); // Example URL
        const $ = cheerio.load(res.data);
        $('.post-title a').slice(0, 5).each((i, el) => {
            extractAndUpload($(el).attr('href'), $(el).text().trim(), "Multi Audio");
        });
    } catch (e) { console.log("DesiDub Crawl Failed"); }

    // 3. HiAnime (English Sub/Dub)
    try {
        const res = await axios.get('https://hianime.to/recently-updated', { headers: HEADERS });
        const $ = cheerio.load(res.data);
        $('.flw-item .film-name a').slice(0, 5).each((i, el) => {
            const link = "https://hianime.to" + $(el).attr('href');
            extractAndUpload(link, $(el).text().trim(), "English Sub/Dub");
        });
    } catch (e) { console.log("HiAnime Crawl Failed"); }
};

module.exports = { startGlobalCrawl };
