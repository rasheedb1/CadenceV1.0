-- ============================================================================
-- Migration 111: Carlos V3 — Sonnet 4.6 + 4ta dimension (Structure)
-- ============================================================================
-- Upgrade Carlos a Sonnet 4.6 + agregar Structure como dimension separada
-- (peer review había merged Structure en Quality, pero structure narrativa es
-- subjetiva y merece dimension propia con LLM judgment).
--
-- 4 dimensions:
--   - Relevance (specificity al lead + value clarity)
--   - Quality  (vocabulary payments + defendible numbers)
--   - Structure (hook patterns, painted problem, narrative arc, threading)
--   - Voice (no AI-tells + sequence consistency + persona match)
-- ============================================================================

-- =====================================================
-- 1. Agregar structure_score column + 4ta dim breakdown
-- =====================================================
ALTER TABLE public.qa_supervisor_decisions
  ADD COLUMN IF NOT EXISTS structure_score NUMERIC(3,1),
  ADD COLUMN IF NOT EXISTS structure_breakdown JSONB DEFAULT '{}'::jsonb;
  /* structure_breakdown schema:
    {
      "hook_pattern_correct": true,        // problem-first Day 1, tech-stack Day 3, etc
      "painted_problem_before_value": true,// problema vívido antes del value claim
      "spear_pattern": true,               // Justin Michael 3-sentence pattern (Day 1)
      "single_question_cta": true,         // ONE question, not multiple
      "reference_threading": true,         // Day 5+ refs prior touch implícitamente
      "pronoun_lock": true,                // I vs we consistent cross-touches
      "vocabulary_lock": true,             // no synonym drift (auth rate ≠ approval rate)
      "channel_coherence": true            // LinkedIn lighter than email, same theme
    }
  */

-- =====================================================
-- 2. Update Carlos agent → Sonnet 4.6
-- =====================================================
UPDATE public.agents
SET model = 'claude-sonnet-4-6',
    max_cost_per_turn_usd = 0.50,  -- 3x más generous para Sonnet
    description = 'QA Supervisor V3 (Sonnet 4.6) — 4 dimensions (Relevance/Quality/Structure/Voice) + payments domain expertise + Justin Michael Spear + 30MPC frameworks + research-backed senior AE patterns.',
    updated_at = NOW()
WHERE org_id = '553315b5-42d0-4518-a461-e4cb12914c54'
  AND name = 'Carlos';

-- =====================================================
-- 3. Aumentar daily budget cap para acomodar Sonnet 4.6
-- =====================================================
-- Sonnet 4.6 ~$0.009/review vs Haiku $0.003. Cap $30/día → ~3,300 calls Haiku
-- vs ~1,100 calls Sonnet. Aumentamos a $50 para buffer cómodo.
ALTER TABLE public.qa_daily_budget
  ALTER COLUMN cap_usd SET DEFAULT 50.0;

UPDATE public.qa_daily_budget
SET cap_usd = 50.0
WHERE org_id = '553315b5-42d0-4518-a461-e4cb12914c54'
  AND budget_date = CURRENT_DATE;

-- =====================================================
-- 4. Resumen
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '✓ Migration 111 (Carlos V3) applied:';
  RAISE NOTICE '  - qa_supervisor_decisions: +structure_score, +structure_breakdown';
  RAISE NOTICE '  - Carlos agent → claude-sonnet-4-6 (max_cost $0.50/turn)';
  RAISE NOTICE '  - qa_daily_budget cap raised to $50/día (Sonnet pricing)';
END $$;
