const axios = require('axios');

async function fetchSeriesData(url) {
  try {
    console.log(`📡 ZenRows Scraping: ${url}`);
    
    const response = await axios({
      url: 'https://api.zenrows.com/v1/',
      method: 'GET',
      params: {
        'url': url,
        'apikey': process.env.SOURCE_API_KEY,
        'premium_proxy': 'true',
      },
      timeout: 60000 
    });

    const data = response.data;
    
    // Clean Data
    return {
      title: data.title || 'Unknown Anime',
      cover: data.cover || data.image || '',
      year: data.year || new Date().getFullYear(),
      genres: data.genres || [],
      description: data.description || '',
      episodes: (data.episodes || []).map((ep, index) => ({
        episode: ep.episode || index + 1,
        title: ep.title || `Episode ${ep.episode || index + 1}`,
        streams: ep.streams || []
      }))
    };
  } catch (error) {
    console.error(`❌ ZenRows Error:`, error.message);
    throw error;
  }
}

module.exports = { fetchSeriesData };
