import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST() {
  try {
    // Get all restaurants
    const { data: restaurants, error: restError } = await supabase
      .from("restaurants")
      .select("id, name");

    if (restError) {
      return NextResponse.json({ error: restError.message }, { status: 500 });
    }

    const results = [];

    for (const restaurant of restaurants || []) {
      // Get matches for this restaurant
      const { data: matches } = await supabase
        .from("item_matches")
        .select("markup_percentage")
        .eq("restaurant_id", restaurant.id);

      let category = "none";
      let avgMarkup: number | null = null;

      if (matches && matches.length > 0) {
        avgMarkup = matches.reduce((sum, m) => sum + m.markup_percentage, 0) / matches.length;

        if (avgMarkup > 20) category = "high";
        else if (avgMarkup > 10) category = "medium";
        else if (avgMarkup > 0) category = "low";
      }

      // Update restaurant
      await supabase
        .from("restaurants")
        .update({ markup_category: category, markup_percentage: avgMarkup })
        .eq("id", restaurant.id);

      results.push({
        name: restaurant.name,
        matches: matches?.length || 0,
        markup_percentage: avgMarkup,
        category,
      });
    }

    return NextResponse.json({
      message: `Synced ${results.length} restaurants`,
      results,
    });
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
