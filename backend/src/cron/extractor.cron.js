const cron = require('node-cron');
const { runBatchExtraction } = require('../extractors/seriesExtractor');

let isRunning = false;

/**
 * Run extractor with concurrency lock
 * @param {number} limit - Number of series to extract
 */
async function runExtractor(limit = 8) {
  if (isRunning) {
    console.log('⚠️ Extraction already in progress, skipping');
    return;
  }

  isRunning = true;
  console.log(`\n⏰ [${new Date().toISOString()}] Starting scheduled extraction`);

  try {
    const result = await runBatchExtraction(limit);
    console.log('📊 Extraction result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ Scheduled extraction failed:', error.message);
  } finally {
    isRunning = false;
  }
}

/**
 * Initial extraction on deploy
 */
function runInitialExtraction() {
  // Delay initial run by 5 seconds to allow server to fully start
  setTimeout(() => {
    runExtractor(8);
  }, 5000);
}

/**
 * Start cron job for every 12 hours
 */
function startCron() {
  // Run at 00:00 and 12:00 every day (every 12 hours)
  cron.schedule('0 */12 * * *', () => {
    runExtractor(8);
  });

  console.log('✅ Cron job registered: Every 12 hours');
}

module.exports = {
  runExtractor,
  runInitialExtraction,
  startCron
};
