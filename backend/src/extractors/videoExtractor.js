const Episode = require('../models/Episode');
const { addRemoteUpload } = require('../services/streamtape.service');

async function processEpisodes(series, episodeList) {
  console.log(`🚀 Queueing ${episodeList.length} episodes for: ${series.title}`);
  let queuedCount = 0;

  for (const epData of episodeList) {
    try {
      // Check if exists
      let episode = await Episode.findOne({ seriesId: series._id, episodeNumber: epData.episode });

      // Agar pehle se ready hai ya processing hai, toh skip karo
      if (episode && (episode.status === 'ready' || episode.status === 'processing')) {
        continue;
      }

      // Create Entry if new
      if (!episode) {
        episode = await Episode.create({
          seriesId: series._id,
          title: epData.title,
          episodeNumber: epData.episode,
          status: 'pending'
        });
      }

      // Get Link
      const sourceLink = epData.streams[0]?.link;
      if (!sourceLink) {
        await episode.updateOne({ status: 'failed', errorReason: 'No source link found' });
        continue;
      }

      // Trigger Remote Upload
      const remoteId = await addRemoteUpload(sourceLink);

      if (remoteId) {
        await episode.updateOne({
          status: 'processing',
          remoteId: remoteId,
          progress: 0,
          errorReason: null
        });
        queuedCount++;
      } else {
        await episode.updateOne({ status: 'failed', errorReason: 'API Request Failed' });
      }

    } catch (error) {
      console.error(`Error queuing Ep ${epData.episode}:`, error.message);
    }
  }
  
  return queuedCount;
}

module.exports = { processEpisodes };
