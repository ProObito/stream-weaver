const axios = require('axios');

const STREAMTAPE_API = 'https://api.streamtape.com';

/**
 * Upload video to Streamtape via remote URL
 * @param {string} videoUrl - Direct video URL to upload
 * @param {string} fileName - Optional filename
 * @returns {Object} Upload result with Streamtape URL
 */
async function uploadToStreamtape(videoUrl, fileName = null) {
  try {
    // Step 1: Get upload URL
    const uploadUrlResponse = await axios.get(`${STREAMTAPE_API}/file/ul`, {
      params: {
        login: process.env.STREAMTAPE_LOGIN,
        key: process.env.STREAMTAPE_KEY
      }
    });

    if (uploadUrlResponse.data.status !== 200) {
      throw new Error(`Failed to get upload URL: ${uploadUrlResponse.data.msg}`);
    }

    // Step 2: Remote upload
    const remoteResponse = await axios.get(`${STREAMTAPE_API}/remotedl/add`, {
      params: {
        login: process.env.STREAMTAPE_LOGIN,
        key: process.env.STREAMTAPE_KEY,
        url: videoUrl,
        name: fileName
      }
    });

    if (remoteResponse.data.status !== 200) {
      throw new Error(`Remote upload failed: ${remoteResponse.data.msg}`);
    }

    const fileId = remoteResponse.data.result.id;

    // Step 3: Check upload status (poll until complete)
    const streamtapeUrl = await pollUploadStatus(fileId);

    return {
      success: true,
      fileId,
      url: streamtapeUrl
    };
  } catch (error) {
    console.error('❌ Streamtape upload error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Poll for upload completion
 * @param {string} fileId - Streamtape file ID
 * @returns {string} Final Streamtape URL
 */
async function pollUploadStatus(fileId, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(10000); // Wait 10 seconds between checks

    try {
      const response = await axios.get(`${STREAMTAPE_API}/remotedl/status`, {
        params: {
          login: process.env.STREAMTAPE_LOGIN,
          key: process.env.STREAMTAPE_KEY,
          id: fileId
        }
      });

      const result = response.data.result;
      
      if (!result || Object.keys(result).length === 0) {
        // Upload might be complete, try to get file info
        return await getFileUrl(fileId);
      }

      const status = result[fileId];
      
      if (status.status === 'finished') {
        return `https://streamtape.com/v/${status.videoId}`;
      }
      
      if (status.status === 'error') {
        throw new Error(`Upload failed: ${status.error}`);
      }

      console.log(`⏳ Upload progress: ${status.percent || 0}%`);
    } catch (error) {
      console.error('Status check error:', error.message);
    }
  }

  throw new Error('Upload timeout - max attempts reached');
}

/**
 * Get file URL after upload
 * @param {string} fileId - Streamtape file ID
 * @returns {string} Streamtape video URL
 */
async function getFileUrl(fileId) {
  const response = await axios.get(`${STREAMTAPE_API}/file/info`, {
    params: {
      login: process.env.STREAMTAPE_LOGIN,
      key: process.env.STREAMTAPE_KEY,
      file: fileId
    }
  });

  if (response.data.status === 200 && response.data.result) {
    const file = response.data.result[fileId];
    return `https://streamtape.com/v/${file.linkid}`;
  }

  return `https://streamtape.com/v/${fileId}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  uploadToStreamtape,
  getFileUrl
};
