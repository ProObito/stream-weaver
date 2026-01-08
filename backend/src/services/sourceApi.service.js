const axios = require('axios');
const Series = require('../models/Series');

/**
 * Fetch series data from source API
 * @param {string} url - Series URL to scrape
 * @returns {Object} Series data with episodes
 */
async function fetchSeriesData(url) {
  try {
    const response = await axios.get(process.env.SOURCE_API_URL, {
      params: {
        url: url,
        apikey: process.env.SOURCE_API_KEY,
        premium_proxy: 'true'
      },
      timeout: 60000 // 60 second timeout
    });

    const data = response.data;

    // Normalize the response
    return {
      title: data.title || 'Unknown Title',
      cover: data.cover || data.image || data.poster || '',
      year: data.year || new Date().getFullYear(),
      genres: data.genres || data.genre || [],
      description: data.description || data.synopsis || '',
      episodes: (data.episodes || []).map((ep, index) => ({
        episode: ep.episode || ep.number || index + 1,
        title: ep.title || `Episode ${ep.episode || index + 1}`,
        streams: ep.streams || ep.sources || []
      }))
    };
  } catch (error) {
    console.error(`❌ Source API error for ${url}:`, error.message);
    throw error;
  }
}

/**
 * Get list of series URLs to extract (excluding already completed ones)
 * @param {number} limit - Number of URLs to return
 * @returns {Array} List of URLs that haven't been extracted yet
 */
async function getSeriesUrls(limit = 8) {
  // Get all configured URLs from environment
  const envUrls = process.env.SERIES_URLS;
  if (!envUrls) {
    console.log('⚠️ No SERIES_URLS configured in environment');
    return [];
  }

  const allUrls = envUrls.split(',').map(u => u.trim()).filter(Boolean);
  
  // Find which URLs are already completed in DB
  const completedSeries = await Series.find({
    sourceUrl: { $in: allUrls },
    status: 'completed'
  }).select('sourceUrl');

  const completedUrls = new Set(completedSeries.map(s => s.sourceUrl));

  // Filter out completed URLs
  const pendingUrls = allUrls.filter(url => !completedUrls.has(url));

  console.log(`📋 Total URLs: ${allUrls.length}, Completed: ${completedUrls.size}, Pending: ${pendingUrls.length}`);

  // Return only the limit number of pending URLs
  return pendingUrls.slice(0, limit);
}

/**
 * Get extraction stats
 * @returns {Object} Stats about extraction progress
 */
async function getExtractionStats() {
  const envUrls = process.env.SERIES_URLS;
  const allUrls = envUrls ? envUrls.split(',').map(u => u.trim()).filter(Boolean) : [];

  const stats = await Series.aggregate([
    { $match: { sourceUrl: { $in: allUrls } } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);

  const result = {
    total: allUrls.length,
    completed: 0,
    failed: 0,
    extracting: 0,
    pending: 0
  };

  stats.forEach(s => {
    result[s._id] = s.count;
  });

  result.pending = result.total - result.completed - result.failed - result.extracting;

  return result;
}

/**
 * Reset failed series to allow re-extraction
 * @returns {number} Number of series reset
 */
async function resetFailedSeries() {
  const result = await Series.updateMany(
    { status: 'failed' },
    { status: 'pending' }
  );
  return result.modifiedCount;
}

module.exports = {
  fetchSeriesData,
  getSeriesUrls,
  getExtractionStats,
  resetFailedSeries
};
