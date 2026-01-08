const mongoose = require('mongoose');

const episodeSchema = new mongoose.Schema({
  seriesId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Series',
    required: true,
    index: true
  },
  episodeNumber: {
    type: Number,
    required: true
  },
  title: {
    type: String,
    default: ''
  },
  streamtapeUrl: {
    type: String,
    required: true
  },
  streamtapeId: {
    type: String
  },
  quality: {
    type: String,
    default: '1080p'
  },
  duration: {
    type: Number // in seconds
  },
  thumbnail: {
    type: String
  },
  status: {
    type: String,
    enum: ['uploading', 'ready', 'failed'],
    default: 'ready'
  }
}, {
  timestamps: true
});

// Compound index for series + episode
episodeSchema.index({ seriesId: 1, episodeNumber: 1 }, { unique: true });

module.exports = mongoose.model('Episode', episodeSchema);
