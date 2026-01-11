const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');
const { extractAndUpload } = require('../extractors/seriesExtractor');

async function crawlAllSites() {
    const Series = mongoose.model('Series');
    const Episode = mongoose.model('Episode');
    const API_KEY = 'ff36f8749fb231991d6381abac9c4ec0';
    
    const sites = [
        { 
            name: 'HindiSubAnime', 
            url: 'https://hindisubanime.co/serie/', 
            // Is page ke liye special selectors
            selector: '.elementor-widget-container a, h4.elementor-heading-title a, .entry-content a', 
            lang: 'Hindi Sub',
            active: true 
        }
    ];

    console.log("🚀 Scanning Serie List Page...");

    for (const site of sites) {
        if (!site.active) continue;

        try {
            console.log(`📡 Requesting: ${site.url}`);
            
            // Render true zaroori hai kyunki ye elementor se bani site hai
            const targetUrl = `https://api.scraperapi.com/?api_key=${API_KEY}&url=${encodeURIComponent(site.url)}&render=true&retry_404=true`;
            
            const res = await axios.get(targetUrl, { timeout: 90000 });
            const $ = cheerio.load(res.data);
            let animeLinks = [];

            $(site.selector).each((i, el) => {
                const title = $(el).text().trim();
                const link = $(el).attr('href');
                
                // Sirf wahi links lo jo /anime/ ya /serie/ pe ja rahe hon
                if (link && (link.includes('/anime/') || link.includes('/serie/')) && title.length > 2) {
                    if (!animeLinks.find(a => a.link === link) && link !== site.url) {
                        animeLinks.push({ title, link });
                    }
                }
            });

            console.log(`✅ Success! Found ${animeLinks.length} Titles on Serie Page`);

            for (const item of animeLinks) {
                let series = await Series.findOne({ title: { $regex: new RegExp(`^${item.title}$`, 'i') } });
                if (series) {
                    const count = await Episode.countDocuments({ seriesId: series._id });
                    if (count > 0) continue;
                }
                
                console.log(`🎬 Processing: ${item.title}`);
                await extractAndUpload(item.link, item.title, site.name, API_KEY, site.lang);
                // Thoda lamba delay taaki ScraperAPI block na kare
                await new Promise(r => setTimeout(r, 10000)); 
            }
        } catch (err) {
            console.error(`❌ Error on Serie Page: ${err.message}`);
        }
    }
}

module.exports = { crawlAllSites };
