require('dotenv').config();
const app = require('./app');
const mongoose = require('mongoose');
const { startCron, runInitialExtraction } = require('./cron/extractor.cron');

const PORT = process.env.PORT || 3000;

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('✅ MongoDB connected');
    
    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      
      // Run initial extraction on deploy (8 series)
      console.log('🎬 Running initial extraction...');
      runInitialExtraction();
      
      // Start cron job for every 12 hours
      if (process.env.CRON_ENABLED === 'true') {
        startCron();
        console.log('⏰ Cron job scheduled for every 12 hours');
      }
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });
