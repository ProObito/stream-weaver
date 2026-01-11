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
            lang: 'Hindi Sub',
            active: true 
        }
    ];

    console.log("🚀 Switching to Ultra-Scraper Mode...");

    for (const site of sites) {
        if (!site.active) continue;

        try {
            console.log(`📡 Requesting with Premium Proxies: ${site.url}`);
            
            // ScraperAPI Ultra Config: 
            // premium=true (Cloudflare bypass)
            // country_code=us (Best for anime sites)
            // device_type=desktop
            const targetUrl = `https://api.scraperapi.com/?api_key=${API_KEY}&url=${encodeURIComponent(site.url)}&render=true&premium=true&country_code=us&device_type=desktop&wait_until=networkidle2`;
            
            const res = await axios.get(targetUrl, { timeout: 120000 });
            const $ = cheerio.load(res.data);
            
            let animeLinks = [];

            // Targeted Selector for Elementor Posts
            $('a').each((i, el) => {
                const title = $(el).text().trim();
                const link = $(el).attr('href');
                
                // Logic: Link mein '/serie/' ya '/anime/' ho par wo khud main page na ho
                if (link && (link.includes('/serie/') || link.includes('/anime/')) && title.length > 5) {
                    if (link !== 'https://hindisubanime.co/serie/' && !animeLinks.find(a => a.link === link)) {
                        animeLinks.push({ title, link });
                    }
                }
            });

            if (animeLinks.length === 0) {
                console.log("⚠️ Site returned empty body. Trying backup selector...");
                // Backup: Kabhi kabhi links pure title tags mein hote hain
                $('h2, h3, h4').find('a').each((i, el) => {
                    const title = $(el).text().trim();
                    const link = $(el).attr('href');
                    if (link && title.length > 5) animeLinks.push({ title, link });
                });
            }

            console.log(`✅ Success! Found ${animeLinks.length} Titles`);

            for (const item of animeLinks) {
                let series = await Series.findOne({ title: { $regex: new RegExp(`^${item.title}$`, 'i') } });
                if (series) {
                    const count = await Episode.countDocuments({ seriesId: series._id });
                    if (count > 0) continue;
                }
                
                console.log(`🎬 Processing: ${item.title}`);
                await extractAndUpload(item.link, item.title, site.name, API_KEY, site.lang);
                await new Promise(r => setTimeout(r, 10000)); 
            }
        } catch (err) {
            console.error(`❌ Ultra-Scraper Fail: ${err.message}`);
        }
    }
}

module.exports = { crawlAllSites };
