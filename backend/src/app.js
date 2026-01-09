require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { startStatusUpdater } = require('./services/cron.service');
const statsRoutes = require('./routes/stats.routes');
const { extractSeries } = require('./extractors/seriesExtractor');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/stats', statsRoutes);

// Manual Trigger Endpoint
app.post('/api/extract', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });
  extractSeries(url).then(r => console.log('Extraction Finish:', r));
  res.json({ message: 'Extraction started in background' });
});

// Gallery API
app.get('/api/gallery', async (req, res) => {
  try {
    const series = await mongoose.model('Series').find({ status: 'completed' });
    res.json({ data: series });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/series/:id', async (req, res) => {
  try {
    const series = await mongoose.model('Series').findById(req.params.id);
    const episodes = await mongoose.model('Episode').find({ seriesId: req.params.id, status: 'ready' }).sort({ episodeNumber: 1 });
    res.json({ series, episodes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ZAROORI: Sirf app export karo, listen mat karo
module.exports = app;
