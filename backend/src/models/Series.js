const mongoose = require('mongoose');

const seriesSchema = new mongoose.Schema({
  title: { type: String, required: true, unique: true }, // Title unique rakho taaki sites merge ho sakein
  poster: String,
  plot: String,
  rating: String,
  // sourceUrl se unique hata diya taaki multiple sites ek hi series mein update kar sakein
  sourceUrl: { type: String }, 
  status: { type: String, enum: ['pending', 'processing', 'completed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Series', seriesSchema);
