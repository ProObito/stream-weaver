const mongoose = require('mongoose');

const seriesSchema = new mongoose.Schema({
    title: { type: String, required: true, unique: true },
    poster: { type: String, default: "" },
    description: { type: String, default: "" },
    sourceUrl: { type: String, default: "" },
    isPublished: { type: Boolean, default: false }, // Yeh zaroori hai
    lastUpdated: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Series', seriesSchema);
