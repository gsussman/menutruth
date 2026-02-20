/**
 * Seed script to load test restaurants into Supabase
 * Run with: npx tsx scripts/seed-data.ts
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Load environment variables from .env.local
config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables!");
  console.error("Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const testRestaurants = [
  {
    name: "Thai Market",
    address: "960 Amsterdam Ave, New York, NY 10025",
    neighborhood: "Upper West Side",
    zip_code: "10025",
    cuisines: ["thai"],
    latitude: 40.7988,
    longitude: -73.9685,
    phone_number: "(212) 280-4575",
    website_url: "https://thaimarketnyc.com",
    direct_ordering_url: "https://thaimarketnyc.com/order",
    has_direct_delivery: true,
    has_pickup: true,
    ubereats_url: "https://www.ubereats.com/store/thai-market",
    ubereats_rating: 4.7,
    markup_category: "medium",
    markup_percentage: 18,
  },
  {
    name: "Joe's Pizza",
    address: "520 Columbus Ave, New York, NY 10024",
    neighborhood: "Upper West Side",
    zip_code: "10024",
    cuisines: ["pizza", "italian"],
    latitude: 40.7856,
    longitude: -73.9732,
    phone_number: "(212) 799-4555",
    website_url: null,
    direct_ordering_url: null,
    has_direct_delivery: false,
    has_pickup: true,
    ubereats_url: "https://www.ubereats.com/store/joes-pizza",
    ubereats_rating: 4.8,
    markup_category: "high",
    markup_percentage: 25,
  },
  {
    name: "Sushi Yasaka",
    address: "251 W 72nd St, New York, NY 10023",
    neighborhood: "Upper West Side",
    zip_code: "10023",
    cuisines: ["japanese"],
    latitude: 40.7782,
    longitude: -73.9816,
    phone_number: "(212) 496-8460",
    website_url: "https://sushiyasaka.com",
    direct_ordering_url: "https://sushiyasaka.com/order",
    has_direct_delivery: true,
    has_pickup: true,
    ubereats_url: "https://www.ubereats.com/store/sushi-yasaka",
    ubereats_rating: 4.6,
    markup_category: "none",
    markup_percentage: 0,
  },
  {
    name: "Curry in a Hurry",
    address: "2400 Broadway, New York, NY 10024",
    neighborhood: "Upper West Side",
    zip_code: "10024",
    cuisines: ["indian"],
    latitude: 40.7905,
    longitude: -73.9742,
    phone_number: "(212) 555-4567",
    website_url: null,
    direct_ordering_url: null,
    has_direct_delivery: false,
    has_pickup: true,
    ubereats_url: "https://www.ubereats.com/store/curry-in-a-hurry",
    ubereats_rating: 4.4,
    markup_category: "low",
    markup_percentage: 8,
  },
  {
    name: "Taqueria Diana",
    address: "129 W 106th St, New York, NY 10025",
    neighborhood: "Upper West Side",
    zip_code: "10025",
    cuisines: ["mexican"],
    latitude: 40.8007,
    longitude: -73.9632,
    phone_number: "(212) 555-7890",
    website_url: "https://taqueriadiana.com",
    direct_ordering_url: "https://taqueriadiana.com/delivery",
    has_direct_delivery: true,
    has_pickup: true,
    ubereats_url: "https://www.ubereats.com/store/taqueria-diana",
    ubereats_rating: 4.5,
    markup_category: "medium",
    markup_percentage: 15,
  },
  {
    name: "Big Nick's Burger Joint",
    address: "2175 Broadway, New York, NY 10024",
    neighborhood: "Upper West Side",
    zip_code: "10024",
    cuisines: ["american"],
    latitude: 40.7838,
    longitude: -73.9787,
    phone_number: "(212) 362-9238",
    website_url: null,
    direct_ordering_url: null,
    has_direct_delivery: false,
    has_pickup: true,
    ubereats_url: "https://www.ubereats.com/store/big-nicks",
    ubereats_rating: 4.3,
    markup_category: "high",
    markup_percentage: 22,
  },
  {
    name: "Hunan Balcony",
    address: "2596 Broadway, New York, NY 10025",
    neighborhood: "Upper West Side",
    zip_code: "10025",
    cuisines: ["chinese"],
    latitude: 40.7948,
    longitude: -73.9702,
    phone_number: "(212) 865-0400",
    website_url: "https://hunanbalcony.com",
    direct_ordering_url: "https://hunanbalcony.com/order",
    has_direct_delivery: true,
    has_pickup: true,
    ubereats_url: "https://www.ubereats.com/store/hunan-balcony",
    ubereats_rating: 4.2,
    markup_category: "low",
    markup_percentage: 5,
  },
  {
    name: "Saigon Grill",
    address: "620 Amsterdam Ave, New York, NY 10024",
    neighborhood: "Upper West Side",
    zip_code: "10024",
    cuisines: ["vietnamese"],
    latitude: 40.7915,
    longitude: -73.9718,
    phone_number: "(212) 875-9072",
    website_url: null,
    direct_ordering_url: null,
    has_direct_delivery: true,
    has_pickup: true,
    ubereats_url: "https://www.ubereats.com/store/saigon-grill",
    ubereats_rating: 4.4,
    markup_category: "medium",
    markup_percentage: 12,
    notes: "Call for delivery - they have their own drivers",
  },
  {
    name: "Sal & Carmine Pizza",
    address: "2671 Broadway, New York, NY 10025",
    neighborhood: "Upper West Side",
    zip_code: "10025",
    cuisines: ["pizza"],
    latitude: 40.7968,
    longitude: -73.9695,
    phone_number: "(212) 663-7651",
    website_url: null,
    direct_ordering_url: null,
    has_direct_delivery: true,
    has_pickup: true,
    ubereats_url: "https://www.ubereats.com/store/sal-carmines",
    ubereats_rating: 4.7,
    markup_category: "none",
    markup_percentage: 0,
    notes: "Classic NYC slice shop - call for delivery",
  },
  {
    name: "Turkuaz",
    address: "2637 Broadway, New York, NY 10025",
    neighborhood: "Upper West Side",
    zip_code: "10025",
    cuisines: ["mediterranean"],
    latitude: 40.7958,
    longitude: -73.9698,
    phone_number: "(212) 665-9541",
    website_url: "https://turkuazrestaurant.com",
    direct_ordering_url: "https://turkuazrestaurant.com/order",
    has_direct_delivery: true,
    has_pickup: true,
    ubereats_url: "https://www.ubereats.com/store/turkuaz",
    ubereats_rating: 4.5,
    markup_category: "low",
    markup_percentage: 7,
  },
];

async function seed() {
  console.log("🌱 Seeding database with test restaurants...\n");

  // First, clear existing data (optional - comment out if you want to keep existing)
  console.log("Clearing existing restaurants...");
  const { error: deleteError } = await supabase
    .from("restaurants")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all

  if (deleteError) {
    console.error("Error clearing data:", deleteError);
  }

  // Insert restaurants
  for (const restaurant of testRestaurants) {
    const { data, error } = await supabase
      .from("restaurants")
      .insert(restaurant)
      .select()
      .single();

    if (error) {
      console.error(`❌ Failed to insert ${restaurant.name}:`, error.message);
    } else {
      console.log(`✅ Inserted: ${restaurant.name}`);
    }
  }

  console.log("\n🎉 Seeding complete!");
  console.log(`Added ${testRestaurants.length} restaurants`);
  console.log("\nRefresh your app at http://localhost:3000 to see them!");
}

seed().catch(console.error);
