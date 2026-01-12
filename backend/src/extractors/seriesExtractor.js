const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');

// Helper: Delay to prevent IP Ban
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 🚀 1. DOODSTREAM REMOTE UPLOAD
 * Ab isko direct video file milegi, toh ye khushi-khushi accept karega.
 */
const addRemoteUpload = async (videoUrl) => {
    const key = process.env.DOODSTREAM_KEY; 

    if (!key) throw new Error("DoodStream API Key missing in Heroku Config Vars!");

    // DoodStream API Call
    const apiUrl = `https://doodapi.com/api/upload/url?key=${key}&url=${encodeURIComponent(videoUrl)}`;
    
    try {
        const { data } = await axios.get(apiUrl);

        if (data.status === 200 && data.result && data.result.filecode) {
            return data.result.filecode; // Success: FileCode mil gaya
        } else {
            console.error("DoodStream Reject:", data);
            return null;
        }
    } catch (err) {
        console.error(`DoodStream API Error: ${err.message}`);
        return null;
    }
};

/**
 * 🕵️ 2. EXTRACT M3U8 FROM EMBED (The Fix for HTML Error)
 * Ye function MegaCloud/VidStream ke API se baat karke asali file nikalta hai.
 */
const extractDirectLink = async (embedUrl) => {
    try {
        const urlObj = new URL(embedUrl);
        
        // ID Extraction: /embed-2/e-1/SOME_ID?k=1 -> SOME_ID
        const pathParts = urlObj.pathname.split('/');
        const videoId = pathParts.find(part => part.length > 10); // ID usually long string

        if (!videoId) return null;

        // Construct AJAX URL
        // Example: https://megacloud.blog/embed-2/ajax/e-1/getSources?id=xyz
        const ajaxUrl = `${urlObj.origin}/embed-2/ajax/e-1/getSources?id=${videoId}`;

        const { data } = await axios.get(ajaxUrl, {
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': embedUrl, // Referer zaroori hai
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        // Check if sources exist
        if (data && data.sources && Array.isArray(data.sources) && data.sources.length > 0) {
            return data.sources[0].file; // Ye hai asali .m3u8 link!
        } 
        
        // Agar encrypted hai
        if (data && data.encrypted) {
            console.log("⚠️ Source is encrypted (Cannot extract simply).");
            return null;
        }

        return null;

    } catch (err) {
        console.error(`Extraction Failed: ${err.message}`);
        return null;
    }
};

/**
 * 🛠️ 3. GET SERVER ID
 */
const getServerId = async (epId) => {
    try {
        const { data: serverData } = await axios.get(`https://hianime.to/ajax/v2/episode/servers?episodeId=${epId}`, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        
        const $ = cheerio.load(serverData.html);
        
        // Try VidStreaming (4) first, then MegaCloud (1)
        let serverId = $('.server-item[data-type="sub"][data-server-id="4"]').attr('data-id');
        if (!serverId) serverId = $('.server-item[data-type="sub"][data-server-id="1"]').attr('data-id');
        if (!serverId) serverId = $('.server-item').first().attr('data-id');

        return serverId;
    } catch (err) {
        return null;
    }
};

/**
 * 📋 4. FETCH EPISODE LIST
 */
const getHiAnimeData = async (mainUrl) => {
    try {
        const animeId = mainUrl.split('-').pop();
        const { data: listData } = await axios.get(`https://hianime.to/ajax/v2/episode/list/${animeId}`, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });

        const $ = cheerio.load(listData.html);
        const episodes = [];

        $('.ep-item').each((i, el) => {
            episodes.push({
                id: $(el).attr('data-id'),
                number: parseInt($(el).attr('data-number')),
                title: $(el).attr('title') || `Episode ${$(el).attr('data-number')}`
            });
        });

        return episodes;
    } catch (err) {
        console.error("List Fetch Error:", err.message);
        return [];
    }
};

/**
 * 🎮 5. MAIN CONTROLLER
 */
const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    try {
        const Episode = mongoose.model('Episode');
        const Series = mongoose.model('Series');

        console.log(`🚀 Starting DoodStream Sync: ${animeName}`);

        // 1. Series Check/Create
        let series = await Series.findOne({ title: new RegExp(`^${animeName}`, 'i') });
        if (!series) {
            series = await Series.create({ 
                title: `${animeName} (${languageTag})`, 
                sourceUrl: mainUrl, 
                language: languageTag 
            });
        }

        // 2. Get Episodes
        const episodes = await getHiAnimeData(mainUrl);
        console.log(`🔍 Found ${episodes.length} episodes.`);

        for (let ep of episodes) {
            try {
                // Check if exists and completed
                const existing = await Episode.findOne({ seriesId: series._id, episodeNumber: ep.number });
                if (existing && existing.status === 'completed') {
                    console.log(`⏭️ Skipping Ep ${ep.number} (Already Live)`);
                    continue;
                }

                // STEP A: Get Server ID
                const serverId = await getServerId(ep.id);
                if (!serverId) {
                    console.log(`⚠️ No Server for Ep ${ep.number}`);
                    continue;
                }

                // STEP B: Get Embed Link (HTML)
                const { data: sourceData } = await axios.get(`https://hianime.to/ajax/v2/episode/sources?id=${serverId}`);
                const embedLink = sourceData.link;

                if (!embedLink) {
                    console.log(`⚠️ No embed link for Ep ${ep.number}`);
                    continue;
                }

                // STEP C: EXTRACT DIRECT .m3u8 (The Fix)
                const directLink = await extractDirectLink(embedLink);
                
                if (!directLink) {
                    console.log(`❌ Could not extract direct file for Ep ${ep.number}`);
                    continue;
                }

                // STEP D: Upload to DoodStream
                console.log(`📡 Sending Ep ${ep.number} to DoodStream...`);
                const fileCode = await addRemoteUpload(directLink);

                if (fileCode) {
                    await Episode.findOneAndUpdate(
                        { seriesId: series._id, episodeNumber: ep.number },
                        { 
                            remoteId: fileCode, 
                            status: 'processing', 
                            title: ep.title 
                        },
                        { upsert: true }
                    );

                    console.log(`✅ Ep ${ep.number} Queued! FileCode: ${fileCode}`);
                }

            } catch (err) {
                console.error(`❌ Ep ${ep.number} Error: ${err.message}`);
            }

            // 6 Seconds Gap (Extraction takes time, so gap helps)
            await sleep(6000); 
        }

        console.log(`🏁 Sync Finished for ${animeName}`);

    } catch (err) {
        console.error(`💥 GLOBAL CRASH: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
