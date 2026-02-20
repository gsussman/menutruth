#!/usr/bin/env python3
"""
Upload scraped restaurant and menu item data to Supabase.
Uses the actual scraped addresses and coordinates.
"""

import json
import os
import uuid
from datetime import datetime
from dotenv import load_dotenv
import requests

load_dotenv()

RESTAURANTS_FILE = "output/restaurants_with_addresses.json"
MENU_ITEMS_FILE = "output/menu_items.json"

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env file")

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


def guess_cuisine_from_name(name: str) -> list:
    """Try to guess cuisine type from restaurant name."""
    name_lower = name.lower()
    
    cuisine_keywords = {
        "pizza": ["pizza", "pizzeria", "slice"],
        "chinese": ["chinese", "wok", "hunan", "szechuan", "dumpling", "noodle", "lo mein", "chow"],
        "thai": ["thai", "pad thai", "chalong"],
        "japanese": ["sushi", "ramen", "japanese", "teriyaki", "udon"],
        "mexican": ["mexican", "taco", "burrito", "taqueria", "quesadilla", "enchilada", "birria", "adobo", "chipotle"],
        "indian": ["indian", "curry", "tandoori", "masala", "biryani", "bombay", "angaar"],
        "italian": ["italian", "pasta", "trattoria", "risotto", "briciola", "bocca"],
        "vietnamese": ["vietnamese", "pho", "banh mi"],
        "korean": ["korean", "bonchon", "bbq", "bibimbap", "kimchi"],
        "mediterranean": ["mediterranean", "falafel", "shawarma", "kebab", "greek", "hummus", "gyro", "za'atar"],
        "american": ["burger", "grill", "diner", "bbq", "wings", "steakhouse", "applebee", "buffalo wild"],
        "deli": ["deli", "bagel", "sandwich"],
        "seafood": ["seafood", "fish", "lobster", "crab", "shrimp", "oyster", "aqua boil"],
        "chicken": ["chicken", "chick-fil-a", "chirping"],
        "fast_food": ["burger king", "mcdonald", "wendy"],
    }
    
    cuisines = []
    for cuisine, keywords in cuisine_keywords.items():
        if any(kw in name_lower for kw in keywords):
            cuisines.append(cuisine)
    
    return cuisines if cuisines else ["other"]


def load_data():
    """Load scraped data files."""
    restaurants = []
    menu_results = []
    
    if os.path.exists(RESTAURANTS_FILE):
        with open(RESTAURANTS_FILE, "r") as f:
            restaurants = json.load(f)
    
    if os.path.exists(MENU_ITEMS_FILE):
        with open(MENU_ITEMS_FILE, "r") as f:
            menu_results = json.load(f)
    
    return restaurants, menu_results


def clear_table(table_name: str) -> bool:
    """Delete all rows from a table."""
    url = f"{SUPABASE_URL}/rest/v1/{table_name}?id=neq.00000000-0000-0000-0000-000000000000"
    response = requests.delete(url, headers=HEADERS)
    return response.status_code in [200, 204]


def insert_restaurant(data: dict) -> dict:
    """Insert a restaurant and return it with the generated ID."""
    url = f"{SUPABASE_URL}/rest/v1/restaurants"
    response = requests.post(url, headers=HEADERS, json=data)
    if response.status_code in [200, 201]:
        result = response.json()
        return result[0] if result else None
    else:
        print(f"  Error inserting: {response.status_code} - {response.text}")
        return None


def insert_menu_items(items: list) -> int:
    """Insert menu items in batch."""
    if not items:
        return 0
    
    url = f"{SUPABASE_URL}/rest/v1/menu_items"
    
    # Insert in batches of 50
    inserted = 0
    for i in range(0, len(items), 50):
        batch = items[i:i+50]
        response = requests.post(url, headers=HEADERS, json=batch)
        if response.status_code in [200, 201]:
            inserted += len(batch)
        else:
            print(f"  Batch insert error: {response.status_code} - {response.text[:200]}")
    
    return inserted


def get_existing_restaurant_urls() -> set:
    """Fetch URLs of restaurants already in the database."""
    url = f"{SUPABASE_URL}/rest/v1/restaurants?select=ubereats_url"
    response = requests.get(url, headers=HEADERS)
    if response.status_code == 200:
        return {r["ubereats_url"] for r in response.json() if r.get("ubereats_url")}
    return set()


def main():
    print("Loading scraped data...")
    restaurants, menu_results = load_data()
    
    print(f"Found {len(restaurants)} restaurants in scraped files")
    print(f"Found {len(menu_results)} menu scrape results")
    
    # Get existing restaurants to avoid duplicates
    existing_urls = get_existing_restaurant_urls()
    print(f"Already in database: {len(existing_urls)} restaurants")
    
    # Create lookup from URL to menu items
    menu_by_url = {r["ubereats_url"]: r for r in menu_results if r.get("ubereats_url")}
    
    # Filter to restaurants with menu items AND not already in DB
    # Restaurants without addresses will be tagged for manual review
    valid_restaurants = []
    restaurants_needing_address = 0
    
    for r in restaurants:
        url = r.get("ubereats_url")
        
        # Skip if already in database
        if url in existing_urls:
            continue
            
        has_coords = r.get("latitude") and r.get("longitude")
        has_address = bool(r.get("address", "").strip())
        has_menu = url in menu_by_url and len(menu_by_url[url].get("items", [])) > 0
        
        # Skip convenience stores
        skip_keywords = ["7-eleven", "cvs", "walgreens", "duane reade", "rite aid", "wine store", "liquor"]
        is_store = any(kw in r.get("name", "").lower() for kw in skip_keywords)
        
        if has_menu and not is_store:
            # Mark restaurants without address/coords for manual review
            r["_needs_address"] = not (has_coords and has_address)
            if r["_needs_address"]:
                restaurants_needing_address += 1
            valid_restaurants.append(r)
    
    print(f"\nNew restaurants to upload: {len(valid_restaurants)}")
    print(f"  - With address: {len(valid_restaurants) - restaurants_needing_address}")
    print(f"  - Needs address (manual review): {restaurants_needing_address}")
    
    if not valid_restaurants:
        print("No new restaurants to upload!")
        return
    
    # Upload restaurants and their menu items (incrementally - no clearing)
    print("\nUploading new restaurants and menu items...")
    uploaded_restaurants = 0
    uploaded_items = 0
    uploaded_needing_address = 0
    
    for r in valid_restaurants:
        name = r.get("name", "Unknown")
        url = r.get("ubereats_url")
        menu_data = menu_by_url.get(url, {})
        
        # Use scraped address if available, otherwise fall back
        address = menu_data.get("address") or r.get("address", "Upper West Side, NY")
        latitude = menu_data.get("latitude") or r.get("latitude")
        longitude = menu_data.get("longitude") or r.get("longitude")
        
        cuisines = guess_cuisine_from_name(name)
        
        # Determine workflow status based on address availability
        needs_address = r.get("_needs_address", False)
        workflow_status = "needs_address" if needs_address else "ready"
        
        restaurant_data = {
            "name": name,
            "address": address if not needs_address else "NEEDS ADDRESS",
            "neighborhood": "Upper West Side",
            "zip_code": r.get("zip_code", "10024"),
            "cuisines": cuisines,
            "latitude": latitude if not needs_address else 0.0,
            "longitude": longitude if not needs_address else 0.0,
            "has_direct_delivery": False,
            "has_pickup": True,
            "ubereats_url": url,
            "ubereats_rating": r.get("rating"),
            "markup_category": "none",  # No markup until matches are created
            "markup_percentage": None,  # Will be set when actual matches are created
            "workflow_status": workflow_status,
            "notes": f"Scraped {len(menu_data.get('items', []))} items from UberEats" + (" [NEEDS ADDRESS]" if needs_address else ""),
            "last_verified_at": datetime.now().isoformat(),
        }
        
        # Insert restaurant
        inserted = insert_restaurant(restaurant_data)
        
        if inserted:
            restaurant_id = inserted["id"]
            uploaded_restaurants += 1
            if needs_address:
                uploaded_needing_address += 1
            status_indicator = "⚠️ NEEDS ADDRESS" if needs_address else "✅"
            print(f"{status_indicator} {name} ({len(menu_data.get('items', []))} items)")
            
            # Prepare menu items for this restaurant
            items_to_insert = []
            for item in menu_data.get("items", []):
                if not item.get("name"):
                    continue
                
                # Price is required - skip items without price
                price = item.get("price")
                if price is None:
                    continue
                    
                item_data = {
                    "restaurant_id": restaurant_id,
                    "source": "ubereats",
                    "item_name": item.get("name", ""),
                    "item_description": item.get("description", ""),
                    "price": price,  # Already in cents
                    "category": item.get("category", "Other"),
                    "scraped_at": datetime.now().isoformat(),
                }
                items_to_insert.append(item_data)
            
            # Insert menu items
            if items_to_insert:
                count = insert_menu_items(items_to_insert)
                uploaded_items += count
        else:
            print(f"❌ {name}")
    
    print(f"\n{'='*60}")
    print(f"Upload complete!")
    print(f"New restaurants uploaded: {uploaded_restaurants}")
    print(f"  - With address: {uploaded_restaurants - uploaded_needing_address}")
    print(f"  - Needs address (workflow_status='needs_address'): {uploaded_needing_address}")
    print(f"New menu items uploaded: {uploaded_items}")
    print(f"{'='*60}")
    if uploaded_needing_address > 0:
        print(f"\n⚠️  {uploaded_needing_address} restaurants need addresses!")
        print(f"   Filter by workflow_status='needs_address' in the database to find them.")
    print(f"\nNew restaurants are in admin panel - add actual prices to make them visible on the main site!")


if __name__ == "__main__":
    main()
