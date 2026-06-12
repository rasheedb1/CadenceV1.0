-- ============================================================================
-- Migration 138: company_domain_groups + domain_aliases for bulletproof discovery
-- ============================================================================
-- Multi-domain discovery feeds SimilarWeb aggregation. A company is researched
-- once (~$0.27 Claude + ~290 credits), then cached cross-org for 30 days.
--
-- domain_aliases on account_map_companies is the manual escape hatch — when
-- populated, discovery is skipped and we trust the curated list.
-- ============================================================================

-- ── Main cache table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_domain_groups (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_domain        TEXT UNIQUE NOT NULL,
  company_name          TEXT,
  -- [{domain, market, confidence: high|medium|low, sources: [], similarweb_verified: bool, top_country: str}]
  discovered_domains    JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- [{expected_market, reason}]
  coverage_gaps         JSONB DEFAULT '[]'::jsonb,
  -- [{domain, reason}]
  excluded_candidates   JSONB DEFAULT '[]'::jsonb,
  -- {scouts_run: [], duration_ms, cost_usd, cost_credits}
  discovery_metadata    JSONB DEFAULT '{}'::jsonb,
  -- Markets the company is known to operate in (from input or scout findings)
  expected_markets      TEXT[] DEFAULT ARRAY[]::TEXT[],
  fetched_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at            TIMESTAMPTZ NOT NULL,
  manual_curated        BOOLEAN NOT NULL DEFAULT FALSE,
  error                 TEXT
);

CREATE INDEX IF NOT EXISTS company_domain_groups_expires_idx
  ON public.company_domain_groups(expires_at);
CREATE INDEX IF NOT EXISTS company_domain_groups_company_name_idx
  ON public.company_domain_groups(company_name);

COMMENT ON TABLE public.company_domain_groups IS
  'Cross-org cache of verified domain portfolios per company. 30-day TTL. Feeds SimilarWeb aggregation.';
COMMENT ON COLUMN public.company_domain_groups.discovered_domains IS
  'Array of [{domain, market, confidence, sources, similarweb_verified, top_country}]. Final verified list.';
COMMENT ON COLUMN public.company_domain_groups.manual_curated IS
  'TRUE if the row was created from a manually-curated domain_aliases override (bypasses 30-day TTL).';

-- RLS: service-role only (shared resource, public data, never read by anon)
ALTER TABLE public.company_domain_groups ENABLE ROW LEVEL SECURITY;

-- ── Manual override column on account_map_companies ──────────────────────────
ALTER TABLE public.account_map_companies
  ADD COLUMN IF NOT EXISTS domain_aliases TEXT[];

COMMENT ON COLUMN public.account_map_companies.domain_aliases IS
  'Manually-curated list of additional domains for this company (e.g. ["walmart.com","lider.cl","flipkart.com"]). When populated, discover-company-domains skips auto-discovery and uses these directly.';

-- =====================================================
-- Smoke
-- =====================================================
DO $$
DECLARE
  v_table_exists BOOLEAN;
  v_alias_col_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'company_domain_groups'
  ) INTO v_table_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'account_map_companies'
       AND column_name = 'domain_aliases'
  ) INTO v_alias_col_exists;

  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE '✓ Migration 138 (domain discovery) applied';
  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE '  company_domain_groups exists: %', v_table_exists;
  RAISE NOTICE '  account_map_companies.domain_aliases exists: %', v_alias_col_exists;
END $$;
