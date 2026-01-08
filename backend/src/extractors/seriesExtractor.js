const Series = require('../models/Series');
const { fetchSeriesData, getSeriesUrls } = require('../services/sourceApi.service');
const { extractAndUploadEpisodes } = require('./videoExtractor');

/**
 * Extract series data and upload episodes
 * @param {string} url - Series URL
 * @returns {Object} Extraction result
 */
async function extractSeries(url) {
  console.log(`\n🎬 Extracting series from: ${url}`);
  
  try {
    // Check if already being extracted
    let series = await Series.findOne({ sourceUrl: url });
    
    if (series && series.status === 'extracting') {
      console.log('⏳ Series already being extracted, skipping');
      return { success: false, reason: 'Already extracting' };
    }

    // Fetch data from source API
    const data = await fetchSeriesData(url);
    
    if (!data || !data.title) {
      throw new Error('Invalid data received from source API');
    }

    // Create or update series in DB
    series = await Series.findOneAndUpdate(
      { sourceUrl: url },
      {
        title: data.title,
        cover: data.cover,
        genres: data.genres,
        year: data.year,
        description: data.description,
        sourceUrl: url,
        status: 'extracting'
      },
      { upsert: true, new: true }
    );

    console.log(`📺 Series: ${series.title} (${data.episodes.length} episodes)`);

    // Extract and upload episodes
    const result = await extractAndUploadEpisodes(series, data.episodes);

    // Update series status
    await Series.findByIdAndUpdate(series._id, {
      status: result.failed === data.episodes.length ? 'failed' : 'completed',
      lastExtracted: new Date()
    });

    console.log(`✅ Series extraction complete: ${result.success} success, ${result.failed} failed, ${result.skipped} skipped`);

    return {
      success: true,
      series: series.title,
      ...result
    };

  } catch (error) {
    console.error(`❌ Series extraction failed for ${url}:`, error.message);
    
    // Mark as failed in DB
    await Series.findOneAndUpdate(
      { sourceUrl: url },
      { status: 'failed' }
    );

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Run batch extraction for multiple series
 * @param {number} limit - Number of series to extract
 * @returns {Object} Batch result
 */
async function runBatchExtraction(limit = 8) {
  console.log(`\n🚀 Starting batch extraction (limit: ${limit})`);
  
  const urls = await getSeriesUrls(limit);
  
  if (urls.length === 0) {
    console.log('⚠️ No series URLs found to extract');
    return { success: false, reason: 'No URLs configured' };
  }

  const results = {
    total: urls.length,
    success: 0,
    failed: 0,
    details: []
  };

  for (const url of urls) {
    const result = await extractSeries(url);
    
    if (result.success) {
      results.success++;
    } else {
      results.failed++;
    }
    
    results.details.push({ url, ...result });
    
    // Small delay between series
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\n📊 Batch complete: ${results.success}/${results.total} successful`);
  return results;
}

module.exports = {
  extractSeries,
  runBatchExtraction
};
