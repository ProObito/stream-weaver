# Anime Extractor Backend

Auto video extraction backend with Streamtape upload and MongoDB storage.

## Features

- 🚀 Auto-extract 8 series on deploy
- ⏰ Every 12 hours batch extraction
- 🎥 Highest quality (1080p) video selection
- ☁️ Streamtape auto-upload
- 🔍 Search & filter API (genre, year)
- 📊 MongoDB for persistent storage

## Quick Start

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your credentials
```

### 3. Run Locally
```bash
npm run dev
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `MONGO_URI` | MongoDB connection string |
| `SOURCE_API_KEY` | Your scraping API key |
| `SOURCE_API_URL` | Scraping API endpoint |
| `STREAMTAPE_LOGIN` | Streamtape account login |
| `STREAMTAPE_KEY` | Streamtape API key |
| `SERIES_URLS` | Comma-separated series URLs to extract |
| `CRON_ENABLED` | Enable/disable 12hr cron (true/false) |
| `PORT` | Server port (default: 3000) |

## API Endpoints

### Gallery
- `GET /api/gallery` - List series with search/filter
  - `?search=naruto` - Text search
  - `?genre=action` - Filter by genre
  - `?year=2023` - Filter by year
  - `?page=1&limit=20` - Pagination

- `GET /api/gallery/genres` - Get all genres
- `GET /api/gallery/years` - Get all years
- `GET /api/gallery/:id` - Get series with episodes
- `GET /api/gallery/:id/episodes` - Get episodes only

### Admin
- `POST /api/extract/trigger` - Manually trigger extraction
- `GET /health` - Health check

## Deploy to Render

1. Create new Web Service
2. Connect your repo
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Add environment variables

## Deploy to Railway

1. Create new project from GitHub
2. Add MongoDB plugin
3. Set environment variables
4. Deploy!

## Quality Logic

- **Storage**: Only 1080p (highest) is uploaded
- **Streaming**: Streamtape handles adaptive quality
- **Frontend**: User can change quality in player

## Frontend Integration

```javascript
// Fetch series
const response = await fetch('https://your-backend.com/api/gallery');
const { data } = await response.json();

// Search
const search = await fetch('/api/gallery?search=attack&genre=action');

// Get series with episodes
const series = await fetch('/api/gallery/SERIES_ID');
```
