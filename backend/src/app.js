require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { startStatusUpdater } = require('./services/cron.service');
const statsRoutes = require('./routes/stats.routes');
const { extractSeries } = require('./extractors/seriesExtractor');

const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/stats', statsRoutes);

// Manual Trigger Endpoint
app.post('/api/extract', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });
  
  // Background mein start karo, user ko wait mat karao
  extractSeries(url).then(r => console.log('Extraction Finish:', r));
  
  res.json({ message: 'Extraction started in background' });
});

// Gallery API (Frontend Display)
app.get('/api/gallery', async (req, res) => {
  const series = await mongoose.model('Series').find({ status: 'completed' });
  res.json({ data: series });
});

app.get('/api/series/:id', async (req, res) => {
  const series = await mongoose.model('Series').findById(req.params.id);
  const episodes = await mongoose.model('Episode').find({ seriesId: req.params.id, status: 'ready' }).sort({ episodeNumber: 1 });
  res.json({ series, episodes });
});

// Connect DB & Start Server
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB Connected');
    app.listen(process.env.PORT || 3000, () => {
      console.log(`🚀 Server running on port ${process.env.PORT || 3000}`);
      startStatusUpdater(); // Cron Job Start
    });
  })
  .catch(err => console.error('DB Error:', err));
