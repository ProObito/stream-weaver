const mongoose = require('mongoose');

const episodeSchema = new mongoose.Schema({
  seriesId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Series', 
    required: true 
  },
  title: { type: String, required: true },
  episodeNumber: { type: Number, required: true },
  
  // Streamtape Links
  streamtapeUrl: { type: String }, // Final play link
  downloadUrl: { type: String },   // Direct download link (optional)
  
  // Tracking Fields (Dashboard ke liye)
  remoteId: { type: String },      // Streamtape Upload ID
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'ready', 'failed'], 
    default: 'pending' 
  },
  progress: { type: Number, default: 0 }, // 0% - 100%
  lastChecked: { type: Date, default: Date.now },
  errorReason: { type: String }

}, { timestamps: true });

// Ensure no duplicate episodes for same series
episodeSchema.index({ seriesId: 1, episodeNumber: 1 }, { unique: true });

module.exports = mongoose.model('Episode', episodeSchema);
