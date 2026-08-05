-- Menu Truth Database Schema
-- Run this in Supabase SQL Editor to create the tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Restaurants table
CREATE TABLE restaurants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  neighborhood TEXT NOT NULL DEFAULT 'Upper West Side',
  zip_code TEXT NOT NULL,
  cuisines TEXT[] NOT NULL DEFAULT '{}',
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  phone_number TEXT,
  website_url TEXT,
  direct_ordering_url TEXT,
  has_direct_delivery BOOLEAN NOT NULL DEFAULT false,
  has_pickup BOOLEAN NOT NULL DEFAULT false,
  ubereats_url TEXT,
  ubereats_rating DECIMAL(2, 1),
  slug TEXT UNIQUE,
  markup_category TEXT NOT NULL DEFAULT 'none' CHECK (markup_category IN ('none', 'low', 'medium', 'high')),
  markup_percentage DECIMAL(5, 2),
  notes TEXT,
  actual_menu_url TEXT,
  actual_prices_verified_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Menu items table (stores both UberEats and actual menu items)
CREATE TABLE menu_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('ubereats', 'actual_menu')),
  item_name TEXT NOT NULL,
  item_description TEXT,
  price INTEGER NOT NULL, -- in cents
  category TEXT,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Item matches table (links UberEats items to actual menu items)
CREATE TABLE item_matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  ubereats_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  actual_menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  is_manual_match BOOLEAN NOT NULL DEFAULT false,
  match_confidence INTEGER, -- 0-100 for fuzzy matches
  price_difference INTEGER NOT NULL, -- in cents (ubereats - actual)
  markup_percentage DECIMAL(5, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(ubereats_item_id, actual_menu_item_id)
);

-- Community flags table
CREATE TABLE community_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  flag_type TEXT NOT NULL CHECK (flag_type IN ('outdated_prices', 'wrong_info', 'closed', 'other')),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Scrape history table (archives each scrape for comparison)
CREATE TABLE scrape_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL CHECK (source IN ('ubereats', 'actual_menu')),
  item_count INTEGER NOT NULL,
  items_snapshot JSONB NOT NULL,
  changed_from_previous BOOLEAN DEFAULT true,
  notes TEXT
);

-- Indexes for performance
CREATE INDEX idx_restaurants_neighborhood ON restaurants(neighborhood);
CREATE INDEX idx_restaurants_zip_code ON restaurants(zip_code);
CREATE INDEX idx_restaurants_markup_category ON restaurants(markup_category);
CREATE INDEX idx_restaurants_slug ON restaurants(slug);
CREATE INDEX idx_restaurants_cuisines ON restaurants USING GIN(cuisines);
CREATE INDEX idx_menu_items_restaurant_id ON menu_items(restaurant_id);
CREATE INDEX idx_menu_items_source ON menu_items(source);
CREATE INDEX idx_item_matches_restaurant_id ON item_matches(restaurant_id);
CREATE INDEX idx_community_flags_restaurant_id ON community_flags(restaurant_id);
CREATE INDEX idx_community_flags_status ON community_flags(status);
CREATE INDEX idx_scrape_runs_restaurant ON scrape_runs(restaurant_id, source, scraped_at DESC);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_restaurants_updated_at
  BEFORE UPDATE ON restaurants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_menu_items_updated_at
  BEFORE UPDATE ON menu_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_item_matches_updated_at
  BEFORE UPDATE ON item_matches
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_runs ENABLE ROW LEVEL SECURITY;

-- Public read access for all tables
CREATE POLICY "Public read access" ON restaurants FOR SELECT USING (true);
CREATE POLICY "Public read access" ON menu_items FOR SELECT USING (true);
CREATE POLICY "Public read access" ON item_matches FOR SELECT USING (true);
CREATE POLICY "Public read access" ON community_flags FOR SELECT USING (true);
CREATE POLICY "Public read access" ON scrape_runs FOR SELECT USING (true);

-- Anyone can create community flags
CREATE POLICY "Anyone can create flags" ON community_flags FOR INSERT WITH CHECK (true);

-- Only authenticated users with service role can modify data
-- (Admin operations will use the service role key)
