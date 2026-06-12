-- ============================================================================
-- Migration 126: Step-specific Carlos rubrics + thresholds
-- ============================================================================
-- Cada touch tiene objetivo distinto, no puede tener mismo rubric:
--   Day 0 connect: peer recognition (no pitch, no Q, no peer cite)
--   Day 1 email: identify pain + Yuno solution + peer + calibrated Q
--   Day 2 comment: rule-based (no LLM)
--   Day 3 LinkedIn DM: tech-stack obs + capability + peer
--   Day 5 email reply: contrarian reframe + capability + new peer
--   Day 7 LinkedIn FU: champion-mapping ONLY (no re-pitch, no Yuno solution required)
--   Day 9 BC email: synthesis + soft exit + multi-prop
-- ============================================================================

-- =====================================================
-- 1. Per-step config table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.carlos_step_rubric (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  step_type TEXT NOT NULL,             -- send_email | linkedin_message | email_reply | linkedin_connect | task
  day_offset INT NOT NULL,             -- 0, 1, 3, 5, 7, 9
  threshold NUMERIC(3,1) NOT NULL,     -- pass score threshold
  min_acceptable NUMERIC(3,1) NOT NULL,-- below = skip
  max_attempts INT NOT NULL DEFAULT 5,
  rubric_focus JSONB NOT NULL DEFAULT '{}'::jsonb,  -- which dimensions matter
  rubric_skip JSONB NOT NULL DEFAULT '[]'::jsonb,    -- which triggers to ignore
  system_prompt_addendum TEXT,         -- step-specific scoring guidance
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (org_id, step_type, day_offset)
);

-- =====================================================
-- 2. Seed step-specific rubrics for chief outreach cadence
-- =====================================================
INSERT INTO public.carlos_step_rubric (org_id, step_type, day_offset, threshold, min_acceptable, rubric_focus, rubric_skip, system_prompt_addendum) VALUES

-- Day 0: connect note (peer recognition only)
('553315b5-42d0-4518-a461-e4cb12914c54', 'linkedin_connect', 0, 7.0, 4.0,
 '{"primary": ["peer_recognition", "company_anchored", "brevity"], "ignore": ["calibrated_q", "yuno_solution", "peer_cite", "capability"]}',
 '["fabricated_proof", "claims_undefensible", "yuno_as_replacement", "no_yuno_solution"]',
 'Day 0 = connect note. Goal: get accepted. Score on PEER RECOGNITION (anchored on company-news), BREVITY (≤300 chars), and NO-PITCH discipline. DO NOT penalize for missing calibrated question, peer cite, or Yuno solution — those are not the job here. Score Voice based on peer-level tone (not pitchy). Score Structure based on company-anchor + brief Yuno-work mention.'),

-- Day 1: cold email (full pitch)
('553315b5-42d0-4518-a461-e4cb12914c54', 'send_email', 1, 8.0, 4.5,
 '{"primary": ["problem_identified", "yuno_solution_explicit", "peer_cite", "calibrated_q", "permission_exit"], "secondary": ["smart_routing_specific", "approval_uplift_anchor"]}',
 '[]',
 'Day 1 = first cold email (Smart Routing → Approval Uplift). Score on: SPECIFIC payments problem identified (NOT generic), explicit Yuno smart-routing capability + benefit number, ONE verified peer USING that capability, calibrated question + permission exit. Threshold 8.0 because this is the hardest-working email of the cadence.'),

-- Day 3: LinkedIn DM (Time-to-Market angle)
('553315b5-42d0-4518-a461-e4cb12914c54', 'linkedin_message', 3, 7.5, 4.0,
 '{"primary": ["greeting_present", "tech_stack_observation", "ttm_capability", "ttm_peer", "calibrated_q"], "ignore": ["smart_routing_pitch"]}',
 '[]',
 'Day 3 = LinkedIn DM (Time-to-Market angle). Score on: greeting "{{first_name}}," present, tech-stack observation grounded in COMPANY intel, EXPLICIT TIME-TO-MARKET capability (configuration not code, faster geo expansion, single API to N markets), inDrive 10-countries-8-months peer cite, calibrated Q on cycle time. DO NOT penalize for not mentioning smart routing — that''s Day 1''s job. Threshold 7.5 (LinkedIn shorter format = harder to hit 8.0).'),

-- Day 5: email reply (Negotiation Power / contrarian)
('553315b5-42d0-4518-a461-e4cb12914c54', 'email_reply', 5, 7.5, 4.0,
 '{"primary": ["contrarian_reframe", "negotiation_capability", "new_peer", "calibrated_q"], "ignore": ["smart_routing_pitch", "ttm_pitch"]}',
 '[]',
 'Day 5 = email reply (Negotiation Power / contrarian). Score on: contrarian opener (disrupts "renegotiate with incumbent" default), explicit NEGOTIATION POWER capability (vendor-agnostic / PSP arbitrage / credible exit), NEW peer (NOT Rappi/inDrive/McDonald used Day 1/3 — use SeatGeek/Spreedly switching-leverage pattern), calibrated Q on incumbent renegotiation. DO NOT penalize for not mentioning smart routing or TTM. Threshold 7.5.'),

-- Day 7: LinkedIn DM follow-up (champion-mapping ONLY)
('553315b5-42d0-4518-a461-e4cb12914c54', 'linkedin_message', 7, 6.5, 3.5,
 '{"primary": ["greeting_present", "value_prop_reminder_brief", "champion_collab_3way", "permission_exit"], "ignore": ["yuno_solution_explicit", "specific_capability", "peer_cite", "calibrated_q"]}',
 '["fabricated_proof", "claims_undefensible", "no_yuno_solution"]',
 'Day 7 = LinkedIn DM follow-up (CHAMPION COLLABORATION). This is brief 35-60w. Goal: pull champion into a 3-way conversation. Score on: greeting present, brief value-prop reminder (REFERENCING prior touch — does NOT need to re-explain Yuno), champion-collaboration ask (3-way invite — NOT "wrong person" demerit), permission exit. DO NOT penalize for: not having calibrated Q, not having peer cite, not explaining Yuno (that was done in prior 4 touches). Persona-aware language is critical here: must match {{title}}. Threshold 6.5 (brief touch, can''t hit substance bar of long emails).'),

-- Day 9: BC email synthesis
('553315b5-42d0-4518-a461-e4cb12914c54', 'send_email', 9, 7.5, 4.5,
 '{"primary": ["narrative_arc_opener", "multi_prop_synthesis", "bc_link_present", "soft_exit_permission", "specific_number_anchor"], "secondary": ["reconciliation_4th_pillar", "comp_set_2_peers"]}',
 '[]',
 'Day 9 = BC email (synthesis + soft exit). Score on: narrative arc opener (refs investigation across week), MULTI-PROP synthesis (smart routing + TTM + negotiation + RECONCILIATION — at least 3 of 4), BC link present, soft exit framing ("closing your file" / "BC is yours regardless"), comp set with 2 peers from prior touches (Rappi + McDonald''s). Threshold 7.5 (synthesis is hard to nail in 130w).'),

('553315b5-42d0-4518-a461-e4cb12914c54', 'task', 9, 7.5, 4.5,
 '{"primary": ["narrative_arc_opener", "multi_prop_synthesis", "bc_link_present", "soft_exit_permission"], "secondary": ["reconciliation_4th_pillar"]}',
 '[]',
 'Same as send_email day 9 — task variant.');

-- =====================================================
-- 3. Resumen
-- =====================================================
DO $$
DECLARE r RECORD;
BEGIN
  RAISE NOTICE '✓ Migration 126 (step-specific Carlos) applied:';
  RAISE NOTICE '  - carlos_step_rubric table created with per-touch thresholds + rubric focus';
  FOR r IN SELECT step_type, day_offset, threshold, min_acceptable FROM public.carlos_step_rubric ORDER BY day_offset LOOP
    RAISE NOTICE '  - Day % %: threshold=%, min=%', r.day_offset, r.step_type, r.threshold, r.min_acceptable;
  END LOOP;
END $$;
