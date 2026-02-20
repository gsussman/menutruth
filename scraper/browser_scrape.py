#!/usr/bin/env python3
"""
Browser-based menu scraper that uses Playwright to handle JavaScript-heavy sites.
Outputs JSON with extracted menu items.

Usage:
    python browser_scrape.py <url> [--anthropic-key KEY] [--ubereats-items JSON]
    
The --ubereats-items flag accepts a JSON array of items to match against,
enabling deterministic price matching without LLM.
"""

import sys
import json
import time
import re
import os
from typing import Optional, List, Dict, Any
from playwright.sync_api import sync_playwright


def normalize_item_name(name: str) -> str:
    """Normalize item name for fuzzy matching."""
    # Lowercase, remove special chars, collapse whitespace
    normalized = name.lower()
    normalized = re.sub(r'[^\w\s]', '', normalized)  # Remove punctuation
    normalized = re.sub(r'\s+', ' ', normalized).strip()  # Collapse whitespace
    return normalized


def find_price_near_text(text: str, search_term: str, window: int = 100) -> Optional[float]:
    """
    Find a price ($X.XX) near a search term in the text.
    Returns price in dollars or None if not found.
    """
    normalized_text = text.lower()
    normalized_search = normalize_item_name(search_term)
    
    # Find the search term in the text
    pos = normalized_text.find(normalized_search)
    if pos == -1:
        # Try finding individual words if full match fails
        words = normalized_search.split()
        if len(words) >= 2:
            # Try matching first two significant words
            for i in range(len(normalized_text) - 20):
                chunk = normalized_text[i:i+len(normalized_search)+20]
                if all(word in chunk for word in words[:2]):
                    pos = i
                    break
    
    if pos == -1:
        return None
    
    # Look for price pattern in a window around the match
    start = max(0, pos - 20)
    end = min(len(text), pos + len(search_term) + window)
    context = text[start:end]
    
    # Price patterns: $12.99, $12, $ 12.99, $12.00
    price_patterns = [
        r'\$\s*(\d{1,3}(?:\.\d{2})?)',  # $12.99 or $12
        r'(\d{1,3}\.\d{2})\s*$',  # 12.99 at end
    ]
    
    for pattern in price_patterns:
        matches = re.findall(pattern, context)
        if matches:
            try:
                return float(matches[0])
            except ValueError:
                continue
    
    return None


def extract_deterministic(text: str, ubereats_items: list) -> list:
    """
    Deterministically extract prices by matching known UberEats item names.
    
    Args:
        text: The page text content
        ubereats_items: List of dicts with 'name' and optionally 'price' from UberEats
        
    Returns:
        List of matched items with actual prices found
    """
    matches = []
    
    for ue_item in ubereats_items:
        item_name = ue_item.get("name", "")
        if not item_name:
            continue
            
        actual_price = find_price_near_text(text, item_name)
        
        if actual_price is not None:
            matches.append({
                "name": item_name,
                "price": actual_price,
                "category": ue_item.get("category", "Menu"),
                "ubereats_price": ue_item.get("price"),  # Keep for comparison
                "match_method": "deterministic"
            })
    
    return matches


def extract_with_llm(text: str, api_key: str, ubereats_items: list = None) -> list:
    """Use Claude to extract menu items from text."""
    try:
        import anthropic
        
        client = anthropic.Anthropic(api_key=api_key)
        
        # If we have UberEats items, ask Claude to find matches specifically
        if ubereats_items:
            item_names = [item.get("name") for item in ubereats_items if item.get("name")]
            prompt = f"""Find the actual menu prices for these items from the restaurant's website text.

Items to find (from UberEats):
{json.dumps(item_names, indent=2)}

Return ONLY a JSON array with the items you found and their prices:
[{{"name": "Item Name", "price": 9.99}}]

Rules:
- Only include items you found with a clear price
- Price as number in dollars (e.g., 9.99 not 999)
- Match item names exactly or very closely
- Empty array [] if no items found

Website text:
{text[:12000]}"""
        else:
            prompt = f"""Extract menu items from this restaurant website text. Return ONLY a JSON array, no other text.

Format: [{{"name": "Item Name", "price": 9.99, "category": "Category"}}]

Rules:
- Only food/drink items with prices
- Price as number in dollars
- Skip navigation, addresses, hours
- Empty array [] if no items found

Text:
{text[:15000]}"""
        
        message = client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=4096,
            messages=[
                {"role": "user", "content": prompt},
                {"role": "assistant", "content": "["}
            ],
        )
        
        response_text = message.content[0].text if message.content else ""
        json_str = "[" + response_text.strip()
        
        json_match = re.search(r'\[[\s\S]*\]', json_str)
        if json_match:
            json_str = json_match.group(0)
        
        json_str = re.sub(r'```json\s*', '', json_str)
        json_str = re.sub(r'```\s*', '', json_str)
        json_str = json_str.strip()
        
        items = json.loads(json_str)
        
        valid_items = []
        for item in items:
            if (item.get("name") and 
                isinstance(item.get("price"), (int, float)) and 
                0 < item["price"] < 1000):
                valid_items.append({
                    "name": item["name"].strip(),
                    "price": round(float(item["price"]), 2),
                    "category": item.get("category", "Menu"),
                    "match_method": "llm"
                })
        
        return valid_items
        
    except Exception as e:
        print(f"LLM extraction failed: {e}", file=sys.stderr)
        return []


def extract_with_regex(text: str) -> list:
    """Fallback regex-based extraction for generic menus."""
    items = []
    
    # Pattern 1: "Item Name $12.99" on same line
    pattern1 = re.findall(r'([A-Z][A-Za-z\s&\'-]+?)\s+\$(\d{1,3}(?:\.\d{2})?)', text)
    for name, price in pattern1:
        name = name.strip()
        if len(name) > 3 and len(name) < 60:
            items.append({
                "name": name,
                "price": float(price),
                "category": "Menu",
                "match_method": "regex"
            })
    
    # Pattern 2: Lines with item code + name + price (like Angaar)
    # e.g., "YTM  Vegetable Samosa $8.00"
    pattern2 = re.findall(r'[A-Z]{2,4}\s+([A-Z][A-Za-z\s&\'-]+?)\s+\$(\d{1,3}(?:\.\d{2})?)', text)
    for name, price in pattern2:
        name = name.strip()
        if len(name) > 3 and len(name) < 60:
            # Avoid duplicates
            if not any(item["name"].lower() == name.lower() for item in items):
                items.append({
                    "name": name,
                    "price": float(price),
                    "category": "Menu",
                    "match_method": "regex"
                })
    
    # Deduplicate by name
    seen = set()
    unique_items = []
    for item in items:
        key = normalize_item_name(item["name"])
        if key not in seen:
            seen.add(key)
            unique_items.append(item)
    
    return unique_items


def detect_ordering_system(html: str, text: str) -> bool:
    """Check if the site has an ordering system."""
    indicators = [
        "add to cart", "add to order", "checkout", "shopping cart",
        "your order", "order now", "place order", "proceed to checkout",
        "thanx.com", "toast", "square", "chownow", "lunchbox",
        "toasttab.com", "getbento.com", "slice", "order online"
    ]
    
    lower_html = html.lower()
    lower_text = text.lower()
    
    return any(ind in lower_html or ind in lower_text for ind in indicators)


def scrape_url(url: str, anthropic_key: str = None, ubereats_items: list = None) -> dict:
    """
    Scrape a URL using a real browser and extract menu items.
    
    Args:
        url: The menu page URL to scrape
        anthropic_key: Optional API key for LLM fallback
        ubereats_items: Optional list of UberEats items to match against
                       (enables deterministic matching)
    """
    
    result = {
        "success": False,
        "items": [],
        "hasOrderingSystem": False,
        "error": None,
        "method": "browser"
    }
    
    try:
        with sync_playwright() as p:
            browser = p.firefox.launch(headless=True)
            page = browser.new_page()
            
            page.goto(url, timeout=30000)
            time.sleep(6)  # Wait for JS to render
            
            # Scroll to load lazy content
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(2)
            
            html = page.content()
            text = page.inner_text('body')
            
            browser.close()
        
        # Detect ordering system
        result["hasOrderingSystem"] = detect_ordering_system(html, text)
        
        items = []
        
        # STEP 1: Try deterministic matching first (if we have UberEats items)
        if ubereats_items:
            items = extract_deterministic(text, ubereats_items)
            if items:
                result["method"] = "browser+deterministic"
                print(f"Deterministic: matched {len(items)}/{len(ubereats_items)} items", file=sys.stderr)
        
        # STEP 2: Try regex extraction (always, to find additional items)
        if not items:
            items = extract_with_regex(text)
            if items:
                result["method"] = "browser+regex"
                print(f"Regex: found {len(items)} items", file=sys.stderr)
        
        # STEP 3: Fall back to LLM only if deterministic and regex found nothing
        if not items and anthropic_key:
            items = extract_with_llm(text, anthropic_key, ubereats_items)
            if items:
                result["method"] = "browser+llm"
                print(f"LLM: found {len(items)} items", file=sys.stderr)
        
        result["items"] = items
        result["success"] = True
        result["text_length"] = len(text)
        
    except Exception as e:
        result["error"] = str(e)
        print(f"Scrape error: {e}", file=sys.stderr)
    
    return result


def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            "error": "Usage: python browser_scrape.py <url> [--anthropic-key KEY] [--ubereats-items JSON]"
        }))
        sys.exit(1)
    
    url = sys.argv[1]
    anthropic_key = None
    ubereats_items = None
    
    # Parse arguments
    i = 2
    while i < len(sys.argv):
        if sys.argv[i] == "--anthropic-key" and i + 1 < len(sys.argv):
            anthropic_key = sys.argv[i + 1]
            i += 2
        elif sys.argv[i] == "--ubereats-items" and i + 1 < len(sys.argv):
            try:
                ubereats_items = json.loads(sys.argv[i + 1])
            except json.JSONDecodeError as e:
                print(json.dumps({"error": f"Invalid JSON for --ubereats-items: {e}"}))
                sys.exit(1)
            i += 2
        else:
            i += 1
    
    # Fall back to environment variable for API key
    if not anthropic_key:
        anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
    
    result = scrape_url(url, anthropic_key, ubereats_items)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
