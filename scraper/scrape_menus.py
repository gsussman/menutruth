#!/usr/bin/env python3
"""
Scrape menu items and prices from UberEats restaurant pages.
Also extracts street addresses and geocodes them.
"""

import json
import os
import time
import re
import requests
from datetime import datetime
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
from dotenv import load_dotenv

load_dotenv()

INPUT_FILE = "output/restaurants.json"
OUTPUT_FILE = "output/menu_items.json"
PROGRESS_FILE = "output/scrape_progress.json"
RESTAURANTS_OUTPUT_FILE = "output/restaurants_with_addresses.json"

# Mapbox API for geocoding
MAPBOX_ACCESS_TOKEN = os.getenv("MAPBOX_ACCESS_TOKEN", "")


def load_restaurants():
    """Load restaurant list from JSON file."""
    if not os.path.exists(INPUT_FILE):
        print(f"Error: {INPUT_FILE} not found. Run scrape_restaurants.py first.")
        return []
    
    with open(INPUT_FILE, "r") as f:
        return json.load(f)


def load_progress():
    """Load scraping progress to resume interrupted runs."""
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, "r") as f:
            return json.load(f)
    return {"completed": [], "results": [], "restaurants_updated": []}


def save_progress(progress):
    """Save scraping progress."""
    with open(PROGRESS_FILE, "w") as f:
        json.dump(progress, f, indent=2)


def parse_price(price_text):
    """Convert price string to cents integer."""
    if not price_text:
        return None
    
    # Remove currency symbols and whitespace
    cleaned = re.sub(r'[^\d.]', '', price_text)
    
    try:
        dollars = float(cleaned)
        return int(dollars * 100)
    except ValueError:
        return None


def geocode_address(address):
    """Use Mapbox to geocode an address to lat/lng coordinates."""
    if not address or not MAPBOX_ACCESS_TOKEN:
        return None, None
    
    try:
        # URL-encode the address
        encoded_address = requests.utils.quote(address)
        url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{encoded_address}.json"
        params = {
            "access_token": MAPBOX_ACCESS_TOKEN,
            "country": "US",
            "types": "address",
            "limit": 1,
            # Bias results toward Upper West Side Manhattan to avoid incorrect matches
            # (e.g., Amsterdam Ave in Staten Island vs Manhattan)
            "proximity": "-73.975,40.785",
            # Restrict to NYC bounding box: SW corner to NE corner
            "bbox": "-74.26,40.49,-73.70,40.92"
        }
        
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        if data.get("features") and len(data["features"]) > 0:
            coords = data["features"][0]["geometry"]["coordinates"]
            # Mapbox returns [longitude, latitude]
            return coords[1], coords[0]
    except Exception as e:
        print(f"  Geocoding error: {e}")
    
    return None, None


def extract_restaurant_details(page, restaurant_name):
    """Extract restaurant address and other details from the page."""
    details = {
        "address": "",
        "latitude": None,
        "longitude": None,
    }
    
    try:
        # Method 1: Look for the store info section that typically shows address
        # UberEats usually has a "More info" button or similar that shows the address
        
        # Try clicking "More info" or similar button to reveal address
        more_info_selectors = [
            'button:has-text("More info")',
            'button:has-text("Store info")',
            '[data-testid="store-info-button"]',
            '[aria-label*="More info"]',
        ]
        
        for selector in more_info_selectors:
            try:
                btn = page.query_selector(selector)
                if btn:
                    btn.click()
                    time.sleep(1)
                    break
            except:
                pass
        
        # Method 2: Look for address in various selectors
        address_selectors = [
            '[data-testid="store-address"]',
            '[data-testid="address"]',
            '[data-baseweb="typo-paragraphsmall"]',  # Common UberEats text component
            'div[class*="address"]',
            'span[class*="address"]',
            'p[class*="address"]',
        ]
        
        for selector in address_selectors:
            elements = page.query_selector_all(selector)
            for el in elements:
                text = el.inner_text().strip()
                # Look for text that looks like an address (has a number and street name)
                if text and re.match(r'^\d+\s+\w+', text):
                    # Check if it looks like NYC address
                    if any(x in text.lower() for x in ['new york', 'ny', 'nyc', 'manhattan', 'brooklyn', 'ave', 'avenue', 'street', 'st', 'broadway']):
                        details["address"] = text
                        break
                    # Even without NYC marker, if it has typical street patterns
                    elif re.match(r'^\d+\s+\w+\s+(ave|avenue|street|st|road|rd|blvd|boulevard|way|place|pl|broadway)', text, re.IGNORECASE):
                        details["address"] = text
                        break
            if details["address"]:
                break
        
        # Method 3: Try to extract from page title or URL
        if not details["address"]:
            # Sometimes the address is in the store slug in the URL
            url = page.url
            # e.g., /store/shake-shack-2137-broadway/...
            match = re.search(r'/store/[^/]+-(\d+-[a-z-]+(?:ave|avenue|street|st|broadway|road|rd)[^/]*)', url, re.IGNORECASE)
            if match:
                addr_from_url = match.group(1).replace('-', ' ').title()
                details["address"] = addr_from_url
        
        # Method 4: Search all text on page for address patterns
        if not details["address"]:
            body_text = page.inner_text('body')
            # Look for NYC address pattern: number + street name + optional New York
            address_pattern = r'(\d+\s+(?:West|East|W\.?|E\.?)?\s*\d*\s*(?:st|nd|rd|th)?\s*(?:Street|St\.?|Avenue|Ave\.?|Broadway|Road|Rd\.?|Boulevard|Blvd\.?|Place|Pl\.?)(?:\s*,?\s*(?:New York|NY|NYC))?(?:\s*,?\s*\d{5})?)'
            matches = re.findall(address_pattern, body_text, re.IGNORECASE)
            if matches:
                # Take the first match that looks reasonable
                for match in matches:
                    if len(match) > 10:  # Filter out short matches
                        details["address"] = match.strip()
                        break
        
        # Method 5: Look for address in any element with "address" in aria-label
        if not details["address"]:
            aria_elements = page.query_selector_all('[aria-label*="address" i], [aria-label*="location" i]')
            for el in aria_elements:
                text = el.inner_text().strip() or el.get_attribute("aria-label") or ""
                if re.match(r'^\d+\s+\w+', text):
                    details["address"] = text
                    break
        
        # Clean up the address
        if details["address"]:
            # Remove any "Deliver to" prefix
            details["address"] = re.sub(r'^Deliver\s+to\s*:?\s*', '', details["address"], flags=re.IGNORECASE)
            # Normalize spacing
            details["address"] = ' '.join(details["address"].split())
            # Add NYC if not present
            if not any(x in details["address"].lower() for x in ['new york', 'ny,', ', ny']):
                details["address"] = details["address"] + ", New York, NY"
            
            print(f"  📍 Found address: {details['address']}")
            
            # Geocode the address
            lat, lng = geocode_address(details["address"])
            if lat and lng:
                details["latitude"] = lat
                details["longitude"] = lng
                print(f"  🗺️  Geocoded: {lat:.6f}, {lng:.6f}")
        else:
            print(f"  ⚠️  Could not find address on page")

    except Exception as e:
        print(f"  Warning: Could not extract address details: {e}")
    
    return details


def extract_menu_items(page):
    """Extract all menu items from a restaurant page."""
    items = []
    
    try:
        # Try multiple selectors - UberEats uses different layouts
        selectors_to_try = [
            'li[data-testid^="store-item-"]',
            '[data-testid="store-item"]',
            'a[href*="/store/"][href*="?mod="]',  # Item links with mod parameter
        ]
        
        selector_found = None
        for selector in selectors_to_try:
            try:
                page.wait_for_selector(selector, timeout=8000)
                selector_found = selector
                print(f"  Found items using selector: {selector}")
                break
            except PlaywrightTimeout:
                continue
        
        if not selector_found:
            # Last resort: wait for any content and try to parse from page
            print("  No standard selectors found, trying text extraction...")
            time.sleep(3)
        
        time.sleep(2)
        
        # Scroll to load all items (UberEats lazy loads menu items)
        last_height = 0
        for _ in range(10):  # Scroll up to 10 times
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(1)
            new_height = page.evaluate("document.body.scrollHeight")
            if new_height == last_height:
                break
            last_height = new_height
        
        # Scroll back to top
        page.evaluate("window.scrollTo(0, 0)")
        time.sleep(0.5)

        # Find menu sections - UberEats uses this structure
        sections = page.query_selector_all('[data-testid="store-catalog-section-vertical-grid"]')
        
        if sections:
            print(f"  Found {len(sections)} menu sections")
            for section in sections:
                # Get section/category name from the h3 inside catalog-section-title
                current_category = "Other"
                header = section.query_selector('[data-testid="catalog-section-title"] h3')
                if header:
                    current_category = header.inner_text().strip()
                    print(f"    Section: {current_category}")
                
                # Find items in this section - they're li elements with data-testid starting with "store-item-"
                item_cards = section.query_selector_all('li[data-testid^="store-item-"]')
                
                for card in item_cards:
                    item = extract_menu_item(card, current_category)
                    if item:
                        items.append(item)
        
        # Fallback 1: try flat item search with data-testid
        if not items:
            print("  No sections found, trying flat item search...")
            item_cards = page.query_selector_all('li[data-testid^="store-item-"]')
            print(f"  Found {len(item_cards)} item cards")
            for card in item_cards:
                item = extract_menu_item(card, "Menu")
                if item:
                    items.append(item)
        
        # Fallback 2: extract from page text using regex
        if not items:
            print("  Trying text-based extraction...")
            items = extract_items_from_text(page)

    except PlaywrightTimeout:
        print("  Warning: Timeout waiting for menu items")
        # Try text extraction as last resort
        items = extract_items_from_text(page)
    except Exception as e:
        print(f"  Warning: Error extracting menu items: {e}")
    
    return items


def extract_items_from_text(page):
    """Extract menu items from page text using regex patterns."""
    items = []
    try:
        # Get all text content
        body_text = page.inner_text("body")
        
        # Pattern for item name followed by price: "Item Name $XX.XX"
        # This captures the UberEats format where items show as "Item Name $12.99 • 90% (123)"
        pattern = r'([A-Z][^$\n]{2,50})\s*\$(\d+\.?\d*)'
        
        seen_items = set()
        for match in re.finditer(pattern, body_text):
            name = match.group(1).strip()
            price_str = match.group(2)
            
            # Clean up name - remove common suffixes
            name = re.sub(r'\s*(Plus small|#\d+ most liked)\s*', '', name).strip()
            
            # Skip if looks like navigation/UI text
            skip_words = ['delivery', 'pickup', 'sign', 'login', 'address', 'order', 'minimum', 'fee', 'tip']
            if any(w in name.lower() for w in skip_words):
                continue
            
            # Skip if too short or already seen
            if len(name) < 3 or name.lower() in seen_items:
                continue
            
            seen_items.add(name.lower())
            
            try:
                price = int(float(price_str) * 100)
                if 50 <= price <= 50000:  # Reasonable price range
                    items.append({
                        "name": name,
                        "price": price,
                        "category": "Menu",
                        "item_id": ""
                    })
            except ValueError:
                continue
        
        if items:
            print(f"  Text extraction found {len(items)} items")
    except Exception as e:
        print(f"  Text extraction error: {e}")
    
    return items


def extract_menu_item(card, category):
    """Extract a single menu item from a card element."""
    try:
        # Get item ID from data-testid attribute (e.g., "store-item-1f9928d2-20ab-599e-a009-fb52b77e5e38")
        item_testid = card.get_attribute("data-testid") or ""
        item_id = item_testid.replace("store-item-", "") if item_testid.startswith("store-item-") else ""
        
        # Get all rich-text spans within this card
        rich_texts = card.query_selector_all('span[data-testid="rich-text"]')
        
        name = ""
        price_text = ""
        
        for rt in rich_texts:
            text = rt.inner_text().strip()
            if not text:
                continue
            # First non-price rich-text is the item name
            if text.startswith('$'):
                if not price_text:  # Take the first price found
                    price_text = text
            elif not name and not text.startswith('•') and len(text) > 1:
                # Skip rating text like "84% (51)"
                if not re.match(r'^\d+%\s*\(\d+\)', text):
                    name = text
        
        if not name or len(name) < 2:
            return None
        
        # Skip if it looks like a category header
        if name in ["Popular Items", "Picked for you", "Most Popular", "Featured Items"]:
            return None
        
        # Get description - it's in a span with class "_nl"
        desc_el = card.query_selector('span._nl')
        description = desc_el.inner_text().strip() if desc_el else ""
        
        # Clean up description
        if description and len(description) > 500:
            description = description[:500] + "..."
        
        price = parse_price(price_text)
        
        return {
            "id": item_id,
            "name": name,
            "description": description,
            "price": price,
            "price_text": price_text,
            "category": category,
        }
        
    except Exception as e:
        print(f"    Error extracting item: {e}")
        return None


def scrape_restaurant_menu(page, restaurant):
    """Scrape menu for a single restaurant."""
    url = restaurant.get("ubereats_url")
    name = restaurant.get("name", "Unknown")
    
    print(f"\nScraping: {name}")
    print(f"  URL: {url}")
    
    result = {
        "restaurant_name": name,
        "ubereats_url": url,
        "address": restaurant.get("address", ""),
        "latitude": restaurant.get("latitude"),
        "longitude": restaurant.get("longitude"),
        "items": [],
        "scraped_at": datetime.now().isoformat(),
        "success": False,
    }
    
    try:
        page.goto(url, timeout=30000)
        time.sleep(3)
        
        # Get additional restaurant details (address, coordinates)
        details = extract_restaurant_details(page, name)
        result["address"] = details.get("address") or restaurant.get("address", "")
        result["latitude"] = details.get("latitude") or restaurant.get("latitude")
        result["longitude"] = details.get("longitude") or restaurant.get("longitude")
        
        # Get menu items
        items = extract_menu_items(page)
        result["items"] = items
        result["success"] = True
        
        print(f"  ✓ Found {len(items)} menu items")
        
        # Show sample prices
        priced_items = [i for i in items if i.get("price")]
        if priced_items[:3]:
            print("  Sample prices:")
            for item in priced_items[:3]:
                print(f"    - {item['name']}: ${item['price']/100:.2f}")
        
    except PlaywrightTimeout:
        print(f"  ✗ Timeout loading page")
    except Exception as e:
        print(f"  ✗ Error: {e}")
    
    return result


def update_restaurants_with_results(original_restaurants, results):
    """Merge scraped address/coordinate data back into restaurants list."""
    # Create a lookup by URL
    result_lookup = {r["ubereats_url"]: r for r in results if r.get("success")}
    
    updated = []
    for restaurant in original_restaurants:
        url = restaurant.get("ubereats_url")
        if url in result_lookup:
            result = result_lookup[url]
            # Update with scraped data
            restaurant["address"] = result.get("address") or restaurant.get("address", "")
            restaurant["latitude"] = result.get("latitude") or restaurant.get("latitude")
            restaurant["longitude"] = result.get("longitude") or restaurant.get("longitude")
        updated.append(restaurant)
    
    return updated


def main(limit=None):
    restaurants = load_restaurants()
    if not restaurants:
        return
    
    print(f"Loaded {len(restaurants)} restaurants")
    
    if limit:
        print(f"Limiting to first {limit} restaurants for testing")
    
    # Check for Mapbox token
    if not MAPBOX_ACCESS_TOKEN:
        print("⚠️  Warning: MAPBOX_ACCESS_TOKEN not set. Addresses won't be geocoded.")
        print("   Add it to your .env file to enable coordinate lookup.")
    
    # Load progress
    progress = load_progress()
    completed_urls = set(progress.get("completed", []))
    results = progress.get("results", [])
    
    # Filter to restaurants not yet scraped
    to_scrape = [r for r in restaurants if r.get("ubereats_url") not in completed_urls]
    
    # Apply limit if specified
    if limit and len(to_scrape) > limit:
        to_scrape = to_scrape[:limit]
    
    print(f"Remaining to scrape: {len(to_scrape)}")
    
    if not to_scrape:
        print("All restaurants already scraped!")
        # Still update the restaurants file with existing results
        updated_restaurants = update_restaurants_with_results(restaurants, results)
        with open(RESTAURANTS_OUTPUT_FILE, "w") as f:
            json.dump(updated_restaurants, f, indent=2)
        print(f"Updated restaurants saved to {RESTAURANTS_OUTPUT_FILE}")
        return

    with sync_playwright() as p:
        # Use Firefox since Chromium has issues on Apple Silicon
        browser = p.firefox.launch(
            headless=False,  # Set to True for production, False to watch/debug
        )
        
        context = browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        
        page = context.new_page()

        for i, restaurant in enumerate(to_scrape):
            print(f"\n[{i+1}/{len(to_scrape)}]", end="")
            
            result = scrape_restaurant_menu(page, restaurant)
            results.append(result)
            completed_urls.add(restaurant.get("ubereats_url"))
            
            # Save progress after each restaurant
            progress = {
                "completed": list(completed_urls),
                "results": results,
            }
            save_progress(progress)
            
            # Rate limiting
            if i < len(to_scrape) - 1:
                print("  Waiting 3 seconds...")
                time.sleep(3)

        browser.close()

    # Save final menu items results
    with open(OUTPUT_FILE, "w") as f:
        json.dump(results, f, indent=2)
    
    # Update and save restaurants with addresses
    updated_restaurants = update_restaurants_with_results(restaurants, results)
    with open(RESTAURANTS_OUTPUT_FILE, "w") as f:
        json.dump(updated_restaurants, f, indent=2)
    
    print(f"\n{'='*60}")
    print(f"Scraping complete!")
    print(f"Menu items saved to {OUTPUT_FILE}")
    print(f"Updated restaurants saved to {RESTAURANTS_OUTPUT_FILE}")
    
    # Summary
    successful = [r for r in results if r.get("success")]
    total_items = sum(len(r.get("items", [])) for r in successful)
    with_address = len([r for r in results if r.get("address")])
    with_coords = len([r for r in results if r.get("latitude") and r.get("longitude")])
    
    print(f"Successfully scraped: {len(successful)}/{len(results)} restaurants")
    print(f"With addresses: {with_address}")
    print(f"With coordinates: {with_coords}")
    print(f"Total menu items: {total_items}")


if __name__ == "__main__":
    import sys
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    main(limit=limit)
