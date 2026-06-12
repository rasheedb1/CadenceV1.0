-- ============================================================================
-- Migration 135: Precise exclusion reasons + relax 90d defense
-- ============================================================================
-- Two changes after E2E test 2026-05-09 found Delivery Hero + DoorDash were
-- excluded with misleading reason "sf_open_opp_or_customer_or_cooldown" when
-- they were actually excluded by a 90-day "done" defense (no SF, no cooldown).
--
-- 1) New RPC `get_excluded_companies_with_reason(org_id)` returns
--    (company_name, normalized_name, reason) so chief-consume-from-list can
--    label each skip accurately:
--      - sf_open_opportunity (priority 10 in MV)
--      - sf_customer (priority 9 in MV)
--      - blacklisted (manually marked)
--      - cooldown_active (cooldown_until > NOW)
--      - in_active_queue (status pending/processing)
--      - recently_processed_30d (status done within last 30d, was 90d)
--
-- 2) Relax `get_excluded_company_names_for_org` 90d → 30d for the recent-done
--    defense. The cooldown_until field is already the source-of-truth and
--    respects manual cooldown clears; the 90d defense was a "belt and
--    suspenders" but blocks re-prospecting after the user resets cooldowns.
--
-- ============================================================================

-- =====================================================
-- 1. New RPC: get_excluded_companies_with_reason
-- =====================================================
-- Returns one row per (org_id, company_name, reason) so a caller can attach
-- the right label to each skipped company. ORDER prioritizes most-specific
-- reasons first (sf_open > sf_customer > blacklisted > cooldown_active > in_active_queue > recently_processed_30d)
-- so SELECT DISTINCT ON (norm_name) gets the most-specific match per company.
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_excluded_companies_with_reason(p_org_id UUID)
RETURNS TABLE (
  company_name TEXT,
  norm_name    TEXT,
  reason       TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH all_reasons AS (
    -- SF open opportunity (priority 1 — most specific)
    SELECT exc.company_name, exc.norm_name, 'sf_open_opportunity'::TEXT AS reason, 1 AS rank
      FROM public.outreach_excluded_companies exc
     WHERE exc.org_id = p_org_id AND exc.reason = 'sf_open_opportunity'

    UNION ALL

    -- SF customer (priority 2)
    SELECT exc.company_name, exc.norm_name, 'sf_customer'::TEXT, 2
      FROM public.outreach_excluded_companies exc
     WHERE exc.org_id = p_org_id AND exc.reason = 'sf_customer'

    UNION ALL

    -- Blacklisted in account_map_companies (priority 3)
    SELECT amc.company_name, normalize_company_name(amc.company_name), 'blacklisted'::TEXT, 3
      FROM public.account_map_companies amc
     WHERE amc.org_id = p_org_id AND amc.pipeline_state = 'blacklisted'

    UNION ALL

    -- Active cooldown (priority 4)
    SELECT amc.company_name, normalize_company_name(amc.company_name), 'cooldown_active'::TEXT, 4
      FROM public.account_map_companies amc
     WHERE amc.org_id = p_org_id
       AND amc.cooldown_until IS NOT NULL
       AND amc.cooldown_until > NOW()

    UNION ALL

    -- In active queue (priority 5)
    SELECT amc.company_name, normalize_company_name(amc.company_name), 'in_active_queue'::TEXT, 5
      FROM public.account_map_companies amc
     WHERE amc.org_id = p_org_id
       AND EXISTS (
         SELECT 1 FROM public.icp_pipeline_queue q
          WHERE q.company_id = amc.id
            AND q.status IN ('pending', 'processing')
       )

    UNION ALL

    -- Recently processed (status=done) within 30 days (priority 6 — least specific)
    -- V135: relaxed from 90d to 30d. Cooldown is the source-of-truth; this is
    -- defense-in-depth for cases where cooldown clearing didn't propagate.
    SELECT amc.company_name, normalize_company_name(amc.company_name), 'recently_processed_30d'::TEXT, 6
      FROM public.account_map_companies amc
     WHERE amc.org_id = p_org_id
       AND EXISTS (
         SELECT 1 FROM public.icp_pipeline_queue q
          WHERE q.company_id = amc.id
            AND q.status = 'done'
            AND q.processed_at > NOW() - INTERVAL '30 days'
       )
  )
  SELECT DISTINCT ON (norm_name) company_name, norm_name, reason
    FROM all_reasons
   WHERE norm_name IS NOT NULL AND length(norm_name) > 0
   ORDER BY norm_name, rank ASC;
$$;

COMMENT ON FUNCTION public.get_excluded_companies_with_reason(UUID) IS
  'Returns each excluded company with its specific reason (sf_open_opportunity / sf_customer / blacklisted / cooldown_active / in_active_queue / recently_processed_30d). Used by chief-consume-from-list to attach precise reasons to skip events.';

-- =====================================================
-- 2. Relax 90d → 30d in get_excluded_company_names_for_org
-- =====================================================
-- The 90d window blocked re-prospecting even after manual cooldown clears.
-- 30d is shorter buffer that still prevents accidental same-week dupes.
-- Cooldown_until remains source-of-truth for the standard 90d company gate.
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_excluded_company_names_for_org(p_org_id UUID)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY(
    SELECT DISTINCT name FROM (
      SELECT amc.company_name AS name
        FROM public.account_map_companies amc
       WHERE amc.org_id = p_org_id
         AND (
           amc.pipeline_state = 'blacklisted'
           OR (amc.cooldown_until IS NOT NULL AND amc.cooldown_until > NOW())
           OR EXISTS (
             SELECT 1 FROM public.icp_pipeline_queue q
              WHERE q.company_id = amc.id
                AND q.status IN ('pending', 'processing')
           )
         )

      UNION

      SELECT exc.company_name
        FROM public.outreach_excluded_companies exc
       WHERE exc.org_id = p_org_id

      UNION

      -- V135: relaxed from 90d to 30d
      SELECT amc2.company_name
        FROM public.account_map_companies amc2
        JOIN public.icp_pipeline_queue q2 ON q2.company_id = amc2.id
       WHERE amc2.org_id = p_org_id
         AND q2.status = 'done'
         AND q2.processed_at > NOW() - INTERVAL '30 days'
    ) all_excluded
    WHERE name IS NOT NULL AND length(trim(name)) > 0
  );
$$;

-- =====================================================
-- 3. Smoke
-- =====================================================
DO $$
DECLARE
  v_test_org UUID := '553315b5-42d0-4518-a461-e4cb12914c54';
  v_count INT;
  v_with_reason_count INT;
  v_sf_count INT;
  v_recent_count INT;
BEGIN
  SELECT cardinality(get_excluded_company_names_for_org(v_test_org)) INTO v_count;
  SELECT COUNT(*) INTO v_with_reason_count FROM get_excluded_companies_with_reason(v_test_org);
  SELECT COUNT(*) INTO v_sf_count
    FROM get_excluded_companies_with_reason(v_test_org)
   WHERE reason IN ('sf_open_opportunity', 'sf_customer');
  SELECT COUNT(*) INTO v_recent_count
    FROM get_excluded_companies_with_reason(v_test_org)
   WHERE reason = 'recently_processed_30d';

  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE '✓ Migration 135 (precise reasons + relax 30d) applied';
  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE '  total excluded (flat list):       %', v_count;
  RAISE NOTICE '  total with reason:                %', v_with_reason_count;
  RAISE NOTICE '  SF (open + customer):             %', v_sf_count;
  RAISE NOTICE '  recently_processed_30d:           %', v_recent_count;
  RAISE NOTICE 'Smoke tests passed ✓';
END $$;
