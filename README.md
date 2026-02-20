# Menu Truth

Discover the real cost of food delivery. Compare UberEats prices to actual restaurant menu prices and find places that offer direct ordering.

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the schema from `src/lib/supabase-schema.sql`
3. Copy `env.example` to `.env.local` and fill in your Supabase credentials:
   - `NEXT_PUBLIC_SUPABASE_URL` - Found in Settings > API
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Found in Settings > API
   - `SUPABASE_SERVICE_ROLE_KEY` - Found in Settings > API (keep this secret!)

### 3. Set Up Maps (Choose One)

**Mapbox (Recommended):**
1. Create an account at [mapbox.com](https://mapbox.com)
2. Get your access token
3. Add `NEXT_PUBLIC_MAPBOX_TOKEN` to `.env.local`

**Google Maps:**
1. Enable Maps JavaScript API in Google Cloud Console
2. Get your API key
3. Add `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to `.env.local`

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Scraper Setup

The Python scraper is in the `scraper/` directory.

```bash
cd scraper
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

See `scraper/README.md` for usage instructions.

## Project Structure

```
menutruth/
├── src/
│   ├── app/           # Next.js app router pages
│   ├── components/    # React components
│   └── lib/           # Utilities and types
├── scraper/           # Python scraper for UberEats
└── public/            # Static assets
```
