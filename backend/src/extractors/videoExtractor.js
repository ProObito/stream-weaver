const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { uploadToStreamtape } = require('../services/streamtape.service');
const Episode = require('../models/Episode');

async function extractAndUploadEpisodes(series, episodes) {
  const tempDir = path.join(__dirname, '../temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

  for (const ep of episodes) {
    // Check if episode already exists
    const existing = await Episode.findOne({ seriesId: series._id, episodeNumber: ep.episode });
    if (existing) continue;

    const tempFilePath = path.join(tempDir, `${series._id}_${ep.episode}.mp4`);
    
    try {
      console.log(`📥 Downloading Ep ${ep.episode}: ${series.title}`);
      
      // 1. Download to Server
      const response = await axios({
        url: ep.streams[0]?.link, // Aapke source se aane wala direct link
        method: 'GET',
        responseType: 'stream'
      });

      const writer = fs.createWriteStream(tempFilePath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      // 2. Upload to Streamtape
      console.log(`📤 Uploading to Streamtape...`);
      const upload = await uploadToStreamtape(tempFilePath, `${series.title} - E${ep.episode}`);

      if (upload.success) {
        // 3. Save to DB (Frontend display)
        await Episode.create({
          seriesId: series._id,
          episodeNumber: ep.episode,
          title: ep.title,
          streamtapeUrl: upload.url, // Ye link frontend player mein jayega
          status: 'ready'
        });
        console.log(`✅ Success: Episode ${ep.episode} is live.`);
      }

    } catch (err) {
      console.error(`❌ Failed Episode ${ep.episode}:`, err.message);
    } finally {
      // 4. Always delete from server
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
        console.log(`🗑️ Temp file deleted.`);
      }
    }
  }
}

module.exports = { extractAndUploadEpisodes };
