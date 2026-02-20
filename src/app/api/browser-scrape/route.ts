import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { createClient } from "@supabase/supabase-js";

// This API route calls the Python browser scraper for JavaScript-heavy sites
// Now supports deterministic matching against existing UberEats items

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { url, restaurantId } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // If restaurantId provided, fetch UberEats items for deterministic matching
    let ubereatsItems: Array<{ name: string; price: number; category: string }> = [];
    
    if (restaurantId) {
      const { data: menuItems } = await supabase
        .from("menu_items")
        .select("item_name, price, category")
        .eq("restaurant_id", restaurantId)
        .eq("source", "ubereats");
      
      if (menuItems && menuItems.length > 0) {
        ubereatsItems = menuItems.map((item) => ({
          name: item.item_name,
          price: item.price / 100, // Convert cents to dollars
          category: item.category || "Menu",
        }));
        console.log(`Loaded ${ubereatsItems.length} UberEats items for matching`);
      }
    }

    // Path to the Python scraper script
    const scraperPath = path.join(
      process.cwd(),
      "scraper",
      "browser_scrape.py"
    );

    // Path to Python in the virtual environment
    const pythonPath = path.join(
      process.cwd(),
      "scraper",
      "venv",
      "bin",
      "python"
    );

    // Get Anthropic API key from environment
    const anthropicKey = process.env.ANTHROPIC_API_KEY || "";

    // Run the Python script
    const result = await new Promise<string>((resolve, reject) => {
      const args = [scraperPath, url];
      
      // Pass UberEats items for deterministic matching
      if (ubereatsItems.length > 0) {
        args.push("--ubereats-items", JSON.stringify(ubereatsItems));
      }
      
      // Pass API key for LLM fallback
      if (anthropicKey) {
        args.push("--anthropic-key", anthropicKey);
      }

      const proc = spawn(pythonPath, args, {
        cwd: process.cwd(),
        env: { ...process.env },
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
        console.log("Scraper:", data.toString().trim());
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Python script failed: ${stderr || stdout}`));
        }
      });

      proc.on("error", (err) => {
        reject(err);
      });

      // Timeout after 60 seconds
      setTimeout(() => {
        proc.kill();
        reject(new Error("Scraper timeout - page took too long to load"));
      }, 60000);
    });

    // Parse the JSON result from Python
    const data = JSON.parse(result);

    return NextResponse.json(data);
  } catch (error) {
    console.error("Browser scrape error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        items: [],
      },
      { status: 500 }
    );
  }
}
