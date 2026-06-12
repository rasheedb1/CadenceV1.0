-- ============================================================================
-- Migration 123: Day 3 + Day 7 refinements (rasheed feedback)
-- ============================================================================
-- 1. Day 3 LinkedIn DM: greet con "{{first_name}}," al inicio (consistente con
--    Day 0 y Day 1 — by Day 3 ya hay rapport, no greeting se siente cold)
-- 2. Day 7 LinkedIn followup: cambiar "is that your team or should I reach
--    someone else" (demerita) por "champion-collaboration" framing — mencionar
--    persona específica del payments team + sugerir 3-way conversation
-- ============================================================================

DO $MIGRATION$
DECLARE
  v_org_id UUID := '553315b5-42d0-4518-a461-e4cb12914c54';
  v_id UUID;
BEGIN

-- =====================================================
-- DAY 3 V8: añadir greeting "{{first_name}},"
-- =====================================================
SELECT id INTO v_id FROM ai_prompts WHERE org_id=v_org_id AND name='chief_outreach_day3_linkedin_message_v3';

UPDATE ai_prompts SET
  prompt_body = REPLACE(
    REPLACE(prompt_body,
      '1. NO GREETING. Open with TECH-STACK OBSERVATION grounded in COMPANY-LEVEL intel:',
      '1. GREETING + TECH-STACK OBSERVATION (1-2 sentences). Open with "{{first_name}},"  then dive into observation grounded in COMPANY-LEVEL intel. By Day 3 they accepted Day 0 connect + saw Day 1 email — greeting reinforces rapport without feeling cold:'
    ),
    '- "Hey/Hi {{first_name}}" greeting',
    '- "Hey/Hi/Hello {{first_name}}" greeting (use just first name + comma — "Samantha,")'
  ),
  description = 'Day 3 LinkedIn DM V8 — added "{{first_name}}," greeting (rasheed feedback: by Day 3 there is rapport, no greeting feels cold).',
  updated_at = NOW()
WHERE id = v_id;
RAISE NOTICE '✓ Day 3 V8 (added greeting)';

-- =====================================================
-- DAY 7 V8: champion-collaboration framing (NOT "wrong person" ask)
-- =====================================================
SELECT id INTO v_id FROM ai_prompts WHERE org_id=v_org_id AND name='chief_outreach_day7_linkedin_followup_v3';

UPDATE ai_prompts SET
  prompt_body = (
    'SECOND LinkedIn DM follow-up to {{first_name}} at {{company}}. First DM was 4 days ago.' ||
    chr(10) || chr(10) ||
    'TOUCH ROLE: Champion-collaboration framing. NOT a "you''re not the right person, who is?" ask (that demerits the prospect). Position {{first_name}} as the senior who can pull in the technical owner. Suggest 3-way conversation, not a replacement.' ||
    $D7$
═══════════════════════════════════════════════════════════════════
USED SIGNALS — DO NOT REUSE: all prior peer cites (Rappi, inDrive, McDonald's)

═══════════════════════════════════════════════════════════════════
PHILOSOPHY — CHAMPION COLLABORATION (NOT REFERRAL ASK):
═══════════════════════════════════════════════════════════════════
Wrong (demerits prospect, sounds like "wrong person"):
  ✗ "Is that your team, or is there a Head of Payments Ops I should reach?"
  ✗ "Are you the right person, or should I be talking to someone else?"

Right (positions prospect as the senior who collaborates with their team):
  ✓ "If there's someone on your payments engineering team worth pulling in for a quick conversation together, happy to coordinate."
  ✓ "Curious if it would be valuable to loop in someone on the payments side for a 3-way chat — happy to set it up."
  ✓ "Worth bringing in your champion on the payments engineering side? Happy to make it a 3-way."

Why this works (sales psychology):
- "Champion" is a peer, not a senior over them. Mentioning a CHAMPION (not decision-maker) is more credible — VPs collaborate with champions every day.
- "3-way conversation" frames you as additive, not as bypassing them.
- "Worth pulling in" assumes their judgment — they decide WHO to bring.
- Permission tone preserved.

═══════════════════════════════════════════════════════════════════
STRUCTURE (35-60 words / 200-330 chars):
═══════════════════════════════════════════════════════════════════
1. GREETING. "{{first_name}}," — peer-level.

2. BRIEF VALUE PROP REMINDER (1 sentence). Reference Day 1''s capability + numeric anchor. Examples:
   • "the smart-routing layer we covered typically lands with someone owning BIN-level decisioning or processor failover."
   • "the +3pp routing pattern usually sits with the team running gateway-side routing logic."

3. CHAMPION-COLLABORATION ASK (1 sentence). Suggest pulling in their payments-team champion for a 3-way conversation. NEVER ask "should I reach someone else". Use intelligence if a specific name is in payment_stack or expansion_signals — otherwise refer generically:
   • "If there''s someone on your payments engineering side worth pulling in for a quick 3-way chat, happy to coordinate."
   • "Curious if it would be useful to loop in your payments team lead — happy to make it a 3-way."
   • "Worth bringing in your payments-engineering champion for a 30-min comparison? Happy to set it up."

4. PERMISSION EXIT (1 sentence). Sandler negative-reverse, low-pressure.
   • "If timing''s off this half, no worries."
   • "Totally fair if not your priority right now."

═══════════════════════════════════════════════════════════════════
EXAMPLES (good vs bad):
═══════════════════════════════════════════════════════════════════
✓ GOOD (champion collaboration):
"Samantha, the smart-routing layer we covered usually lands with someone owning BIN-level decisioning at the gateway level. If there''s someone on your payments engineering team worth pulling in for a quick 3-way chat, happy to coordinate. If timing''s off this half, no worries."

✗ BAD (demerits prospect):
"Quick one. The smart-routing layer I mentioned usually sits with whoever owns processor failover. Is that your team, or is there a Head of Payments Ops I should reach? If timing''s off, no worries."

═══════════════════════════════════════════════════════════════════
ANTI-PATTERNS (auto-fail):
═══════════════════════════════════════════════════════════════════
- "Is that your team or should I reach [other role]?" — demerits prospect, sounds like wrong-person ask
- "Are you the right person?" — same demerit risk
- "Just following up", "Bumping this", "Wanted to circle back"
- "I know you''re busy", "Did you get a chance"
- Re-introducing yourself
- Hard meeting request as primary CTA (the 3-way invite IS the CTA, soft)
- More than 60 words
- Mentioning ANY peer case used in prior touches (Rappi/inDrive/McDonald''s)
- Naming Yuno competitors (Spreedly, Primer, Gr4vy)
- Em-dash for emphasis (use period after greeting comma)
- "Hey/Hi {{first_name}}" — use just "{{first_name}},"
$D7$ ||
    $D7B$
═══════════════════════════════════════════════════════════════════
ABSOLUTE BANS (typography + vocabulary):
═══════════════════════════════════════════════════════════════════
- Em-dashes (—) → periods or commas
- En-dashes (–) between words → hyphens
- Tilde (~) for "approximately" → "around" / "about"
- Curly quotes, bullet chars (•), ellipsis (…)

VOCABULARY (instant AI-tell):
delve, tapestry, landscape, realm, testament, underscore, underpinnings, pivotal, foster, robust, garner, bolster, intricate, intricacies, interplay, meticulous, vibrant, showcase, commendable, strategically, leverage, synergy, streamline, unlock, transform, revolutionize, revolutionary, game-changer, best-in-class, innovative, paradigm, cutting-edge, holistic, disruptive, scalable, opportunity

═══════════════════════════════════════════════════════════════════
CROSS-TOUCH:
═══════════════════════════════════════════════════════════════════
- PRONOUN LOCK: "I"
- VOCABULARY LOCK: same routing term as Day 1
- NUMERIC ANCHOR: reference in passing
- ANGLE: champion-collaboration (DIFFERENT from problem-first/peer/contrarian)

═══════════════════════════════════════════════════════════════════
SUBSTANCE CHECK:
═══════════════════════════════════════════════════════════════════
1. Greeting "{{first_name}}," present
2. Brief value-prop reference
3. Champion-collaboration ask (3-way framing) — NOT "wrong person" ask
4. Permission exit closer
5. NO "Is that your team / should I reach someone else" patterns

OUTPUT: Body only, plain text, no signature.
$D7B$
  ),
  description = 'Day 7 LinkedIn DM V8 — champion-collaboration framing (3-way conversation invite). Replaces "wrong person" ask which demerits prospect.',
  updated_at = NOW()
WHERE id = v_id;
RAISE NOTICE '✓ Day 7 V8 (champion-collaboration 3-way)';

RAISE NOTICE '';
RAISE NOTICE '═══════════════════════════════════════════════════════════════';
RAISE NOTICE 'Migration 123 complete:';
RAISE NOTICE '  Day 3 V8 — greeting "{{first_name}}," restored';
RAISE NOTICE '  Day 7 V8 — champion-collaboration framing (3-way invite)';
RAISE NOTICE '═══════════════════════════════════════════════════════════════';

END $MIGRATION$;
