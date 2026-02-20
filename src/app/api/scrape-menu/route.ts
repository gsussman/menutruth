import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Check for API key
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured. Add it to .env.local" },
        { status: 500 }
      );
    }

    // Fetch the page content
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: "Could not fetch URL - site may be blocking automated requests",
          needsManualScrape: true,
        },
        { status: 200 }
      );
    }

    const html = await response.text();

    // Extract text content (strip HTML tags)
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "\n")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#?\w+;/g, " ")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join("\n");

    // Truncate if too long (Claude has context limits)
    const truncatedText = textContent.slice(0, 15000);

    // Use Claude to extract menu items
    const items = await extractMenuItemsWithLLM(truncatedText);

    // Detect if this is an ordering system
    const hasOrderingSystem = detectOrderingSystem(html, textContent);

    return NextResponse.json({
      success: true,
      items,
      hasOrderingSystem,
      rawTextLength: textContent.length,
      method: "llm",
    });
  } catch (error) {
    console.error("Scrape error:", error);
    return NextResponse.json(
      { error: "Failed to scrape URL", details: String(error) },
      { status: 500 }
    );
  }
}

async function extractMenuItemsWithLLM(
  text: string
): Promise<Array<{ name: string; price: number; category: string }>> {
  try {
    const message = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `Extract menu items from this restaurant website text. Return ONLY a JSON array, no other text.

Format: [{"name": "Item Name", "price": 9.99, "category": "Category"}]

Rules:
- Only food/drink items with prices
- Price as number in dollars
- Skip navigation, addresses, hours
- Empty array [] if no items found

Text:
${text}`,
        },
        {
          role: "assistant",
          content: "[", // Force Claude to start with JSON array
        },
      ],
    });

    // Extract the text content from the response
    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Since we prefilled with "[", prepend it back
    let jsonStr = "[" + responseText.trim();

    // Try to find a valid JSON array in the response
    const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    // Remove markdown code blocks if present
    jsonStr = jsonStr.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    const items = JSON.parse(jsonStr);

    // Validate and clean the items
    return items
      .filter(
        (item: { name?: string; price?: number }) =>
          item.name &&
          typeof item.price === "number" &&
          item.price > 0 &&
          item.price < 1000
      )
      .map((item: { name: string; price: number; category?: string }) => ({
        name: item.name.trim(),
        price: Math.round(item.price * 100) / 100,
        category: item.category || "Menu",
      }));
  } catch (error) {
    console.error("LLM extraction error:", error);
    return [];
  }
}

function detectOrderingSystem(html: string, text: string): boolean {
  const orderingIndicators = [
    "add to cart",
    "add to order",
    "checkout",
    "shopping cart",
    "your order",
    "order now",
    "place order",
    "proceed to checkout",
    'type="checkout"',
    "cart-icon",
    "shopping-cart",
    "thanx.com",
    "toast.com",
    "square.com",
    "chownow",
    "doordash.com/merchant",
    "order.online",
    "toasttab.com",
    "getbento.com",
    "slice.com",
  ];

  const lowerHtml = html.toLowerCase();
  const lowerText = text.toLowerCase();

  return orderingIndicators.some(
    (indicator) =>
      lowerHtml.includes(indicator) || lowerText.includes(indicator)
  );
}
