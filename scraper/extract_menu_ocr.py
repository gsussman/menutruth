#!/usr/bin/env python3
"""
Extract menu items and prices from menu images using vision AI.

Supports:
- Image files (jpg, png, webp)
- PDF files (first page)
- URLs to menu images

Uses Claude or GPT-4o for extraction (set via environment variable).
"""

import base64
import json
import os
import sys
import httpx
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

OUTPUT_DIR = "output/actual_menus"


def setup_output_dir():
    """Create output directory if it doesn't exist."""
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)


def encode_image(image_path):
    """Encode image file to base64."""
    with open(image_path, "rb") as f:
        return base64.standard_b64encode(f.read()).decode("utf-8")


def get_image_media_type(image_path):
    """Get media type for image."""
    ext = Path(image_path).suffix.lower()
    media_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }
    return media_types.get(ext, "image/jpeg")


def extract_with_claude(image_path):
    """Extract menu items using Claude's vision API."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY not set")
    
    image_data = encode_image(image_path)
    media_type = get_image_media_type(image_path)
    
    prompt = """Analyze this restaurant menu image and extract all menu items with their prices.

Return the data as a JSON array with this structure:
{
  "items": [
    {
      "name": "Item Name",
      "description": "Brief description if shown",
      "price": 1595,
      "category": "Category/Section Name"
    }
  ]
}

Important:
- Price should be in cents (e.g., $15.95 = 1595)
- Include all visible items with prices
- Use the section headers as category names
- If a price range is shown, use the lower price
- Skip items without prices
- Return ONLY the JSON, no other text"""

    response = httpx.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 4096,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": image_data,
                            },
                        },
                        {
                            "type": "text",
                            "text": prompt,
                        },
                    ],
                }
            ],
        },
        timeout=60.0,
    )
    
    response.raise_for_status()
    result = response.json()
    
    # Extract text content
    text = result["content"][0]["text"]
    
    # Parse JSON from response
    # Handle potential markdown code blocks
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0]
    elif "```" in text:
        text = text.split("```")[1].split("```")[0]
    
    return json.loads(text.strip())


def extract_with_openai(image_path):
    """Extract menu items using OpenAI's GPT-4o vision API."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not set")
    
    image_data = encode_image(image_path)
    media_type = get_image_media_type(image_path)
    
    prompt = """Analyze this restaurant menu image and extract all menu items with their prices.

Return the data as a JSON array with this structure:
{
  "items": [
    {
      "name": "Item Name",
      "description": "Brief description if shown",
      "price": 1595,
      "category": "Category/Section Name"
    }
  ]
}

Important:
- Price should be in cents (e.g., $15.95 = 1595)
- Include all visible items with prices
- Use the section headers as category names
- If a price range is shown, use the lower price
- Skip items without prices
- Return ONLY the JSON, no other text"""

    response = httpx.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": "gpt-4o",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{media_type};base64,{image_data}",
                            },
                        },
                        {
                            "type": "text",
                            "text": prompt,
                        },
                    ],
                }
            ],
            "max_tokens": 4096,
        },
        timeout=60.0,
    )
    
    response.raise_for_status()
    result = response.json()
    
    text = result["choices"][0]["message"]["content"]
    
    # Parse JSON from response
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0]
    elif "```" in text:
        text = text.split("```")[1].split("```")[0]
    
    return json.loads(text.strip())


def extract_menu(image_path, provider="claude"):
    """Extract menu from image using specified provider."""
    print(f"Extracting menu from: {image_path}")
    print(f"Using provider: {provider}")
    
    if provider == "claude":
        return extract_with_claude(image_path)
    elif provider == "openai":
        return extract_with_openai(image_path)
    else:
        raise ValueError(f"Unknown provider: {provider}")


def main():
    setup_output_dir()
    
    if len(sys.argv) < 2:
        print("Usage: python extract_menu_ocr.py <image_path> [restaurant_name] [--provider=claude|openai]")
        print("\nExample:")
        print("  python extract_menu_ocr.py menu.jpg 'Thai Market'")
        print("  python extract_menu_ocr.py menu.png 'Joes Pizza' --provider=openai")
        return
    
    image_path = sys.argv[1]
    restaurant_name = sys.argv[2] if len(sys.argv) > 2 and not sys.argv[2].startswith("--") else "unknown"
    
    # Parse provider flag
    provider = "claude"
    for arg in sys.argv:
        if arg.startswith("--provider="):
            provider = arg.split("=")[1]
    
    if not os.path.exists(image_path):
        print(f"Error: File not found: {image_path}")
        return
    
    try:
        result = extract_menu(image_path, provider)
        
        items = result.get("items", [])
        print(f"\n✓ Extracted {len(items)} items")
        
        # Show sample
        print("\nSample items:")
        for item in items[:5]:
            price = item.get("price", 0)
            print(f"  - {item['name']}: ${price/100:.2f}")
        
        if len(items) > 5:
            print(f"  ... and {len(items) - 5} more")
        
        # Save to file
        safe_name = "".join(c for c in restaurant_name if c.isalnum() or c in " -_").strip()
        safe_name = safe_name.replace(" ", "_").lower()
        output_file = os.path.join(OUTPUT_DIR, f"{safe_name}_actual_menu.json")
        
        output_data = {
            "restaurant_name": restaurant_name,
            "source_image": image_path,
            "provider": provider,
            "items": items,
        }
        
        with open(output_file, "w") as f:
            json.dump(output_data, f, indent=2)
        
        print(f"\nSaved to: {output_file}")
        
    except Exception as e:
        print(f"Error extracting menu: {e}")
        raise


if __name__ == "__main__":
    main()
