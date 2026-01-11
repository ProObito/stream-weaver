const Episode = require('../models/Episode');
const { addRemoteUpload } = require('../services/streamtape.service');

async function processEpisodes(series, episodeList) {
  console.log(`🚀 Queueing ${episodeList.length} episodes for: ${series.title}`);
  
  for (const epData of episodeList) {
    try {
      // 1. Pehle se hai toh skip
      let episode = await Episode.findOne({ 
        seriesId: series._id, 
        episodeNumber: epData.episode,
        seasonNumber: epData.season || 1 
      });

      if (episode && (episode.status === 'ready' || episode.status === 'processing')) continue;

      // 2. Draft Episode entry banao (remoteId ke bina)
      if (!episode) {
        episode = await Episode.create({
          seriesId: series._id,
          title: epData.title || `Episode ${epData.episode}`,
          episodeNumber: epData.episode,
          seasonNumber: epData.season || 1,
          status: 'pending'
          // remoteId yahan required nahi hai ab
        });
      }

      // 3. Streamtape pe bhejo
      const remoteId = await addRemoteUpload(epData.link);

      if (remoteId) {
        await Episode.findByIdAndUpdate(episode._id, {
          status: 'processing',
          remoteId: remoteId
        });
      } else {
        await Episode.findByIdAndUpdate(episode._id, { 
          status: 'failed', 
          errorReason: 'Streamtape API did not return ID' 
        });
      }
    } catch (error) {
      console.error(`❌ Error in Ep ${epData.episode}:`, error.message);
    }
  }
}

module.exports = { processEpisodes };
