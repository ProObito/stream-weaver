const app = require('./app');
const mongoose = require('mongoose');
const cron = require('node-cron');
const { crawlAllSites } = require('./services/crawler.service'); // Crawler import kiya
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error("❌ ERROR: MONGODB_URI is not defined in Heroku Config Vars!");
    process.exit(1);
}

mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('✅ MongoDB Connected Successfully');
        
        app.listen(PORT, () => {
            console.log(`🚀 Server is running on port ${PORT}`);
            
            // 🚀 AUTOMATION START:
            // 1. Server start hote hi extraction shuru kar do (Old + New Content)
            console.log("⚡ Initializing Content Sync (Archive + Future)...");
            crawlAllSites();

            // 2. Schedule: Har 12 ghante mein check karega ki naya episode aaya ya nahi
            // Isse "Hatho-hath" updates milte rahenge
            cron.schedule('0 */12 * * *', () => {
                console.log("⏰ Scheduled Task: Syncing New Updates from Sites...");
                crawlAllSites();
            });
        });
    })
    .catch(err => {
        console.error('❌ MongoDB Connection Failed:', err.message);
        process.exit(1);
    });
