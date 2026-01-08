const axios = require('axios');

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
 * Get list of series URLs to extract
 * This can be from env, database, or another API
 * @param {number} limit - Number of URLs to return
 * @returns {Array} List of URLs
 */
async function getSeriesUrls(limit = 8) {
  // Option 1: From environment variable (comma separated)
  const envUrls = process.env.SERIES_URLS;
  if (envUrls) {
    return envUrls.split(',').slice(0, limit).map(u => u.trim());
  }

  // Option 2: You can add logic to fetch from an API
  // Example: fetch trending/new series URLs
  
  return [];
}

module.exports = {
  fetchSeriesData,
  getSeriesUrls
};
