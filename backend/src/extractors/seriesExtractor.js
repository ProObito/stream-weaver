const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- STREAMTAPE REMOTE UPLOAD HELPER ---
const triggerRemoteUpload = async (remoteUrl, folderId = '') => {
    const login = process.env.STREAMTAPE_LOGIN;
    const key = process.env.STREAMTAPE_KEY;
    
    // Streamtape Remote Upload API
    const apiUrl = `https://api.streamtape.com/remotedl/add?login=${login}&key=${key}&url=${encodeURIComponent(remoteUrl)}${folderId ? `&folder=${folderId}` : ''}`;
    
    const { data } = await axios.get(apiUrl);
    if (data.status === 200 && data.result && data.result.id) {
        return data.result.id; // Yeh Remote Ticket ID hai
    } else {
        throw new Error(data.msg || "Remote Upload Failed to Trigger");
    }
};

// --- GET FRESH LINK FOR SINGLE EPISODE ---
const getFreshEpLink = async (epDataId) => {
    const { data: src } = await axios.get(`https://hianime.to/ajax/v2/episode/sources?id=${epDataId}`);
    return src.link || null;
};

// --- MAIN EXTRACTOR ---
const extractAndUpload = async (mainUrl, animeName, languageTag) => {
    try {
        const Episode = mongoose.model('Episode');
        const Series = mongoose.model('Series');
        
        console.log(`📡 Targeting: ${animeName}`);

        let series = await Series.findOne({ title: `${animeName} (${languageTag})` });
        if (!series) {
            series = await Series.create({ title: `${animeName} (${languageTag})`, sourceUrl: mainUrl, language: languageTag });
        }

        // 1. Get Episode List (Only IDs and Numbers)
        const animeId = mainUrl.split('-').pop();
        const { data: listData } = await axios.get(`https://hianime.to/ajax/v2/episode/list/${animeId}`, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        const $ = cheerio.load(listData.html);
        const items = $('.ep-item').get();

        console.log(`🔍 Found ${items.length} episodes. Starting Remote Sync...`);

        for (const el of items) {
            const epId = $(el).attr('data-id');
            const num = parseInt($(el).attr('data-number'));

            try {
                // 2. Get FRESH link right now (Expire hone se pehle)
                const freshLink = await getFreshEpLink(epId);
                
                if (freshLink) {
                    console.log(`🚀 Triggering Remote for Ep ${num}...`);
                    const ticketId = await triggerRemoteUpload(freshLink);

                    // 3. Save as "processing" in DB
                    await Episode.findOneAndUpdate(
                        { seriesId: series._id, episodeNumber: num },
                        { 
                            remoteId: ticketId, // Ticket ID temporarily
                            status: 'processing',
                            title: $(el).attr('title') || `Episode ${num}`
                        },
                        { upsert: true }
                    );
                    console.log(`✅ Ep ${num} Queued (Ticket: ${ticketId})`);
                }
            } catch (err) {
                console.error(`❌ Ep ${num} Error: ${err.message}`);
            }

            // 15 seconds gap taaki Streamtape API spam na ho
            await sleep(15000);
        }

    } catch (err) {
        console.error(`❌ Global Error: ${err.message}`);
    }
};

module.exports = { extractAndUpload };
