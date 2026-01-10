const app = require('./app');
const mongoose = require('mongoose');
const cron = require('node-cron');
// Bracket { } lagana zaroori hai
const { crawlAllSites } = require('./services/crawler.service'); 
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('✅ MongoDB Connected Successfully');
        
        // Server ko listen karwana
        const server = app.listen(PORT, () => {
            console.log(`🚀 Server is running on port ${PORT}`);
            
            // Background sync start
            console.log("⚡ Initializing Content Sync...");
            
            // Try-Catch taaki agar crawler fail ho toh server na gire
            try {
                crawlAllSites();
            } catch (e) {
                console.error("❌ Crawler failed to start:", e.message);
            }

            // Schedule: Har 12 ghante mein
            cron.schedule('0 */12 * * *', () => {
                console.log("⏰ Scheduled Sync Started...");
                crawlAllSites().catch(err => console.error("Cron Error:", err));
            });
        });
    })
    .catch(err => {
        console.error('❌ MongoDB Connection Failed:', err.message);
        process.exit(1);
    });
