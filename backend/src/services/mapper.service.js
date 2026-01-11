const axios = require('axios');

const getUniversalMeta = async (animeName, mainUrl) => {
    try {
        console.log(`🔍 Mapping Metadata for: ${animeName}`);
        let malId = null;

        // --- STRATEGY 1: Check HiAnime Mapping via IrfanKhan66 Repo ---
        if (mainUrl.includes('hianime.to') || mainUrl.includes('zoro.to')) {
            try {
                // URL se ID nikalo (e.g., watch/one-piece-100?ep=...)
                const idPart = mainUrl.split('/').pop().split('?')[0]; 
                // IrfanKhan66 ki repo se JSON read karo
                const mappingUrl = `https://raw.githubusercontent.com/IrfanKhan66/hianime-mapper/main/mapping.json`;
                const mappings = await axios.get(mappingUrl);
                const animeMap = mappings.data.find(item => item.hianime_id === idPart);
                
                if (animeMap) malId = animeMap.mal_id;
            } catch (e) { console.log("⚠️ HiAnime Mapping check failed, trying fallback."); }
        }

        // --- STRATEGY 2: Fetch Data (Jikan if MAL ID found, else Anilist) ---
        if (malId) {
            // Get from Jikan (MAL)
            const malRes = await axios.get(`https://api.jikan.moe/v4/anime/${malId}`);
            const d = malRes.data.data;
            return {
                poster: d.images.jpg.large_image_url,
                description: d.synopsis,
                title: d.title_english || d.title,
                rating: d.score,
                genres: d.genres.map(g => g.name)
            };
        } else {
            // Fallback: Anilist GraphQL (Best for TPX/DesiDub)
            const cleanTitle = animeName
                .replace(/Hindi|Dubbed|Subbed|Season \d+|S\d+|Episode \d+|E\d+/gi, '')
                .trim();
            
            const query = `query ($s: String) { Media (search: $s, type: ANIME) { 
                title { english romaji } 
                description 
                coverImage { extraLarge } 
                averageScore
                genres
            }}`;

            const res = await axios.post('https://graphql.anilist.co', { query, variables: { s: cleanTitle } });
            const m = res.data.data.Media;
            
            return {
                poster: m.coverImage.extraLarge,
                description: m.description ? m.description.replace(/<[^>]*>?/gm, '') : "No description available.",
                title: m.title.english || m.title.romaji,
                rating: m.averageScore ? (m.averageScore / 10).toFixed(1) : "N/A",
                genres: m.genres
            };
        }
    } catch (err) {
        console.log(`❌ Metadata Failed: ${err.message}`);
        return {
            poster: "https://via.placeholder.com/600x900?text=No+Poster",
            description: "No metadata found.",
            title: animeName,
            rating: "N/A",
            genres: []
        };
    }
};

module.exports = { getUniversalMeta };
