const mongoose = require('mongoose');
const axios = require('axios');

// Models Safety Check
const Series = mongoose.models.Series || mongoose.model('Series', new mongoose.Schema({
    title: String,
    sourceUrl: String,
    language: String,
    isPublished: Boolean
}));

const Episode = mongoose.models.Episode || mongoose.model('Episode', new mongoose.Schema({
    seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'Series' },
    episodeNumber: Number,
    link: String,
    remoteId: String,
    title: String,
    season: Number,
    status: { type: String, default: 'pending' }
}));

// --- 1. GENERIC SAVE (Used by other scrapers if any) ---
const processEpisodes = async (series, episodeList) => {
    try {
        console.log(`💾 Saving episodes for ${series.title}...`);
        for (const ep of episodeList) {
            await Episode.findOneAndUpdate(
                { seriesId: series._id, episodeNumber: ep.episode },
                {
                    link: ep.link,
                    title: ep.title,
                    season: 1
                },
                { upsert: true, new: true }
            );
        }
    } catch (err) {
        console.error("Process Error:", err.message);
    }
};

// --- 2. DOODSTREAM STATUS CHECKER (The Magic Part) ---
const checkRemoteStatus = async () => {
    try {
        const key = process.env.DOODSTREAM_KEY;
        
        if (!key) {
            console.error("❌ DoodStream Key missing for status check.");
            return;
        }

        // Find uploads that are still 'processing'
        const pendingEps = await Episode.find({ status: 'processing' });
        
        if (pendingEps.length === 0) {
            console.log("ℹ️ No pending uploads to check.");
            return;
        }

        console.log(`🕵️ Checking DoodStream status for ${pendingEps.length} files...`);

        for (const ep of pendingEps) {
            try {
                // DoodStream Check API
                const url = `https://doodapi.com/api/url/check?key=${key}&file_code=${ep.remoteId}`;
                const { data } = await axios.get(url);

                if (data.status === 200 && data.result) {
                    // DoodStream result can be an object or array, handle both
                    const fileData = Array.isArray(data.result) ? data.result[0] : data.result;

                    if (!fileData) continue;

                    // Status Logic:
                    // 'active' = Ready to watch
                    // 'error' = Download failed
                    
                    if (fileData.status === 'active') {
                        await Episode.findByIdAndUpdate(ep._id, {
                            remoteId: fileData.file_code, 
                            status: 'completed'
                        });
                        console.log(`✅ Ep ${ep.episodeNumber} is LIVE!`);
                    
                    } else if (fileData.status === 'error') {
                        await Episode.findByIdAndUpdate(ep._id, { status: 'failed' });
                        console.log(`❌ Ep ${ep.episodeNumber} Failed on DoodStream.`);
                    } else {
                        // Still processing...
                        // console.log(`⏳ Ep ${ep.episodeNumber} still downloading...`);
                    }
                }
            } catch (innerErr) {
                console.error(`Check Error for Ep ${ep.episodeNumber}:`, innerErr.message);
            }
        }
        console.log("🏁 Status Check Cycle Finished.");

    } catch (err) {
        console.error("❌ Error in checkRemoteStatus:", err.message);
    }
};

module.exports = { processEpisodes, checkRemoteStatus };
