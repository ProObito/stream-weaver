const express = require('express');
const router = express.Router();
const Series = require('../models/Series');
const Episode = require('../models/Episode');

router.get('/dashboard', async (req, res) => {
  try {
    // Counts
    const seriesCount = await Series.countDocuments();
    const episodeStats = await Episode.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);

    const stats = {
      series: seriesCount,
      episodes: {
        total: await Episode.countDocuments(),
        ready: episodeStats.find(s => s._id === 'ready')?.count || 0,
        processing: episodeStats.find(s => s._id === 'processing')?.count || 0,
        failed: episodeStats.find(s => s._id === 'failed')?.count || 0,
        pending: episodeStats.find(s => s._id === 'pending')?.count || 0,
      }
    };

    // Live Recent Activity
    const recent = await Episode.find({ status: { $in: ['processing', 'ready'] } })
      .sort({ updatedAt: -1 })
      .limit(10)
      .select('title episodeNumber status progress');

    res.json({ success: true, stats, recent });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
