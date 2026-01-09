const mongoose = require('mongoose');

const seriesSchema = new mongoose.Schema({
  title: { type: String, required: true },
  sourceUrl: { type: String, required: true, unique: true },
  
  // Metadata from AniList
  cover: { type: String },
  banner: { type: String },
  description: { type: String },
  genres: [String],
  year: { type: Number },
  rating: { type: Number },

  status: { 
    type: String, 
    enum: ['pending', 'extracting', 'completed', 'failed'],
    default: 'pending'
  },
  lastExtracted: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Series', seriesSchema);
