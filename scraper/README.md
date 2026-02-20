# Menu Truth Scraper

Python scraper for collecting restaurant and menu data from UberEats.

## Setup

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Install Playwright browsers
playwright install chromium
```

## Configuration

Create a `.env` file in this directory:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

## Usage

### 1. Scrape Restaurant List

Scrape the list of restaurants from UberEats for Upper West Side:

```bash
python scrape_restaurants.py
```

This will:
- Search UberEats for restaurants in UWS zip codes
- Extract restaurant name, address, cuisine, rating
- Save to `output/restaurants.json`

### 2. Scrape Menu Items

Once you have the restaurant list, scrape their menus:

```bash
python scrape_menus.py
```

This will:
- Load restaurants from `output/restaurants.json`
- Visit each restaurant's UberEats page
- Extract all menu items and prices
- Save to `output/menu_items.json`

### 3. Upload to Supabase

Upload the scraped data to your Supabase database:

```bash
python upload_to_supabase.py
```

## Output Format

### restaurants.json
```json
[
  {
    "name": "Thai Market",
    "address": "960 Amsterdam Ave, New York, NY 10025",
    "ubereats_url": "https://www.ubereats.com/store/...",
    "cuisines": ["Thai", "Asian"],
    "ubereats_rating": 4.7,
    "zip_code": "10025"
  }
]
```

### menu_items.json
```json
[
  {
    "restaurant_name": "Thai Market",
    "items": [
      {
        "name": "Pad Thai",
        "description": "Rice noodles with...",
        "price": 1895,
        "category": "Noodles"
      }
    ]
  }
]
```

## Notes

- The scraper uses Playwright with headless Chrome
- Rate limiting is built in (5 second delay between requests)
- UberEats may block excessive scraping; use responsibly
- For production use, consider rotating proxies
