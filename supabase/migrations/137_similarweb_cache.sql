-- ============================================================================
-- Migration 137: similarweb_cache — shared cache for SimilarWeb traffic data
-- ============================================================================
-- SimilarWeb traffic data is public (not org-specific). Caching cross-org
-- maximizes credit savings: one fetch of rappi.com serves every org that ever
-- researches Rappi.
--
-- 30-day TTL. Silent auto-refresh kicks in at age >25 days (handled in edge fn).
-- raw_visits/raw_geo retained for debugging; can be pruned later if storage grows.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.similarweb_cache (
  domain          TEXT PRIMARY KEY,
  monthly_visits  JSONB NOT NULL,
  top_countries   JSONB NOT NULL,
  engagement      JSONB,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  raw_visits      JSONB,
  raw_geo         JSONB,
  error           TEXT
);

CREATE INDEX IF NOT EXISTS similarweb_cache_expires_idx
  ON public.similarweb_cache(expires_at);

COMMENT ON TABLE public.similarweb_cache IS
  'Shared cross-org cache for SimilarWeb traffic data. Domain-keyed, 30-day TTL.';
COMMENT ON COLUMN public.similarweb_cache.error IS
  'If non-null, the last fetch failed; serve stale data with a warning rather than refetching repeatedly.';

-- RLS: service-role only (cron + edge functions). No public/anon access.
ALTER TABLE public.similarweb_cache ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- Smoke
-- =====================================================
DO $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'similarweb_cache'
  ) INTO v_exists;

  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE '✓ Migration 137 (similarweb_cache) applied';
  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE '  Table exists: %', v_exists;
END $$;
