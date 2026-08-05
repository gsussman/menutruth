-- Migration: Add unique slug for shareable restaurant URLs
-- Run in Supabase SQL Editor

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS slug TEXT;

-- Backfill slugs from name (lowercase, hyphenated); append short id on collision
WITH prepared AS (
  SELECT
    id,
    TRIM(BOTH '-' FROM LOWER(REGEXP_REPLACE(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g'), '-+', '-', 'g'))) AS base_slug
  FROM restaurants
  WHERE slug IS NULL OR slug = ''
),
ranked AS (
  SELECT
    id,
    base_slug,
    ROW_NUMBER() OVER (PARTITION BY base_slug ORDER BY id) AS rn
  FROM prepared
  WHERE base_slug <> ''
)
UPDATE restaurants r
SET slug = CASE
  WHEN ranked.rn = 1 THEN ranked.base_slug
  ELSE ranked.base_slug || '-' || LEFT(REPLACE(r.id::text, '-', ''), 6)
END
FROM ranked
WHERE r.id = ranked.id;

-- Any still-empty slugs (edge cases) get id-based slug
UPDATE restaurants
SET slug = 'restaurant-' || LEFT(REPLACE(id::text, '-', ''), 8)
WHERE slug IS NULL OR slug = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurants_slug ON restaurants(slug);

ALTER TABLE restaurants ALTER COLUMN slug SET NOT NULL;
