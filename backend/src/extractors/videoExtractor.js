const { pickBestQuality } = require('../utils/qualitySelector');
const { uploadToStreamtape } = require('../services/streamtape.service');
const Episode = require('../models/Episode');

/**
 * Extract and upload episodes for a series
 * @param {Object} series - Series document from DB
 * @param {Array} episodes - Episodes data from source API
 * @returns {Object} Extraction result
 */
async function extractAndUploadEpisodes(series, episodes) {
  const results = {
    success: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  for (const ep of episodes) {
    try {
      // Check if episode already exists
      const existing = await Episode.findOne({
        seriesId: series._id,
        episodeNumber: ep.episode
      });

      if (existing && existing.status === 'ready') {
        console.log(`⏭️ Episode ${ep.episode} already exists, skipping`);
        results.skipped++;
        continue;
      }

      // Pick best quality stream (1080p preferred)
      const bestStream = pickBestQuality(ep.streams);
      
      if (!bestStream) {
        console.log(`⚠️ No streams found for episode ${ep.episode}`);
        results.failed++;
        results.errors.push(`Episode ${ep.episode}: No streams available`);
        continue;
      }

      console.log(`📤 Uploading Episode ${ep.episode} (${bestStream.quality})`);

      // Upload to Streamtape
      const uploadResult = await uploadToStreamtape(
        bestStream.url,
        `${series.title} - Episode ${ep.episode}`
      );

      if (!uploadResult.success) {
        results.failed++;
        results.errors.push(`Episode ${ep.episode}: ${uploadResult.error}`);
        continue;
      }

      // Save to database
      await Episode.findOneAndUpdate(
        { seriesId: series._id, episodeNumber: ep.episode },
        {
          seriesId: series._id,
          episodeNumber: ep.episode,
          title: ep.title || `Episode ${ep.episode}`,
          streamtapeUrl: uploadResult.url,
          streamtapeId: uploadResult.fileId,
          quality: bestStream.quality,
          status: 'ready'
        },
        { upsert: true, new: true }
      );

      console.log(`✅ Episode ${ep.episode} uploaded successfully`);
      results.success++;

    } catch (error) {
      console.error(`❌ Error processing episode ${ep.episode}:`, error.message);
      results.failed++;
      results.errors.push(`Episode ${ep.episode}: ${error.message}`);
    }
  }

  return results;
}

module.exports = {
  extractAndUploadEpisodes
};
