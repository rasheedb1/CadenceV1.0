-- ============================================================================
-- Migration 114: Expand verified customer list — add Uber, Smartfit, SpaceX, Xcaret
-- ============================================================================
-- Correction (2026-05-08, Rasheed): Uber, Smartfit, SpaceX, Xcaret ARE Yuno
-- customers. Previous prompts (V5/V6) treated Uber/SpaceX as fabricated_proof.
-- This was wrong. Updates customer library + vertical mapping in all 6 prompts +
-- removes the explicit "Uber not customer" ban from Day 7 V4.
-- ============================================================================

DO $MIGRATION$
DECLARE
  v_org_id UUID := '553315b5-42d0-4518-a461-e4cb12914c54';
  v_id UUID;
BEGIN

-- =====================================================
-- DAY 1 V6 → V7 (expanded customer library + vertical mapping)
-- =====================================================
SELECT id INTO v_id FROM ai_prompts WHERE org_id=v_org_id AND name='chief_outreach_day1_value_email_v3';

UPDATE ai_prompts SET
  prompt_body = REPLACE(
    REPLACE(prompt_body,
      '- Real customers (use ONLY these — never invent): Rappi, inDrive, McDonald''s, Avianca, Livelo, Reserva, Open English, Viva Aerobus.',
      '- Real customers (use ONLY these — never invent): Rappi, inDrive, Uber, McDonald''s, Avianca, Viva Aerobus, Xcaret, Livelo, Reserva, Open English, Smartfit, SpaceX.'
    ),
    'CUSTOMER PROOF LIBRARY (verified — use these by vertical match):
═══════════════════════════════════════════════════════════════════
Match {{company}} vertical to the closest peer below. Use ONE specific peer with ONE defendible number. NEVER fabricate metrics not in this list.

DELIVERY / MARKETPLACE / ON-DEMAND:
  • Rappi (delivery LATAM) — Leonardo Benante (former Sr. Manager of Payments) on pre-Yuno: "transaction failures, decentralized data, manual analysts resolving disruptions one by one."
  • inDrive (mobility 47 countries) — Vasiliy Everstov (Head of Global Payments at inDrive): "single integration / single API across 47 countries."

QSR / RETAIL / TRAVEL:
  • McDonald''s (QSR LATAM) — Yuno powers payment flows across multi-country LATAM ops.
  • Avianca (airline LATAM) — multi-country card + APM coverage via Yuno.
  • Viva Aerobus (low-cost airline MX) — Juan Carlos Zuazua context: single platform across MX domestic + cross-border.

LOYALTY / FINTECH:
  • Livelo (largest loyalty program Brazil, 40M+ members) — Camilo Ferreira Jorge (Head of Payments).

FASHION / DTC:
  • Reserva (Brazilian DTC fashion) — Clara Farias (Head of Payments).

EDTECH:
  • Open English (LATAM edtech, recurring billing) — Wilmer Sarmiento: "+5% approval rate" lift after Yuno smart routing.',
    'CUSTOMER PROOF LIBRARY (verified — use these by vertical match):
═══════════════════════════════════════════════════════════════════
Match {{company}} vertical to the closest peer below. Use ONE specific peer with ONE defendible number. NEVER fabricate metrics not in this list. For customers without public quotes, cite as "Yuno powers [Company]''s payments" — do NOT invent executives or metrics.

DELIVERY / MARKETPLACE / ON-DEMAND:
  • Rappi (delivery LATAM) — Leonardo Benante (former Sr. Manager of Payments) verbatim pre-Yuno: "transaction failures, decentralized data, manual analysts resolving disruptions one by one."
  • Uber (delivery + mobility global) — Yuno orchestrates payment flows. NO public quote — cite as "Uber runs through Yuno''s orchestration layer."

MOBILITY / RIDESHARE:
  • inDrive (47 countries) — Vasiliy Everstov (Head of Global Payments): "single integration / single API across 47 countries."
  • Uber — see above (mobility + delivery).

QSR / RESTAURANTS:
  • McDonald''s (QSR LATAM) — multi-channel payments (delivery + in-store + kiosk) across LATAM. NO public quote.

AIRLINE / TRAVEL:
  • Avianca (airline LATAM) — multi-country card + APM coverage via Yuno.
  • Viva Aerobus (low-cost airline MX) — Juan Carlos Zuazua context: single platform domestic + cross-border.

TOURISM / PARKS / HOSPITALITY:
  • Xcaret (Mexican tourism / parks operator) — Yuno powers payment flows across multi-park / multi-channel ops. NO public quote — cite as "Xcaret runs payments on Yuno across [domestic + tourist] flows."

LOYALTY / FINTECH:
  • Livelo (Brazil, 40M+ members) — Camilo Ferreira Jorge (Head of Payments): consolidated payment ops + APM coverage.

DTC / FASHION / RETAIL:
  • Reserva (DTC fashion BR) — Clara Farias (Head of Payments): single API for acquirers + APMs.

EDTECH / SUBSCRIPTIONS:
  • Open English (LATAM edtech, recurring billing) — Wilmer Sarmiento: "+5% approval rate" lift after Yuno smart routing on cross-border subs.

FITNESS / WELLNESS:
  • Smartfit (largest fitness chain LATAM) — Yuno orchestrates payments across BR + regional markets. NO public quote.

AEROSPACE / HARDWARE / ENTERPRISE TECH:
  • SpaceX (aerospace) — Yuno powers payment flows. NO public quote — cite as "SpaceX runs payments through Yuno''s orchestration layer." Strong trust signal for enterprise / global ops.'
  ),
  description = 'Day 1 value email V7 — expanded verified customer library: +Uber +Smartfit +SpaceX +Xcaret. Vertical mapping rewritten. Honesty rule: customers without public quotes cited as "Yuno powers X" without inventing executives.',
  updated_at = NOW()
WHERE id = v_id;
RAISE NOTICE '✓ Day 1 → V7 (12 verified customers, vertical mapping expanded)';

-- =====================================================
-- DAY 7 V4 → V5 (REMOVE "Uber NOT customer" ban — Uber IS a customer)
-- =====================================================
SELECT id INTO v_id FROM ai_prompts WHERE org_id=v_org_id AND name='chief_outreach_day7_linkedin_followup_v3';

UPDATE ai_prompts SET
  prompt_body = REPLACE(
    REPLACE(
      REPLACE(prompt_body,
        '- Mentioning ANY peer case (Rappi/inDrive/McDonald''s) — those are used',
        '- Mentioning ANY peer case used in Days 1/3/5 (Rappi/inDrive/McDonald''s most common path) — those are used'
      ),
      '- Fabricating Uber case study or claiming Uber uses Yuno (Uber is NOT a verified Yuno customer)',
      '- Inventing executive names or metrics for ANY customer where no public quote exists (Uber/McDonald''s/Avianca/Xcaret/Smartfit/SpaceX have NO public quote — cite only as "X runs through Yuno''s orchestration layer")'
    ),
    '4. NO Uber, NO Yuno competitors named.',
    '4. NO Yuno competitors named (Spreedly/Primer/Gr4vy). Uber, SpaceX, Xcaret, Smartfit are OK to cite as customers (verified) — but only as "runs through Yuno", no fabricated metrics.'
  ),
  description = 'Day 7 LinkedIn followup V5 — Uber/Smartfit/SpaceX/Xcaret added as verified customers (correction). Yuno competitors still banned. Honesty rule: no fabricated executives/metrics for customers without public quotes.',
  updated_at = NOW()
WHERE id = v_id;
RAISE NOTICE '✓ Day 7 → V5 (Uber ban REMOVED — Uber/SpaceX/Smartfit/Xcaret citable)';

-- =====================================================
-- DAYS 3, 5, 9 — append note allowing alternates from expanded library
-- =====================================================
-- Day 3: inDrive primary, Uber alternate for mobility/delivery
SELECT id INTO v_id FROM ai_prompts WHERE org_id=v_org_id AND name='chief_outreach_day3_linkedin_message_v3';
UPDATE ai_prompts SET
  prompt_body = REPLACE(prompt_body,
    'ALLOCATED PEER CASE: inDrive (mobility 47 countries).',
    'ALLOCATED PEER CASE: inDrive (mobility 47 countries) PRIMARY. If Day 1 already cited inDrive (rare, only for mobility leads), use Uber as alternate: "Uber runs through Yuno''s orchestration layer" — no fabricated metrics.'
  ),
  description = 'Day 3 LinkedIn DM V5 — inDrive primary peer, Uber alternate (added per expanded customer library). No fabricated metrics for Uber.',
  updated_at = NOW()
WHERE id = v_id;
RAISE NOTICE '✓ Day 3 → V5 (Uber as alternate peer)';

-- Day 5: McDonald's primary; allow Smartfit/Xcaret/Avianca as alternates if vertical-matched
SELECT id INTO v_id FROM ai_prompts WHERE org_id=v_org_id AND name='chief_outreach_day5_email_reply_v3';
UPDATE ai_prompts SET
  prompt_body = REPLACE(prompt_body,
    'ALLOCATED SIGNAL: peer_benchmark.mcdonalds.',
    'ALLOCATED SIGNAL: peer_benchmark for Day 5. Default = McDonald''s. Vertical alternates if Day 5 needs different angle: Smartfit (fitness/wellness), Xcaret (tourism/parks), Avianca (travel), Viva Aerobus (low-cost travel). Pick whichever closest matches {{company}} vertical AND is not yet used in Days 1/3.'
  ),
  description = 'Day 5 email reply V5 — McDonald''s primary, vertical alternates added (Smartfit/Xcaret/Avianca/Viva). Carlos V4 + customer library expanded.',
  updated_at = NOW()
WHERE id = v_id;
RAISE NOTICE '✓ Day 5 → V5 (vertical alternates added)';

-- Day 9: BC email synthesis comp set — expand allowed references
SELECT id INTO v_id FROM ai_prompts WHERE org_id=v_org_id AND name='chief_outreach_day9_bc_email_v3';
UPDATE ai_prompts SET
  prompt_body = REPLACE(prompt_body,
    'PRIOR PEER CASES MENTIONED (the BC''s comp set):
- Rappi (delivery LATAM) — Day 1
- inDrive (mobility 47 countries) — Day 3
- McDonald''s (QSR LATAM multi-channel) — Day 5',
    'PRIOR PEER CASES MENTIONED (the BC''s comp set — actual peers depend on what Days 1/3/5 cited):
- Day 1 default = Rappi (delivery) | alternates: inDrive, Uber, Avianca, Xcaret, etc per vertical
- Day 3 default = inDrive (47 countries) | alternate: Uber
- Day 5 default = McDonald''s | alternates: Smartfit, Xcaret, Viva Aerobus per vertical match

Read used_signals to know which 3 actually got cited. Reference at least 2 of them as the comp set.'
  ),
  description = 'Day 9 BC email V5 — expanded comp set with vertical-aware peer alternates from full 12-customer library.',
  updated_at = NOW()
WHERE id = v_id;
RAISE NOTICE '✓ Day 9 → V5 (comp set expanded per vertical)';

RAISE NOTICE '';
RAISE NOTICE '═══════════════════════════════════════════════════════════════';
RAISE NOTICE 'Migration 114 complete: customer library expanded 8 → 12';
RAISE NOTICE '  Added: Uber, Smartfit, SpaceX, Xcaret';
RAISE NOTICE '  Day 1 → V7, Day 3 → V5, Day 5 → V5, Day 7 → V5, Day 9 → V5';
RAISE NOTICE '  Honesty rule: customers without public quotes cited as "runs through Yuno"';
RAISE NOTICE '═══════════════════════════════════════════════════════════════';

END $MIGRATION$;
