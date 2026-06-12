-- ============================================================================
-- Migration 118: Full-autonomy schema (no human in the loop)
-- ============================================================================
-- Cambios:
--   1. cadence_leads.context_json — ya tiene used_signals; agregamos:
--      • numeric_anchor (locked across all 9 touches)
--      • prospect_artifacts_used (track which posts/quotes already cited)
--   2. Disable burn-in mode for chief outreach cadence (full auto from touch 1)
--   3. carlos_telemetry — per-decision audit trail
--   4. carlos_golden_set — frozen evals for drift detection
--   5. message_qa_reviews — add carlos_v5_decision + auto_skip_reason
-- ============================================================================

-- =====================================================
-- 1. Disable burn-in for the chief outreach cadence
-- =====================================================
-- step_burn_in_status table already exists (migration 106). Mark all rows for
-- the chief cadence as graduated to skip burn-in gate in process-queue.
INSERT INTO public.step_burn_in_status (
  org_id, cadence_id, step_type, approvals_count, approval_threshold, in_burn_in
)
SELECT DISTINCT
  c.org_id,
  c.id AS cadence_id,
  cs.step_type,
  10, -- pretend 10 approvals (already graduated)
  1,
  false  -- in_burn_in = false → no human review needed
FROM public.cadences c
JOIN public.cadence_steps cs ON cs.cadence_id = c.id
WHERE c.org_id = '553315b5-42d0-4518-a461-e4cb12914c54'
  AND c.id = '48c6b5bc-0276-47bb-a275-5fa8beaa6c30'
ON CONFLICT (org_id, cadence_id, step_type) DO UPDATE SET
  in_burn_in = false,
  approvals_count = GREATEST(public.step_burn_in_status.approvals_count, 10),
  graduated_at = COALESCE(public.step_burn_in_status.graduated_at, NOW());

-- =====================================================
-- 2. Carlos telemetry table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.carlos_telemetry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  review_id UUID,  -- references message_qa_reviews
  carlos_version TEXT NOT NULL,           -- 'v4' | 'v5'
  prompt_hash TEXT,                       -- short hash of prompt body for drift detection
  step_type TEXT NOT NULL,
  day_offset INT,
  decision TEXT NOT NULL,                 -- approve | regenerate | reject | skip
  hard_gate_violations JSONB DEFAULT '[]'::jsonb,  -- list of {category, pattern, match}
  scoring_breakdown JSONB DEFAULT '{}'::jsonb,     -- {relevance, quality, structure, voice}
  evidence_quotes JSONB DEFAULT '{}'::jsonb,       -- {dim: quoted_span_from_message}
  total_cost_usd NUMERIC(10,6),
  duration_ms INT,
  shadow_mode BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_carlos_telemetry_org_created
  ON public.carlos_telemetry (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_carlos_telemetry_decision
  ON public.carlos_telemetry (carlos_version, decision, created_at DESC);

-- =====================================================
-- 3. Carlos golden set (drift detection)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.carlos_golden_set (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  name TEXT NOT NULL,                      -- 'samantha_day1_v8_approved' etc
  step_type TEXT NOT NULL,
  day_offset INT,
  signal_allocation TEXT,
  generated_subject TEXT,
  generated_message TEXT NOT NULL,
  expected_decision TEXT NOT NULL,         -- approve | regenerate | reject
  expected_hard_violations TEXT[] DEFAULT '{}',
  expected_min_score NUMERIC(3,1),
  expected_max_score NUMERIC(3,1),
  notes TEXT,
  human_grader TEXT,                       -- 'rasheed' | 'nando' | etc
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 4. Add Carlos V5 outputs to message_qa_reviews
-- =====================================================
ALTER TABLE public.message_qa_reviews
  ADD COLUMN IF NOT EXISTS carlos_version TEXT DEFAULT 'v4',
  ADD COLUMN IF NOT EXISTS hard_gate_violations JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS auto_skipped BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS skip_reason TEXT;

-- =====================================================
-- 5. cadence_leads.context_json schema notes
-- =====================================================
-- Schema additions (no DDL needed, JSONB is flexible):
--   {
--     "used_signals": [...],                 -- existing
--     "numeric_anchor": {                     -- NEW: locked across all touches
--       "value": "+3pp",
--       "metric": "approval rate uplift",
--       "set_at_touch": 1,
--       "verbatim": true                      -- if true, repeat exact string
--     },
--     "prospect_artifacts_used": [           -- NEW: track citations
--       {"touch": 1, "type": "trigger_event", "ref": "wonder_acquisition"},
--       {"touch": 3, "type": "post", "ref": "linkedin_post_url"}
--     ],
--     "vocabulary_lock": {                    -- NEW: locked nouns
--       "primary_term": "smart routing",
--       "set_at_touch": 1
--     }
--   }

-- =====================================================
-- 6. Resumen
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '✓ Migration 118 (full-autonomy) applied:';
  RAISE NOTICE '  - Burn-in disabled for cadence 48c6b5bc';
  RAISE NOTICE '  - carlos_telemetry table created (drift detection)';
  RAISE NOTICE '  - carlos_golden_set table created (frozen evals)';
  RAISE NOTICE '  - message_qa_reviews + carlos_version + hard_gate_violations + auto_skipped';
  RAISE NOTICE '  - cadence_leads.context_json schema documented (numeric_anchor, prospect_artifacts_used, vocabulary_lock)';
END $$;
