const mongoose = require('mongoose');

const episodeSchema = new mongoose.Schema({
  seriesId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Series',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  episodeNumber: {
    type: Number,
    required: true
  },
  // Season support for "Old to New" sorting
  seasonNumber: {
    type: Number,
    default: 1
  },
  // Streamtape ID (Required: false taaki agar API fail ho toh crash na ho)
  remoteId: {
    type: String,
    required: false
  },
  // Current status of the upload
  status: {
    type: String,
    enum: ['pending', 'processing', 'ready', 'failed'],
    default: 'pending'
  },
  // Error tracking
  errorReason: {
    type: String,
    default: null
  },
  // Upload progress percentage
  progress: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true // Automates createdAt and updatedAt
});

// Indexing taaki search fast ho aur duplicate episodes na banein ek hi season mein
episodeSchema.index({ seriesId: 1, seasonNumber: 1, episodeNumber: 1 }, { unique: true });

module.exports = mongoose.model('Episode', episodeSchema);
