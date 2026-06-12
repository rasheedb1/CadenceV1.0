-- ============================================================================
-- Migration 136: Extend prospects.status CHECK to admit verifier statuses
-- ============================================================================
-- Original constraint: status IN ('new', 'enriched', 'promoted')
-- This silently rejected:
--   - V10 validator's 'disqualified_by_validator' (filter still worked because
--     validator_score < 6 caught them in post-fetch filters, but state lost)
--   - V13 employer-verifier's 'wrong_company' (caused the wrong-company drops
--     to NOT persist — the count was logged but DB UPDATE was rejected)
--
-- Extending to:
--   - 'new', 'enriched', 'promoted'
--   - 'disqualified_by_validator' (V10/V11c — wrong title for payments)
--   - 'wrong_company' (V13 — current LinkedIn employer ≠ target company)
-- ============================================================================

ALTER TABLE public.prospects
  DROP CONSTRAINT IF EXISTS prospects_status_check;

ALTER TABLE public.prospects
  ADD CONSTRAINT prospects_status_check
  CHECK (status = ANY (ARRAY[
    'new'::TEXT,
    'enriched'::TEXT,
    'promoted'::TEXT,
    'disqualified_by_validator'::TEXT,
    'wrong_company'::TEXT
  ]));

COMMENT ON CONSTRAINT prospects_status_check ON public.prospects IS
  'V13: extended to admit disqualified_by_validator (V10) and wrong_company (V13 employer-verifier).';

-- =====================================================
-- Smoke
-- =====================================================
DO $$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def
    FROM pg_constraint c
   WHERE c.conrelid = 'public.prospects'::regclass
     AND c.contype = 'c'
     AND c.conname = 'prospects_status_check';

  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE '✓ Migration 136 (extend prospects.status) applied';
  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE '  New constraint: %', v_def;
END $$;
