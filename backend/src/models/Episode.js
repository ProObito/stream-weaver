const mongoose = require('mongoose');

const episodeSchema = new mongoose.Schema({
  seriesId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Series', 
    required: true 
  },
  title: { type: String, required: true },
  episodeNumber: { type: Number, required: true },
  language: { type: String, required: true }, // "Multi" ya "Hindi Sub"
  
  remoteId: { type: String },      
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'ready', 'failed'], 
    default: 'pending' 
  },
  progress: { type: Number, default: 0 },
  lastChecked: { type: Date, default: Date.now },
  errorReason: { type: String }

}, { timestamps: true });

// 🔥 IMPORTANT FIX: Ab Ep 1 [Multi] aur Ep 1 [Hindi Sub] dono unique mane jayenge
episodeSchema.index({ seriesId: 1, episodeNumber: 1, language: 1 }, { unique: true });

module.exports = mongoose.model('Episode', episodeSchema);
