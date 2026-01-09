require('dotenv').config();
const express = require('express'); // static serve ke liye zaroori hai
const path = require('path');
const app = require('./app'); // Ye wahi app hai jo app.js se export hua
const mongoose = require('mongoose');
const { startCron, runInitialExtraction } = require('./cron/extractor.cron');

const PORT = process.env.PORT || 3000;

// Frontend static files serve logic
const distPath = path.join(__dirname, '../../dist');
app.use(express.static(distPath));

// API ke alawa saari requests index.html par bhej do
app.get(/^(?!\/api).+/, (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      
      runInitialExtraction();
      
      if (process.env.CRON_ENABLED === 'true') {
        startCron();
        console.log('⏰ Cron job scheduled');
      }
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });
