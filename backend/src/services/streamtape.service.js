const axios = require('axios');
const fs = require('fs'); // File delete karne ke liye
const path = require('path');

const STREAMTAPE_API = 'https://api.streamtape.com';

async function uploadToStreamtape(filePath, fileName) {
  try {
    // 1. Get Upload URL
    const getUrl = await axios.get(`${STREAMTAPE_API}/file/ul`, {
      params: {
        login: process.env.STREAMTAPE_LOGIN,
        key: process.env.STREAMTAPE_KEY
      }
    });

    const uploadUrl = getUrl.data.result.url;

    // 2. Local File ko Streamtape par bhejiyo
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));

    const uploadRes = await axios.post(uploadUrl, formData);

    // 3. Upload hote hi Server se Delete kar do
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath); 
      console.log(`🗑️ Deleted from server: ${fileName}`);
    }

    return {
      success: true,
      url: `https://streamtape.com/v/${uploadRes.data.result.id}`,
      fileId: uploadRes.data.result.id
    };
  } catch (error) {
    // Error aaye tab bhi safe side ke liye file delete kar dena
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return { success: false, error: error.message };
  }
}

module.exports = { uploadToStreamtape };
