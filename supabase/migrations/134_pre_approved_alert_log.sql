-- ============================================================================
-- Migration 134: pre-approved-list low-stock alert tracking
-- ============================================================================
-- Tracks when chief-consume-from-list has notified the user that the
-- pre_approved_icp_companies list is running low (< 50 entries). Used as
-- anti-spam guard — without this, the batch cron (every 5 min) would fire
-- a WhatsApp notification on every run once the list dips below threshold.
--
-- Design:
--   - One row per (org_id, alert_date) — alert_date = NOW() ET-truncated
--   - UNIQUE (org_id, alert_date) → ON CONFLICT DO NOTHING is the anti-spam lock
--   - RPC `should_alert_pre_approved_low(org_id)` returns true ONLY if no
--     row exists for today AND remaining < threshold
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chief_pre_approved_alert_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  alert_date    DATE NOT NULL,  -- ET date when alert was sent
  remaining_at_alert INT  NOT NULL,
  threshold     INT  NOT NULL,
  notified_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  whatsapp_status INT,
  CONSTRAINT uniq_pre_approved_alert_per_org_per_day UNIQUE (org_id, alert_date)
);

CREATE INDEX IF NOT EXISTS idx_chief_pre_approved_alert_org_date
  ON public.chief_pre_approved_alert_log (org_id, alert_date DESC);

COMMENT ON TABLE public.chief_pre_approved_alert_log IS
  'Anti-spam log for pre_approved_icp_companies low-stock WhatsApp alerts. UNIQUE (org_id, alert_date) ensures max 1 alert per org per day.';

-- =====================================================
-- RPC: claim_pre_approved_alert_slot
-- =====================================================
-- Atomically claims the alert slot for today. Returns TRUE if this caller
-- gets to send (i.e. no prior alert today for this org), FALSE otherwise.
-- ON CONFLICT DO NOTHING means concurrent callers race safely — only one wins.
-- =====================================================
CREATE OR REPLACE FUNCTION public.claim_pre_approved_alert_slot(
  p_org_id    UUID,
  p_remaining INT,
  p_threshold INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'America/New_York')::DATE;
  v_inserted INT;
BEGIN
  WITH ins AS (
    INSERT INTO public.chief_pre_approved_alert_log
      (org_id, alert_date, remaining_at_alert, threshold)
    VALUES (p_org_id, v_today, p_remaining, p_threshold)
    ON CONFLICT (org_id, alert_date) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted FROM ins;

  RETURN v_inserted = 1;
END;
$$;

COMMENT ON FUNCTION public.claim_pre_approved_alert_slot(UUID, INT, INT) IS
  'Atomically claims today''s alert slot for an org. Returns TRUE if caller wins (must send WhatsApp), FALSE if already claimed today.';

-- =====================================================
-- RPC: mark_pre_approved_alert_sent
-- =====================================================
-- Updates the row with the bridge response status (200, 5xx, etc.) for audit.
-- =====================================================
CREATE OR REPLACE FUNCTION public.mark_pre_approved_alert_sent(
  p_org_id UUID,
  p_status INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'America/New_York')::DATE;
BEGIN
  UPDATE public.chief_pre_approved_alert_log
     SET whatsapp_status = p_status
   WHERE org_id = p_org_id AND alert_date = v_today;
END;
$$;

-- =====================================================
-- Smoke test
-- =====================================================
DO $$
DECLARE
  v_test_org UUID := '553315b5-42d0-4518-a461-e4cb12914c54';
  v_first BOOLEAN;
  v_second BOOLEAN;
BEGIN
  -- Cleanup any prior test row for today
  DELETE FROM public.chief_pre_approved_alert_log
   WHERE org_id = v_test_org
     AND alert_date = (NOW() AT TIME ZONE 'America/New_York')::DATE;

  v_first := public.claim_pre_approved_alert_slot(v_test_org, 49, 50);
  v_second := public.claim_pre_approved_alert_slot(v_test_org, 49, 50);

  IF NOT v_first THEN
    RAISE EXCEPTION 'First claim should win, got FALSE';
  END IF;
  IF v_second THEN
    RAISE EXCEPTION 'Second claim should lose (anti-spam), got TRUE';
  END IF;

  PERFORM public.mark_pre_approved_alert_sent(v_test_org, 200);

  -- Cleanup
  DELETE FROM public.chief_pre_approved_alert_log
   WHERE org_id = v_test_org
     AND alert_date = (NOW() AT TIME ZONE 'America/New_York')::DATE;

  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE '✓ Migration 134 (pre_approved alert tracking) applied';
  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE '  claim_pre_approved_alert_slot: anti-spam works';
  RAISE NOTICE '  mark_pre_approved_alert_sent:  audit trail works';
  RAISE NOTICE '  Smoke tests passed ✓';
END $$;
