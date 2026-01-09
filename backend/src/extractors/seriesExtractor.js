const Series = require('../models/Series');
const { fetchSeriesData, getSeriesUrls } = require('../services/sourceApi.service');
const { getAnilistInfo } = require('../services/metadata.service'); // Naya import
const { extractAndUploadEpisodes } = require('./videoExtractor');

/**
 * Extract series with Hybrid Logic (Video from Source, Info from AniList)
 */
async function extractSeries(url) {
  console.log(`\n🎬 Starting Hybrid Extraction: ${url}`);
  
  try {
    let series = await Series.findOne({ sourceUrl: url });
    if (series && series.status === 'extracting') return { success: false, reason: 'Already extracting' };

    // 1. Source site se video links aur title nikalo (ZenRows use karke)
    const sourceData = await fetchSeriesData(url);
    if (!sourceData || !sourceData.title) throw new Error('Source site data failed');

    // 2. AniList se HD metadata fetch karo
    console.log(`🔍 Fetching AniList metadata for: ${sourceData.title}`);
    const aniInfo = await getAnilistInfo(sourceData.title);

    // 3. Database mein Save/Update (Merging)
    series = await Series.findOneAndUpdate(
      { sourceUrl: url },
      {
        title: sourceData.title,
        // AniList ki info ko priority do, agar na mile toh source ki info use karo
        cover: aniInfo?.cover || sourceData.cover, 
        description: aniInfo?.description || sourceData.description,
        genres: aniInfo?.genres || sourceData.genres,
        year: aniInfo?.year || sourceData.year,
        sourceUrl: url,
        status: 'extracting'
      },
      { upsert: true, new: true }
    );

    // 4. Video upload logic (Wahi purana)
    const uploadResult = await extractAndUploadEpisodes(series, sourceData.episodes);
    
    series.status = 'completed';
    series.lastExtracted = new Date();
    await series.save();

    return { success: true, episodes: uploadResult };
  } catch (error) {
    console.error(`❌ Extraction Error:`, error.message);
    return { success: false, error: error.message };
  }
}

// Ye function wahi rahega jo pehle tha (Batch extraction ke liye)
async function runBatchExtraction(limit = 8) {
  const urls = await getSeriesUrls(limit);
  if (urls.length === 0) return { success: true, message: 'No pending series' };

  for (const url of urls) {
    await extractSeries(url);
    await new Promise(r => setTimeout(r, 2000));
  }
}

module.exports = { extractSeries, runBatchExtraction };
