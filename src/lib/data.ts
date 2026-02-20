import { supabase } from "./supabase";
import { Restaurant, RestaurantFilters, ItemMatchWithItems, CommunityFlag } from "./types";

/**
 * Fetch restaurants for the public site (only those with verified price matches)
 */
export async function getRestaurants(filters?: RestaurantFilters): Promise<Restaurant[]> {
  let query = supabase
    .from("restaurants")
    .select("*")
    .not("markup_percentage", "is", null) // Only show restaurants with actual matches
    .order("name", { ascending: true });

  // Apply filters
  if (filters?.cuisine) {
    query = query.contains("cuisines", [filters.cuisine]);
  }

  if (filters?.markup_category) {
    query = query.eq("markup_category", filters.markup_category);
  }

  if (filters?.has_direct_delivery !== undefined) {
    query = query.eq("has_direct_delivery", filters.has_direct_delivery);
  }

  if (filters?.search_query) {
    // Search in name and address
    query = query.or(
      `name.ilike.%${filters.search_query}%,address.ilike.%${filters.search_query}%`
    );
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching restaurants:", error);
    return [];
  }

  return data as Restaurant[];
}

/**
 * Fetch ALL restaurants (for admin panel - includes those without matches)
 */
export async function getAllRestaurants(): Promise<Restaurant[]> {
  const { data, error } = await supabase
    .from("restaurants")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching restaurants:", error);
    return [];
  }

  return data as Restaurant[];
}

/**
 * Fetch a single restaurant by ID
 */
export async function getRestaurantById(id: string): Promise<Restaurant | null> {
  const { data, error } = await supabase
    .from("restaurants")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching restaurant:", error);
    return null;
  }

  return data as Restaurant;
}

/**
 * Fetch item matches for a restaurant (for price comparison display)
 */
export async function getItemMatchesForRestaurant(
  restaurantId: string
): Promise<ItemMatchWithItems[]> {
  const { data, error } = await supabase
    .from("item_matches")
    .select(`
      *,
      ubereats_item:menu_items!ubereats_item_id(*),
      actual_menu_item:menu_items!actual_menu_item_id(*)
    `)
    .eq("restaurant_id", restaurantId)
    .order("markup_percentage", { ascending: false })
    .limit(10);

  if (error) {
    console.error("Error fetching item matches:", error);
    return [];
  }

  return data as ItemMatchWithItems[];
}

/**
 * Submit a community flag for outdated info
 */
export async function submitFlag(
  restaurantId: string,
  flagType: CommunityFlag["flag_type"],
  description?: string
): Promise<boolean> {
  const { error } = await supabase.from("community_flags").insert({
    restaurant_id: restaurantId,
    flag_type: flagType,
    description,
  });

  if (error) {
    console.error("Error submitting flag:", error);
    return false;
  }

  return true;
}

/**
 * Get count of restaurants by markup category (for stats - only those with matches)
 */
export async function getMarkupStats(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("restaurants")
    .select("markup_category")
    .not("markup_percentage", "is", null); // Only count restaurants with actual matches

  if (error) {
    console.error("Error fetching stats:", error);
    return {};
  }

  const stats: Record<string, number> = {
    none: 0,
    low: 0,
    medium: 0,
    high: 0,
  };

  data.forEach((r) => {
    const category = r.markup_category as string;
    if (category in stats) {
      stats[category]++;
    }
  });

  return stats;
}
