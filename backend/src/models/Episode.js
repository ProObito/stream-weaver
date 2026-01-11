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
    remoteId: { 
        type: String, 
        required: true 
    }, // Streamtape ya Doodstream ki ID
    language: { 
        type: String, 
        default: 'Hindi Sub' 
    },
    quality: { 
        type: String, 
        default: '720p' 
    }
}, { timestamps: true });

// Indexing taaki search fast ho aur duplicate episode na bane
episodeSchema.index({ seriesId: 1, episodeNumber: 1, language: 1 }, { unique: true });

module.exports = mongoose.models.Episode || mongoose.model('Episode', episodeSchema);
