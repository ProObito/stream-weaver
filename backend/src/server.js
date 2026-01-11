const app = require('./app');
const mongoose = require('mongoose');
const cron = require('node-cron'); // Cron import
const { extractAndUpload } = require('./extractors/seriesExtractor');
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('✅ MongoDB Connected');
        
        // --- AUTO SYNC JOB ---
        // Har 6 ghante mein chalega: '0 */6 * * *'
        cron.schedule('0 */6 * * *', async () => {
            console.log("🔄 Auto-Sync Started: Checking for new episodes...");
            try {
                const Series = mongoose.model('Series');
                // Sirf Published anime ko check karo
                const activeSeries = await Series.find({ isPublished: true });
                
                for (const s of activeSeries) {
                    console.log(`Checking updates for: ${s.title}`);
                    // Language default 'Hindi Sub' le rahe, DB se bhi utha sakte ho
                    await extractAndUpload(s.sourceUrl, s.title, "Hindi Sub");
                }
                console.log("✅ Auto-Sync Finished");
            } catch (e) { console.error("Auto-Sync Failed:", e); }
        });

        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
        });
    })
    .catch(err => {
        console.error('❌ DB Error:', err.message);
    });
