const axios = require('axios');

async function getAnilistInfo(title) {
  const query = `
    query ($search: String) {
      Media (search: $search, type: ANIME) {
        description
        bannerImage
        coverImage { extraLarge large }
        genres
        averageScore
        seasonYear
      }
    }`;

  try {
    const response = await axios.post('https://graphql.anilist.co', {
      query,
      variables: { search: title }
    });
    
    const data = response.data.data.Media;
    if (!data) return null;

    return {
      description: data.description ? data.description.replace(/<[^>]*>?/gm, '') : '',
      cover: data.coverImage.extraLarge || data.coverImage.large,
      banner: data.bannerImage,
      genres: data.genres || [],
      year: data.seasonYear,
      rating: data.averageScore
    };
  } catch (err) {
    return null;
  }
}

module.exports = { getAnilistInfo };
