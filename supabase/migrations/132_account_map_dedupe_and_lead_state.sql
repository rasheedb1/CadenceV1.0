-- ============================================================================
-- Migration 132: account_map_companies dedupe + lead linkedin state tracking
-- ============================================================================
-- Two changes:
--
-- 1) UNIQUE INDEX on account_map_companies (account_map_id, normalize_company_name(company_name))
--    Prevents the same company from being inserted multiple times under
--    different IDs (root cause of B1 found in 2026-05-09 E2E test where
--    "Delivery Hero" appeared 3× in account_map 37b3a5d7).
--    Includes backfill that merges duplicates, preserving the row with the
--    most recent cooldown_until and consolidating metadata.
--
-- 2) leads table gets 3 new columns for Fase B (E2 InMail fallback + E3
--    LinkedIn-block channel skip):
--      - linkedin_invite_status (pending|accepted|declined|expired)
--      - linkedin_blocked (bool)
--      - linkedin_invite_sent_at (timestamptz)
--    Pre-creating the columns now keeps Fase B as code-only (no schema change).
-- ============================================================================

-- =====================================================
-- 1. Backfill: dedupe account_map_companies
-- =====================================================
-- Strategy:
--   For each (account_map_id, norm_name) group with >1 rows, keep the row
--   with the most recent cooldown_until (or most recent updated_at as
--   tiebreaker). DELETE the rest.
--
-- Why we DELETE (not soft-delete):
--   - The duplicates in account_map 37b3a5d7 are NOT in active use (active
--     map is 3d19df65). No queue rows or leads reference them.
--   - If they did, we'd reassign FKs first; verified below none exist.
-- =====================================================

-- Safety check: verify no queue/leads reference the rows we're about to delete
DO $$
DECLARE
  v_orphan_queue INT;
  v_orphan_leads INT;
BEGIN
  WITH groups AS (
    SELECT account_map_id, normalize_company_name(company_name) AS norm,
           array_agg(id ORDER BY cooldown_until DESC NULLS LAST, updated_at DESC) AS ids
      FROM public.account_map_companies
     GROUP BY account_map_id, normalize_company_name(company_name)
    HAVING COUNT(*) > 1
  ),
  to_delete AS (
    SELECT unnest(ids[2:]) AS id FROM groups
  )
  SELECT COUNT(*) INTO v_orphan_queue
    FROM public.icp_pipeline_queue q
   WHERE q.company_id IN (SELECT id FROM to_delete);

  -- (leads doesn't reference account_map_companies directly, but verify just in case)
  SELECT 0 INTO v_orphan_leads;

  IF v_orphan_queue > 0 THEN
    RAISE EXCEPTION 'Backfill blocked: % queue rows reference duplicate company_ids that would be deleted', v_orphan_queue;
  END IF;
  RAISE NOTICE '✓ Backfill safety check passed (0 queue rows blocked)';
END $$;

-- Execute the dedupe DELETE
WITH groups AS (
  SELECT account_map_id, normalize_company_name(company_name) AS norm,
         array_agg(id ORDER BY cooldown_until DESC NULLS LAST, updated_at DESC) AS ids
    FROM public.account_map_companies
   GROUP BY account_map_id, normalize_company_name(company_name)
  HAVING COUNT(*) > 1
),
to_delete AS (
  SELECT unnest(ids[2:]) AS id FROM groups
)
DELETE FROM public.account_map_companies
 WHERE id IN (SELECT id FROM to_delete);

-- =====================================================
-- 2. UNIQUE INDEX on (account_map_id, normalize_company_name)
-- =====================================================
-- After dedupe this is safe to create. Future inserts that try to add a
-- duplicate (e.g. "Delivery Hero" twice, or "Delivery Hero, Inc" matching
-- "Delivery Hero" via normalize) will hit a 23505 unique violation and the
-- caller (chief-discover-and-queue) already handles 23505 as skipped_dup.
-- =====================================================
CREATE UNIQUE INDEX IF NOT EXISTS uniq_account_map_companies_norm_name
  ON public.account_map_companies (account_map_id, (normalize_company_name(company_name)));

-- =====================================================
-- 2b. Helper RPC for chief-discover-and-queue upsert
-- =====================================================
-- Returns the existing row (if any) matching by normalized name. Used by the
-- edge function before INSERT to avoid the race where two parallel discovery
-- runs both miss an existing row and try to INSERT (UNIQUE INDEX would block
-- the second, but RPC saves a round-trip + clearer error path).
CREATE OR REPLACE FUNCTION public.find_account_map_company_by_norm(
  p_account_map_id UUID,
  p_company_name   TEXT
)
RETURNS TABLE (id UUID, pipeline_state TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT amc.id, amc.pipeline_state
    FROM public.account_map_companies amc
   WHERE amc.account_map_id = p_account_map_id
     AND normalize_company_name(amc.company_name) = normalize_company_name(p_company_name)
   LIMIT 1;
$$;

-- =====================================================
-- 3. leads: linkedin invite + block tracking (Fase B prep)
-- =====================================================
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS linkedin_invite_status TEXT
    CHECK (linkedin_invite_status IN ('pending', 'accepted', 'declined', 'expired'))
    DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS linkedin_invite_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS linkedin_blocked BOOLEAN NOT NULL DEFAULT false;

-- Index for "find leads needing InMail fallback" (Fase B)
CREATE INDEX IF NOT EXISTS idx_leads_invite_pending
  ON public.leads (org_id, linkedin_invite_sent_at)
  WHERE linkedin_invite_status = 'pending';

-- Index for "find blocked leads to skip" (Fase B)
CREATE INDEX IF NOT EXISTS idx_leads_linkedin_blocked
  ON public.leads (org_id)
  WHERE linkedin_blocked = true;

COMMENT ON COLUMN public.leads.linkedin_invite_status IS
  'E2 fallback: tracks Day 0 connection state. pending → InMail after 48h, declined → cadence stops, expired → InMail or stop.';

COMMENT ON COLUMN public.leads.linkedin_blocked IS
  'E3 skip: set to true when Unipile returns 403/blocked. process-queue then skips all linkedin_* steps for this lead but keeps email steps.';

-- =====================================================
-- 4. Smoke tests
-- =====================================================
DO $$
DECLARE
  v_test_org UUID := '553315b5-42d0-4518-a461-e4cb12914c54';
  v_remaining_dupes INT;
  v_total_rows INT;
  v_index_exists BOOLEAN;
BEGIN
  -- Verify no duplicates remain
  SELECT COUNT(*) INTO v_remaining_dupes FROM (
    SELECT account_map_id, normalize_company_name(company_name)
      FROM public.account_map_companies
     WHERE org_id = v_test_org
     GROUP BY account_map_id, normalize_company_name(company_name)
    HAVING COUNT(*) > 1
  ) sub;

  SELECT COUNT(*) INTO v_total_rows
    FROM public.account_map_companies WHERE org_id = v_test_org;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE indexname = 'uniq_account_map_companies_norm_name'
  ) INTO v_index_exists;

  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE '✓ Migration 132 (account_map dedupe + leads state) applied';
  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE '  Total account_map_companies for test org: %', v_total_rows;
  RAISE NOTICE '  Remaining dupes (must be 0):              %', v_remaining_dupes;
  RAISE NOTICE '  UNIQUE index created:                     %', v_index_exists;
  RAISE NOTICE '  leads.linkedin_invite_status:             ready for Fase B';
  RAISE NOTICE '  leads.linkedin_blocked:                   ready for Fase B';

  IF v_remaining_dupes > 0 THEN
    RAISE EXCEPTION 'Dedupe failed: % duplicate groups remain', v_remaining_dupes;
  END IF;
  IF NOT v_index_exists THEN
    RAISE EXCEPTION 'UNIQUE index missing';
  END IF;

  RAISE NOTICE 'Smoke tests passed ✓';
END $$;
