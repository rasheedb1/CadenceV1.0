-- ============================================================================
-- Migration 125: QA settings V8 (full-autonomy thresholds)
-- ============================================================================
-- Updates qa_* settings for full-autonomy + send-best-attempt philosophy:
--   • qa_threshold = 8.0 (target for auto_approve)
--   • qa_dead_band_width = 0.5 (regen window 7.5-8.5)
--   • qa_max_attempts = 5 (was 2)
--   • qa_min_acceptable_score = 4.5 (below = skip; above = send best)
--   • qa_send_best_after_max = true (NEW philosophy: send best, don't waste lead)
--   • qa_shadow_mode_active = false (live decisions)
--
-- Per-step thresholds OVERRIDE the global threshold via carlos_step_rubric
-- table (see migration 126).
-- ============================================================================

ALTER TABLE public.org_chief_settings
  ADD COLUMN IF NOT EXISTS qa_max_attempts INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS qa_min_acceptable_score NUMERIC(3,1) NOT NULL DEFAULT 4.5,
  ADD COLUMN IF NOT EXISTS qa_send_best_after_max BOOLEAN NOT NULL DEFAULT true;

UPDATE public.org_chief_settings SET
  qa_threshold = 8.0,
  qa_dead_band_width = 0.5,
  qa_max_attempts = 5,
  qa_min_acceptable_score = 4.5,
  qa_send_best_after_max = true,
  qa_shadow_mode_active = false,
  updated_at = NOW()
WHERE org_id = '553315b5-42d0-4518-a461-e4cb12914c54';

DO $$
BEGIN
  RAISE NOTICE '✓ Migration 125 (QA settings V8) applied:';
  RAISE NOTICE '  - qa_threshold = 8.0 (default for non-overridden steps)';
  RAISE NOTICE '  - qa_max_attempts = 5';
  RAISE NOTICE '  - qa_min_acceptable_score = 4.5 (skip below)';
  RAISE NOTICE '  - qa_send_best_after_max = true (philosophy: send best, dont waste lead)';
END $$;
