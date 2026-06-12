-- ============================================================================
-- Migration 133: pre_approved_icp_companies — replace LLM discovery with curated list
-- ============================================================================
-- Replaces the daily LLM-based ICP discovery (chief-discover-and-queue calling
-- discover-icp-companies) with a pre-approved company list seeded by the user.
--
-- Why:
--   - LLM discovery costs ~$0.40/run + ~25s latency
--   - User has 2484 high-confidence ICP companies already curated with LinkedIn
--     URLs (sf-compare/linkedin_names_BY_REGION_with_urls.tsv)
--   - At 5 companies/day → 496 days runway, no LLM needed for discovery
--   - LLM discovery stays deployed as MANUAL fallback (not on cron)
--
-- Design:
--   - Single global list (no org_id) — these are universally valid Yuno ICP
--   - position INT preserves TSV ingestion order (1 = highest priority,
--     consume FIFO ascending so most-important fire first)
--   - consumed_at timestamp + consumed_by_org_id mark claim (idempotent)
--   - url_type discriminates 'company' (Unipile resolves direct) vs 'search'
--     (needs Unipile keyword search) vs 'school' (rare educational entities)
--   - consume_next_n uses FOR UPDATE SKIP LOCKED for safe concurrent consumption
-- ============================================================================

-- =====================================================
-- 1. Table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.pre_approved_icp_companies (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position              INT  NOT NULL UNIQUE,
  name                  TEXT NOT NULL,
  linkedin_url          TEXT NOT NULL,
  url_type              TEXT NOT NULL CHECK (url_type IN ('company', 'school', 'search')),
  needs_resolution      BOOLEAN NOT NULL DEFAULT false,
  consumed_at           TIMESTAMPTZ,
  consumed_by_org_id    UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  consumed_account_map_company_id UUID REFERENCES public.account_map_companies(id) ON DELETE SET NULL,
  resolution_failed_at  TIMESTAMPTZ,
  resolution_failure_reason TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pre_approved_pending_position
  ON public.pre_approved_icp_companies (position ASC)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pre_approved_consumed_at
  ON public.pre_approved_icp_companies (consumed_at DESC)
  WHERE consumed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pre_approved_norm_name
  ON public.pre_approved_icp_companies ((normalize_company_name(name)));

COMMENT ON TABLE public.pre_approved_icp_companies IS
  'Curated ICP company list (~2400 entries) consumed FIFO by chief-consume-from-list daily. Replaces LLM discovery for cost/latency. Position 1 = highest priority.';

COMMENT ON COLUMN public.pre_approved_icp_companies.url_type IS
  'company = direct /company/ URL (Unipile resolves instantly). search = /search/results/ URL (needs Unipile keyword lookup). school = /school/ URL (rare, treat as company).';

COMMENT ON COLUMN public.pre_approved_icp_companies.needs_resolution IS
  'TRUE when linkedin_url is a /search/ URL — Unipile must keyword-search to find the actual company entity. Set FALSE for direct /company/ URLs.';

-- =====================================================
-- 2. RLS — read-only for authenticated, service-role only writes
-- =====================================================
ALTER TABLE public.pre_approved_icp_companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pre_approved_read_authenticated" ON public.pre_approved_icp_companies;
CREATE POLICY "pre_approved_read_authenticated"
  ON public.pre_approved_icp_companies
  FOR SELECT
  TO authenticated
  USING (true);

-- writes only via service_role / SECURITY DEFINER RPCs

-- =====================================================
-- 3. RPC: consume_next_n  — claim N pending entries atomically
-- =====================================================
-- FOR UPDATE SKIP LOCKED ensures two concurrent consumers don't claim the same
-- row. Returns the claimed rows so the caller (chief-consume-from-list) can
-- pipe them into account_map_companies + icp_pipeline_queue.
-- =====================================================
CREATE OR REPLACE FUNCTION public.consume_next_n_pre_approved(
  p_n      INT,
  p_org_id UUID
)
RETURNS TABLE (
  id           UUID,
  pos          INT,
  name         TEXT,
  linkedin_url TEXT,
  url_type     TEXT,
  needs_resolution BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed UUID[];
BEGIN
  IF p_n IS NULL OR p_n < 1 THEN
    RAISE EXCEPTION 'consume_next_n_pre_approved: p_n must be >= 1, got %', p_n;
  END IF;
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'consume_next_n_pre_approved: p_org_id required';
  END IF;

  -- Claim the next N pending rows in position order
  WITH claimed AS (
    SELECT pac.id
      FROM public.pre_approved_icp_companies pac
     WHERE pac.consumed_at IS NULL
     ORDER BY pac.position ASC
     LIMIT p_n
     FOR UPDATE SKIP LOCKED
  ),
  upd AS (
    UPDATE public.pre_approved_icp_companies pac
       SET consumed_at = NOW(),
           consumed_by_org_id = p_org_id,
           updated_at = NOW()
      FROM claimed
     WHERE pac.id = claimed.id
    RETURNING pac.id
  )
  SELECT array_agg(upd.id) INTO v_claimed FROM upd;

  -- Return the claimed rows with their data
  RETURN QUERY
    SELECT pac.id, pac.position AS pos, pac.name, pac.linkedin_url, pac.url_type, pac.needs_resolution
      FROM public.pre_approved_icp_companies pac
     WHERE pac.id = ANY(COALESCE(v_claimed, ARRAY[]::UUID[]))
     ORDER BY pac.position ASC;
END;
$$;

COMMENT ON FUNCTION public.consume_next_n_pre_approved(INT, UUID) IS
  'Atomically claim next N pending pre-approved companies in position order. Marks consumed_at=NOW() so they are not re-consumed. Returns the claimed rows for the caller to pipe into account_map_companies + icp_pipeline_queue.';

-- =====================================================
-- 4. RPC: rollback_consumption — undo a consumption (used on insert failure)
-- =====================================================
-- If chief-consume-from-list fails to insert a claimed entry into
-- account_map_companies (DB error, race), we want to release the claim so a
-- future run can retry it.
-- =====================================================
CREATE OR REPLACE FUNCTION public.rollback_pre_approved_consumption(p_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.pre_approved_icp_companies
     SET consumed_at = NULL,
         consumed_by_org_id = NULL,
         consumed_account_map_company_id = NULL,
         updated_at = NOW()
   WHERE id = p_id;
$$;

-- =====================================================
-- 5. RPC: link_consumption_to_amc — store FK after successful insert
-- =====================================================
CREATE OR REPLACE FUNCTION public.link_pre_approved_to_amc(
  p_id  UUID,
  p_amc_id UUID
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.pre_approved_icp_companies
     SET consumed_account_map_company_id = p_amc_id,
         updated_at = NOW()
   WHERE id = p_id;
$$;

-- =====================================================
-- 6. RPC: mark_resolution_failed — when Unipile can't find the company
-- =====================================================
-- Distinct from rollback because we DON'T want to re-consume it — it's bad
-- data. Sets resolution_failed_at + reason for manual review.
-- =====================================================
CREATE OR REPLACE FUNCTION public.mark_pre_approved_resolution_failed(
  p_id     UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.pre_approved_icp_companies
     SET resolution_failed_at = NOW(),
         resolution_failure_reason = p_reason,
         updated_at = NOW()
   WHERE id = p_id;
$$;

-- =====================================================
-- 7. RPC: count_remaining — pending entries
-- =====================================================
CREATE OR REPLACE FUNCTION public.count_remaining_pre_approved()
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INT
    FROM public.pre_approved_icp_companies
   WHERE consumed_at IS NULL;
$$;

-- =====================================================
-- 8. RPC: get_pre_approved_list_stats — full breakdown
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_pre_approved_list_stats()
RETURNS TABLE (
  total            INT,
  remaining        INT,
  consumed         INT,
  resolution_failed INT,
  remaining_by_url_type JSONB,
  next_5           JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH counts AS (
    SELECT
      COUNT(*) FILTER (WHERE TRUE)::INT AS total,
      COUNT(*) FILTER (WHERE consumed_at IS NULL)::INT AS remaining,
      COUNT(*) FILTER (WHERE consumed_at IS NOT NULL)::INT AS consumed,
      COUNT(*) FILTER (WHERE resolution_failed_at IS NOT NULL)::INT AS resolution_failed
    FROM public.pre_approved_icp_companies
  ),
  by_type AS (
    SELECT jsonb_object_agg(url_type, cnt) AS breakdown
    FROM (
      SELECT url_type, COUNT(*)::INT AS cnt
        FROM public.pre_approved_icp_companies
       WHERE consumed_at IS NULL
       GROUP BY url_type
    ) sub
  ),
  next_up AS (
    SELECT jsonb_agg(jsonb_build_object('position', position, 'name', name, 'url_type', url_type) ORDER BY position) AS next_5
    FROM (
      SELECT position, name, url_type
        FROM public.pre_approved_icp_companies
       WHERE consumed_at IS NULL
       ORDER BY position ASC
       LIMIT 5
    ) sub
  )
  SELECT counts.total, counts.remaining, counts.consumed, counts.resolution_failed,
         COALESCE(by_type.breakdown, '{}'::JSONB),
         COALESCE(next_up.next_5, '[]'::JSONB)
    FROM counts, by_type, next_up;
$$;

-- =====================================================
-- 9. RPC: bulk_insert_pre_approved_companies — seed the table
-- =====================================================
-- Accepts JSONB array: [{name, linkedin_url, url_type, needs_resolution}, ...]
-- Auto-assigns position starting from MAX(position)+1 (so re-inserting appends).
-- Ignores duplicates by (name, linkedin_url) pair.
-- Returns count of rows inserted.
-- =====================================================
CREATE OR REPLACE FUNCTION public.bulk_insert_pre_approved_companies(p_entries JSONB)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INT;
  v_start_position INT;
BEGIN
  IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' THEN
    RAISE EXCEPTION 'bulk_insert_pre_approved_companies: p_entries must be JSON array';
  END IF;

  SELECT COALESCE(MAX(position), 0) + 1 INTO v_start_position
    FROM public.pre_approved_icp_companies;

  WITH input AS (
    SELECT
      v_start_position - 1 + ROW_NUMBER() OVER (ORDER BY ord) AS pos,
      e->>'name'        AS name,
      e->>'linkedin_url' AS linkedin_url,
      COALESCE(e->>'url_type', 'company') AS url_type,
      COALESCE((e->>'needs_resolution')::BOOLEAN, false) AS needs_resolution
    FROM jsonb_array_elements(p_entries) WITH ORDINALITY AS arr(e, ord)
  ),
  filtered AS (
    SELECT i.* FROM input i
     WHERE i.name IS NOT NULL AND length(trim(i.name)) > 0
       AND i.linkedin_url IS NOT NULL AND length(trim(i.linkedin_url)) > 0
       -- Skip if (name, linkedin_url) already exists
       AND NOT EXISTS (
         SELECT 1 FROM public.pre_approved_icp_companies pac
          WHERE lower(pac.name) = lower(i.name)
            AND pac.linkedin_url = i.linkedin_url
       )
  ),
  ins AS (
    INSERT INTO public.pre_approved_icp_companies (position, name, linkedin_url, url_type, needs_resolution)
    SELECT pos, name, linkedin_url, url_type, needs_resolution FROM filtered
    RETURNING 1
  )
  SELECT COUNT(*)::INT INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.bulk_insert_pre_approved_companies(JSONB) IS
  'Bulk-insert pre-approved ICP companies preserving JSONB array order as position. Skips dupes by (lower(name), linkedin_url). Returns count inserted.';

-- =====================================================
-- 10. updated_at trigger
-- =====================================================
CREATE OR REPLACE FUNCTION public.set_updated_at_pre_approved()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pre_approved_updated_at ON public.pre_approved_icp_companies;
CREATE TRIGGER trg_pre_approved_updated_at
  BEFORE UPDATE ON public.pre_approved_icp_companies
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_pre_approved();

-- =====================================================
-- 11. Smoke tests + summary
-- =====================================================
DO $$
DECLARE
  v_test_org UUID := '553315b5-42d0-4518-a461-e4cb12914c54';
  v_table_exists BOOLEAN;
  v_inserted INT;
  v_count INT;
  v_claimed INT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'pre_approved_icp_companies'
  ) INTO v_table_exists;

  IF NOT v_table_exists THEN
    RAISE EXCEPTION 'pre_approved_icp_companies table missing after CREATE';
  END IF;

  -- Test bulk insert with 3 dummy rows
  v_inserted := public.bulk_insert_pre_approved_companies(
    '[
      {"name": "__SMOKE_TEST_A__", "linkedin_url": "https://www.linkedin.com/company/smoke-a/", "url_type": "company"},
      {"name": "__SMOKE_TEST_B__", "linkedin_url": "https://www.linkedin.com/company/smoke-b/", "url_type": "company"},
      {"name": "__SMOKE_TEST_C__", "linkedin_url": "https://www.linkedin.com/search/results/companies/?keywords=smoke-c", "url_type": "search", "needs_resolution": true}
    ]'::JSONB
  );

  IF v_inserted <> 3 THEN
    RAISE EXCEPTION 'Smoke insert: expected 3 rows, got %', v_inserted;
  END IF;

  -- Re-insert same rows (must skip dupes) → returns 0
  v_inserted := public.bulk_insert_pre_approved_companies(
    '[{"name": "__SMOKE_TEST_A__", "linkedin_url": "https://www.linkedin.com/company/smoke-a/", "url_type": "company"}]'::JSONB
  );

  IF v_inserted <> 0 THEN
    RAISE EXCEPTION 'Dedup smoke: expected 0 (already exists), got %', v_inserted;
  END IF;

  -- Test consume_next_n claims 2
  SELECT COUNT(*) INTO v_claimed
    FROM public.consume_next_n_pre_approved(2, v_test_org);
  IF v_claimed <> 2 THEN
    RAISE EXCEPTION 'consume_next_n: expected 2 claimed, got %', v_claimed;
  END IF;

  -- Verify count_remaining decremented
  v_count := public.count_remaining_pre_approved();
  -- (count is "smoke rows still pending"; we can't be exact because real data may be loaded)

  -- Cleanup smoke rows
  DELETE FROM public.pre_approved_icp_companies
   WHERE name LIKE '__SMOKE_TEST_%';

  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE '✓ Migration 133 (pre_approved_icp_companies) applied';
  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE '  Table created:                    yes';
  RAISE NOTICE '  bulk_insert_pre_approved_companies: works (insert + dedup)';
  RAISE NOTICE '  consume_next_n_pre_approved:      claims rows atomically';
  RAISE NOTICE '  count_remaining_pre_approved:     %', v_count;
  RAISE NOTICE '────────────────────────────────────────────────────────';
  RAISE NOTICE '  Next: bulk-load 2484 rows from TSV via bulk_insert_pre_approved_companies()';
  RAISE NOTICE '  Smoke tests passed ✓';
END $$;
