const axios = require('axios');
const cheerio = require('cheerio');
const { extractAndUpload } = require('../extractors/seriesExtractor');

async function crawlAllSites() {
    const sites = [
        { name: 'DesiDub', url: 'https://www.desidubanime.me/', skipCheck: true, selector: 'article a' },
        { name: 'TPX Sub', url: 'https://www.tpxsub.com/', skipCheck: false, selector: 'a' },
        { name: 'Lords Anime', url: 'https://www.lordsanime.in/all-anime-list/', skipCheck: false, selector: '.post-title a' },
        { name: 'YBX Anime', url: 'https://ybxanime.com/', skipCheck: false, selector: 'a' }
    ];

    for (const site of sites) {
        try {
            const res = await axios.get('https://api.zenrows.com/v1/', {
                params: { 'url': site.url, 'apikey': process.env.ZENROWS_API_KEY, 'premium_proxy': 'true' }
            });
            const $ = cheerio.load(res.data);
            const links = [];

            $(site.selector).each((i, el) => {
                const link = $(el).attr('href');
                const title = $(el).text().trim();
                if (link && link.includes('http') && title.length > 5) links.push({ title, link });
            });

            for (const item of links) {
                await extractAndUpload(item.link, item.title, site.name);
                await new Promise(r => setTimeout(r, 5000));
            }
        } catch (err) { console.log(`${site.name} Error: ${err.message}`); }
    }
}

module.exports = { crawlAllSites };
