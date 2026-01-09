const cron = require('node-cron');
const Episode = require('../models/Episode');
const { checkRemoteStatus } = require('./streamtape.service');

function startStatusUpdater() {
  // Har 1 minute par chalega
  cron.schedule('*/1 * * * *', async () => {
    console.log('🔄 Cron Job: Checking Upload Status...');
    
    // Sirf un episodes ko dhundo jo 'processing' mein hain
    const processingEpisodes = await Episode.find({ 
      status: 'processing', 
      remoteId: { $exists: true } 
    }).limit(20); // Ek baar mein 20 check karo taaki load na pade

    if (processingEpisodes.length === 0) return;

    for (const ep of processingEpisodes) {
      const statusData = await checkRemoteStatus(ep.remoteId);
      
      if (!statusData) continue;

      // Case 1: Finished
      if (statusData.status === 'finished') {
        ep.status = 'ready';
        ep.streamtapeUrl = `https://streamtape.com/v/${statusData.url}`;
        ep.progress = 100;
        ep.lastChecked = new Date();
        await ep.save();
        console.log(`✅ Ready: ${ep.title}`);
      } 
      // Case 2: Downloading
      else if (statusData.status === 'downloading') {
        const percent = statusData.bytes_total > 0 
          ? Math.floor((statusData.bytes_downloaded / statusData.bytes_total) * 100) 
          : 0;
        ep.progress = percent;
        ep.lastChecked = new Date();
        await ep.save();
      }
      // Case 3: Error
      else if (statusData.status === 'error') {
        ep.status = 'failed';
        ep.errorReason = 'Streamtape Download Failed';
        await ep.save();
        console.log(`❌ Failed: ${ep.title}`);
      }
    }
  });
}

module.exports = { startStatusUpdater };
