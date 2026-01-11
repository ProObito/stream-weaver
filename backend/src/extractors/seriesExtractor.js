const app = require('./app');
const mongoose = require('mongoose');
const cron = require('node-cron');
const { crawlAllSites } = require('./services/crawler.service'); 
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

// Check if URI exists
if (!MONGODB_URI) {
    console.error("❌ ERROR: MONGODB_URI is not defined in environment variables!");
    process.exit(1);
}

mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('✅ MongoDB Connected Successfully');
        
        const server = app.listen(PORT, () => {
            console.log(`🚀 Server is running on port ${PORT}`);
            console.log("⚡ Initializing Content Sync...");
            
            // Safe Crawler Start
            try {
                if (typeof crawlAllSites === 'function') {
                    crawlAllSites();
                } else {
                    console.log("⚠️ Warning: crawlAllSites is not a function. Check crawler.service.js");
                }
            } catch (e) {
                console.error("❌ Crawler failed to start:", e.message);
            }

            // Schedule: Har 12 ghante mein
            cron.schedule('0 */12 * * *', () => {
                console.log("⏰ Scheduled Sync Started...");
                if (typeof crawlAllSites === 'function') {
                    crawlAllSites().catch(err => console.error("Cron Error:", err));
                }
            });
        });
    })
    .catch(err => {
        console.error('❌ MongoDB Connection Failed:', err.message);
        process.exit(1);
    });
