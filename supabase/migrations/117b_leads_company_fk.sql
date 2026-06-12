-- ============================================================================
-- Migration 117b: leads.account_map_company_id FK
-- ============================================================================
-- Para cache lookup eficiente: lead → company directo, sin join via prospects
-- (prospects.promoted_lead_id no siempre se popula post-promote — ver chief-
-- process-company:398 que se hace UPDATE pero no garantizado en error paths).
--
-- Migration:
--   1. ADD column nullable (lead pueden venir de CSV sin company match)
--   2. BACKFILL desde prospects.company_id por email match (más confiable que
--      promoted_lead_id que está roto)
--   3. UPDATE chief-process-company para setear el FK al promote (NEXT)
-- ============================================================================

-- =====================================================
-- 1. Add nullable FK column
-- =====================================================
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS account_map_company_id UUID REFERENCES public.account_map_companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_account_map_company_id
  ON public.leads (account_map_company_id) WHERE account_map_company_id IS NOT NULL;

-- =====================================================
-- 2. Backfill from prospects (match by email + org_id)
-- =====================================================
-- Para cada lead con email, encontrar prospect con mismo email + org_id que
-- tenga company_id, y setear account_map_company_id.
-- =====================================================
WITH lead_to_company AS (
  SELECT DISTINCT ON (l.id)
    l.id AS lead_id,
    p.company_id
  FROM public.leads l
  JOIN public.prospects p
    ON p.org_id = l.org_id
   AND lower(p.email) = lower(l.email)
   AND p.company_id IS NOT NULL
  WHERE l.email IS NOT NULL
    AND l.account_map_company_id IS NULL
)
UPDATE public.leads l
SET account_map_company_id = ltc.company_id
FROM lead_to_company ltc
WHERE l.id = ltc.lead_id;

-- =====================================================
-- 3. Resumen
-- =====================================================
DO $$
DECLARE
  v_total INT;
  v_with_company INT;
BEGIN
  SELECT count(*), count(account_map_company_id) INTO v_total, v_with_company
  FROM public.leads
  WHERE org_id = '553315b5-42d0-4518-a461-e4cb12914c54';

  RAISE NOTICE '✓ Migration 117b applied:';
  RAISE NOTICE '  - leads.account_map_company_id FK added (nullable)';
  RAISE NOTICE '  - Backfilled %/% leads from prospects via email match',
    v_with_company, v_total;
END $$;
