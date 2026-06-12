-- ============================================================================
-- Migration 115: LinkedIn weekly message cap (150/week per LinkedIn account)
-- ============================================================================
-- LinkedIn enforces ~150 DMs/week per account (server-side limit). Daily cap
-- (70 actions/day) covers connects+comments+likes+messages combined; we need
-- a separate weekly counter SPECIFICALLY for linkedin_message to:
--   1. Prevent the account from being throttled by LinkedIn
--   2. Reschedule Day 3 / Day 7 DMs to next Monday if cap hit (not next day —
--      daily reset doesn't help when weekly is full)
--   3. Pause discovery when projected weekly DM count would exceed cap
-- ============================================================================

-- =====================================================
-- 1. Settings: max_linkedin_messages_per_week (default 150)
-- =====================================================
ALTER TABLE public.org_chief_settings
  ADD COLUMN IF NOT EXISTS max_linkedin_messages_per_week INT NOT NULL DEFAULT 150;

UPDATE public.org_chief_settings
SET max_linkedin_messages_per_week = 150
WHERE max_linkedin_messages_per_week IS NULL;

-- =====================================================
-- 2. RPC: check_weekly_linkedin_message_cap (read-only)
-- =====================================================
-- Returns whether the org is under the weekly DM cap (Mon-Sun ISO week).
-- Used by process-queue BEFORE attempting a linkedin_message send.
-- =====================================================
CREATE OR REPLACE FUNCTION public.check_weekly_linkedin_message_cap(
  p_org_id UUID,
  p_cap INT DEFAULT NULL
) RETURNS TABLE (under_cap BOOLEAN, current_count INT, cap_value INT, week_start DATE, week_end DATE)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cap INT;
  v_count INT;
  v_week_start DATE;
  v_week_end DATE;
BEGIN
  v_week_start := date_trunc('week', CURRENT_DATE)::DATE;  -- Monday
  v_week_end := v_week_start + INTERVAL '6 days';

  -- Resolve cap from settings if not passed
  IF p_cap IS NULL THEN
    SELECT max_linkedin_messages_per_week INTO v_cap
    FROM public.org_chief_settings
    WHERE org_id = p_org_id;
    v_cap := COALESCE(v_cap, 150);
  ELSE
    v_cap := p_cap;
  END IF;

  -- Sum linkedin_message counters across the current ISO week
  SELECT COALESCE(SUM(count), 0) INTO v_count
  FROM public.daily_action_counters
  WHERE org_id = p_org_id
    AND action_type = 'linkedin_message'
    AND action_date >= v_week_start
    AND action_date <= v_week_end;

  RETURN QUERY SELECT v_count < v_cap, v_count, v_cap, v_week_start, v_week_end;
END;
$$;

-- =====================================================
-- 3. RPC: increment_weekly_linkedin_message (atomic)
-- =====================================================
-- Atomic check-and-increment for linkedin_message counter (today's row).
-- Returns allowed=false if the weekly sum would exceed cap.
-- Pattern: same as increment_if_under_cap but week-scoped check before
-- incrementing today's daily row.
-- =====================================================
CREATE OR REPLACE FUNCTION public.increment_weekly_linkedin_message(
  p_org_id UUID,
  p_cap INT DEFAULT NULL
) RETURNS TABLE (allowed BOOLEAN, weekly_count INT, cap_value INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cap INT;
  v_weekly INT;
  v_week_start DATE;
BEGIN
  v_week_start := date_trunc('week', CURRENT_DATE)::DATE;

  IF p_cap IS NULL THEN
    SELECT max_linkedin_messages_per_week INTO v_cap
    FROM public.org_chief_settings
    WHERE org_id = p_org_id;
    v_cap := COALESCE(v_cap, 150);
  ELSE
    v_cap := p_cap;
  END IF;

  -- Ensure today's row exists (separate from linkedin_total)
  INSERT INTO public.daily_action_counters (org_id, action_date, action_type, count)
  VALUES (p_org_id, CURRENT_DATE, 'linkedin_message', 0)
  ON CONFLICT (org_id, action_date, action_type) DO NOTHING;

  -- Lock the week aggregate by locking the FOR UPDATE on today's row
  PERFORM 1 FROM public.daily_action_counters
  WHERE org_id = p_org_id AND action_date = CURRENT_DATE AND action_type = 'linkedin_message'
  FOR UPDATE;

  -- Sum the week
  SELECT COALESCE(SUM(count), 0) INTO v_weekly
  FROM public.daily_action_counters
  WHERE org_id = p_org_id
    AND action_type = 'linkedin_message'
    AND action_date >= v_week_start;

  IF v_weekly + 1 > v_cap THEN
    RETURN QUERY SELECT false, v_weekly, v_cap;
  ELSE
    UPDATE public.daily_action_counters
    SET count = count + 1, updated_at = NOW()
    WHERE org_id = p_org_id AND action_date = CURRENT_DATE AND action_type = 'linkedin_message';

    SELECT COALESCE(SUM(count), 0) INTO v_weekly
    FROM public.daily_action_counters
    WHERE org_id = p_org_id
      AND action_type = 'linkedin_message'
      AND action_date >= v_week_start;

    RETURN QUERY SELECT true, v_weekly, v_cap;
  END IF;
END;
$$;

-- =====================================================
-- 4. Update should_pause_discovery — also consider projected weekly DMs
-- =====================================================
-- Adds outputs: weekly_dms_used, weekly_dm_cap, pending_dm_schedules, reason.
-- Pauses if EITHER pending_count > threshold OR weekly DM count + pending DM
-- schedules >= weekly cap. (Drops + recreates because return type changed.)
-- =====================================================
DROP FUNCTION IF EXISTS public.should_pause_discovery(UUID);

CREATE OR REPLACE FUNCTION public.should_pause_discovery(p_org_id UUID)
RETURNS TABLE (
  should_pause BOOLEAN,
  pending_count INT,
  threshold INT,
  weekly_dms_used INT,
  weekly_dm_cap INT,
  pending_dm_schedules INT,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_threshold INT;
  v_pending INT;
  v_weekly_cap INT;
  v_weekly_used INT;
  v_pending_dms INT;
  v_week_start DATE;
  v_should_pause BOOLEAN := false;
  v_reason TEXT := 'ok';
BEGIN
  v_week_start := date_trunc('week', CURRENT_DATE)::DATE;

  -- Pull thresholds
  SELECT max_pending_schedules_back_pressure, max_linkedin_messages_per_week
    INTO v_threshold, v_weekly_cap
  FROM public.org_chief_settings
  WHERE org_id = p_org_id;

  v_threshold := COALESCE(v_threshold, 200);
  v_weekly_cap := COALESCE(v_weekly_cap, 150);

  -- Pending schedules count (existing behavior)
  SELECT count(*) INTO v_pending
  FROM public.schedules
  WHERE org_id = p_org_id
    AND status IN ('scheduled', 'processing', 'hold_for_review');

  -- Weekly DM count (already executed this ISO week)
  SELECT COALESCE(SUM(count), 0) INTO v_weekly_used
  FROM public.daily_action_counters
  WHERE org_id = p_org_id
    AND action_type = 'linkedin_message'
    AND action_date >= v_week_start;

  -- Pending DM schedules (Day 3 + Day 7 of active cadences) that will fire this week
  SELECT count(*) INTO v_pending_dms
  FROM public.schedules s
  JOIN public.cadence_steps cs ON s.cadence_step_id = cs.id
  WHERE s.org_id = p_org_id
    AND s.status IN ('scheduled', 'processing')
    AND cs.step_type = 'linkedin_message'
    AND s.scheduled_at < (v_week_start + INTERVAL '7 days');

  IF v_pending > v_threshold THEN
    v_should_pause := true;
    v_reason := 'pending_schedules_too_high';
  ELSIF (v_weekly_used + v_pending_dms) >= v_weekly_cap THEN
    v_should_pause := true;
    v_reason := 'weekly_dm_cap_projection_exceeded';
  END IF;

  RETURN QUERY SELECT v_should_pause, v_pending, v_threshold,
                      v_weekly_used, v_weekly_cap, v_pending_dms, v_reason;
END;
$$;

-- =====================================================
-- 5. Helper: next_monday_9am_et — used by process-queue when rescheduling
-- =====================================================
-- Returns the next Monday 09:00 America/New_York (with optional jitter 0-29 min).
-- Used by process-queue when weekly DM cap is hit: pushing to "tomorrow" doesn't
-- help if weekly is full; need to wait until ISO week reset (Monday 00:00).
-- =====================================================
CREATE OR REPLACE FUNCTION public.next_monday_9am_et()
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_now DATE := (NOW() AT TIME ZONE 'America/New_York')::DATE;
  v_dow INT := EXTRACT(DOW FROM v_now)::INT;  -- 0=Sun, 1=Mon, ..., 6=Sat
  v_days_until_monday INT;
  v_target TIMESTAMPTZ;
BEGIN
  -- If today is Monday, push to NEXT Monday (current Monday's window is the
  -- one we presumably just exhausted)
  IF v_dow = 1 THEN
    v_days_until_monday := 7;
  ELSIF v_dow = 0 THEN
    v_days_until_monday := 1;  -- Sunday → tomorrow
  ELSE
    v_days_until_monday := 8 - v_dow;  -- Tue=6, Wed=5, ..., Sat=2
  END IF;

  v_target := ((v_now + v_days_until_monday * INTERVAL '1 day')::TIMESTAMP + INTERVAL '9 hours')
              AT TIME ZONE 'America/New_York';

  RETURN v_target;
END;
$$;

-- =====================================================
-- 6. Resumen
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '✓ Migration 115 (LinkedIn weekly DM cap) applied:';
  RAISE NOTICE '  - org_chief_settings.max_linkedin_messages_per_week (default 150)';
  RAISE NOTICE '  - RPC check_weekly_linkedin_message_cap(org, cap?) — read-only';
  RAISE NOTICE '  - RPC increment_weekly_linkedin_message(org, cap?) — atomic';
  RAISE NOTICE '  - RPC should_pause_discovery extended w/ weekly DM projection';
  RAISE NOTICE '  - Helper next_monday_9am_et() for weekly reschedule target';
END $$;
