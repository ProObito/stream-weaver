const axios = require('axios');

const STREAMTAPE_API = 'https://api.streamtape.com';
const LOGIN = process.env.STREAMTAPE_LOGIN;
const KEY = process.env.STREAMTAPE_KEY;

/**
 * 1. Add Remote Upload: Link server ko mat bhejo, seedha Streamtape ko do
 */
async function addRemoteUpload(url) {
  try {
    const response = await axios.get(`${STREAMTAPE_API}/remotedl/add`, {
      params: { login: LOGIN, key: KEY, url: url }
    });
    
    if (response.data.status === 200 && response.data.result && response.data.result.id) {
      return response.data.result.id;
    }
    console.error('⚠️ Streamtape Add Failed:', response.data.msg);
    return null;
  } catch (error) {
    console.error('❌ Streamtape Connection Error:', error.message);
    return null;
  }
}

/**
 * 2. Check Status: Dashboard ko batane ke liye ki kitna percent hua
 */
async function checkRemoteStatus(remoteId) {
  try {
    const response = await axios.get(`${STREAMTAPE_API}/remotedl/status`, {
      params: { login: LOGIN, key: KEY, id: remoteId }
    });

    if (response.data.status !== 200) return null;

    const data = response.data.result[remoteId];
    if (!data) return null;

    return {
      status: data.status, // 'downloading', 'finished', 'error'
      bytes_downloaded: data.bytes_downloaded,
      bytes_total: data.bytes_total,
      url: data.url // Final link only when finished
    };
  } catch (error) {
    console.error('Check Status Error:', error.message);
    return null;
  }
}

module.exports = { addRemoteUpload, checkRemoteStatus };
