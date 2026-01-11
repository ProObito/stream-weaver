const axios = require('axios');

const addRemoteUpload = async (link) => {
    try {
        // Teri details yahan set kar di hain
        const login = 'd3f8bfe5641fe0077596'; 
        const key = '0AWzYr6lmpsb38z';

        const url = `https://api.streamtape.com/remotedl/add?login=${login}&key=${key}&url=${encodeURIComponent(link)}`;
        
        const response = await axios.get(url);

        // Streamtape returns status 200 for success
        if (response.data.status === 200 && response.data.result) {
            console.log(`✅ Streamtape Success! ID: ${response.data.result.id}`);
            return response.data.result.id;
        } else {
            console.error(`⚠️ Streamtape API Refused: ${response.data.msg || 'Check API Limit'}`);
            return null;
        }
    } catch (error) {
        console.error(`❌ Streamtape Service Crash: ${error.message}`);
        return null;
    }
};

module.exports = { addRemoteUpload };
