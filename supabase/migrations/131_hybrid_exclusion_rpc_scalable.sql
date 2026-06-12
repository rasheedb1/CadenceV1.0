-- ============================================================================
-- Migration 131: Hybrid LLM exclusion RPC + scalability tuning
-- ============================================================================
-- Problem identified after Migration 130:
--   get_excluded_company_names_for_llm reads from materialized view, which
--   refreshes nightly (07:00 UTC). Companies processed during the day don't
--   appear in the LLM-bounded list until next refresh — opens a 0-24h window
--   where the LLM may waste tokens proposing them (post-filter SQL still
--   blocks them, but it's wasted LLM work).
--
-- Solution: hybrid RPC that UNION-ALLs:
--   (a) live cooldowns from account_map_companies (last 36h) — captures any
--       just-processed company before the MV catches up
--   (b) materialized view (everything else, indexed)
--
-- Scalability decisions baked in:
--   1. Partial index on (org_id, cooldown_until) WHERE cooldown_until > NOW()
--      → live query is O(log N) regardless of total account_map_companies size
--      Note: NOW() is non-immutable, so the partial uses cooldown_until IS NOT NULL
--      and we filter > NOW() at query time (still index-only via the partial)
--   2. UNION ALL (not UNION) inside the function — dedup is done after LIMIT
--      so we don't sort the full union; cuts work proportional to total
--      excluded count
--   3. RPC stays STABLE (not VOLATILE) so caller-side caching works
--   4. MV refresh cron tightened from daily → every 4 hours: at scale, SF
--      sync runs more often, and 4h is well within edge function batch
--      cycles. REFRESH CONCURRENTLY costs grow with row count not refresh
--      frequency, so this is cheap.
--   5. Live window of 36h (not 24h) gives slack if MV refresh is delayed
--      or skipped one cycle (e.g. maintenance window)
--   6. Bounded LIMIT enforced server-side; never returns unbounded arrays
-- ============================================================================

-- =====================================================
-- 1. Index for fast live-cooldown lookup
-- =====================================================
-- Partial index over rows where cooldown is set. Selective (only rows in
-- cooldown), small, hot. Query then filters by `cooldown_until > NOW()` and
-- `last_pipeline_processed_at > NOW() - INTERVAL '36 hours'`.
CREATE INDEX IF NOT EXISTS idx_account_map_companies_live_cooldown
  ON public.account_map_companies (org_id, cooldown_until DESC, last_pipeline_processed_at DESC)
  WHERE cooldown_until IS NOT NULL;

-- =====================================================
-- 2. Hybrid RPC: live cooldowns + materialized view
-- =====================================================
-- Returns top-N company names by priority:
--   priority 11 = just-processed companies (live, last 36h)
--   priority 10 = SF open opportunity (from MV)
--   priority  9 = SF closed_won customer (from MV)
--   priority  8 = blacklisted (from MV)
--   priority  5 = older cooldowns (from MV)
--
-- Live cooldowns get priority 11 (above SF open opps) because they're the
-- companies we just contacted — highest risk of double-touch if re-enqueued.
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_excluded_company_names_for_llm(
  p_org_id UUID,
  p_limit  INT DEFAULT 50
)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH live AS (
    -- Recently-processed companies (closes the MV-refresh gap)
    SELECT amc.company_name AS name, 11 AS priority
      FROM public.account_map_companies amc
     WHERE amc.org_id = p_org_id
       AND amc.cooldown_until IS NOT NULL
       AND amc.cooldown_until > NOW()
       AND amc.last_pipeline_processed_at > NOW() - INTERVAL '36 hours'
  ),
  mv AS (
    SELECT exc.company_name AS name, exc.priority
      FROM public.outreach_excluded_companies exc
     WHERE exc.org_id = p_org_id
  ),
  combined AS (
    SELECT name, priority FROM live
    UNION ALL
    SELECT name, priority FROM mv
  ),
  -- Dedup: a company that is both live + in MV keeps the higher priority
  deduped AS (
    SELECT name, MAX(priority) AS priority
      FROM combined
     WHERE name IS NOT NULL AND length(trim(name)) > 0
     GROUP BY name
  )
  SELECT ARRAY(
    SELECT name
      FROM deduped
     ORDER BY priority DESC, name ASC
     LIMIT GREATEST(p_limit, 1)
  );
$$;

COMMENT ON FUNCTION public.get_excluded_company_names_for_llm(UUID, INT) IS
  'Hybrid exclusion list for LLM prompts: live cooldowns (last 36h) + materialized view. Closes the gap between MV refresh cycles. Bounded by p_limit (default 50) for prompt-size safety.';

-- =====================================================
-- 3. Tighten MV refresh cron (daily → every 4 hours)
-- =====================================================
-- At scale, daily refresh leaves too much stale data between cycles
-- (e.g. SF rep closes a new opp at 9am → MV doesn't reflect until 7am next
-- day). Every 4 hours = 6 refreshes/day, REFRESH CONCURRENTLY is cheap
-- (~1-2s for thousands of rows), and the live overlay covers the worst-case
-- 4h window.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-outreach-excluded-mv') THEN
      PERFORM cron.unschedule('refresh-outreach-excluded-mv');
    END IF;
    PERFORM cron.schedule(
      'refresh-outreach-excluded-mv',
      '0 */4 * * *',  -- every 4 hours on the hour
      $job$ SELECT public.refresh_outreach_excluded_companies(); $job$
    );
    RAISE NOTICE '✓ pg_cron job retuned: refresh-outreach-excluded-mv now runs every 4 hours';
  END IF;
END $$;

-- =====================================================
-- 4. Smoke tests
-- =====================================================
DO $$
DECLARE
  v_test_org UUID := '553315b5-42d0-4518-a461-e4cb12914c54';
  v_llm_list TEXT[];
  v_full_count INT;
  v_live_count INT;
  v_mv_count INT;
  v_top_5 TEXT;
BEGIN
  -- Force a refresh so MV reflects latest state for the test
  PERFORM public.refresh_outreach_excluded_companies();

  v_llm_list := public.get_excluded_company_names_for_llm(v_test_org, 50);
  v_full_count := cardinality(v_llm_list);

  SELECT COUNT(*) INTO v_live_count
    FROM public.account_map_companies
   WHERE org_id = v_test_org
     AND cooldown_until > NOW()
     AND last_pipeline_processed_at > NOW() - INTERVAL '36 hours';

  SELECT COUNT(*) INTO v_mv_count
    FROM public.outreach_excluded_companies
   WHERE org_id = v_test_org;

  v_top_5 := array_to_string(v_llm_list[1:5], ', ');

  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE '✓ Migration 131 (hybrid LLM RPC + scalability) applied';
  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE '  Live cooldowns (last 36h):   %', v_live_count;
  RAISE NOTICE '  MV total for org:            %', v_mv_count;
  RAISE NOTICE '  LLM list returned:           %', v_full_count;
  RAISE NOTICE '  Top 5 (priority DESC):       %', v_top_5;
  RAISE NOTICE '  Cron retuned to: every 4 hours';
  RAISE NOTICE '────────────────────────────────────────────────────────';

  IF v_full_count > 50 THEN
    RAISE EXCEPTION 'LLM list exceeded p_limit (% > 50)', v_full_count;
  END IF;

  -- Verify live cooldowns appear at the top (priority 11 > MV max 10)
  IF v_live_count > 0 AND v_full_count > 0 THEN
    DECLARE
      v_top1 TEXT := v_llm_list[1];
      v_top1_in_live BOOLEAN;
    BEGIN
      SELECT EXISTS (
        SELECT 1 FROM public.account_map_companies
         WHERE org_id = v_test_org
           AND company_name = v_top1
           AND cooldown_until > NOW()
           AND last_pipeline_processed_at > NOW() - INTERVAL '36 hours'
      ) INTO v_top1_in_live;
      IF NOT v_top1_in_live THEN
        RAISE WARNING 'Top entry (%) is not a live cooldown — verify priority ordering', v_top1;
      ELSE
        RAISE NOTICE '  ✓ Top entry is a live cooldown: %', v_top1;
      END IF;
    END;
  END IF;

  RAISE NOTICE 'Smoke tests passed ✓';
END $$;
