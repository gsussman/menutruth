-- Migration: Add scrape history tracking and actual menu URL
-- Run this in Supabase SQL Editor to update an existing database

-- Add new columns to restaurants table
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS actual_menu_url TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS actual_prices_verified_at TIMESTAMPTZ;

-- Create scrape history table
CREATE TABLE IF NOT EXISTS scrape_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL CHECK (source IN ('ubereats', 'actual_menu')),
  item_count INTEGER NOT NULL,
  items_snapshot JSONB NOT NULL,
  changed_from_previous BOOLEAN DEFAULT true,
  notes TEXT
);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_scrape_runs_restaurant ON scrape_runs(restaurant_id, source, scraped_at DESC);

-- Enable RLS on scrape_runs
ALTER TABLE scrape_runs ENABLE ROW LEVEL SECURITY;

-- Public read access for scrape_runs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'scrape_runs' AND policyname = 'Public read access'
  ) THEN
    CREATE POLICY "Public read access" ON scrape_runs FOR SELECT USING (true);
  END IF;
END
$$;
