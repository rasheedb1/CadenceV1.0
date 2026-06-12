-- ============================================================================
-- Migration 128: Batch processor — auto-retry skipped companies
-- ============================================================================
-- Today: chief-process-company processes 1 company. If skipped (no qualified
-- buyers), nothing else happens that day.
--
-- Goal: meet daily_target_processed by AUTO-RETRYING — claim next company
-- from queue and try until target hit OR DM budget exhausted OR queue empty.
--
-- New:
--   • daily_target_processed_companies setting (default = same as
--     daily_target_companies, but distinct so user can tune retry behavior)
--   • count_processed_companies_today() RPC → tracks successful processings
--   • get_queue_health() RPC → pending count + low-water alert
-- ============================================================================

-- =====================================================
-- 1. Settings
-- =====================================================
ALTER TABLE public.org_chief_settings
  ADD COLUMN IF NOT EXISTS daily_target_processed_companies INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS batch_max_attempts_per_run INT NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS batch_min_queue_for_discovery INT NOT NULL DEFAULT 5;

COMMENT ON COLUMN public.org_chief_settings.daily_target_processed_companies IS
  'Number of SUCCESSFULLY-processed companies per day (post-validator, post-Apollo). System auto-retries skipped companies until this target is hit.';

COMMENT ON COLUMN public.org_chief_settings.batch_max_attempts_per_run IS
  'Max companies to attempt per batch-processor run (single edge function call). Limits per-call duration.';

COMMENT ON COLUMN public.org_chief_settings.batch_min_queue_for_discovery IS
  'If pending queue < this, trigger discovery before batch processing (refills queue).';

-- =====================================================
-- 2. Count today's successful processings
-- =====================================================
CREATE OR REPLACE FUNCTION public.count_processed_companies_today(p_org_id UUID)
RETURNS TABLE (
  done_today INT,
  skipped_today INT,
  failed_today INT,
  total_attempts_today INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_start TIMESTAMPTZ := date_trunc('day', NOW() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York';
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE status = 'done')::INT AS done_today,
    COUNT(*) FILTER (WHERE status = 'skipped')::INT AS skipped_today,
    COUNT(*) FILTER (WHERE status = 'failed')::INT AS failed_today,
    COUNT(*)::INT AS total_attempts_today
  FROM public.icp_pipeline_queue
  WHERE org_id = p_org_id
    AND processed_at >= v_today_start;
END;
$$;

-- =====================================================
-- 3. Queue health check
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_queue_health(p_org_id UUID)
RETURNS TABLE (
  pending_count INT,
  processing_count INT,
  done_count INT,
  skipped_count INT,
  failed_count INT,
  needs_discovery BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_threshold INT;
BEGIN
  SELECT batch_min_queue_for_discovery INTO v_threshold
  FROM public.org_chief_settings
  WHERE org_id = p_org_id;
  v_threshold := COALESCE(v_threshold, 5);

  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE status = 'pending')::INT AS pending_count,
    COUNT(*) FILTER (WHERE status = 'processing')::INT AS processing_count,
    COUNT(*) FILTER (WHERE status = 'done')::INT AS done_count,
    COUNT(*) FILTER (WHERE status = 'skipped')::INT AS skipped_count,
    COUNT(*) FILTER (WHERE status = 'failed')::INT AS failed_count,
    (COUNT(*) FILTER (WHERE status = 'pending')::INT < v_threshold) AS needs_discovery
  FROM public.icp_pipeline_queue
  WHERE org_id = p_org_id;
END;
$$;

-- =====================================================
-- 4. Resumen
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '✓ Migration 128 (batch processor) applied:';
  RAISE NOTICE '  - org_chief_settings: +daily_target_processed_companies (1) +batch_max_attempts_per_run (4) +batch_min_queue_for_discovery (5)';
  RAISE NOTICE '  - count_processed_companies_today(org) — tracks daily success';
  RAISE NOTICE '  - get_queue_health(org) — queue stats + needs_discovery flag';
END $$;
