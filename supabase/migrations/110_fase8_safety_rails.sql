-- ============================================================================
-- Migration 110: Fase 8 safety rails
-- ============================================================================
-- 3 piezas para arrancar Fase 8 sin romper la cuenta Unipile o sender reputation:
--   1. LinkedIn rate limit hard cap (max_linkedin_actions_per_day=70)
--   2. Capacity back-pressure (pause discovery si pending_schedules > 200)
--   3. Bounce handling (skip emails a leads con email_invalid=true)
-- ============================================================================

-- =====================================================
-- 1. RPC atomic: increment_if_under_cap
-- =====================================================
-- Atómicamente incrementa el counter si el resultado quedaría bajo el cap.
-- Si excedería el cap, NO incrementa y devuelve allowed=false.
-- Previene race conditions del cron (process-queue corre cada 2 min, multiple
-- schedules pueden ejecutar en paralelo).
-- =====================================================
CREATE OR REPLACE FUNCTION public.increment_if_under_cap(
  p_org_id UUID,
  p_action_type TEXT,
  p_cap INT
) RETURNS TABLE (allowed BOOLEAN, current_count INT, cap_value INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  -- Atomic upsert with conditional logic
  INSERT INTO public.daily_action_counters (org_id, action_date, action_type, count)
  VALUES (p_org_id, CURRENT_DATE, p_action_type, 0)
  ON CONFLICT (org_id, action_date, action_type) DO NOTHING;

  -- Lock row + check cap + increment if room
  SELECT count INTO v_count
  FROM public.daily_action_counters
  WHERE org_id = p_org_id AND action_date = CURRENT_DATE AND action_type = p_action_type
  FOR UPDATE;

  IF v_count + 1 > p_cap THEN
    -- Cap would be exceeded, don't increment
    RETURN QUERY SELECT false, v_count, p_cap;
  ELSE
    UPDATE public.daily_action_counters
    SET count = count + 1, updated_at = NOW()
    WHERE org_id = p_org_id AND action_date = CURRENT_DATE AND action_type = p_action_type
    RETURNING count INTO v_count;
    RETURN QUERY SELECT true, v_count, p_cap;
  END IF;
END;
$$;

-- =====================================================
-- 2. RPC: should_pause_discovery (back-pressure check)
-- =====================================================
-- Devuelve true si pending_schedules > max_pending_schedules_back_pressure setting.
-- Used by chief-discover-and-queue to skip discovery cycles when queue is saturated.
-- =====================================================
CREATE OR REPLACE FUNCTION public.should_pause_discovery(p_org_id UUID)
RETURNS TABLE (should_pause BOOLEAN, pending_count INT, threshold INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_threshold INT;
  v_pending INT;
BEGIN
  -- Get threshold from settings
  SELECT max_pending_schedules_back_pressure INTO v_threshold
  FROM public.org_chief_settings
  WHERE org_id = p_org_id;

  v_threshold := COALESCE(v_threshold, 200);

  -- Count pending + processing schedules across all cadences for this org
  SELECT count(*) INTO v_pending
  FROM public.schedules
  WHERE org_id = p_org_id
    AND status IN ('scheduled', 'processing', 'hold_for_review');

  RETURN QUERY SELECT v_pending > v_threshold, v_pending, v_threshold;
END;
$$;

-- =====================================================
-- 3. Index para acelerar back-pressure check
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_schedules_org_status_pending
  ON public.schedules(org_id, status)
  WHERE status IN ('scheduled', 'processing', 'hold_for_review');

-- Index para que email_invalid lookups sean rápidos en process-queue
CREATE INDEX IF NOT EXISTS idx_leads_email_invalid
  ON public.leads(id, email_invalid)
  WHERE email_invalid = true;

-- =====================================================
-- 4. Helper: mark_lead_email_invalid
-- =====================================================
-- Atomically marks a lead's email as invalid + skips pending email steps.
-- Called from send-email when Gmail returns 550/553 bounce codes.
-- =====================================================
CREATE OR REPLACE FUNCTION public.mark_lead_email_invalid(
  p_lead_id UUID,
  p_bounce_reason TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Mark lead
  UPDATE public.leads
  SET email_invalid = true,
      last_bounce_at = NOW(),
      bounce_reason = LEFT(p_bounce_reason, 500),
      updated_at = NOW()
  WHERE id = p_lead_id;

  -- Cancel pending email schedules for this lead (Day 5 email_reply, Day 9 BC email)
  UPDATE public.schedules
  SET status = 'skipped_due_to_state_change',
      last_error = 'email_invalid: ' || LEFT(p_bounce_reason, 200),
      updated_at = NOW()
  WHERE lead_id = p_lead_id
    AND status IN ('scheduled', 'hold_for_review')
    AND cadence_step_id IN (
      SELECT id FROM public.cadence_steps
      WHERE step_type IN ('send_email', 'email_reply')
    );

  RAISE NOTICE 'Lead % marked email_invalid, pending email schedules cancelled', p_lead_id;
END;
$$;

-- =====================================================
-- 5. Resumen
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '✓ Migration 110 (Fase 8 safety rails) applied:';
  RAISE NOTICE '  - increment_if_under_cap(org, action_type, cap): atomic LinkedIn cap enforcement';
  RAISE NOTICE '  - should_pause_discovery(org): back-pressure check (pending > 200 → pause)';
  RAISE NOTICE '  - mark_lead_email_invalid(lead, reason): bounce handling + cancel pending email steps';
  RAISE NOTICE '  - 2 indexes for fast lookups';
END $$;
