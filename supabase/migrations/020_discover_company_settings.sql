-- =====================================================
-- Discover ICP Companies: min/max settings
-- =====================================================

ALTER TABLE public.account_maps
  ADD COLUMN IF NOT EXISTS discover_min_companies INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS discover_max_companies INTEGER NOT NULL DEFAULT 15;
