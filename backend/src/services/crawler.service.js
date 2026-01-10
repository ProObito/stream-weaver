const axios = require('axios');
const cheerio = require('cheerio');
const { extractAndUpload } = require('../extractors/seriesExtractor');

async function crawlSite(startPage = 1, endPage = 5) {
  console.log(`🕷️ Spider Started! Crawling pages ${startPage} to ${endPage}...`);

  for (let i = startPage; i <= endPage; i++) {
    try {
      console.log(`📄 Scanning Page ${i}...`);
      
      // 1. Page Load karo (ZenRows use karke taaki block na ho)
      const targetUrl = `https://www.desidubanime.me/page/${i}/`; 
      // Note: Site ka page structure change ho sakta hai, standard /page/i hota hai
      
      const response = await axios.get(`https://api.zenrows.com/v1/?key=${process.env.ZENROWS_API_KEY}&url=${encodeURIComponent(targetUrl)}`);
      const $ = cheerio.load(response.data);

      const animeLinks = [];

      // 2. Links Dhoondo (Selector site ke hisaab se adjust karna pad sakta hai)
      // Usually 'article' tag ya '.post' class hoti hai
      $('article a').each((index, element) => {
        const link = $(element).attr('href');
        const title = $(element).text().trim();

        // Sirf anime wale links uthao, faltu pages nahi
        if (link && link.includes('hindi') && !link.includes('/page/')) {
            // Duplicate check
            const alreadyAdded = animeLinks.find(a => a.url === link);
            if (!alreadyAdded) {
                animeLinks.push({ name: title || "Unknown Anime", url: link });
            }
        }
      });

      console.log(`found ${animeLinks.length} anime on Page ${i}`);

      // 3. Har Anime ko Process Karo
      for (const anime of animeLinks) {
        console.log(`🚀 Sending to Extractor: ${anime.name}`);
        
        // Yeh wahi function hai jo humne kal raat banaya tha (MAL + Upload wala)
        await extractAndUpload(anime.url, anime.name);
        
        // 5 second ka break (Safety first!)
        await new Promise(r => setTimeout(r, 5000));
      }

    } catch (error) {
      console.error(`❌ Error on Page ${i}:`, error.message);
    }
    
    // Page change hone se pehle lamba break
    console.log("💤 Resting before next page...");
    await new Promise(r => setTimeout(r, 10000));
  }
  
  console.log("✅ Crawling Job Finished!");
}

module.exports = { crawlSite };
