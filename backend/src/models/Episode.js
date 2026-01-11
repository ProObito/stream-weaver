const mongoose = require('mongoose');

const seriesSchema = new mongoose.Schema({
    title: { type: String, required: true, unique: true },
    poster: { type: String, default: "" },
    description: { type: String, default: "" },
    sourceUrl: { type: String, default: "" },
    isPublished: { type: Boolean, default: false },
    lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

// Agar model pehle se compile hai toh wahi use karega
module.exports = mongoose.models.Series || mongoose.model('Series', seriesSchema);
