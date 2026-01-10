const axios = require('axios');
const cheerio = require('cheerio');

async function extractAndUpload(url, animeName) {
    try {
        console.log(`🎬 Extracting: ${animeName} from ${url}`);
        
        // ZenRows se page fetch karna (Cloudflare bypass karne ke liye)
        const response = await axios.get(`https://api.zenrows.com/v1/?key=${process.env.ZENROWS_API_KEY}&url=${encodeURIComponent(url)}&block_resources=image,stylesheet,font&wait_for=.post-content`);
        const $ = cheerio.load(response.data);

        const episodes = [];

        // Desidubanime ke specific selectors (Modify if site changes)
        // Ye logic 1080p ya 720p ke direct links dhoondega
        $('.post-content a').each((i, el) => {
            const linkText = $(el).text().toLowerCase();
            const linkUrl = $(el).attr('href');

            // Sirf Direct Download ya Hdrive wale links uthana jo remote upload support karein
            if (linkUrl && (linkText.includes('1080p') || linkText.includes('720p') || linkText.includes('direct'))) {
                episodes.push({
                    title: `${animeName} - Episode ${i + 1}`,
                    sourceUrl: linkUrl
                });
            }
        });

        console.log(`📦 Found ${episodes.length} episodes for ${animeName}`);

        for (const ep of episodes) {
            // Streamtape Remote Upload Trigger
            const remoteUrl = `https://api.streamtape.com/file/remoteupload/add?login=${process.env.STREAMTAPE_LOGIN}&key=${process.env.STREAMTAPE_KEY}&url=${encodeURIComponent(ep.sourceUrl)}&name=${encodeURIComponent(ep.title)}`;
            
            const uploadRes = await axios.get(remoteUrl);
            if (uploadRes.data.status === 200) {
                console.log(`✅ Queued on Streamtape: ${ep.title}`);
            }
            // 2 sec gap taaki API limit hit na ho
            await new Promise(r => setTimeout(r, 2000));
        }

        return { success: true, count: episodes.length };
    } catch (error) {
        console.error(`❌ Error in ${animeName}:`, error.message);
        return { success: false, error: error.message };
    }
}

module.exports = { extractAndUpload };
