const mongoose = require('mongoose');
const axios = require('axios');

// Helper to define models if not already defined
const Series = mongoose.models.Series || mongoose.model('Series', new mongoose.Schema({
    title: String,
    sourceUrl: String,
    language: String,
    isPublished: Boolean,
    poster: String,
    description: String
}));

const Episode = mongoose.models.Episode || mongoose.model('Episode', new mongoose.Schema({
    seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'Series' },
    episodeNumber: Number,
    link: String,
    remoteId: String, // Pehle Ticket ID hoga, baad mein Video ID ban jayega
    title: String,
    season: Number,
    status: { type: String, default: 'pending' } // pending, processing, completed, failed
}));

// --- 1. SAVE/UPDATE EPISODES (Called by Extractor) ---
const processEpisodes = async (series, episodeList) => {
    try {
        console.log(`💾 Saving ${episodeList.length} episodes to DB for ${series.title}...`);

        for (const ep of episodeList) {
            await Episode.findOneAndUpdate(
                { seriesId: series._id, episodeNumber: ep.episode },
                {
                    link: ep.link,
                    title: ep.title,
                    season: ep.season || 1,
                    // Note: remoteId update nahi kar rahe yahan, wo extractAndUpload karega
                    // Hum bas structure bana rahe hain agar nahi hai toh
                },
                { upsert: true, new: true }
            );
        }
        console.log(`✅ DB Sync Complete for ${series.title}`);
    } catch (err) {
        console.error("Error in processEpisodes:", err.message);
    }
};

// --- 2. CHECK STATUS OF PENDING UPLOADS (The Magic Fix) ---
const checkRemoteStatus = async () => {
    try {
        const login = process.env.STREAMTAPE_LOGIN;
        const key = process.env.STREAMTAPE_KEY;

        if (!login || !key) {
            console.error("❌ Missing Streamtape Credentials in Environment Variables");
            return;
        }

        // Sirf unhe dhoondo jo 'processing' hain (Jinka Ticket ID hai par Video ID nahi)
        const pendingEpisodes = await Episode.find({ status: 'processing' });

        if (pendingEpisodes.length === 0) {
            console.log("ℹ️ No pending uploads to check.");
            return;
        }

        console.log(`🕵️ Checking Streamtape status for ${pendingEpisodes.length} tickets...`);

        for (const ep of pendingEpisodes) {
            try {
                // Streamtape API call
                const { data } = await axios.get(`https://api.streamtape.com/remotedl/status?login=${login}&key=${key}&id=${ep.remoteId}`);

                if (data.status === 200 && data.result) {
                    // Streamtape response format: result: { "TicketID": { ...data... } }
                    const ticketData = data.result[ep.remoteId];

                    if (!ticketData) {
                        console.log(`⚠️ Ticket ${ep.remoteId} not found in Streamtape response.`);
                        continue;
                    }

                    if (ticketData.status === 'finished') {
                        // 🎉 SUCCESS: Ticket ID ko Asali Video ID se replace karo
                        await Episode.findByIdAndUpdate(ep._id, {
                            remoteId: ticketData.remoteid, // This is the real Video ID
                            status: 'completed'
                        });
                        console.log(`✅ Ep ${ep.episodeNumber} is LIVE! (Video ID: ${ticketData.remoteid})`);
                    
                    } else if (ticketData.status === 'failed') {
                        // ❌ FAIL: Download fail ho gaya
                        await Episode.findByIdAndUpdate(ep._id, { status: 'failed' });
                        console.log(`❌ Ep ${ep.episodeNumber} Failed on Streamtape.`);
                    
                    } else {
                        // ⏳ WAITING: Abhi download chal raha hai
                        // Optional: Percentage log kar sakte ho
                        // console.log(`⏳ Ep ${ep.episodeNumber} downloading...`);
                    }
                }
            } catch (innerErr) {
                console.error(`Error checking ticket ${ep.remoteId}:`, innerErr.message);
            }
        }
        console.log("🏁 Status check cycle finished.");

    } catch (err) {
        console.error("❌ Error in checkRemoteStatus:", err.message);
    }
};

module.exports = { processEpisodes, checkRemoteStatus };
