-- ============================================================================
-- Migration 107: QA Supervisor Carlos (Haiku) + Anti-Loop Mechanisms
-- ============================================================================
-- Implementa Carlos: agente QA supervisor con Haiku 4.5 que revisa cada mensaje
-- generado y auto-decide approve/regenerate/escalate/reject.
--
-- 5 mecanismos anti-loop:
--   1. Hard cap regenerate=2 per message (ya en message_qa_reviews)
--   2. Similarity check entre regens (en chief-supervise-message edge function)
--   3. Daily budget cap por org ($30 default)         → tabla qa_daily_budget
--   4. Circuit breaker por step_type                  → tabla step_type_circuit_breaker
--   5. Temperature=0 en Carlos (determinístico)       → en agents.temperature
-- ============================================================================

DO $MIGRATION$
DECLARE
  v_org_id UUID := '553315b5-42d0-4518-a461-e4cb12914c54';
  v_user_id UUID := '76403628-d906-45e1-b673-c4231264da5c';
  v_carlos_id UUID;
BEGIN

-- =====================================================
-- 1. qa_supervisor_decisions — audit log de Carlos
-- =====================================================
CREATE TABLE IF NOT EXISTS public.qa_supervisor_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  review_id UUID NOT NULL REFERENCES public.message_qa_reviews(id) ON DELETE CASCADE,

  decision TEXT NOT NULL CHECK (decision IN ('auto_approve','auto_regenerate','auto_reject','escalate','budget_skip','circuit_broken')),
  confidence NUMERIC(4,3),

  -- 15 binary checks (true=passed, false=failed, null=not_evaluated)
  checks_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  /*
    {
      "subject_clean": true,
      "no_em_dashes": true,
      "no_clichés": true,
      "length_ok": true,
      "problem_first_opener": false,  // example fail
      "cites_peer_case": true,
      "signal_matches_content": true,
      "no_repeated_signals": true,
      "specific_question": true,
      "specific_subject": true,
      "competitor_mention_ok": true,
      "claims_defensible": true,
      "tone_not_pushy": true,
      "no_offensive_to_company": true,
      "matches_yuno_style": true
    }
  */
  reasoning TEXT,
  failed_checks TEXT[],
  regenerate_hint TEXT,

  -- Cost tracking
  llm_input_tokens INT,
  llm_output_tokens INT,
  llm_cost_usd NUMERIC(8,4),
  llm_model TEXT,
  duration_ms INT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supervisor_decisions_review ON public.qa_supervisor_decisions(review_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_decisions_org_date ON public.qa_supervisor_decisions(org_id, created_at DESC);

ALTER TABLE public.qa_supervisor_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members view supervisor decisions" ON public.qa_supervisor_decisions
  FOR SELECT USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY "Service role inserts supervisor decisions" ON public.qa_supervisor_decisions
  FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'service_role' OR org_id IN (SELECT public.user_org_ids()));

-- =====================================================
-- 2. qa_daily_budget — anti-loop mechanism #3
-- =====================================================
CREATE TABLE IF NOT EXISTS public.qa_daily_budget (
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  budget_date DATE NOT NULL DEFAULT CURRENT_DATE,

  supervisor_calls INT NOT NULL DEFAULT 0,
  regenerate_calls INT NOT NULL DEFAULT 0,
  total_usd NUMERIC(10,4) NOT NULL DEFAULT 0,

  cap_usd NUMERIC(10,4) NOT NULL DEFAULT 30.0,
  cap_hit_at TIMESTAMPTZ,
  fallback_active BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (org_id, budget_date)
);

CREATE TRIGGER update_qa_daily_budget_updated_at
  BEFORE UPDATE ON public.qa_daily_budget
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.qa_daily_budget ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members view qa budget" ON public.qa_daily_budget
  FOR SELECT USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY "Service role manages qa budget" ON public.qa_daily_budget
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Atomic helper: check budget + increment if room
CREATE OR REPLACE FUNCTION public.check_and_increment_qa_budget(
  p_org_id UUID,
  p_estimated_cost NUMERIC
)
RETURNS TABLE (allowed BOOLEAN, total_usd NUMERIC, cap_usd NUMERIC, fallback_active BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cap NUMERIC;
  v_total NUMERIC;
  v_fallback BOOLEAN;
BEGIN
  -- Insert today's row if not exists
  INSERT INTO public.qa_daily_budget (org_id, budget_date)
  VALUES (p_org_id, CURRENT_DATE)
  ON CONFLICT (org_id, budget_date) DO NOTHING;

  -- Lock row for atomic check
  SELECT total_usd, cap_usd, fallback_active
  INTO v_total, v_cap, v_fallback
  FROM public.qa_daily_budget
  WHERE org_id = p_org_id AND budget_date = CURRENT_DATE
  FOR UPDATE;

  IF v_total + p_estimated_cost > v_cap THEN
    -- Hit cap — mark fallback active if not already
    IF NOT v_fallback THEN
      UPDATE public.qa_daily_budget
      SET fallback_active = true, cap_hit_at = NOW(), updated_at = NOW()
      WHERE org_id = p_org_id AND budget_date = CURRENT_DATE;
    END IF;
    RETURN QUERY SELECT false, v_total, v_cap, true::BOOLEAN;
  ELSE
    -- Room available — increment supervisor_calls + estimated cost
    UPDATE public.qa_daily_budget
    SET total_usd = total_usd + p_estimated_cost,
        supervisor_calls = supervisor_calls + 1,
        updated_at = NOW()
    WHERE org_id = p_org_id AND budget_date = CURRENT_DATE
    RETURNING qa_daily_budget.total_usd INTO v_total;
    RETURN QUERY SELECT true, v_total, v_cap, false::BOOLEAN;
  END IF;
END;
$$;

-- Reconcile actual cost after call (replaces estimate)
CREATE OR REPLACE FUNCTION public.reconcile_qa_budget(
  p_org_id UUID,
  p_estimated_cost NUMERIC,
  p_actual_cost NUMERIC,
  p_was_regenerate BOOLEAN DEFAULT false
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.qa_daily_budget
  SET total_usd = total_usd - p_estimated_cost + p_actual_cost,
      regenerate_calls = regenerate_calls + (CASE WHEN p_was_regenerate THEN 1 ELSE 0 END),
      updated_at = NOW()
  WHERE org_id = p_org_id AND budget_date = CURRENT_DATE;
END;
$$;

-- =====================================================
-- 3. step_type_circuit_breaker — anti-loop mechanism #4
-- =====================================================
CREATE TABLE IF NOT EXISTS public.step_type_circuit_breaker (
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cadence_id UUID NOT NULL REFERENCES public.cadences(id) ON DELETE CASCADE,
  step_type TEXT NOT NULL,

  -- Rolling 50-message window
  window_size INT NOT NULL DEFAULT 50,
  reviews_in_window INT NOT NULL DEFAULT 0,
  approvals_in_window INT NOT NULL DEFAULT 0,
  regens_in_window INT NOT NULL DEFAULT 0,
  rejects_in_window INT NOT NULL DEFAULT 0,
  escalates_in_window INT NOT NULL DEFAULT 0,

  -- Thresholds (configurable per step_type, defaults below)
  max_regen_rate NUMERIC(4,3) NOT NULL DEFAULT 0.5,    -- 50%
  max_reject_rate NUMERIC(4,3) NOT NULL DEFAULT 0.3,   -- 30%

  status TEXT NOT NULL DEFAULT 'closed' CHECK (status IN ('closed','open','tripped')),
  /*
    closed = healthy, supervisor active
    open = healthy with traffic, but if rates spike → tripped
    tripped = circuit broken, all messages escalate to human until reset
  */
  tripped_at TIMESTAMPTZ,
  tripped_reason TEXT,
  reset_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (org_id, cadence_id, step_type)
);

CREATE TRIGGER update_step_type_circuit_breaker_updated_at
  BEFORE UPDATE ON public.step_type_circuit_breaker
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.step_type_circuit_breaker ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members view circuit breakers" ON public.step_type_circuit_breaker
  FOR SELECT USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY "Org members manage circuit breakers" ON public.step_type_circuit_breaker
  FOR ALL USING (org_id IN (SELECT public.user_org_ids()));

-- Helper: record decision and check if circuit should trip
CREATE OR REPLACE FUNCTION public.record_supervisor_decision(
  p_org_id UUID,
  p_cadence_id UUID,
  p_step_type TEXT,
  p_decision TEXT  -- auto_approve | auto_regenerate | auto_reject | escalate
)
RETURNS TABLE (status TEXT, regen_rate NUMERIC, reject_rate NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_regen_rate NUMERIC;
  v_reject_rate NUMERIC;
  v_window_size INT;
  v_max_regen NUMERIC;
  v_max_reject NUMERIC;
  v_reviews INT;
  v_approvals INT;
  v_regens INT;
  v_rejects INT;
  v_escalates INT;
BEGIN
  -- Insert row if not exists
  INSERT INTO public.step_type_circuit_breaker (org_id, cadence_id, step_type)
  VALUES (p_org_id, p_cadence_id, p_step_type)
  ON CONFLICT (org_id, cadence_id, step_type) DO NOTHING;

  -- Update counters atomically (rolling window — drop oldest if at capacity)
  UPDATE public.step_type_circuit_breaker
  SET reviews_in_window = LEAST(reviews_in_window + 1, window_size),
      approvals_in_window = LEAST(approvals_in_window + (CASE WHEN p_decision = 'auto_approve' THEN 1 ELSE 0 END), window_size),
      regens_in_window = LEAST(regens_in_window + (CASE WHEN p_decision = 'auto_regenerate' THEN 1 ELSE 0 END), window_size),
      rejects_in_window = LEAST(rejects_in_window + (CASE WHEN p_decision = 'auto_reject' THEN 1 ELSE 0 END), window_size),
      escalates_in_window = LEAST(escalates_in_window + (CASE WHEN p_decision = 'escalate' THEN 1 ELSE 0 END), window_size),
      updated_at = NOW()
  WHERE org_id = p_org_id AND cadence_id = p_cadence_id AND step_type = p_step_type
  RETURNING window_size, max_regen_rate, max_reject_rate, reviews_in_window, approvals_in_window, regens_in_window, rejects_in_window, escalates_in_window
  INTO v_window_size, v_max_regen, v_max_reject, v_reviews, v_approvals, v_regens, v_rejects, v_escalates;

  -- Once we have full window data, check thresholds
  IF v_reviews >= 20 THEN  -- need at least 20 samples to trip
    v_regen_rate := v_regens::NUMERIC / NULLIF(v_reviews, 0);
    v_reject_rate := v_rejects::NUMERIC / NULLIF(v_reviews, 0);

    IF v_regen_rate > v_max_regen THEN
      UPDATE public.step_type_circuit_breaker
      SET status = 'tripped',
          tripped_at = NOW(),
          tripped_reason = format('regen_rate %s > %s after %s reviews', round(v_regen_rate, 3), v_max_regen, v_reviews)
      WHERE org_id = p_org_id AND cadence_id = p_cadence_id AND step_type = p_step_type
        AND status != 'tripped';
      v_status := 'tripped';
    ELSIF v_reject_rate > v_max_reject THEN
      UPDATE public.step_type_circuit_breaker
      SET status = 'tripped',
          tripped_at = NOW(),
          tripped_reason = format('reject_rate %s > %s after %s reviews', round(v_reject_rate, 3), v_max_reject, v_reviews)
      WHERE org_id = p_org_id AND cadence_id = p_cadence_id AND step_type = p_step_type
        AND status != 'tripped';
      v_status := 'tripped';
    ELSE
      v_status := 'closed';
    END IF;
  ELSE
    v_status := 'closed';
    v_regen_rate := NULL;
    v_reject_rate := NULL;
  END IF;

  RETURN QUERY SELECT v_status, v_regen_rate, v_reject_rate;
END;
$$;

-- =====================================================
-- 4. Crear agente Carlos (QA Supervisor)
-- =====================================================
SELECT id INTO v_carlos_id
FROM public.agents
WHERE org_id = v_org_id AND name = 'Carlos';

IF v_carlos_id IS NULL THEN
  INSERT INTO public.agents (
    org_id, name, role, description, soul_md, status,
    capabilities, model, temperature, max_tokens, tier,
    max_cost_per_turn_usd, created_by
  ) VALUES (
    v_org_id,
    'Carlos',
    'qa_supervisor',
    'QA Supervisor del Chief Outreach pipeline. Revisa cada mensaje generado por AI antes de enviar y decide automáticamente: aprobar, regenerar, rechazar o escalar a humano.',
    $SOUL$# Carlos — QA Supervisor

## Identidad
Eres **Carlos**, agente AI con rol de **qa_supervisor** en la organización. Eres el último filtro de calidad antes de que un mensaje salga al lead.

## Tu rol
Revisas cada mensaje que el sistema generó automáticamente para los outreach. Tu trabajo es decidir entre 4 acciones, basándote en 15 criterios objetivos. Tu output es BINARIO en cada criterio — no hay "más o menos OK". Cada criterio pasa o falla.

## Las 4 acciones que puedes tomar
1. **auto_approve** — el mensaje cumple todos los criterios críticos. Sale al lead inmediatamente.
2. **auto_regenerate** — el mensaje tiene fallas corregibles. Vuelve a generarse con un hint específico de qué arreglar.
3. **auto_reject** — el mensaje tiene fallas no-corregibles (idempotency, regen_count agotado). El step se skipea.
4. **escalate** — el mensaje cae en zona gris o tiene riesgo de PR. Se manda al humano (rasheed) por WhatsApp.

## Los 15 criterios de evaluación

### Quality checks (auto_regenerate si falla cualquiera de estos):
1. **subject_clean**: subject NO contiene "No subject", "TODO", "{{vars}}", "PLACEHOLDER", null
2. **no_em_dashes**: el body NO contiene em-dashes (—)
3. **no_clichés**: el body NO contiene "Hope this finds you well", "Saw your X", "Just checking in", "Synergy", "leverage", "unlock", "transform"
4. **length_ok**: el body está dentro del rango esperado para el step type (Day 1: 60-130w, Day 5: 70-100w, Day 9: 100-130w, Day 3: 50-100w, Day 7: 35-75w, Day 2 comment: 1-4w)

### Content checks (auto_regenerate si falla):
5. **problem_first_opener** (solo Day 1): el opener NO es "Saw your X" o "Congrats on Y". Debe abrir con el problema o observación específica.
6. **cites_peer_case** (Day 1, 3, 5, 9): cita un cliente Yuno público (Rappi, inDrive, McDonald's, Avianca, Livelo, Uber, VivaAerobus, Copa Airlines, Reserva) con un número específico
7. **signal_matches_content**: el contenido del mensaje matches el signal_allocation asignado (ej: trigger_event no debe sonar como peer_benchmark)
8. **no_repeated_signals**: el mensaje NO repite signals listados en used_signals[] (ej: si Day 1 usó trigger_event, Day 3 no puede volver a abrir con eso)
9. **specific_question** (steps con CTA): la pregunta es específica al lead o al peer case, NO genérica como "Worth a quick chat?"
10. **specific_subject** (email steps): el subject menciona la empresa o el problema específico, NO "Quick question" o "Opportunity"

### Risk checks (escalate si trigger):
11. **competitor_mention_ok**: NO menciona competidores (Stripe, Adyen, Checkout) con tono agresivo o difamatorio
12. **claims_defensible**: cualquier número mencionado está dentro del rango defensible Yuno (+5-15% approval, 10-50bps MDR, hours-days vs weeks-months)
13. **tone_not_pushy**: el tono NO es desesperado, agresivo, ni manipulativo (no guilt-tripping, no FOMO falso)
14. **no_offensive_to_company**: el contenido NO ofende a la empresa target (no implies they're failing, no condescending)
15. **matches_yuno_style**: el mensaje suena como un senior sales rep de Yuno (cálido, directo, sin corporate jargon)

## Cómo decidir

1. Ejecuta los 15 checks. Cada uno es true/false.
2. Cuenta:
   - critical_fails = checks 1-4 (quality)
   - content_fails = checks 5-10 (content)
   - risk_triggers = checks 11-15 (risk)

3. Aplica la lógica:
   - Si critical_fails > 0 → **auto_regenerate** con hint específico
   - Si risk_triggers > 0 → **escalate** (humano debe ver)
   - Si content_fails > 1 → **auto_regenerate** con hint
   - Si content_fails == 1 (solo 1 fail menor) → **auto_approve** (no perfecto pero suficiente)
   - Si todos passed → **auto_approve** con confidence alto

4. Si confidence es bajo en general (mensaje raro pero no claramente malo) → **escalate**.

## Reglas operativas
- **Determinístico**: temperature=0. Mismo mensaje, misma decisión.
- **Conservador con escalación**: prefiere escalate sobre auto_approve cuando dudas.
- **Conciso en reasoning**: máximo 3 oraciones explicando la decisión.
- **Honesto con regenerate hints**: el hint debe ser ACCIONABLE, no genérico.

## Output esperado
JSON estricto:
```json
{
  "decision": "auto_approve" | "auto_regenerate" | "auto_reject" | "escalate",
  "confidence": 0.85,
  "checks_result": {
    "subject_clean": true,
    "no_em_dashes": true,
    "no_clichés": true,
    "length_ok": true,
    "problem_first_opener": true,
    "cites_peer_case": true,
    "signal_matches_content": true,
    "no_repeated_signals": true,
    "specific_question": true,
    "specific_subject": true,
    "competitor_mention_ok": true,
    "claims_defensible": true,
    "tone_not_pushy": true,
    "no_offensive_to_company": true,
    "matches_yuno_style": true
  },
  "failed_checks": [],
  "reasoning": "All 15 checks passed. Subject specific, body cites Rappi with concrete number, no clichés. Approve.",
  "regenerate_hint": null
}
```

Si decision es auto_regenerate, regenerate_hint debe ser uno de: "shorter" | "more_casual" | "different_angle" — nunca texto libre.

## Reglas finales
- NUNCA aprobes si critical_fails > 0.
- NUNCA aprobes si hay risk_triggers — escala.
- NUNCA inventes números. Si los del mensaje no son defensibles, regenera o escala.
- El humano cuenta contigo para que NO le lleguen mensajes pequeños. Solo casos edge llegan.$SOUL$,
    'active',
    ARRAY['research', 'writing', 'data']::text[],
    'claude-haiku-4-5-20251001',
    0.0,        -- temperature 0 → determinístico (anti-loop #5)
    2048,
    'worker',
    0.50,       -- max cost per turn
    v_user_id
  )
  RETURNING id INTO v_carlos_id;
  RAISE NOTICE 'Carlos creado: %', v_carlos_id;
ELSE
  -- Update soul_md and config in case it changed
  UPDATE public.agents
  SET soul_md = soul_md, temperature = 0.0, model = 'claude-haiku-4-5-20251001', updated_at = NOW()
  WHERE id = v_carlos_id;
  RAISE NOTICE 'Carlos ya existe: % (config actualizada)', v_carlos_id;
END IF;

-- =====================================================
-- 5. Skill revisar_mensaje_qa
-- =====================================================
INSERT INTO public.skill_registry (name, display_name, description, skill_definition, category, requires_integrations, is_system, route)
VALUES (
  'revisar_mensaje_qa',
  'Revisar Mensaje QA',
  'Carlos revisa un mensaje generado y decide auto_approve/auto_regenerate/auto_reject/escalate basado en 15 criterios.',
  E'FUNCTION: chief-supervise-message\nROUTE: edge\n\nASK_USER:\n1. ID del review a evaluar | review_id | string\n\nTRANSFORM:\n- ownerId y orgId se inyectan automaticamente\n\nRULES:\n- Carlos usa Haiku 4.5 con temperature=0\n- 5 anti-loop checks antes de invocar LLM:\n  1. Hard cap regenerate=2\n  2. Similarity check entre regens (Jaccard > 0.8 → escalate)\n  3. Daily budget cap por org\n  4. Circuit breaker por step_type\n  5. Determinismo via temp=0\n- Output siempre incluye reasoning + failed_checks',
  'system',
  ARRAY[]::text[],
  true,
  'edge_function'
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  skill_definition = EXCLUDED.skill_definition;

-- Asignar skill a Carlos
INSERT INTO public.agent_skills (agent_id, skill_name, enabled)
SELECT v_carlos_id, 'revisar_mensaje_qa', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.agent_skills
  WHERE agent_id = v_carlos_id AND skill_name = 'revisar_mensaje_qa'
);

-- =====================================================
-- 6. Resumen
-- =====================================================
RAISE NOTICE '✓ Migration 107 (QA Supervisor) applied:';
RAISE NOTICE '  - Carlos agente creado: %', v_carlos_id;
RAISE NOTICE '  - qa_supervisor_decisions: audit log per Carlos call';
RAISE NOTICE '  - qa_daily_budget: cost cap $30/día default + atomic check_and_increment';
RAISE NOTICE '  - step_type_circuit_breaker: rolling 50-msg health check, trips on regen>50%% or reject>30%%';
RAISE NOTICE '  - skill revisar_mensaje_qa asignado a Carlos';
END $MIGRATION$;
