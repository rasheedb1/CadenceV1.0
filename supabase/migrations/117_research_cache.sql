-- ============================================================================
-- Migration 117: Research cache (company + person)
-- ============================================================================
-- Reduce ~80% del costo mensual de research moviendo de "fresh fetch en cada
-- touchpoint" a "fetch lazy on Day 1 + cache reusa en Days 3/5/7/9".
--
-- Cache topology:
--   • account_map_companies.research_json — firecrawl company + signals scan
--     (compartido por todos los leads en la misma empresa)
--   • leads.research_json — unipile profile + recent posts + firecrawl person
--     (único por lead)
--
-- TTL policy:
--   • Company research: 30 días (firmographics estables)
--   • Person research:  14 días (posts/title cambian más)
--   • Signals scan:      7 días (funding/M&A son time-sensitive)
-- ============================================================================

-- =====================================================
-- 1. Company-level research cache
-- =====================================================
ALTER TABLE public.account_map_companies
  ADD COLUMN IF NOT EXISTS research_json JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS research_refreshed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signals_refreshed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.account_map_companies.research_json IS
  'Cached company-level research (firecrawl insights + signal scan). Schema: { version: 1, company_insights: [{title,snippet,url}], detected_signals: [...], fetched_at: ISO, signals_refreshed_at: ISO }';

-- =====================================================
-- 2. Lead-level (person) research cache
-- =====================================================
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS research_json JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS research_refreshed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.leads.research_json IS
  'Cached person-level research (unipile profile + recent posts + firecrawl person search). Schema: { version: 1, profile_summary: {name,headline,company,location,summary,recentPosts:[]}, person_insights: [{title,snippet,url}], fetched_at: ISO }';

-- =====================================================
-- 3. Indexes for stale-cache queries (find what to refresh)
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_amc_research_refreshed
  ON public.account_map_companies (org_id, research_refreshed_at)
  WHERE research_refreshed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_research_refreshed
  ON public.leads (org_id, research_refreshed_at)
  WHERE research_refreshed_at IS NOT NULL;

-- =====================================================
-- 4. Resumen
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '✓ Migration 117 (research cache) applied:';
  RAISE NOTICE '  - account_map_companies: +research_json +research_refreshed_at +signals_refreshed_at';
  RAISE NOTICE '  - leads: +research_json +research_refreshed_at';
  RAISE NOTICE '  - Indexes on (org_id, research_refreshed_at) for both tables';
  RAISE NOTICE '  TTLs: company 30d, person 14d, signals 7d (enforced by ai-research-generate)';
END $$;
