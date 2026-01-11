const axios = require('axios');
const cheerio = require('cheerio');
const { extractAndUpload } = require('../extractors/seriesExtractor');

// Real Browser Headers taaki sites block na karein
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://google.com'
};

const startGlobalCrawl = async () => {
    console.log("🚀 Global Crawling Started...");

    // 1. TPXSub (Hindi Subbed) - Latest Updates
    try {
        const res = await axios.get('https://tpxsub.com/', { headers: HEADERS, timeout: 10000 });
        const $ = cheerio.load(res.data);
        // Selector: TPX aksar .entry-title a use karta hai latest posts ke liye
        $('.entry-title a').slice(0, 6).each((i, el) => {
            const link = $(el).attr('href');
            const title = $(el).text().trim();
            if (link) extractAndUpload(link, title, "Hindi Sub");
        });
        console.log("✅ TPX Scraping Triggered");
    } catch (e) { 
        console.log(`❌ TPX Crawl Failed: ${e.message}`); 
    }

    // 2. DesiDub (Multi Audio / Hindi Dub)
    try {
        const res = await axios.get('https://desidub.to/', { headers: HEADERS, timeout: 10000 });
        const $ = cheerio.load(res.data);
        // Selector: DesiDub usually uses .post-title or .entry-title
        $('.post-title a, .entry-title a').slice(0, 6).each((i, el) => {
            const link = $(el).attr('href');
            const title = $(el).text().trim();
            if (link) extractAndUpload(link, title, "Multi Audio");
        });
        console.log("✅ DesiDub Scraping Triggered");
    } catch (e) { 
        console.log(`❌ DesiDub Crawl Failed: ${e.message}`); 
    }

    // 3. HiAnime (English Sub/Dub) - Recently Updated Section
    try {
        const res = await axios.get('https://hianime.to/recently-updated', { headers: HEADERS, timeout: 10000 });
        const $ = cheerio.load(res.data);
        // Selector: HiAnime structure for titles
        $('.film_list-wrap .flw-item .film-name a').slice(0, 6).each((i, el) => {
            const path = $(el).attr('href');
            const title = $(el).attr('title') || $(el).text().trim();
            if (path) {
                const fullLink = path.startsWith('http') ? path : `https://hianime.to${path}`;
                extractAndUpload(fullLink, title, "English Sub/Dub");
            }
        });
        console.log("✅ HiAnime Scraping Triggered");
    } catch (e) { 
        console.log(`❌ HiAnime Crawl Failed: ${e.message}`); 
    }
};

module.exports = { startGlobalCrawl };
