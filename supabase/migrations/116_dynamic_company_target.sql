-- ============================================================================
-- Migration 116: Dynamic discovery target — derive companies/day from weekly DM budget
-- ============================================================================
-- Filosofía: en vez de reschedule reactivo cuando linkedin_message hit weekly
-- cap, descubrir MENOS empresas a priori — computamos cuántas caben dado el
-- presupuesto semanal de DMs restante.
--
-- Math base:
--   daily_target_companies × max_emails_per_company × 2 DMs/lead × 5 días ≤ weekly_cap
--   → daily_target_companies ≤ weekly_cap / (max_emails × 10)
--   → con cap=150, max_emails=15: 150 / 150 = 1 empresa/día
-- ============================================================================

-- =====================================================
-- 1. RPC: compute_safe_discovery_target
-- =====================================================
-- Calcula el número máximo seguro de empresas a descubrir EN ESTE RUN
-- considerando:
--   • Presupuesto semanal de DMs restante (cap - executed - pending)
--   • Asunción: cada lead = 2 DMs (Day 3 + Day 7)
--   • Asunción: cada empresa rinde max_emails_per_company leads (worst case)
--   • Setting daily_target_companies como techo absoluto
--   • Petición explícita del caller (Weekly Refill workflow puede pedir más)
--
-- safe_target = MIN(
--   floor(dm_budget / 2 / max_emails),  -- dynamic cap
--   daily_target_companies,             -- settings cap
--   explicit_request                    -- caller hint
-- )
-- =====================================================
CREATE OR REPLACE FUNCTION public.compute_safe_discovery_target(
  p_org_id UUID,
  p_explicit_request INT DEFAULT NULL
)
RETURNS TABLE (
  safe_target INT,
  weekly_dm_cap INT,
  weekly_dms_used INT,
  pending_dm_schedules INT,
  weekly_dm_budget_remaining INT,
  max_leads_per_company INT,
  daily_target_setting INT,
  reasoning TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_weekly_cap INT;
  v_weekly_used INT;
  v_pending_dms INT;
  v_max_emails INT;
  v_daily_target INT;
  v_dms_per_lead CONSTANT INT := 2;
  v_dm_budget INT;
  v_lead_budget INT;
  v_company_budget INT;
  v_safe INT;
  v_week_start DATE := date_trunc('week', CURRENT_DATE)::DATE;
  v_reasoning TEXT;
BEGIN
  SELECT max_linkedin_messages_per_week,
         max_emails_per_company,
         daily_target_companies
    INTO v_weekly_cap, v_max_emails, v_daily_target
  FROM public.org_chief_settings
  WHERE org_id = p_org_id;

  v_weekly_cap   := COALESCE(v_weekly_cap, 150);
  v_max_emails   := COALESCE(v_max_emails, 15);
  v_daily_target := COALESCE(v_daily_target, 1);

  -- Executed DMs this ISO week
  SELECT COALESCE(SUM(count), 0) INTO v_weekly_used
  FROM public.daily_action_counters
  WHERE org_id = p_org_id
    AND action_type = 'linkedin_message'
    AND action_date >= v_week_start;

  -- Pending DM schedules firing this week
  SELECT count(*) INTO v_pending_dms
  FROM public.schedules s
  JOIN public.cadence_steps cs ON s.cadence_step_id = cs.id
  WHERE s.org_id = p_org_id
    AND s.status IN ('scheduled', 'processing')
    AND cs.step_type = 'linkedin_message'
    AND s.scheduled_at < (v_week_start + INTERVAL '7 days');

  v_dm_budget     := GREATEST(v_weekly_cap - v_weekly_used - v_pending_dms, 0);
  v_lead_budget   := v_dm_budget / v_dms_per_lead;
  v_company_budget:= CASE WHEN v_max_emails > 0 THEN v_lead_budget / v_max_emails ELSE 0 END;

  -- Safe target = min of all caps
  v_safe := v_company_budget;
  IF p_explicit_request IS NOT NULL AND p_explicit_request < v_safe THEN
    v_safe := p_explicit_request;
  END IF;
  IF v_daily_target < v_safe THEN
    v_safe := v_daily_target;
  END IF;
  v_safe := GREATEST(v_safe, 0);

  v_reasoning := format(
    'budget=%s DMs (cap %s − used %s − pending %s) → %s leads (÷%s DMs/lead) → %s companies (÷%s leads/co); daily_setting=%s; explicit=%s; safe=%s',
    v_dm_budget, v_weekly_cap, v_weekly_used, v_pending_dms,
    v_lead_budget, v_dms_per_lead, v_company_budget, v_max_emails,
    v_daily_target, COALESCE(p_explicit_request::text, 'null'), v_safe
  );

  RETURN QUERY SELECT v_safe, v_weekly_cap, v_weekly_used, v_pending_dms,
                      v_dm_budget, v_max_emails, v_daily_target, v_reasoning;
END;
$$;

-- =====================================================
-- 2. Lower default daily_target_companies 5 → 1
-- =====================================================
ALTER TABLE public.org_chief_settings
  ALTER COLUMN daily_target_companies SET DEFAULT 1;

UPDATE public.org_chief_settings
SET daily_target_companies = 1, updated_at = NOW()
WHERE org_id = '553315b5-42d0-4518-a461-e4cb12914c54'
  AND daily_target_companies = 5;

-- =====================================================
-- 3. Resumen
-- =====================================================
DO $$
DECLARE
  v_test RECORD;
BEGIN
  RAISE NOTICE '✓ Migration 116 (dynamic company target) applied:';
  RAISE NOTICE '  - RPC compute_safe_discovery_target(org, explicit_request?)';
  RAISE NOTICE '  - daily_target_companies default 5 → 1';
  RAISE NOTICE '  - rasheedbayter''s Team setting updated 5 → 1';

  -- Quick math demo
  SELECT * INTO v_test FROM compute_safe_discovery_target('553315b5-42d0-4518-a461-e4cb12914c54');
  RAISE NOTICE '  Live computation: safe_target=% (%)', v_test.safe_target, v_test.reasoning;
END $$;
