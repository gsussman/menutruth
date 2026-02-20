#!/usr/bin/env python3
"""
Scrape restaurant list from UberEats for Upper West Side NYC.
"""

import json
import os
import time
import re
from datetime import datetime
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

# UWS zip codes
UWS_ZIP_CODES = ["10023", "10024", "10025", "10026"]

# Sample address for each zip code to search from
SEARCH_ADDRESSES = {
    "10023": "200 W 70th St, New York, NY 10023",
    "10024": "350 W 85th St, New York, NY 10024",
    "10025": "960 Amsterdam Ave, New York, NY 10025",
    "10026": "280 W 110th St, New York, NY 10026",
}

OUTPUT_DIR = "output"


def setup_output_dir():
    """Create output directory if it doesn't exist."""
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)


def extract_restaurant_data(page, restaurant_element):
    """Extract data from a restaurant card element."""
    try:
        # Get the link and name
        link_element = restaurant_element.query_selector('a[href*="/store/"]')
        if not link_element:
            return None

        href = link_element.get_attribute("href")
        name = link_element.get_attribute("aria-label") or ""
        
        # Clean up the name (often has extra info like delivery time)
        name = name.split(",")[0].strip() if name else ""
        
        if not name:
            # Try to get name from text content
            name_el = restaurant_element.query_selector('h3, [data-testid="store-card-title"]')
            if name_el:
                name = name_el.inner_text().strip()
        
        if not name or not href:
            return None

        # Try to get rating
        rating = None
        rating_el = restaurant_element.query_selector('[aria-label*="rating"], [data-testid="store-rating"]')
        if rating_el:
            rating_text = rating_el.inner_text() or rating_el.get_attribute("aria-label") or ""
            rating_match = re.search(r'(\d+\.?\d*)', rating_text)
            if rating_match:
                rating = float(rating_match.group(1))

        # Try to get cuisine/category tags
        cuisines = []
        tag_elements = restaurant_element.query_selector_all('[data-testid="store-tag"], span[color="contentSecondary"]')
        for tag in tag_elements:
            text = tag.inner_text().strip()
            if text and not any(c in text for c in ['$', 'min', 'mi', '•']):
                cuisines.append(text)

        # Build full URL
        full_url = f"https://www.ubereats.com{href}" if href.startswith("/") else href

        return {
            "name": name,
            "ubereats_url": full_url,
            "ubereats_rating": rating,
            "cuisines": cuisines[:3],  # Limit to first 3 cuisine tags
            "scraped_at": datetime.now().isoformat(),
        }
    except Exception as e:
        print(f"Error extracting restaurant data: {e}")
        return None


def scrape_restaurants_for_address(page, address, zip_code):
    """Scrape restaurants for a specific address."""
    restaurants = []
    
    print(f"\n{'='*60}")
    print(f"Scraping restaurants for: {address}")
    print(f"{'='*60}")

    try:
        # Go to UberEats
        page.goto("https://www.ubereats.com/", timeout=30000)
        time.sleep(2)

        # Look for address input
        address_input = page.query_selector(
            'input[placeholder*="address"], input[aria-label*="address"], input[data-testid="location-input"]'
        )
        
        if address_input:
            address_input.click()
            time.sleep(1)
            address_input.fill(address)
            time.sleep(2)
            
            # Press enter or click search
            address_input.press("Enter")
            time.sleep(3)

        # Wait for restaurant listings to load
        page.wait_for_selector('a[href*="/store/"]', timeout=15000)
        time.sleep(2)

        # Scroll to load more restaurants
        for _ in range(5):
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(2)

        # Find all restaurant cards
        restaurant_cards = page.query_selector_all(
            '[data-testid="store-card"], [data-testid="feed-item"], article'
        )
        
        print(f"Found {len(restaurant_cards)} potential restaurant cards")

        for card in restaurant_cards:
            data = extract_restaurant_data(page, card)
            if data:
                data["zip_code"] = zip_code
                data["address"] = ""  # Will be filled in when we scrape the menu page
                restaurants.append(data)
                print(f"  ✓ {data['name']}")

    except PlaywrightTimeout:
        print(f"Timeout while scraping {address}")
    except Exception as e:
        print(f"Error scraping {address}: {e}")

    return restaurants


def deduplicate_restaurants(restaurants):
    """Remove duplicate restaurants based on UberEats URL."""
    seen_urls = set()
    unique = []
    
    for r in restaurants:
        url = r.get("ubereats_url", "")
        # Normalize URL (remove query params)
        base_url = url.split("?")[0]
        
        if base_url not in seen_urls:
            seen_urls.add(base_url)
            unique.append(r)
    
    return unique


def main():
    setup_output_dir()
    all_restaurants = []

    with sync_playwright() as p:
        # Launch browser (using Firefox for better Mac compatibility)
        browser = p.firefox.launch(
            headless=False,  # Set to True for headless mode
        )
        
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        
        page = context.new_page()

        # Scrape for each zip code
        for zip_code, address in SEARCH_ADDRESSES.items():
            restaurants = scrape_restaurants_for_address(page, address, zip_code)
            all_restaurants.extend(restaurants)
            
            # Rate limiting
            print(f"\nWaiting 5 seconds before next search...")
            time.sleep(5)

        browser.close()

    # Deduplicate
    unique_restaurants = deduplicate_restaurants(all_restaurants)
    
    print(f"\n{'='*60}")
    print(f"Total unique restaurants found: {len(unique_restaurants)}")
    print(f"{'='*60}")

    # Sort by name
    unique_restaurants.sort(key=lambda x: x.get("name", "").lower())

    # Save to file
    output_file = os.path.join(OUTPUT_DIR, "restaurants.json")
    with open(output_file, "w") as f:
        json.dump(unique_restaurants, f, indent=2)
    
    print(f"\nSaved to {output_file}")

    # Print summary by cuisine
    cuisine_counts = {}
    for r in unique_restaurants:
        for c in r.get("cuisines", []):
            cuisine_counts[c] = cuisine_counts.get(c, 0) + 1
    
    print("\nRestaurants by cuisine:")
    for cuisine, count in sorted(cuisine_counts.items(), key=lambda x: -x[1])[:15]:
        print(f"  {cuisine}: {count}")


if __name__ == "__main__":
    main()
