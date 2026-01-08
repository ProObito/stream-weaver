/**
 * Quality priority order - highest first
 */
const QUALITY_PRIORITY = ['1080p', '720p', '480p', '360p'];

/**
 * Pick the best quality stream from available streams
 * @param {Array} streams - Array of stream objects with quality and url
 * @returns {Object|null} Best quality stream or null
 */
function pickBestQuality(streams) {
  if (!streams || !Array.isArray(streams) || streams.length === 0) {
    return null;
  }

  // Sort by quality priority
  const sorted = [...streams].sort((a, b) => {
    const aIndex = QUALITY_PRIORITY.indexOf(a.quality);
    const bIndex = QUALITY_PRIORITY.indexOf(b.quality);
    
    // Unknown quality goes to end
    const aRank = aIndex === -1 ? 999 : aIndex;
    const bRank = bIndex === -1 ? 999 : bIndex;
    
    return aRank - bRank;
  });

  return sorted[0];
}

/**
 * Filter streams by minimum quality
 * @param {Array} streams - Array of stream objects
 * @param {string} minQuality - Minimum quality (e.g., '720p')
 * @returns {Array} Filtered streams
 */
function filterByMinQuality(streams, minQuality = '480p') {
  const minIndex = QUALITY_PRIORITY.indexOf(minQuality);
  if (minIndex === -1) return streams;

  return streams.filter(s => {
    const index = QUALITY_PRIORITY.indexOf(s.quality);
    return index !== -1 && index <= minIndex;
  });
}

module.exports = {
  pickBestQuality,
  filterByMinQuality,
  QUALITY_PRIORITY
};
