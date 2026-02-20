#!/usr/bin/env python3
"""
Scrape restaurant list from UberEats for 10024 zip code (UWS core area).
"""

import json
import os
import time
import re
from datetime import datetime
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

# Focus on 10024 - core UWS area (79th-96th streets)
SEARCH_ADDRESS = "350 W 85th St, New York, NY 10024"
ZIP_CODE = "10024"

OUTPUT_DIR = "output"


def setup_output_dir():
    """Create output directory if it doesn't exist."""
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)


def extract_restaurant_data(page, restaurant_element):
    """Extract data from a restaurant card element."""
    try:
        link_element = restaurant_element.query_selector('a[href*="/store/"]')
        if not link_element:
            return None

        href = link_element.get_attribute("href")
        name = link_element.get_attribute("aria-label") or ""
        
        name = name.split(",")[0].strip() if name else ""
        
        if not name:
            name_el = restaurant_element.query_selector('h3, [data-testid="store-card-title"]')
            if name_el:
                name = name_el.inner_text().strip()
        
        if not name or not href:
            return None

        rating = None
        rating_el = restaurant_element.query_selector('[aria-label*="rating"], [data-testid="store-rating"]')
        if rating_el:
            rating_text = rating_el.inner_text() or rating_el.get_attribute("aria-label") or ""
            rating_match = re.search(r'(\d+\.?\d*)', rating_text)
            if rating_match:
                rating = float(rating_match.group(1))

        cuisines = []
        tag_elements = restaurant_element.query_selector_all('[data-testid="store-tag"], span[color="contentSecondary"]')
        for tag in tag_elements:
            text = tag.inner_text().strip()
            if text and not any(c in text for c in ['$', 'min', 'mi', '•']):
                cuisines.append(text)

        full_url = f"https://www.ubereats.com{href}" if href.startswith("/") else href

        return {
            "name": name,
            "ubereats_url": full_url,
            "ubereats_rating": rating,
            "cuisines": cuisines[:3],
            "scraped_at": datetime.now().isoformat(),
        }
    except Exception as e:
        print(f"Error extracting restaurant data: {e}")
        return None


def scrape_restaurants(page, address, zip_code):
    """Scrape restaurants for a specific address with extended scrolling."""
    restaurants = []
    
    print(f"\n{'='*60}")
    print(f"Scraping restaurants for: {address}")
    print(f"{'='*60}")

    try:
        page.goto("https://www.ubereats.com/", timeout=30000)
        time.sleep(2)

        address_input = page.query_selector(
            'input[placeholder*="address"], input[aria-label*="address"], input[data-testid="location-input"]'
        )
        
        if address_input:
            address_input.click()
            time.sleep(1)
            address_input.fill(address)
            time.sleep(2)
            address_input.press("Enter")
            time.sleep(3)

        page.wait_for_selector('a[href*="/store/"]', timeout=15000)
        time.sleep(2)

        # Extended scrolling to load more restaurants
        print("Scrolling to load more restaurants...")
        last_count = 0
        scroll_attempts = 0
        max_scrolls = 20  # More scrolling to get more restaurants
        
        while scroll_attempts < max_scrolls:
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(2)
            
            current_cards = page.query_selector_all('a[href*="/store/"]')
            current_count = len(current_cards)
            
            if current_count == last_count:
                scroll_attempts += 1
                if scroll_attempts >= 3:
                    print(f"  No new restaurants after {scroll_attempts} scrolls, stopping")
                    break
            else:
                scroll_attempts = 0
                print(f"  Found {current_count} restaurant links...")
            
            last_count = current_count

        # Find all restaurant cards
        restaurant_cards = page.query_selector_all(
            '[data-testid="store-card"], [data-testid="feed-item"], article'
        )
        
        print(f"Found {len(restaurant_cards)} potential restaurant cards")

        seen_names = set()
        for card in restaurant_cards:
            data = extract_restaurant_data(page, card)
            if data and data['name'].lower() not in seen_names:
                seen_names.add(data['name'].lower())
                data["zip_code"] = zip_code
                data["address"] = ""
                restaurants.append(data)
                print(f"  ✓ {data['name']}")

    except PlaywrightTimeout:
        print(f"Timeout while scraping {address}")
    except Exception as e:
        print(f"Error scraping {address}: {e}")

    return restaurants


def load_existing_restaurants():
    """Load existing restaurant URLs from current restaurants.json."""
    existing_urls = set()
    try:
        with open(os.path.join(OUTPUT_DIR, "restaurants.json")) as f:
            existing = json.load(f)
            for r in existing:
                url = r.get("ubereats_url", "").split("?")[0]
                existing_urls.add(url)
        print(f"Loaded {len(existing_urls)} existing restaurant URLs")
    except FileNotFoundError:
        print("No existing restaurants.json found")
    return existing_urls


def main():
    setup_output_dir()
    
    # Load existing to find new ones
    existing_urls = load_existing_restaurants()

    with sync_playwright() as p:
        browser = p.firefox.launch(headless=True)
        
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        
        page = context.new_page()
        restaurants = scrape_restaurants(page, SEARCH_ADDRESS, ZIP_CODE)
        browser.close()

    # Identify new restaurants
    new_restaurants = []
    for r in restaurants:
        url = r.get("ubereats_url", "").split("?")[0]
        if url not in existing_urls:
            new_restaurants.append(r)

    # Sort by name
    restaurants.sort(key=lambda x: x.get("name", "").lower())
    new_restaurants.sort(key=lambda x: x.get("name", "").lower())
    
    print(f"\n{'='*60}")
    print(f"Total restaurants found: {len(restaurants)}")
    print(f"NEW restaurants (not in existing list): {len(new_restaurants)}")
    print(f"{'='*60}")

    # Save all found restaurants
    output_file = os.path.join(OUTPUT_DIR, "restaurants_10024.json")
    with open(output_file, "w") as f:
        json.dump(restaurants, f, indent=2)
    print(f"\nAll restaurants saved to {output_file}")

    # Save just new restaurants
    if new_restaurants:
        new_file = os.path.join(OUTPUT_DIR, "restaurants_10024_new.json")
        with open(new_file, "w") as f:
            json.dump(new_restaurants, f, indent=2)
        print(f"New restaurants saved to {new_file}")
        
        print(f"\nNew restaurants found:")
        for r in new_restaurants:
            print(f"  - {r['name']}")


if __name__ == "__main__":
    main()
