const Series = require('../models/Series');
const { fetchSeriesData } = require('../services/sourceApi.service');
const { getAnilistInfo } = require('../services/metadata.service');
const { processEpisodes } = require('./videoExtractor');

async function extractSeries(url) {
  console.log(`\n🎬 Starting Extraction: ${url}`);
  
  try {
    // 1. Fetch Source Data (ZenRows)
    const sourceData = await fetchSeriesData(url);
    if (!sourceData || !sourceData.title) throw new Error('Source data failed');

    // 2. Fetch Metadata (AniList)
    const aniInfo = await getAnilistInfo(sourceData.title);

    // 3. Save/Update Series
    const series = await Series.findOneAndUpdate(
      { sourceUrl: url },
      {
        title: sourceData.title,
        cover: aniInfo?.cover || sourceData.cover,
        banner: aniInfo?.banner || '',
        description: aniInfo?.description || sourceData.description,
        genres: aniInfo?.genres || sourceData.genres,
        year: aniInfo?.year || sourceData.year,
        status: 'extracting',
        lastExtracted: new Date()
      },
      { upsert: true, new: true }
    );

    // 4. Start Remote Upload Process
    const queuedCount = await processEpisodes(series, sourceData.episodes);
    
    series.status = 'completed';
    await series.save();

    return { success: true, queued: queuedCount };
  } catch (error) {
    console.error(`❌ Series Extraction Error:`, error.message);
    await Series.findOneAndUpdate({ sourceUrl: url }, { status: 'failed' });
    return { success: false, error: error.message };
  }
}

module.exports = { extractSeries };
