#!/usr/bin/env python3
"""
Robust nightly scraper for Uber Eats menus.

Usage:
  python rescrape_batch.py --limit 15      # Scrape 15 oldest restaurants
  python rescrape_batch.py --limit 10 --timeout 60  # 60 min timeout

Features:
- Automatically selects N oldest restaurants with both UE and actual prices
- Per-restaurant retries with browser restart
- Overall timeout with graceful shutdown
- Saves scrape history to scrape_runs table
- Only updates menu_items if prices changed
- Writes nightly summary JSON
"""

import argparse
import hashlib
import json
import os
import random
import signal
import sys
import time
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv
from fuzzywuzzy import fuzz
from playwright.sync_api import sync_playwright

from scrape_menus import scrape_restaurant_menu

load_dotenv()

MIN_MATCH_SCORE = 70
MAX_RETRIES = 2
DEFAULT_TIMEOUT_MINUTES = 90

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

# Global flag for graceful shutdown
shutdown_requested = False


def signal_handler(signum, frame):
    global shutdown_requested
    print("\n⚠️  Shutdown requested, finishing current restaurant...")
    shutdown_requested = True


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


def normalize_item_name(name: str) -> str:
    import re
    name = name.lower()
    for word in ["the", "a", "an", "with", "and", "&", "w/", "w."]:
        name = name.replace(f" {word} ", " ")
    name = re.sub(r"[^\w\s]", "", name)
    return " ".join(name.split())


def similarity(a: str, b: str) -> int:
    n1, n2 = normalize_item_name(a), normalize_item_name(b)
    return max(
        fuzz.ratio(n1, n2),
        fuzz.partial_ratio(n1, n2),
        fuzz.token_sort_ratio(n1, n2),
        fuzz.token_set_ratio(n1, n2),
    )


def markup_category(pct) -> str:
    if pct is None or pct <= 0:
        return "none"
    if pct <= 10:
        return "low"
    if pct <= 20:
        return "medium"
    return "high"


def api(method: str, path: str, **kwargs):
    resp = requests.request(
        method,
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers={**HEADERS, **kwargs.pop("extra_headers", {})},
        timeout=60,
        **kwargs,
    )
    return resp


def items_hash(items: list) -> str:
    """Create a hash of items for change detection."""
    normalized = sorted(
        [(normalize_item_name(i.get("name", "")), i.get("price", 0)) for i in items]
    )
    return hashlib.md5(json.dumps(normalized).encode()).hexdigest()


def fetch_targets(limit: int) -> list:
    """Fetch the N oldest restaurants that have both UE and actual prices."""
    print(f"Finding {limit} oldest restaurants with both UE and actual prices...")
    
    # Get restaurants with markup (have real prices matched) ordered by last_verified_at
    resp = api(
        "GET",
        "restaurants",
        params={
            "select": "id,name,ubereats_url,last_verified_at,markup_percentage",
            "markup_percentage": "not.is.null",
            "ubereats_url": "not.is.null",
            "order": "last_verified_at.asc.nullsfirst",
            "limit": limit * 3,  # Fetch extra in case some don't have both sources
        },
    )
    resp.raise_for_status()
    candidates = resp.json()
    
    selected = []
    for rest in candidates:
        if len(selected) >= limit:
            break
        rid = rest["id"]
        
        # Check for both UE and actual items
        counts = {}
        for source in ("ubereats", "actual_menu"):
            c = api(
                "GET",
                "menu_items",
                params={
                    "select": "id",
                    "restaurant_id": f"eq.{rid}",
                    "source": f"eq.{source}",
                    "limit": 1,
                },
                extra_headers={"Prefer": "count=exact"},
            )
            cr = c.headers.get("content-range", "")
            total = int(cr.split("/")[-1]) if "/" in cr and cr.split("/")[-1].isdigit() else 0
            counts[source] = total
        
        if counts["ubereats"] > 0 and counts["actual_menu"] > 0:
            rest["ue_count"] = counts["ubereats"]
            rest["actual_count"] = counts["actual_menu"]
            selected.append(rest)
            print(f"  ✓ {rest['name'][:40]} (UE={counts['ubereats']}, Actual={counts['actual_menu']})")
    
    print(f"Selected {len(selected)} restaurants for rescrape")
    return selected


def fetch_current_ue_items(restaurant_id: str) -> list:
    """Fetch current UE items for change comparison."""
    resp = api(
        "GET",
        "menu_items",
        params={
            "select": "item_name,price,category",
            "restaurant_id": f"eq.{restaurant_id}",
            "source": "eq.ubereats",
        },
    )
    if resp.status_code == 200:
        return [{"name": i["item_name"], "price": i["price"], "category": i.get("category")} for i in resp.json()]
    return []


def save_scrape_run(restaurant_id: str, source: str, items: list, changed: bool, notes: str = None) -> bool:
    """Save scrape snapshot to history table (if it exists)."""
    snapshot = [{"name": i.get("name", ""), "price": i.get("price", 0), "category": i.get("category", "Menu")} for i in items]
    row = {
        "restaurant_id": restaurant_id,
        "source": source,
        "item_count": len(items),
        "items_snapshot": snapshot,
        "changed_from_previous": changed,
        "notes": notes,
    }
    resp = api("POST", "scrape_runs", json=row)
    if resp.status_code in (200, 201):
        return True
    elif resp.status_code == 404:
        # Table doesn't exist yet, skip silently
        return False
    else:
        print(f"  Warning: Failed to save scrape history: {resp.status_code}")
        return False


def delete_ubereats_items(restaurant_id: str) -> None:
    resp = api(
        "DELETE",
        "menu_items",
        params={
            "restaurant_id": f"eq.{restaurant_id}",
            "source": "eq.ubereats",
        },
        extra_headers={"Prefer": "return=minimal"},
    )
    if resp.status_code not in (200, 204):
        raise RuntimeError(f"Delete UE items failed: {resp.status_code} {resp.text[:200]}")


def insert_ubereats_items(restaurant_id: str, items: list) -> list:
    rows = []
    now = datetime.now(timezone.utc).isoformat()
    for item in items:
        price = item.get("price")
        if price is None:
            continue
        rows.append({
            "restaurant_id": restaurant_id,
            "source": "ubereats",
            "item_name": item["name"],
            "item_description": item.get("description") or None,
            "price": int(price),
            "category": item.get("category") or "Menu",
            "scraped_at": now,
        })

    inserted = []
    for i in range(0, len(rows), 50):
        batch = rows[i : i + 50]
        resp = api("POST", "menu_items", json=batch)
        if resp.status_code not in (200, 201):
            raise RuntimeError(f"Insert UE items failed: {resp.status_code} {resp.text[:300]}")
        inserted.extend(resp.json())
    return inserted


def fetch_actual_items(restaurant_id: str) -> list:
    resp = api(
        "GET",
        "menu_items",
        params={
            "select": "id,item_name,price",
            "restaurant_id": f"eq.{restaurant_id}",
            "source": "eq.actual_menu",
        },
    )
    resp.raise_for_status()
    return resp.json()


def rematch(restaurant_id: str, ue_items: list, actual_items: list) -> int:
    if not ue_items or not actual_items:
        return 0

    matches = []
    used_actual = set()
    for ue in ue_items:
        best = None
        best_score = 0
        for actual in actual_items:
            if actual["id"] in used_actual:
                continue
            score = similarity(ue["item_name"], actual["item_name"])
            if score > best_score and score >= MIN_MATCH_SCORE:
                best_score = score
                best = actual
        if not best:
            continue
        used_actual.add(best["id"])
        ue_price = int(ue["price"])
        actual_price = int(best["price"])
        diff = ue_price - actual_price
        pct = round((diff / actual_price) * 100, 2) if actual_price else 0
        matches.append({
            "restaurant_id": restaurant_id,
            "ubereats_item_id": ue["id"],
            "actual_menu_item_id": best["id"],
            "is_manual_match": False,
            "match_confidence": best_score,
            "price_difference": diff,
            "markup_percentage": pct,
        })

    # Clear existing matches
    api(
        "DELETE",
        "item_matches",
        params={"restaurant_id": f"eq.{restaurant_id}"},
        extra_headers={"Prefer": "return=minimal"},
    )

    for i in range(0, len(matches), 50):
        batch = matches[i : i + 50]
        resp = api("POST", "item_matches", json=batch)
        if resp.status_code not in (200, 201):
            raise RuntimeError(f"Insert matches failed: {resp.status_code} {resp.text[:300]}")

    return len(matches)


def update_restaurant_markup(restaurant_id: str, match_count: int) -> None:
    now = datetime.now(timezone.utc).isoformat()
    if match_count == 0:
        patch = {"last_verified_at": now, "updated_at": now}
    else:
        resp = api(
            "GET",
            "item_matches",
            params={
                "select": "markup_percentage",
                "restaurant_id": f"eq.{restaurant_id}",
            },
        )
        resp.raise_for_status()
        pcts = [float(m["markup_percentage"]) for m in resp.json()]
        avg = round(sum(pcts) / len(pcts), 2) if pcts else None
        patch = {
            "markup_percentage": avg,
            "markup_category": markup_category(avg),
            "last_verified_at": now,
            "updated_at": now,
        }

    resp = api(
        "PATCH",
        "restaurants",
        params={"id": f"eq.{restaurant_id}"},
        json=patch,
        extra_headers={"Prefer": "return=minimal"},
    )
    if resp.status_code not in (200, 204):
        raise RuntimeError(f"Patch restaurant failed: {resp.status_code} {resp.text[:200]}")


def scrape_with_retries(page, browser, p, target: dict, max_retries: int = MAX_RETRIES) -> tuple:
    """Scrape a restaurant with retries. Returns (scrape_result, browser, page)."""
    last_error = None
    
    for attempt in range(max_retries + 1):
        try:
            # Check if page is still usable, restart browser if needed
            try:
                if page and not page.is_closed():
                    pass  # Page is good
                else:
                    raise Exception("Page closed")
            except Exception:
                # Need to restart browser
                if browser:
                    try:
                        browser.close()
                    except Exception:
                        pass
                browser = p.firefox.launch(headless=False)
                context = browser.new_context(
                    viewport={"width": 1280, "height": 900},
                    user_agent=(
                        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                    ),
                )
                page = context.new_page()
                page.set_default_timeout(45000)
                page.set_default_navigation_timeout(45000)
            
            scrape = scrape_restaurant_menu(
                page,
                {"name": target["name"], "ubereats_url": target["ubereats_url"]},
            )
            
            if scrape.get("success") and scrape.get("items"):
                return scrape, browser, page
            
            last_error = scrape.get("error", "Empty or failed scrape")
            if attempt < max_retries:
                retry_delay = random.randint(5, 10)
                print(f"  Retry {attempt + 1}/{max_retries}: {last_error} (waiting {retry_delay}s)")
                time.sleep(retry_delay)
                
        except Exception as e:
            last_error = str(e)
            if attempt < max_retries:
                retry_delay = random.randint(5, 10)
                print(f"  Retry {attempt + 1}/{max_retries}: {e} (waiting {retry_delay}s)")
                time.sleep(retry_delay)
    
    return {"success": False, "items": [], "error": last_error}, browser, page


def process_restaurant(page, browser, p, target: dict) -> tuple:
    """Process a single restaurant: scrape, compare, update if changed, rematch.
    Returns (entry_dict, browser, page) - browser/page may be refreshed on crash."""
    entry = {
        "id": target["id"],
        "name": target["name"],
        "success": False,
        "item_count": 0,
        "match_count": 0,
        "changed": False,
        "error": None,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
    }
    
    try:
        # Scrape with retries (reuses browser/page)
        scrape, browser, page = scrape_with_retries(page, browser, p, target)
        
        if not scrape.get("success") or not scrape.get("items"):
            entry["error"] = scrape.get("error", "scrape_failed_or_empty")
            return entry
        
        new_items = scrape["items"]
        entry["item_count"] = len(new_items)
        
        # Compare with existing items
        current_items = fetch_current_ue_items(target["id"])
        old_hash = items_hash(current_items)
        new_hash = items_hash(new_items)
        changed = old_hash != new_hash
        entry["changed"] = changed
        
        # Save scrape history
        save_scrape_run(target["id"], "ubereats", new_items, changed)
        
        if not changed:
            print(f"  ✓ No price changes detected, skipping DB update")
            entry["success"] = True
            entry["match_count"] = target.get("actual_count", 0)
            return entry, browser, page
        
        # Update database
        delete_ubereats_items(target["id"])
        ue_rows = insert_ubereats_items(target["id"], new_items)
        actual = fetch_actual_items(target["id"])
        match_count = rematch(target["id"], ue_rows, actual)
        update_restaurant_markup(target["id"], match_count)
        
        entry["success"] = True
        entry["match_count"] = match_count
        entry["item_count"] = len(ue_rows)
        print(f"  DB: {len(ue_rows)} UE items, {match_count} rematches (actual={len(actual)})")
        
    except Exception as e:
        entry["error"] = str(e)
        print(f"  ERROR: {e}")
    
    return entry, browser, page


def write_summary(results: list, start_time: datetime, timed_out: bool = False) -> str:
    """Write nightly summary JSON and return the filename."""
    end_time = datetime.now(timezone.utc)
    duration = (end_time - start_time).total_seconds()
    
    succeeded = [r for r in results if r.get("success") and not r.get("error")]
    failed = [r for r in results if not r.get("success") or r.get("error")]
    changed = [r for r in succeeded if r.get("changed")]
    
    summary = {
        "run_at": start_time.isoformat(),
        "completed_at": end_time.isoformat(),
        "duration_seconds": round(duration, 1),
        "timed_out": timed_out,
        "total": len(results),
        "succeeded": len(succeeded),
        "failed": len(failed),
        "changed": len(changed),
        "restaurants": results,
    }
    
    timestamp = start_time.strftime("%Y%m%d_%H%M%S")
    filename = f"output/nightly_{timestamp}.json"
    os.makedirs("output", exist_ok=True)
    
    with open(filename, "w") as f:
        json.dump(summary, f, indent=2)
    
    return filename


def main():
    parser = argparse.ArgumentParser(description="Robust nightly UberEats scraper")
    parser.add_argument("--limit", type=int, default=15, help="Number of restaurants to scrape (default: 15)")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_MINUTES, help="Overall timeout in minutes (default: 90)")
    args = parser.parse_args()
    
    start_time = datetime.now(timezone.utc)
    deadline = time.time() + args.timeout * 60
    results = []
    timed_out = False
    
    print(f"\n{'='*60}")
    print(f"Nightly Scraper - {start_time.strftime('%Y-%m-%d %H:%M:%S')} UTC")
    print(f"Limit: {args.limit} restaurants, Timeout: {args.timeout} minutes")
    print(f"{'='*60}\n")
    
    # Fetch targets
    targets = fetch_targets(args.limit)
    if not targets:
        print("No restaurants found to scrape!")
        sys.exit(0)
    
    print(f"\nStarting scrape of {len(targets)} restaurants...\n")
    
    with sync_playwright() as p:
        # Launch ONE browser and reuse it for all restaurants
        browser = p.firefox.launch(headless=False)
        context = browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
        )
        page = context.new_page()
        page.set_default_timeout(45000)
        page.set_default_navigation_timeout(45000)
        
        for i, target in enumerate(targets):
            # Check for timeout or shutdown
            if time.time() > deadline:
                print(f"\n⚠️  Timeout reached after {args.timeout} minutes")
                timed_out = True
                break
            if shutdown_requested:
                print(f"\n⚠️  Shutdown requested")
                break
            
            print(f"\n[{i + 1}/{len(targets)}] {target['name']}")
            
            result, browser, page = process_restaurant(page, browser, p, target)
            results.append(result)
            
            # Rate limiting between restaurants
            if i < len(targets) - 1 and not shutdown_requested:
                delay = random.randint(5, 10)
                print(f"  Waiting {delay} seconds...")
                time.sleep(delay)
        
        # Close browser at the end
        try:
            browser.close()
        except Exception:
            pass
    
    # Write summary
    summary_file = write_summary(results, start_time, timed_out)
    
    # Print final status
    succeeded = [r for r in results if r.get("success") and not r.get("error")]
    failed = [r for r in results if not r.get("success") or r.get("error")]
    changed = [r for r in succeeded if r.get("changed")]
    
    print(f"\n{'='*60}")
    status = "TIMEOUT" if timed_out else ("INTERRUPTED" if shutdown_requested else "COMPLETE")
    print(f"{status}: {len(succeeded)}/{len(results)} succeeded, {len(failed)} failed, {len(changed)} with changes")
    print(f"Summary: {summary_file}")
    print(f"{'='*60}\n")
    
    for r in results:
        status = "OK" if r.get("success") and not r.get("error") else "FAIL"
        change = "CHANGED" if r.get("changed") else "unchanged"
        print(f"  [{status}] {r['name']}: items={r['item_count']} matches={r['match_count']} ({change}) {r.get('error') or ''}")
    
    # Exit code: 0 if all succeeded, 1 if any failed
    sys.exit(0 if not failed else 1)


if __name__ == "__main__":
    main()
