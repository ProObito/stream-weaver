require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const app = require('./app'); // app.js se express instance le raha hai
const { startStatusUpdater } = require('./services/cron.service');

const PORT = process.env.PORT || 3000;

// Frontend static files serve logic
const distPath = path.join(__dirname, '../../dist');
app.use(express.static(distPath));

// API ke alawa saari requests index.html par bhej do (React Router support)
app.get(/^(?!\/api).+/, (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// MongoDB Connection & Server Start
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB Connected');
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      
      // Cron service start
      try {
        startStatusUpdater();
        console.log('⏰ Status Updater Cron Started');
      } catch (e) {
        console.log('Cron failed to start:', e.message);
      }
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB Connection Error:', err);
    process.exit(1);
  });
