-- ============================================================================
-- Migration 129: Salesforce opportunity conflict guard
-- ============================================================================
-- Protect other Yuno reps + ourselves: don't outbound to companies that
-- already have an opportunity in Salesforce.
--
-- Behavior:
--   • Before cascade-search, call check_sf_opportunity_conflict(org, company_name)
--   • If conflict → mark queue 'skipped' + cooldown 365 days + skip_reason='existing_sf_opportunity'
--   • Batch processor auto-claims next company → maintains daily target
--
-- Match logic: fuzzy normalized comparison (lowercase, strip suffixes Inc/LLC/SA)
-- + tier-based (open opp = always skip, closed-won = always skip, closed-lost = allow re-engage)
-- ============================================================================

-- =====================================================
-- 1. Helper: normalize company name for matching
-- =====================================================
CREATE OR REPLACE FUNCTION public.normalize_company_name(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  IF p_name IS NULL THEN RETURN NULL; END IF;
  RETURN trim(regexp_replace(
    lower(p_name),
    '\s*(,\s*)?\s*(inc|incorporated|corp|corporation|llc|ltd|limited|sa|s\.a\.|s\.a|sas|s\.a\.s|gmbh|ag|bv|nv|plc|co\.|company|holdings?|group|international|global)\.?\s*$',
    ''
  ));
END;
$$;

-- =====================================================
-- 2. Conflict check: returns bool + details
-- =====================================================
CREATE OR REPLACE FUNCTION public.check_sf_opportunity_conflict(
  p_org_id UUID,
  p_company_name TEXT
)
RETURNS TABLE (
  has_conflict BOOLEAN,
  conflict_type TEXT,    -- 'open_opportunity' | 'closed_won' | 'no_conflict'
  matched_account_name TEXT,
  matched_opp_name TEXT,
  matched_opp_stage TEXT,
  opp_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized TEXT;
  v_match RECORD;
  v_open_count INT;
  v_won_count INT;
BEGIN
  v_normalized := normalize_company_name(p_company_name);

  IF v_normalized IS NULL OR length(v_normalized) < 3 THEN
    RETURN QUERY SELECT false, 'no_conflict'::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, 0;
    RETURN;
  END IF;

  -- Find matching account by normalized name
  SELECT a.name AS account_name, a.sf_account_id
    INTO v_match
  FROM salesforce_accounts a
  WHERE a.org_id = p_org_id
    AND normalize_company_name(a.name) = v_normalized
  LIMIT 1;

  IF v_match IS NULL THEN
    -- Try ILIKE fuzzy as secondary
    SELECT a.name AS account_name, a.sf_account_id
      INTO v_match
    FROM salesforce_accounts a
    WHERE a.org_id = p_org_id
      AND lower(a.name) ILIKE '%' || v_normalized || '%'
    LIMIT 1;
  END IF;

  IF v_match IS NULL THEN
    RETURN QUERY SELECT false, 'no_conflict'::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, 0;
    RETURN;
  END IF;

  -- Found matching account → check opportunities
  SELECT
    COUNT(*) FILTER (WHERE NOT is_closed)::INT,
    COUNT(*) FILTER (WHERE is_closed AND is_won)::INT
  INTO v_open_count, v_won_count
  FROM salesforce_opportunities
  WHERE org_id = p_org_id AND sf_account_id = v_match.sf_account_id;

  -- Open opportunity = highest priority conflict
  IF v_open_count > 0 THEN
    RETURN QUERY
    SELECT
      true,
      'open_opportunity'::TEXT,
      v_match.account_name,
      o.name,
      o.stage_name,
      v_open_count
    FROM salesforce_opportunities o
    WHERE o.org_id = p_org_id AND o.sf_account_id = v_match.sf_account_id
      AND NOT o.is_closed
    ORDER BY o.synced_at DESC NULLS LAST
    LIMIT 1;
    RETURN;
  END IF;

  -- Closed-won = customer, also skip
  IF v_won_count > 0 THEN
    RETURN QUERY
    SELECT
      true,
      'closed_won'::TEXT,
      v_match.account_name,
      o.name,
      o.stage_name,
      v_won_count
    FROM salesforce_opportunities o
    WHERE o.org_id = p_org_id AND o.sf_account_id = v_match.sf_account_id
      AND o.is_closed AND o.is_won
    ORDER BY o.close_date DESC NULLS LAST
    LIMIT 1;
    RETURN;
  END IF;

  -- Account exists in SF but only closed-lost opps → safe to re-engage
  RETURN QUERY SELECT false, 'no_conflict'::TEXT, v_match.account_name, NULL::TEXT, NULL::TEXT, 0;
END;
$$;

-- =====================================================
-- 3. Performance indexes
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_sf_accounts_org_normalized
  ON public.salesforce_accounts (org_id, (normalize_company_name(name)));

CREATE INDEX IF NOT EXISTS idx_sf_opportunities_account_status
  ON public.salesforce_opportunities (org_id, sf_account_id, is_closed, is_won);

-- =====================================================
-- 4. Resumen
-- =====================================================
DO $$
DECLARE
  v_test_grub RECORD;
  v_test_uber RECORD;
BEGIN
  RAISE NOTICE '✓ Migration 129 (SF opportunity guard) applied';

  SELECT * INTO v_test_grub FROM check_sf_opportunity_conflict(
    '553315b5-42d0-4518-a461-e4cb12914c54', 'Grubhub'
  ) LIMIT 1;
  RAISE NOTICE '  Test Grubhub: conflict=% type=%', v_test_grub.has_conflict, v_test_grub.conflict_type;

  SELECT * INTO v_test_uber FROM check_sf_opportunity_conflict(
    '553315b5-42d0-4518-a461-e4cb12914c54', 'Uber'
  ) LIMIT 1;
  RAISE NOTICE '  Test Uber: conflict=% type=%', v_test_uber.has_conflict, v_test_uber.conflict_type;
END $$;
