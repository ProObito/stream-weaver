const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');

// --- HELPER: DELAY ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- DOODSTREAM REMOTE UPLOAD ---
const addRemoteUpload = async (videoUrl) => {
    const key = process.env.DOODSTREAM_KEY;
    if (!key) throw new Error("DoodStream Key Missing!");

    // DoodStream ko direct link bhej rahe hain
    const apiUrl = `https://doodapi.com/api/upload/url?key=${key}&url=${encodeURIComponent(videoUrl)}`;
    
    try {
        const { data } = await axios.get(apiUrl);
        if (data.status === 200 && data.result && data.result.filecode) {
            return data.result.filecode;
        }
        return null;
    } catch (err) {
        console.error("DoodStream Error:", err.message);
        return null;
    }
};

// --- EXTRACTOR: GET M3U8 (Fixed for 404 Error) ---
const extractDirectLink = async (embedUrl) => {
    try {
        const url = new URL(embedUrl);
        // ID nikalna: /embed-2/e-1/THIS_IS_ID?k=1
        const id = url.pathname.split('/').pop().split('?')[0]; 

        // 🚨 CRITICAL FIX: Try Multiple API Endpoints
        // MegaCloud aur VidStream ke naye aur purane dono URL try karenge
        const domains = [url.origin, 'https://megacloud.tv', 'https://rabbitstream.net'];
        const endpoints = [
            `/ajax/v2/embed-4/getSources?id=${id}`, // New (v2)
            `/embed-2/ajax/e-1/getSources?id=${id}` // Old (v1)
        ];

        for (const domain of domains) {
            for (const path of endpoints) {
                try {
                    const apiUrl = `${domain}${path}`;
                    
                    const { data } = await axios.get(apiUrl, {
                        headers: {
                            'X-Requested-With': 'XMLHttpRequest',
                            'Referer': embedUrl,
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        },
                        timeout: 5000 // 5 sec timeout per try
                    });

                    if (data && data.sources && data.sources.length > 0) {
                        return data.sources[0].file; // MIL GAYA LINK!
                    }
                } catch (e) {
                    // Ignore fail, try next url
                }
            }
        }
        
        return null;

    } catch (err) {
        console.error(`Extractor Error (${embedUrl}):`, err.message);
        return null;
    }
};

// --- GET SERVER ID ---
const getServerId = async (epId) => {
    try {
        const { data: serverData } = await axios.get(`https://hianime.to/ajax/v2/episode/servers?episodeId=${epId}`, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        const $ = cheerio.load(serverData.html);
        
        // Priority: VidStreaming (4) -> MegaCloud (1)
        let serverId = $('.server-item[data-type="sub"][data-server-id="4"]').attr('data-id');
        if (!serverId) serverId = $('.server-item[data-type="sub"][data-server-id="1"]').attr('data-id');
        if (!serverId) serverId = $('.server-item').first().attr('data-id');

        return serverId;
    } catch (err) {
        return null;
    }
};

// --- FETCH LIST ---
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
        return [];
    }
};

// --- MAIN CONTROLLER ---
const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    try {
        const Episode = mongoose.model('Episode');
        const Series = mongoose.model('Series');

        console.log(`🚀 Starting Sync: ${animeName}`);

        let series = await Series.findOne({ title: new RegExp(`^${animeName}`, 'i') });
        if (!series) {
            series = await Series.create({ title: `${animeName} (${languageTag})`, sourceUrl: mainUrl, language: languageTag });
        }

        const episodes = await getHiAnimeData(mainUrl);
        console.log(`🔍 Found ${episodes.length} episodes.`);

        for (let ep of episodes) {
            try {
                const existing = await Episode.findOne({ seriesId: series._id, episodeNumber: ep.number });
                if (existing && existing.status === 'completed') {
                    console.log(`⏭️ Skipping Ep ${ep.number}`);
                    continue;
                }

                const serverId = await getServerId(ep.id);
                if (!serverId) continue;

                const { data: sourceData } = await axios.get(`https://hianime.to/ajax/v2/episode/sources?id=${serverId}`);
                const embedLink = sourceData.link;

                if (!embedLink) continue;

                // Attempt Extraction with updated Logic
                const directLink = await extractDirectLink(embedLink);
                
                if (directLink) {
                    console.log(`📡 Sending Ep ${ep.number} to DoodStream...`);
                    const fileCode = await addRemoteUpload(directLink);

                    if (fileCode) {
                        await Episode.findOneAndUpdate(
                            { seriesId: series._id, episodeNumber: ep.number },
                            { remoteId: fileCode, status: 'processing', title: ep.title },
                            { upsert: true }
                        );
                        console.log(`✅ Ep ${ep.number} Queued! FileCode: ${fileCode}`);
                    }
                } else {
                    console.log(`❌ Extraction Failed Ep ${ep.number} (Isse Repo se hi fix karna padega)`);
                }

            } catch (err) {
                console.error(`❌ Ep ${ep.number} Error: ${err.message}`);
            }
            // Thoda fast kiya delay
            await sleep(4000);
        }
        console.log(`🏁 Sync Finished for ${animeName}`);
    } catch (err) {
        console.error(`💥 GLOBAL CRASH: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
