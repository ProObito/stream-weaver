const mongoose = require('mongoose');

const seriesSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    index: true
  },
  cover: {
    type: String,
    default: ''
  },
  genres: [{
    type: String
  }],
  year: {
    type: Number,
    index: true
  },
  description: {
    type: String,
    default: ''
  },
  sourceUrl: {
    type: String,
    unique: true
  },
  status: {
    type: String,
    enum: ['pending', 'extracting', 'completed', 'failed'],
    default: 'pending'
  },
  lastExtracted: {
    type: Date
  }
}, {
  timestamps: true
});

// Text index for search
seriesSchema.index({ title: 'text', description: 'text' });

module.exports = mongoose.model('Series', seriesSchema);
