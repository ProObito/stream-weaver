const express = require('express');
const cors = require('cors');
const galleryRoutes = require('./routes/gallery.routes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/gallery', galleryRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Manual trigger endpoint (for testing)
app.post('/api/extract/trigger', async (req, res) => {
  const { runExtractor } = require('./cron/extractor.cron');
  try {
    await runExtractor(8);
    res.json({ success: true, message: 'Extraction triggered' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = app;
