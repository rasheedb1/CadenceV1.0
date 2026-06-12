-- ============================================================================
-- Migration 108: Carlos V2 — schema extensions for scoring + shadow mode
-- ============================================================================
-- Aplica las 10 mejoras del peer review:
--   - 3 dims (Relevance, Quality, Voice) en lugar de 5
--   - quality_score 0-10 con dead band 7.2-7.8
--   - regenerate_hint enum cerrado (7 valores)
--   - risk_triggers array (yuno_as_replacement, pricing_comparison, etc)
--   - shadow mode flag (Carlos V2 evalúa pero no actúa por 2 semanas)
--   - prompt_version pinning durante regen
-- ============================================================================

-- =====================================================
-- 1. Extend qa_supervisor_decisions
-- =====================================================
ALTER TABLE public.qa_supervisor_decisions
  ADD COLUMN IF NOT EXISTS quality_score NUMERIC(3,1),
  ADD COLUMN IF NOT EXISTS scoring_breakdown JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS feedback TEXT,
  ADD COLUMN IF NOT EXISTS regenerate_hint_enum TEXT,
  ADD COLUMN IF NOT EXISTS risk_triggers TEXT[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS prompt_version TEXT,
  ADD COLUMN IF NOT EXISTS pre_flight_failed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pre_flight_failures TEXT[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS shadow_mode BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS would_have_decided TEXT;  -- en shadow mode: qué habría decidido Carlos V2

-- Constraint: regenerate_hint_enum solo acepta valores válidos
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'qa_supervisor_decisions_hint_enum_check') THEN
    ALTER TABLE public.qa_supervisor_decisions
      ADD CONSTRAINT qa_supervisor_decisions_hint_enum_check
      CHECK (regenerate_hint_enum IS NULL OR regenerate_hint_enum IN (
        'shorter', 'more_specific', 'different_angle', 'different_signal',
        'fix_structure', 'soften_tone', 'add_proof_point'
      ));
  END IF;
END $$;

-- Index para queries de shadow mode comparison
CREATE INDEX IF NOT EXISTS idx_qa_supervisor_decisions_shadow
  ON public.qa_supervisor_decisions(org_id, shadow_mode, created_at DESC)
  WHERE shadow_mode = true;

-- =====================================================
-- 2. Extend org_chief_settings con shadow mode flag
-- =====================================================
ALTER TABLE public.org_chief_settings
  ADD COLUMN IF NOT EXISTS qa_shadow_mode_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS qa_threshold NUMERIC(3,1) NOT NULL DEFAULT 7.5,
  ADD COLUMN IF NOT EXISTS qa_dead_band_width NUMERIC(3,1) NOT NULL DEFAULT 0.3,
  ADD COLUMN IF NOT EXISTS qa_shadow_started_at TIMESTAMPTZ;

-- Inicializar shadow mode active para org existente
UPDATE public.org_chief_settings
SET qa_shadow_mode_active = true,
    qa_shadow_started_at = NOW()
WHERE org_id = '553315b5-42d0-4518-a461-e4cb12914c54'
  AND qa_shadow_started_at IS NULL;

-- =====================================================
-- 3. Tune step_type_circuit_breaker (rolling 24h + min 20 samples)
-- =====================================================
ALTER TABLE public.step_type_circuit_breaker
  ADD COLUMN IF NOT EXISTS min_samples_to_trip INT NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS window_hours INT NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS window_started_at TIMESTAMPTZ DEFAULT NOW();

-- Reset window helper: resets counters si ventana > window_hours
CREATE OR REPLACE FUNCTION public.reset_circuit_breaker_window_if_stale(
  p_org_id UUID,
  p_cadence_id UUID,
  p_step_type TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_started TIMESTAMPTZ;
  v_window_hrs INT;
BEGIN
  SELECT window_started_at, window_hours INTO v_started, v_window_hrs
  FROM public.step_type_circuit_breaker
  WHERE org_id = p_org_id AND cadence_id = p_cadence_id AND step_type = p_step_type;

  IF v_started IS NOT NULL AND NOW() - v_started > make_interval(hours => v_window_hrs) THEN
    -- Stale window: reset counters
    UPDATE public.step_type_circuit_breaker
    SET reviews_in_window = 0,
        approvals_in_window = 0,
        regens_in_window = 0,
        rejects_in_window = 0,
        escalates_in_window = 0,
        window_started_at = NOW(),
        status = CASE WHEN status = 'tripped' THEN 'closed' ELSE status END,
        tripped_at = NULL,
        tripped_reason = NULL
    WHERE org_id = p_org_id AND cadence_id = p_cadence_id AND step_type = p_step_type;
  END IF;
END;
$$;

-- =====================================================
-- 4. View para shadow mode comparison (V1 vs V2)
-- =====================================================
CREATE OR REPLACE VIEW public.qa_shadow_comparison AS
SELECT
  r.step_type,
  count(*) FILTER (WHERE d.shadow_mode = false) as v1_decisions,
  count(*) FILTER (WHERE d.shadow_mode = true) as v2_decisions,
  count(*) FILTER (WHERE d.shadow_mode = false AND d.decision = 'auto_approve') as v1_approves,
  count(*) FILTER (WHERE d.shadow_mode = true AND d.would_have_decided = 'auto_approve') as v2_approves,
  count(*) FILTER (WHERE d.shadow_mode = true AND d.decision != d.would_have_decided) as v1_v2_disagreements,
  avg(d.quality_score) FILTER (WHERE d.shadow_mode = true) as v2_avg_score,
  sum(d.llm_cost_usd) FILTER (WHERE d.shadow_mode = false) as v1_cost,
  sum(d.llm_cost_usd) FILTER (WHERE d.shadow_mode = true) as v2_cost
FROM public.qa_supervisor_decisions d
JOIN public.message_qa_reviews r ON r.id = d.review_id
WHERE d.created_at > NOW() - INTERVAL '14 days'
GROUP BY r.step_type;

-- =====================================================
-- 5. Resumen
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '✓ Migration 108 (Carlos V2 schema) applied:';
  RAISE NOTICE '  - qa_supervisor_decisions: +9 cols (score, breakdown, hint_enum, risk_triggers, etc)';
  RAISE NOTICE '  - org_chief_settings: +4 cols (qa_shadow_mode_active=true, qa_threshold=7.5, dead_band=0.3)';
  RAISE NOTICE '  - step_type_circuit_breaker: +3 cols (rolling window 24h, min 20 samples)';
  RAISE NOTICE '  - view qa_shadow_comparison: V1 vs V2 metrics for cutover decision';
END $$;
