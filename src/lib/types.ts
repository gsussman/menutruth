// Database types for Menu Truth

export type MarkupCategory = 'none' | 'low' | 'medium' | 'high';

export type CuisineType = 
  | 'american'
  | 'asian'
  | 'chinese'
  | 'indian'
  | 'italian'
  | 'japanese'
  | 'korean'
  | 'mediterranean'
  | 'mexican'
  | 'pizza'
  | 'thai'
  | 'vietnamese'
  | 'deli'
  | 'seafood'
  | 'other';

export interface Restaurant {
  id: string;
  name: string;
  address: string;
  neighborhood: string;
  zip_code: string;
  cuisines: CuisineType[];
  latitude: number;
  longitude: number;
  phone_number: string | null;
  website_url: string | null;
  direct_ordering_url: string | null;
  has_direct_delivery: boolean;
  has_pickup: boolean;
  ubereats_url: string | null;
  ubereats_rating: number | null;
  slug?: string | null;
  markup_category: MarkupCategory;
  markup_percentage: number | null; // e.g., 18 for 18%
  notes: string | null;
  actual_menu_url: string | null;
  actual_prices_verified_at: string | null; // ISO date string
  last_verified_at: string; // ISO date string
  created_at: string;
  updated_at: string;
}

export interface MenuItem {
  id: string;
  restaurant_id: string;
  source: 'ubereats' | 'actual_menu';
  item_name: string;
  item_description: string | null;
  price: number; // in cents to avoid floating point issues
  category: string | null; // e.g., "Appetizers", "Entrees"
  scraped_at: string;
  created_at: string;
  updated_at: string;
}

export interface ItemMatch {
  id: string;
  restaurant_id: string;
  ubereats_item_id: string;
  actual_menu_item_id: string;
  is_manual_match: boolean; // true if manually set, false if fuzzy matched
  match_confidence: number | null; // 0-100 for fuzzy matches
  price_difference: number; // in cents (ubereats_price - actual_price)
  markup_percentage: number; // calculated markup for this item
  created_at: string;
  updated_at: string;
}

export interface CommunityFlag {
  id: string;
  restaurant_id: string;
  flag_type: 'outdated_prices' | 'wrong_info' | 'closed' | 'other';
  description: string | null;
  status: 'pending' | 'reviewed' | 'resolved';
  created_at: string;
  resolved_at: string | null;
}

export interface ScrapeRun {
  id: string;
  restaurant_id: string;
  scraped_at: string;
  source: 'ubereats' | 'actual_menu';
  item_count: number;
  items_snapshot: Array<{ name: string; price: number; category: string }>;
  changed_from_previous: boolean;
  notes: string | null;
}

// Joined types for display
export interface RestaurantWithItems extends Restaurant {
  ubereats_items: MenuItem[];
  actual_menu_items: MenuItem[];
  item_matches: ItemMatchWithItems[];
}

export interface ItemMatchWithItems extends ItemMatch {
  ubereats_item: MenuItem;
  actual_menu_item: MenuItem;
}

// API/form types
export interface CreateRestaurantInput {
  name: string;
  address: string;
  neighborhood?: string;
  zip_code: string;
  cuisines: CuisineType[];
  latitude: number;
  longitude: number;
  phone_number?: string;
  website_url?: string;
  direct_ordering_url?: string;
  has_direct_delivery: boolean;
  has_pickup: boolean;
  ubereats_url?: string;
  ubereats_rating?: number;
  notes?: string;
}

export interface CreateMenuItemInput {
  restaurant_id: string;
  source: 'ubereats' | 'actual_menu';
  item_name: string;
  item_description?: string;
  price: number;
  category?: string;
}

// Filter types for the UI
export interface RestaurantFilters {
  cuisine?: CuisineType;
  markup_category?: MarkupCategory;
  has_direct_delivery?: boolean;
  search_query?: string;
}
