#!/usr/bin/env python3
"""
Match UberEats menu items to actual menu items using fuzzy matching.
Calculates markup percentages and updates restaurant markup categories.
"""

import json
import os
import re
from dotenv import load_dotenv
from fuzzywuzzy import fuzz
from supabase import create_client, Client

load_dotenv()

# Minimum similarity score to consider a match (0-100)
MIN_MATCH_SCORE = 70


def get_supabase_client() -> Client:
    """Create Supabase client."""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    
    if not url or not key:
        raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
    
    return create_client(url, key)


def normalize_item_name(name):
    """Normalize item name for better matching."""
    # Convert to lowercase
    name = name.lower()
    
    # Remove common words that don't affect matching
    stopwords = ["the", "a", "an", "with", "and", "&", "w/", "w."]
    for word in stopwords:
        name = name.replace(f" {word} ", " ")
    
    # Remove special characters
    name = re.sub(r'[^\w\s]', '', name)
    
    # Remove extra whitespace
    name = ' '.join(name.split())
    
    return name


def calculate_similarity(name1, name2):
    """Calculate similarity score between two item names."""
    # Normalize both names
    n1 = normalize_item_name(name1)
    n2 = normalize_item_name(name2)
    
    # Use multiple fuzzy matching strategies and take the best
    scores = [
        fuzz.ratio(n1, n2),
        fuzz.partial_ratio(n1, n2),
        fuzz.token_sort_ratio(n1, n2),
        fuzz.token_set_ratio(n1, n2),
    ]
    
    return max(scores)


def find_best_match(ubereats_item, actual_items):
    """Find the best matching actual menu item for a UberEats item."""
    best_match = None
    best_score = 0
    
    for actual_item in actual_items:
        score = calculate_similarity(
            ubereats_item["item_name"],
            actual_item["item_name"]
        )
        
        if score > best_score and score >= MIN_MATCH_SCORE:
            best_score = score
            best_match = actual_item
    
    return best_match, best_score


def calculate_markup(ubereats_price, actual_price):
    """Calculate markup percentage."""
    if not actual_price or actual_price == 0:
        return 0
    
    return ((ubereats_price - actual_price) / actual_price) * 100


def determine_markup_category(avg_markup):
    """Determine markup category from average markup percentage."""
    if avg_markup <= 0:
        return "none"
    elif avg_markup <= 10:
        return "low"
    elif avg_markup <= 20:
        return "medium"
    else:
        return "high"


def match_restaurant_items(supabase: Client, restaurant_id, restaurant_name):
    """Match items for a single restaurant."""
    print(f"\nMatching items for: {restaurant_name}")
    
    # Get UberEats items
    ubereats_result = supabase.table("menu_items").select("*").eq(
        "restaurant_id", restaurant_id
    ).eq("source", "ubereats").execute()
    
    ubereats_items = ubereats_result.data or []
    
    # Get actual menu items
    actual_result = supabase.table("menu_items").select("*").eq(
        "restaurant_id", restaurant_id
    ).eq("source", "actual_menu").execute()
    
    actual_items = actual_result.data or []
    
    print(f"  UberEats items: {len(ubereats_items)}")
    print(f"  Actual menu items: {len(actual_items)}")
    
    if not ubereats_items or not actual_items:
        print("  ⚠ Skipping - missing items from one source")
        return None
    
    # Match items
    matches = []
    markups = []
    
    for ue_item in ubereats_items:
        best_match, score = find_best_match(ue_item, actual_items)
        
        if best_match:
            markup_pct = calculate_markup(ue_item["price"], best_match["price"])
            
            match_record = {
                "restaurant_id": restaurant_id,
                "ubereats_item_id": ue_item["id"],
                "actual_menu_item_id": best_match["id"],
                "is_manual_match": False,
                "match_confidence": score,
                "price_difference": ue_item["price"] - best_match["price"],
                "markup_percentage": round(markup_pct, 2),
            }
            
            matches.append(match_record)
            markups.append(markup_pct)
            
            print(f"    ✓ '{ue_item['item_name']}' -> '{best_match['item_name']}' "
                  f"(score: {score}, markup: {markup_pct:.1f}%)")
    
    print(f"  Matched: {len(matches)}/{len(ubereats_items)} items")
    
    # Insert matches into database
    if matches:
        # Delete existing auto-matches for this restaurant
        supabase.table("item_matches").delete().eq(
            "restaurant_id", restaurant_id
        ).eq("is_manual_match", False).execute()
        
        # Insert new matches
        for match in matches:
            try:
                supabase.table("item_matches").insert(match).execute()
            except Exception as e:
                print(f"    Warning: Could not insert match: {e}")
    
    # Calculate and update restaurant markup
    if markups:
        avg_markup = sum(markups) / len(markups)
        markup_category = determine_markup_category(avg_markup)
        
        print(f"  Average markup: {avg_markup:.1f}%")
        print(f"  Category: {markup_category}")
        
        # Update restaurant
        supabase.table("restaurants").update({
            "markup_category": markup_category,
            "markup_percentage": round(avg_markup, 2),
        }).eq("id", restaurant_id).execute()
        
        return {
            "matches": len(matches),
            "avg_markup": avg_markup,
            "category": markup_category,
        }
    
    return None


def main():
    supabase = get_supabase_client()
    print("Connected to Supabase")
    
    # Get all restaurants
    result = supabase.table("restaurants").select("id, name").execute()
    restaurants = result.data or []
    
    print(f"Found {len(restaurants)} restaurants")
    
    # Match items for each restaurant
    results = []
    for restaurant in restaurants:
        match_result = match_restaurant_items(
            supabase,
            restaurant["id"],
            restaurant["name"]
        )
        if match_result:
            results.append({
                "name": restaurant["name"],
                **match_result,
            })
    
    # Summary
    print(f"\n{'='*60}")
    print("Matching complete!")
    print(f"{'='*60}")
    
    if results:
        print("\nResults by markup category:")
        for category in ["none", "low", "medium", "high"]:
            count = len([r for r in results if r["category"] == category])
            print(f"  {category}: {count}")
        
        print("\nTop 5 highest markups:")
        sorted_results = sorted(results, key=lambda x: x["avg_markup"], reverse=True)
        for r in sorted_results[:5]:
            print(f"  {r['name']}: {r['avg_markup']:.1f}%")


if __name__ == "__main__":
    main()
