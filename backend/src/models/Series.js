const mongoose = require('mongoose');

const seriesSchema = new mongoose.Schema({
  title: { type: String, required: true },
  sourceSite: { type: String }, 
  sourceUrl: { type: String, unique: true },
  poster: String,
  plot: String,
  rating: String,
  language: { type: String }, // Hindi Dubbed ya Hindi Subbed
  status: { type: String, enum: ['pending', 'processing', 'completed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Series', seriesSchema);
