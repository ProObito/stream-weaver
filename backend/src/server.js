require('dotenv').config();
const express = require('express'); // Express yahan add kiya
const path = require('path');       // Path module add kiya
const app = require('./app');
const mongoose = require('mongoose');
const { startCron, runInitialExtraction } = require('./cron/extractor.cron');

const PORT = process.env.PORT || 3000;

// --- FRONTEND INTEGRATION LOGIC ---
// React build (dist folder) ko serve karne ke liye
const distPath = path.join(__dirname, '../../dist');
app.use(express.static(distPath));

// API routes ke alawa koi bhi request aaye toh index.html bhej do
// Isse React Router (Pages) sahi se kaam karenge
app.get('*', (req, res, next) => {
  // Agar request API ki hai toh use aage jaane do
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(distPath, 'index.html'));
});
// ----------------------------------

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('✅ MongoDB connected');
    
    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      
      // Run initial extraction on deploy
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
