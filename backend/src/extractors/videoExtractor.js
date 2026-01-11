const Episode = require('../models/Episode');
const { addRemoteUpload } = require('../services/streamtape.service');

async function processEpisodes(series, episodeList) {
  console.log(`🚀 Queueing ${episodeList.length} episodes for: ${series.title}`);
  let queuedCount = 0;

  for (const epData of episodeList) {
    try {
      // 1. Check if episode already exists for this series
      let episode = await Episode.findOne({ 
        seriesId: series._id, 
        episodeNumber: epData.episode 
      });

      // Status check: Agar pehle se upload ho raha hai ya ho chuka hai, skip karo
      if (episode && (episode.status === 'ready' || episode.status === 'processing')) {
        continue;
      }

      // 2. Naya episode entry banao agar nahi hai
      if (!episode) {
        episode = await Episode.create({
          seriesId: series._id,
          title: epData.title || `Episode ${epData.episode}`,
          episodeNumber: epData.episode,
          status: 'pending'
        });
      }

      // 3. Source link check
      const sourceLink = epData.streams?.[0]?.link || epData.link; // Dono formats support karega
      if (!sourceLink) {
        await episode.updateOne({ status: 'failed', errorReason: 'No source link found' });
        continue;
      }

      // 4. Remote Upload trigger (Streamtape API)
      const remoteId = await addRemoteUpload(sourceLink);

      if (remoteId) {
        await episode.updateOne({
          status: 'processing',
          remoteId: remoteId,
          progress: 0,
          errorReason: null
        });
        queuedCount++;
        console.log(`✅ Ep ${epData.episode} queued to Streamtape.`);
      } else {
        await episode.updateOne({ status: 'failed', errorReason: 'Streamtape API Failed' });
      }

    } catch (error) {
      console.error(`❌ Error in Ep ${epData.episode}:`, error.message);
    }
  }
  
  return queuedCount;
}

module.exports = { processEpisodes };
