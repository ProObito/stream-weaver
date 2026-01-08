const express = require('express');
const router = express.Router();
const Series = require('../models/Series');
const Episode = require('../models/Episode');

/**
 * GET /api/gallery
 * Search & filter series
 * Query params: search, genre, year, page, limit
 */
router.get('/', async (req, res) => {
  try {
    const { search, genre, year, page = 1, limit = 20 } = req.query;
    
    const query = { status: 'completed' };

    // Text search
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Genre filter
    if (genre) {
      query.genres = { $in: [genre] };
    }

    // Year filter
    if (year) {
      query.year = parseInt(year);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [series, total] = await Promise.all([
      Series.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Series.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: series,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/gallery/genres
 * Get all unique genres
 */
router.get('/genres', async (req, res) => {
  try {
    const genres = await Series.distinct('genres');
    res.json({ success: true, data: genres.filter(Boolean).sort() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/gallery/years
 * Get all unique years
 */
router.get('/years', async (req, res) => {
  try {
    const years = await Series.distinct('year');
    res.json({ success: true, data: years.filter(Boolean).sort((a, b) => b - a) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/gallery/:id
 * Get series details with episodes
 */
router.get('/:id', async (req, res) => {
  try {
    const series = await Series.findById(req.params.id).lean();
    
    if (!series) {
      return res.status(404).json({ success: false, error: 'Series not found' });
    }

    const episodes = await Episode.find({ 
      seriesId: series._id,
      status: 'ready'
    })
    .sort({ episodeNumber: 1 })
    .lean();

    res.json({
      success: true,
      data: {
        ...series,
        episodes
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/gallery/:id/episodes
 * Get episodes for a series
 */
router.get('/:id/episodes', async (req, res) => {
  try {
    const episodes = await Episode.find({
      seriesId: req.params.id,
      status: 'ready'
    })
    .sort({ episodeNumber: 1 })
    .lean();

    res.json({ success: true, data: episodes });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
