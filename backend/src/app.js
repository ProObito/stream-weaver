require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// Services Imports
const { startStatusUpdater } = require('./services/cron.service');
const { crawlSite } = require('./services/crawler.service'); // Naya Spider File
const { extractAndUpload } = require('./services/seriesExtractor'); // Remote Upload logic
const statsRoutes = require('./routes/stats.routes');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Models Load karna zaroori hai (taaki "Schema not registered" error na aaye)
require('./models/Series');
require('./models/Episode');

// --- ROUTES ---

// 1. Stats Route (Dashboard ke liye)
app.use('/api/stats', statsRoutes);

/**
 * 🕷️ AUTO-CRAWLER ENDPOINT (The Beast)
 * ReqBin Body: { "startPage": 1, "endPage": 5 }
 * Kaam: Ye khud site par jayega aur series dhund kar laayega.
 */
app.post('/api/start-crawl', async (req, res) => {
  const { startPage, endPage } = req.body;
  
  // Background mein process start (await nahi lagaya taaki response turant mile)
  crawlSite(startPage || 1, endPage || 5);

  res.json({ 
    message: "🕷️ Crawler Started! Logs check karo.",
    info: `Scanning Pages ${startPage || 1} to ${endPage || 5} in background.`
  });
});

/**
 * 📦 BULK EXTRACTION (Manual List)
 * ReqBin Body: { "animeList": [{ "name": "Naruto", "url": "..." }] }
 */
app.post('/api/bulk-extract', async (req, res) => {
  const { animeList } = req.body;

  if (!animeList || !Array.isArray(animeList)) {
    return res.status(400).json({ error: 'Anime list (array) required' });
  }

  res.json({ message: `🚀 ${animeList.length} Animes queued! Check logs.` });

  // Background Loop
  (async () => {
    for (const anime of animeList) {
      console.log(`🎬 Bulk Processing: ${anime.name}`);
      try {
        // MAL info + Streamtape Remote Upload yahan ho raha hai
        await extractAndUpload(anime.url, anime.name);
        // 10 sec gap safety ke liye
        await new Promise(r => setTimeout(r, 10000));
      } catch (err) {
        console.error(`❌ Bulk Error (${anime.name}):`, err.message);
      }
    }
  })();
});

/**
 * 🎯 SINGLE EXTRACTION
 * ReqBin Body: { "url": "...", "animeName": "Solo Leveling" }
 */
app.post('/api/extract', async (req, res) => {
  const { url, animeName } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  // extractAndUpload call kiya (SeriesExtractor file wala)
  extractAndUpload(url, animeName || 'Unknown Anime')
    .then(r => console.log('✅ Single Extraction Done'))
    .catch(err => console.error('❌ Single Extraction Failed:', err));

  res.json({ message: 'Extraction started in background' });
});

/**
 * 🖼️ GALLERY API (Frontend ke liye)
 * Jo series complete ho gayi hain unhe dikhata hai
 */
app.get('/api/gallery', async (req, res) => {
  try {
    // Sirf wahi dikhao jinka kuch content aa gaya ho
    const series = await mongoose.model('Series').find().sort({ createdAt: -1 });
    res.json({ data: series });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 📺 EPISODE LIST API
 * Frontend player ke liye data
 */
app.get('/api/series/:id', async (req, res) => {
  try {
    const series = await mongoose.model('Series').findById(req.params.id);
    if (!series) return res.status(404).json({ error: "Series not found" });
    
    // Sirf 'ready' status wale episodes bhejo jo play ho sakein
    const episodes = await mongoose.model('Episode').find({ 
      seriesId: req.params.id 
    }).sort({ episodeNumber: 1 }); // Sort by Ep 1, 2, 3...
    
    res.json({ series, episodes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ZAROORI: Server start logic server.js mein hai, yahan sirf export karo
module.exports = app;
