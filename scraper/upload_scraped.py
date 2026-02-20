#!/usr/bin/env python3
"""
Upload scraped restaurant data to Supabase using REST API.
"""

import json
import os
import random
from datetime import datetime
from dotenv import load_dotenv
import httpx

load_dotenv()

INPUT_FILE = "output/restaurants.json"

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env file")

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}


def guess_cuisine_from_name(name: str) -> list:
    """Try to guess cuisine type from restaurant name."""
    name_lower = name.lower()
    
    cuisine_keywords = {
        "pizza": ["pizza", "pizzeria", "slice"],
        "chinese": ["chinese", "wok", "hunan", "szechuan", "dumpling", "noodle", "lo mein", "chow"],
        "thai": ["thai", "pad thai"],
        "japanese": ["sushi", "ramen", "japanese", "teriyaki", "udon"],
        "mexican": ["mexican", "taco", "burrito", "taqueria", "quesadilla", "enchilada", "birria"],
        "indian": ["indian", "curry", "tandoori", "masala", "biryani"],
        "italian": ["italian", "pasta", "trattoria", "risotto"],
        "vietnamese": ["vietnamese", "pho", "banh mi"],
        "korean": ["korean", "bbq", "bibimbap", "kimchi"],
        "mediterranean": ["mediterranean", "falafel", "shawarma", "kebab", "greek", "hummus", "gyro"],
        "american": ["burger", "grill", "diner", "bbq", "wings", "steakhouse"],
        "deli": ["deli", "bagel", "sandwich"],
        "seafood": ["seafood", "fish", "lobster", "crab", "shrimp", "oyster"],
    }
    
    cuisines = []
    for cuisine, keywords in cuisine_keywords.items():
        if any(kw in name_lower for kw in keywords):
            cuisines.append(cuisine)
    
    return cuisines if cuisines else ["other"]


# Default coordinates for UWS zip codes
ZIP_COORDS = {
    "10023": (40.7755, -73.9820),
    "10024": (40.7875, -73.9750),
    "10025": (40.7990, -73.9680),
    "10026": (40.8030, -73.9580),
}


def get_coordinates_for_zip(zip_code: str) -> tuple:
    """Get approximate coordinates based on zip code with some randomness."""
    base = ZIP_COORDS.get(zip_code, (40.787, -73.975))
    lat = base[0] + random.uniform(-0.006, 0.006)
    lng = base[1] + random.uniform(-0.006, 0.006)
    return (round(lat, 6), round(lng, 6))


def load_scraped_data():
    """Load the scraped restaurant data."""
    if not os.path.exists(INPUT_FILE):
        print(f"Error: {INPUT_FILE} not found")
        return []
    
    with open(INPUT_FILE, "r") as f:
        return json.load(f)


def delete_all_restaurants():
    """Delete all existing restaurants."""
    url = f"{SUPABASE_URL}/rest/v1/restaurants?id=neq.00000000-0000-0000-0000-000000000000"
    response = httpx.delete(url, headers=HEADERS)
    return response.status_code in [200, 204]


def insert_restaurant(data: dict) -> bool:
    """Insert a single restaurant."""
    url = f"{SUPABASE_URL}/rest/v1/restaurants"
    response = httpx.post(url, headers=HEADERS, json=data)
    return response.status_code in [200, 201]


def main():
    print("Loading scraped restaurant data...")
    restaurants = load_scraped_data()
    
    if not restaurants:
        return
    
    print(f"Found {len(restaurants)} restaurants")
    
    # Clear existing data
    print("\nClearing existing restaurants...")
    if delete_all_restaurants():
        print("✅ Cleared existing data")
    else:
        print("⚠️ Warning: Could not clear existing data")
    
    # Upload each restaurant
    uploaded = 0
    skipped = 0
    
    print("\nUploading restaurants...")
    
    for r in restaurants:
        name = r.get("name", "").strip()
        
        # Skip if no name
        if not name or len(name) < 2:
            skipped += 1
            continue
        
        # Skip convenience stores and non-restaurants
        skip_keywords = ["7-eleven", "cvs", "walgreens", "duane reade", "rite aid", "wine store", "liquor"]
        if any(kw in name.lower() for kw in skip_keywords):
            skipped += 1
            continue
        
        zip_code = r.get("zip_code", "10024")
        lat, lng = get_coordinates_for_zip(zip_code)
        cuisines = guess_cuisine_from_name(name)
        
        restaurant_data = {
            "name": name,
            "address": f"Upper West Side, NY {zip_code}",
            "neighborhood": "Upper West Side",
            "zip_code": zip_code,
            "cuisines": cuisines,
            "latitude": lat,
            "longitude": lng,
            "has_direct_delivery": False,
            "has_pickup": True,
            "ubereats_url": r.get("ubereats_url"),
            "markup_category": "medium",
            "markup_percentage": 15,
            "notes": "Scraped from UberEats - needs verification",
            "last_verified_at": datetime.now().isoformat(),
        }
        
        if insert_restaurant(restaurant_data):
            uploaded += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name}")
            skipped += 1
    
    print(f"\n{'='*60}")
    print(f"Upload complete!")
    print(f"Uploaded: {uploaded}")
    print(f"Skipped: {skipped}")
    print(f"{'='*60}")
    print(f"\nRefresh your app at http://localhost:3000 to see the restaurants!")


if __name__ == "__main__":
    main()
