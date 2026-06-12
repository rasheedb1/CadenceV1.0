-- ============================================================================
-- Migration 130: Anti-duplicate guarantee + SF-aware exclusion (efficiency)
-- ============================================================================
-- Two problems solved:
--
-- 1) DUPLICATE PROCESSING (iFood was processed 2× on 2026-05-09):
--    chief-process-company on done branch left pipeline_state='in_pipeline' with
--    cooldown_until=NULL → next discovery cycle didn't see it as excluded →
--    LLM re-proposed it → upsert allowed it → UNIQUE INDEX only blocked
--    pending|processing, not done → second queue row inserted → second processing.
--
--    Fix: stricter UNIQUE INDEX (per-day defense) + cooldown set on done
--    (in chief-process-company patch — separate file).
--
-- 2) DISCOVERY LOOPS over known SF accounts (Rappi, Avianca, Mercado Libre…):
--    get_excluded_company_names_for_org only knew about account_map_companies
--    + queue. It had no idea about Salesforce open opps or customers.
--
--    Fix: materialized view `outreach_excluded_companies` joining SF data,
--    refreshed nightly. Two RPCs: full list (for SQL post-filter) + top-N
--    (for LLM prompt — keeps it bounded).
--
-- Performance: all lookups are indexed. MV has (org_id, norm_name) index.
-- normalize_company_name is IMMUTABLE so it composes well with indexes.
-- ============================================================================

-- =====================================================
-- A. Anti-duplicate UNIQUE INDEX (defense-in-depth)
-- =====================================================
-- Old index only covered pending|processing. New index also covers done,
-- partitioned by ((created_at AT TIME ZONE 'UTC')::date) so the same company can be re-enqueued on
-- a different day (after cooldown lifts) but never twice the same day.
--
-- DATE() is IMMUTABLE — safe in partial index expressions.
-- =====================================================

-- A0. Pre-cleanup: existing duplicates (e.g. iFood 2026-05-09) would violate
-- the new UNIQUE INDEX. Mark the older row in each duplicate-group as 'failed'
-- with a clear reason. This preserves history and unblocks the index creation.
-- The newer row keeps status='done' (it carries the latest cadence_lead_ids
-- which are idempotent — no double leads were created).
WITH dups AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY org_id, company_id, ((created_at AT TIME ZONE 'UTC')::date)
           ORDER BY processed_at DESC NULLS LAST, created_at DESC
         ) AS rn
    FROM public.icp_pipeline_queue
   WHERE status IN ('pending', 'processing', 'done')
)
UPDATE public.icp_pipeline_queue q
   SET status = 'failed',
       error_detail = COALESCE(error_detail, '') ||
         CASE WHEN error_detail IS NULL OR length(error_detail) = 0
              THEN 'superseded_duplicate_pre_migration_130'
              ELSE ' | superseded_duplicate_pre_migration_130'
         END,
       updated_at = NOW()
  FROM dups
 WHERE q.id = dups.id
   AND dups.rn > 1;

DROP INDEX IF EXISTS public.uniq_icp_pipeline_queue_active;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_icp_pipeline_queue_per_day
  ON public.icp_pipeline_queue (org_id, company_id, (((created_at AT TIME ZONE 'UTC')::date)))
  WHERE status IN ('pending', 'processing', 'done');

-- =====================================================
-- A2. Backfill: clean up companies stuck in 'in_pipeline' without cooldown
-- =====================================================
-- Any account_map_companies that have a queue row processed (done) in the last
-- 90 days but no cooldown_until → set cooldown so future discovery skips them.
-- =====================================================

UPDATE public.account_map_companies amc
   SET pipeline_state = 'cooldown',
       cooldown_until = COALESCE(
         (SELECT MAX(q.processed_at) + INTERVAL '90 days'
            FROM public.icp_pipeline_queue q
           WHERE q.company_id = amc.id AND q.status = 'done'),
         NOW() + INTERVAL '90 days'
       )
 WHERE EXISTS (
   SELECT 1 FROM public.icp_pipeline_queue q
    WHERE q.company_id = amc.id
      AND q.status = 'done'
      AND q.processed_at > NOW() - INTERVAL '90 days'
 )
 AND (amc.cooldown_until IS NULL OR amc.cooldown_until < NOW());

-- =====================================================
-- B1. Materialized view: outreach_excluded_companies
-- =====================================================
-- Single source of truth for "do not discover/contact" companies, refreshed
-- nightly. Joins SF data + account_map state. Indexed on (org_id, norm_name)
-- for sub-millisecond lookups during post-filter.
--
-- Priority semantics:
--   10 = SF open opportunity (active deal — never poach)
--    9 = SF closed_won (Yuno customer — never re-prospect)
--    8 = blacklisted in account_map_companies (manual exclude)
--    5 = active cooldown in account_map_companies (recently processed)
-- Higher priority surfaces first in the LLM-bounded list.
-- =====================================================

DROP MATERIALIZED VIEW IF EXISTS public.outreach_excluded_companies;

CREATE MATERIALIZED VIEW public.outreach_excluded_companies AS
  WITH all_sources AS (
    -- SF accounts with an open opportunity
    SELECT a.org_id, a.name AS company_name,
           normalize_company_name(a.name) AS norm_name,
           'sf_open_opportunity'::TEXT AS reason,
           10 AS priority
      FROM public.salesforce_accounts a
     WHERE EXISTS (
       SELECT 1 FROM public.salesforce_opportunities o
        WHERE o.org_id = a.org_id AND o.sf_account_id = a.sf_account_id
          AND NOT o.is_closed
     )

    UNION ALL

    -- SF accounts that are closed_won (Yuno customers) — only if no open opp
    SELECT a.org_id, a.name,
           normalize_company_name(a.name),
           'sf_customer'::TEXT,
           9
      FROM public.salesforce_accounts a
     WHERE EXISTS (
       SELECT 1 FROM public.salesforce_opportunities o
        WHERE o.org_id = a.org_id AND o.sf_account_id = a.sf_account_id
          AND o.is_closed AND o.is_won
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.salesforce_opportunities o2
        WHERE o2.org_id = a.org_id AND o2.sf_account_id = a.sf_account_id
          AND NOT o2.is_closed
     )

    UNION ALL

    -- Manually blacklisted in account_map_companies
    SELECT amc.org_id, amc.company_name,
           normalize_company_name(amc.company_name),
           'blacklisted'::TEXT,
           8
      FROM public.account_map_companies amc
     WHERE amc.pipeline_state = 'blacklisted'

    UNION ALL

    -- Active cooldown in account_map_companies (recently processed)
    SELECT amc.org_id, amc.company_name,
           normalize_company_name(amc.company_name),
           'cooldown'::TEXT,
           5
      FROM public.account_map_companies amc
     WHERE amc.cooldown_until IS NOT NULL
       AND amc.cooldown_until > NOW()
  ),
  -- Dedupe within each (org_id, norm_name, reason) group — multiple SF accounts
  -- can share a normalized name (e.g. "Tiendas Efe USA" + "Tiendas Efe MX").
  -- Pick a stable representative display name (alphabetically first).
  dedup AS (
    SELECT org_id, norm_name, reason, priority,
           MIN(company_name) AS company_name
      FROM all_sources
     WHERE norm_name IS NOT NULL AND length(norm_name) > 0
     GROUP BY org_id, norm_name, reason, priority
  )
  SELECT org_id, company_name, norm_name, reason, priority FROM dedup;

-- Required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX uniq_outreach_excluded_org_norm_reason
  ON public.outreach_excluded_companies (org_id, norm_name, reason);

CREATE INDEX idx_outreach_excluded_org_norm
  ON public.outreach_excluded_companies (org_id, norm_name);

CREATE INDEX idx_outreach_excluded_org_priority
  ON public.outreach_excluded_companies (org_id, priority DESC);

COMMENT ON MATERIALIZED VIEW public.outreach_excluded_companies IS
  'Single source of truth for "do not discover/contact" companies. Joins SF + account_map state. Refreshed nightly via cron. Indexed (org_id, norm_name) for fast post-filter.';

-- =====================================================
-- B2. Refresh RPC
-- =====================================================
CREATE OR REPLACE FUNCTION public.refresh_outreach_excluded_companies()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.outreach_excluded_companies;
  SELECT COUNT(*) INTO v_count FROM public.outreach_excluded_companies;
  RETURN format('Refreshed outreach_excluded_companies: %s rows', v_count);
END;
$$;

COMMENT ON FUNCTION public.refresh_outreach_excluded_companies() IS
  'Refresh outreach_excluded_companies MV concurrently. Called nightly by pg_cron + on-demand after large SF syncs.';

-- =====================================================
-- B3. pg_cron job — daily refresh at 03:00 ET (07:00 UTC)
-- =====================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule previous runs to make migration idempotent
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-outreach-excluded-mv') THEN
      PERFORM cron.unschedule('refresh-outreach-excluded-mv');
    END IF;
    PERFORM cron.schedule(
      'refresh-outreach-excluded-mv',
      '0 7 * * *',  -- 07:00 UTC = 03:00 ET (EST) / 04:00 ET (EDT)
      $job$ SELECT public.refresh_outreach_excluded_companies(); $job$
    );
    RAISE NOTICE '✓ pg_cron job "refresh-outreach-excluded-mv" scheduled (daily 07:00 UTC)';
  ELSE
    RAISE NOTICE '⚠ pg_cron not installed — refresh must be triggered manually or by external scheduler';
  END IF;
END $$;

-- =====================================================
-- B4. Refactor get_excluded_company_names_for_org
-- =====================================================
-- Now a UNION of:
--   - existing logic (account_map_companies cooldown/blacklist + queue active)
--   - outreach_excluded_companies (SF-aware)
-- Returns DISTINCT TEXT[] of company names. Preserves backwards compat.
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
      -- Account-map cooldown / blacklist / in-queue
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

      -- SF-aware exclusion (open opps, customers, etc.)
      SELECT exc.company_name
        FROM public.outreach_excluded_companies exc
       WHERE exc.org_id = p_org_id

      UNION

      -- Defense-in-depth: any company processed (done) in the last 90 days
      -- (covers the case where backfill missed something or cooldown was cleared)
      SELECT amc2.company_name
        FROM public.account_map_companies amc2
        JOIN public.icp_pipeline_queue q2 ON q2.company_id = amc2.id
       WHERE amc2.org_id = p_org_id
         AND q2.status = 'done'
         AND q2.processed_at > NOW() - INTERVAL '90 days'
    ) all_excluded
    WHERE name IS NOT NULL AND length(trim(name)) > 0
  );
$$;

-- =====================================================
-- B5. New RPC: top-N for LLM prompt (bounded list)
-- =====================================================
-- Returns the highest-priority excluded names so chief-discover-and-queue
-- can pass a SHORT list to the LLM prompt (not the full list).
-- Order: priority DESC (SF opps first), then alphabetical.
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
  SELECT ARRAY(
    SELECT company_name
      FROM public.outreach_excluded_companies
     WHERE org_id = p_org_id
     ORDER BY priority DESC, company_name ASC
     LIMIT GREATEST(p_limit, 1)
  );
$$;

COMMENT ON FUNCTION public.get_excluded_company_names_for_llm(UUID, INT) IS
  'Top-N most critical excluded companies (SF opps + customers first), bounded for LLM prompt. The full list lives in get_excluded_company_names_for_org() and is applied as a SQL post-filter.';

-- =====================================================
-- C. Smoke tests + summary
-- =====================================================
DO $$
DECLARE
  v_test_org UUID := '553315b5-42d0-4518-a461-e4cb12914c54';
  v_mv_total INT;
  v_mv_org INT;
  v_full INT;
  v_llm INT;
  v_norm_match BOOLEAN;
BEGIN
  -- Initial refresh (so V1 has data right away)
  -- Use plain REFRESH (not CONCURRENTLY) since this is the first populate
  REFRESH MATERIALIZED VIEW public.outreach_excluded_companies;

  SELECT COUNT(*) INTO v_mv_total FROM public.outreach_excluded_companies;
  SELECT COUNT(*) INTO v_mv_org   FROM public.outreach_excluded_companies WHERE org_id = v_test_org;
  SELECT cardinality(get_excluded_company_names_for_org(v_test_org)) INTO v_full;
  SELECT cardinality(get_excluded_company_names_for_llm(v_test_org, 50)) INTO v_llm;

  -- Verify normalize fuzzy match works for SF account variations
  SELECT normalize_company_name('Rappi') = normalize_company_name('Rappi Inc.')
     AND normalize_company_name('Rappi') = normalize_company_name('RAPPI S.A.S')
    INTO v_norm_match;

  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE '✓ Migration 130 (anti-dup + SF-aware exclusion) applied';
  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE '  outreach_excluded_companies total rows:   %', v_mv_total;
  RAISE NOTICE '  outreach_excluded_companies for test org: %', v_mv_org;
  RAISE NOTICE '  get_excluded_company_names_for_org()  → %', v_full;
  RAISE NOTICE '  get_excluded_company_names_for_llm(50) → %', v_llm;
  RAISE NOTICE '  normalize fuzzy match Rappi variants:    %', v_norm_match;
  RAISE NOTICE '────────────────────────────────────────────────────────';

  IF v_mv_org = 0 THEN
    RAISE WARNING '⚠ Test org has 0 SF-excluded companies — verify SF sync ran';
  END IF;

  IF v_llm > 50 THEN
    RAISE EXCEPTION 'LLM list returned more than limit (% > 50)', v_llm;
  END IF;

  IF NOT v_norm_match THEN
    RAISE EXCEPTION 'normalize_company_name fuzzy match failed';
  END IF;

  RAISE NOTICE 'Smoke tests passed ✓';
END $$;
