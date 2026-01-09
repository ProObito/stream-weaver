const axios = require('axios');
const Series = require('../models/Series');

/**
 * ZenRows API ka use karke series data fetch karna
 */
async function fetchSeriesData(url) {
  try {
    console.log(`📡 ZenRows Requesting: ${url}`);
    
    const response = await axios({
      url: 'https://api.zenrows.com/v1/',
      method: 'GET',
      params: {
        'url': url,
        'apikey': process.env.SOURCE_API_KEY, // .env se 700c782d... lega
        'premium_proxy': 'true',
      },
      timeout: 60000 // 60 seconds wait karega slow sites ke liye
    });

    const data = response.data;

    // Data format ko hamare DB ke mutabiq set karna
    return {
      title: data.title || 'Unknown Title',
      cover: data.cover || data.image || '',
      year: data.year || new Date().getFullYear(),
      genres: data.genres || [],
      description: data.description || '',
      // Episodes ka array map karna
      episodes: (data.episodes || []).map((ep, index) => ({
        episode: ep.episode || index + 1,
        title: ep.title || `Episode ${ep.episode || index + 1}`,
        streams: ep.streams || [] // Video links yahan hone chahiye
      }))
    };
  } catch (error) {
    console.error(`❌ Source API (ZenRows) Error for ${url}:`, error.message);
    throw error;
  }
}

/**
 * .env file se pending URLs ki list nikalna
 */
async function getSeriesUrls(limit = 8) {
  const envUrls = process.env.SERIES_URLS;
  if (!envUrls) return [];

  // Comma separated list ko array mein badalna
  const allUrls = envUrls.split(',').map(u => u.trim()).filter(Boolean);
  
  // Check karna ki kaunsi series pehle se 'completed' hain
  const completedSeries = await Series.find({ 
    sourceUrl: { $in: allUrls },
    status: 'completed'
  }).select('sourceUrl');

  const completedUrls = new Set(completedSeries.map(s => s.sourceUrl));
  
  // Sirf wahi URLs wapas dena jo abhi tak complete nahi hue
  const pendingUrls = allUrls.filter(url => !completedUrls.has(url));

  return pendingUrls.slice(0, limit);
}

/**
 * Admin Dashboard ke liye stats taiyaar karna
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

  result.pending = result.total - (result.completed + result.failed + result.extracting);
  return result;
}

/**
 * Failed series ko wapas 'pending' karne ke liye (Reset button ke liye)
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
