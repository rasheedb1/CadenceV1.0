-- ============================================================================
-- Migration 124: Value prop diversification across 5 LLM touches
-- ============================================================================
-- Feedback rasheed: cada touch repite "smart routing", suena soporífero.
-- Los 5 canónicos value props de orquestación de pagos:
--   1. Smart Routing → approval uplift
--   2. Negotiation Power → cost reduction (vendor-agnostic, PSP arbitrage)
--   3. Time-to-Market → faster geo expansion (configuration-not-code)
--   4. Development Cost → engineering velocity (single API)
--   5. Unified Reconciliation → finance ops efficiency
--
-- Mapping touch → value prop (cada touch lidera con UNO distinto):
--   • Day 1: Smart Routing (VP Payments concern)
--   • Day 3: Time-to-Market (CPO/Regional GM concern)
--   • Day 5: Negotiation Power (CFO concern — challenger reframe)
--   • Day 7: Dev Cost (CTO concern — natural fit con champion-collaboration)
--   • Day 9: Multi-prop synthesis + Reconciliation as 4th pillar in BC
-- ============================================================================

DO $MIGRATION$
DECLARE
  v_org_id UUID := '553315b5-42d0-4518-a461-e4cb12914c54';
  v_id UUID;
BEGIN

-- =====================================================
-- DAY 1: stays Smart Routing (already aligned)
-- Just clarify it's the APPROVAL UPLIFT angle (not generic "smart routing pitch")
-- =====================================================
SELECT id INTO v_id FROM ai_prompts WHERE org_id=v_org_id AND name='chief_outreach_day1_value_email_v3';

UPDATE ai_prompts SET
  prompt_body = REPLACE(prompt_body,
    'TOUCH ROLE: Identify a SPECIFIC payments problem this company likely has + show explicitly HOW Yuno solves it + back with verified peer. NOT just problem-framing without solution.',
    'TOUCH ROLE: Identify approval-rate pain + Yuno''s SMART ROUTING capability + verified peer.

TOUCH OWNS THIS VALUE PROP: Smart Routing → Approval Rate Uplift.
Concrete numbers: 10-30% approval lift industry typical. Livelo +5% approval + 50% transaction recovery via Yuno. CellPoint OSO up to 25% boost. Reserva +4% in <3 months.
Persona match: VP Payments / Head of Payments — owns approval rate as North Star KPI.
Vocabulary: "intelligent routing", "cascading retries", "auth uplift", "transaction recovery", "issuer affinity".

OTHER VALUE PROPS RESERVED FOR LATER TOUCHES (do NOT mention here):
  - Day 3 = Time-to-Market (configuration not code, faster geo expansion)
  - Day 5 = Negotiation Power (vendor-agnostic, PSP arbitrage, credible exit path)
  - Day 7 = Dev Cost (single API, engineering bandwidth)
  - Day 9 = Reconciliation (single pane of glass) + multi-prop synthesis

If you mention Time-to-Market / Negotiation / Dev / Reconciliation here, you''re burning angles for later touches.'
  ),
  description = 'Day 1 V10 — Smart Routing → Approval Uplift (VP Payments angle). Reserves other 4 value props for later touches.',
  updated_at = NOW()
WHERE id = v_id;
RAISE NOTICE '✓ Day 1 V10 (Smart Routing only)';

-- =====================================================
-- DAY 3: pivot to TIME-TO-MARKET angle
-- =====================================================
SELECT id INTO v_id FROM ai_prompts WHERE org_id=v_org_id AND name='chief_outreach_day3_linkedin_message_v3';

UPDATE ai_prompts SET
  prompt_body = (
    'FIRST LinkedIn DM to {{first_name}} ({{title}} at {{company}}). On behalf of Rasheed from Yuno. They accepted Day 0 connect.' ||
    chr(10) || chr(10) ||
    'TOUCH ROLE: Tech-stack observation + TIME-TO-MARKET as Yuno value prop + verified peer (inDrive 10 countries <8 months).' ||
    chr(10) || chr(10) ||
    'TOUCH OWNS: Time-to-Market — geo expansion / new payment method launch velocity.' ||
    chr(10) ||
    'Concrete numbers: per-PSP integration = 4-8 weeks dev. Building 5 PSPs = 6-9 months stealing roadmap. In-house orchestration build = 18 months / €2M+. With orchestrator = "configuration change rather than new development project" = days vs months. inDrive launched in 10 new countries in <8 months via Yuno.' ||
    chr(10) ||
    'Persona match: CPO / Head of Growth / Regional GM — every quarter without local payment methods = lost GMV.' ||
    chr(10) ||
    'Vocabulary: "configuration not code", "drag-and-drop workflows", "local acquiring at the click of a button", "geo-expansion enablement", "go-live in days".' ||
    chr(10) ||
    'OTHER VALUE PROPS — do NOT mention here:' ||
    chr(10) ||
    '  - Smart Routing (Day 1 already covered)' ||
    chr(10) ||
    '  - Negotiation Power (reserved Day 5)' ||
    chr(10) ||
    '  - Dev Cost (reserved Day 7)' ||
    chr(10) ||
    '  - Reconciliation (reserved Day 9)' ||
    $D3$
═══════════════════════════════════════════════════════════════════
STRUCTURE (50-130 words / 300-700 chars):
═══════════════════════════════════════════════════════════════════
1. GREETING + TIMING-SPECIFIC OBSERVATION (1-2 sentences). Open with "{{first_name}}," then a TIME-TO-MARKET-flavored observation grounded in their company intel (recent expansion, new market, integration timeline). Examples:
   • "{{first_name}}, the Burq nationwide rollout plus Wonder integration usually means your team is staring down 3-4 new PSP integrations to support post-merger payment flows."
   • "{{first_name}}, the Morocco rollout you announced typically means your eng team has 4-8 weeks of acquirer integration work per market — that''s the velocity tax."

2. TIME-TO-MARKET PAIN (1 sentence). Make the cost of slow rollout concrete:
   • "Most platforms in your spot end up with 6-9 months of integration backlog before a new market is actually live with local payment methods."
   • "In-house orchestration builds are typically 18 months and €2M+, which is why most teams choose to buy."

3. YUNO TIME-TO-MARKET CAPABILITY + PEER (2 sentences). Pitch faster geo-expansion via single API:
   • "Yuno''s single API connects to 1000+ payment methods across 200+ countries. Adding a new market goes from months of dev work to a configuration change."
   • "Vasiliy Everstov at inDrive used Yuno to launch in 10 new countries in less than 8 months — same pattern delivery platforms hit when scaling fast."

4. CALIBRATED QUESTION (1 sentence). Reveal current cycle time:
   • "How long does adding a new market typically take your payments team today, end-to-end with PSP integration + local methods + reconciliation?"
   • "What''s the current eng cycle for spinning up a new acquirer in a market you don''t already operate in?"

5. NO SIGNATURE on LinkedIn DMs.

═══════════════════════════════════════════════════════════════════
ABSOLUTE BANS:
═══════════════════════════════════════════════════════════════════
- Mentioning "smart routing" / "auth rate" / "approval lift" — those are Day 1''s angle, must be different here
- Mentioning "negotiation" / "vendor leverage" / "PSP arbitrage" — Day 5''s angle
- Mentioning "single API" alone as DEV COST framing — Day 7''s angle (here use it as TTM enabler)
- Mentioning "reconciliation" / "unified ledger" — Day 9''s angle
- "Hey/Hi {{first_name}}" — use just "{{first_name}},"
- Self-introduction
- Em-dashes (—) → periods
- AI vocabulary: delve, foster, robust, leverage, synergy, streamline, unlock, transform, etc

═══════════════════════════════════════════════════════════════════
CROSS-TOUCH:
═══════════════════════════════════════════════════════════════════
- PRONOUN LOCK: "I" (matches Day 1)
- ANGLE: TIME-TO-MARKET (different from Day 1''s approval uplift)
- PEER: inDrive primary; Mattilda alternate (also did LatAm geo expansion via orchestrator)

OUTPUT: Body only, plain text, no signature.
$D3$
  ),
  description = 'Day 3 V9 — TIME-TO-MARKET value prop (geo expansion / new market velocity). CPO/Regional GM angle. inDrive 10 countries <8 months as anchor.',
  updated_at = NOW()
WHERE id = v_id;
RAISE NOTICE '✓ Day 3 V9 (Time-to-Market)';

-- =====================================================
-- DAY 5: pivot to NEGOTIATION POWER angle (challenger reframe)
-- =====================================================
SELECT id INTO v_id FROM ai_prompts WHERE org_id=v_org_id AND name='chief_outreach_day5_email_reply_v3';

UPDATE ai_prompts SET
  prompt_body = (
    'EMAIL REPLY (same Day 1 thread) to {{first_name}} at {{company}}. Day 1 was 4 days ago.' ||
    chr(10) || chr(10) ||
    'TOUCH ROLE: Challenger reframe with NEGOTIATION POWER as Yuno value prop. The contrarian: most teams optimize incumbent contract; the bigger lever is exit credibility.' ||
    chr(10) || chr(10) ||
    'TOUCH OWNS: Negotiation Power → Cost Reduction (vendor-agnostic, PSP arbitrage, credible exit path).' ||
    chr(10) ||
    'Concrete data: Multi-PSP strategy = up to 15% savings on processing fees. Cost-based routing = 20-40% savings in MENA. Spreedly vault: $0.18/card update vs $0.25 from PSP-locked = 28% cheaper. Acquirer markup, gateway fees, refund + chargeback fees ARE negotiable when you process across multiple PSPs.' ||
    chr(10) ||
    'Persona match: CFO + Head of Finance — directly hits cost-of-payments line on P&L.' ||
    chr(10) ||
    'Vocabulary: "vendor-agnostic", "PSP arbitrage", "least-cost routing", "acquirer markup compression", "best-of-breed stack", "credible exit path", "RFP leverage".' ||
    chr(10) ||
    'OTHER VALUE PROPS — do NOT mention here:' ||
    chr(10) ||
    '  - Smart Routing approval uplift (Day 1)' ||
    chr(10) ||
    '  - Time-to-Market (Day 3)' ||
    chr(10) ||
    '  - Dev Cost (reserved Day 7)' ||
    chr(10) ||
    '  - Reconciliation (reserved Day 9)' ||
    $D5$
═══════════════════════════════════════════════════════════════════
USED SIGNALS — DO NOT REUSE: trigger_event (Day 1), tech_stack/TTM (Day 3), inDrive (Day 3)

═══════════════════════════════════════════════════════════════════
PHILOSOPHY — CHALLENGER REFRAME: NEGOTIATION POWER:
═══════════════════════════════════════════════════════════════════
Most VP Payments / CFOs optimize the OBVIOUS lever: renegotiating MDR with their incumbent acquirer. Without a credible exit path, the incumbent has no incentive to recut rates seriously.

The contrarian: orchestration creates the credible exit. When you can move 20% of volume to another acquirer in days (not months), your incumbent renegotiates. That''s where the real basis-points savings come from — not from the acquirer being generous.

═══════════════════════════════════════════════════════════════════
STRUCTURE (60-130 words):
═══════════════════════════════════════════════════════════════════
1. CONTRARIAN OPENER (2-3 sentences). Disrupt default thinking on cost.
   • "Most teams in your spot try to renegotiate MDR with their incumbent acquirer. Without a credible exit path, that conversation rarely moves the needle more than a few basis points."
   • "Default move post-merger is consolidating PSPs to cut vendor count. The bigger cost lever is keeping multiple acquirers and using the move-volume-in-days option as renegotiation leverage."

2. NEGOTIATION POWER MECHANICS (2 sentences). Make the savings tangible.
   • "Acquirer markup, gateway fees, refund and chargeback fees ARE all negotiable when you process across multiple PSPs. Most platforms see 10-15% reduction in blended processing cost within 6 months of going vendor-agnostic."
   • "Spreedly published numbers showing PCI-vaulted card updates at $0.18 each vs $0.25 from a PSP-locked stack — that 28% gap shows up everywhere once you decouple."

3. YUNO + PEER (1-2 sentences). Position Yuno as the credible-exit enabler.
   • "Yuno is the orchestration layer that makes that exit credible. Routing happens in real time across whichever acquirers you''re plugged into, no rip-and-replace. SeatGeek runs payments through Spreedly for exactly this reason — staying PSP-independent preserves switching leverage at scale."
   • "Most multi-PSP merchants we see save 10-15% on processing within the first year, just from the renegotiation that becomes possible when the incumbent knows you can actually move."

4. CALIBRATED QUESTION (1 sentence). Reveals current contract leverage.
   • "When was the last time you successfully renegotiated MDR with your incumbent — and did it feel like the conversation had any teeth?"
   • "Are you currently single-acquirer per market, or do you have credible alternates ready to take volume on short notice?"

5. SIGNATURE: "Thanks,\nRasheed\nYuno"
$D5$ ||
    $D5B$
═══════════════════════════════════════════════════════════════════
ABSOLUTE BANS:
═══════════════════════════════════════════════════════════════════
- Mentioning "smart routing" / "approval lift" / "auth rate" — Day 1''s angle
- Mentioning "geo expansion" / "time-to-market" / "configuration not code" — Day 3''s angle
- Mentioning "single API" / "engineering bandwidth" — Day 7''s angle (here use "vendor-agnostic" / "PSP arbitrage")
- Mentioning "reconciliation" / "unified ledger" — Day 9''s angle
- Re-using inDrive (used Day 3) — use SeatGeek/Spreedly for switching-leverage, or McDonald''s as multi-channel
- "Following up" / "Just checking in" / "Bumping"
- Disparaging Stripe/Adyen — frame as "incumbent rates without exit credibility"
- Em-dashes (—) → periods
- AI vocabulary: delve, foster, robust, leverage, synergy, streamline, unlock, transform, etc

═══════════════════════════════════════════════════════════════════
CROSS-TOUCH:
═══════════════════════════════════════════════════════════════════
- PRONOUN LOCK: "I" (matches Days 1/3)
- ANGLE: NEGOTIATION POWER / cost (challenger reframe vs Day 1 approval / Day 3 TTM)
- PEER: SeatGeek (Spreedly switching leverage) primary; McDonald''s as multi-channel alt

OUTPUT FORMAT:
Line 1: SUBJECT: Re: [original Day 1 subject]
Line 2: (blank)
Lines 3+: 60-130 words.
$D5B$
  ),
  description = 'Day 5 V8 — NEGOTIATION POWER value prop (CFO angle). Challenger reframe: most renegotiate with incumbent without exit credibility. Yuno makes exit credible.',
  updated_at = NOW()
WHERE id = v_id;
RAISE NOTICE '✓ Day 5 V8 (Negotiation Power)';

-- =====================================================
-- DAY 7: pivot to DEV COST angle (champion = payments engineering)
-- =====================================================
SELECT id INTO v_id FROM ai_prompts WHERE org_id=v_org_id AND name='chief_outreach_day7_linkedin_followup_v3';

UPDATE ai_prompts SET
  prompt_body = REPLACE(
    REPLACE(prompt_body,
      'TOUCH ROLE: Champion-collaboration framing. NOT a "you''re not the right person, who is?" ask (that demerits the prospect). Position {{first_name}} as the senior who can pull in the technical owner. Suggest 3-way conversation, not a replacement.',
      'TOUCH ROLE: Champion-collaboration framing + DEV COST as Yuno value prop. The payments engineering team owns the dev-cost pain — natural fit for the 3-way invite.

TOUCH OWNS: Development Cost / Engineering Velocity (single API replaces N PSP integrations).
Concrete data: 4-8 weeks dev per PSP integration (industry baseline). Building 5 PSPs = 6-9 months stealing roadmap from product. In-house orchestration build = €2M+ initial / €49k/mo team / 18-month time-to-market avoided. Yuno = single API to 1000+ payment methods.
Persona match: CTO / VP Engineering / payments-eng team — wants payments OFF the eng roadmap so team builds product, not plumbing.
Vocabulary: "single API", "no-code workflows", "engineering bandwidth", "abstract the PSP layer", "future-proof stack", "off the eng roadmap".

NEVER position {{first_name}} as the "wrong person". Position them as the senior who can pull in their payments-engineering champion for a collaborative 3-way conversation.'
    ),
    'BRIEF VALUE PROP REMINDER (1 sentence). Reference Day 1''s capability + numeric anchor. Examples:
   • "the smart-routing layer we covered typically lands with someone owning BIN-level decisioning or processor failover."
   • "the +3pp routing pattern usually sits with the team running gateway-side routing logic."',
    'DEV-COST ANGLE OPENER (1-2 sentences). Position the dev-cost pain that payments-engineering owns. Examples:
   • "the dev-cost angle of orchestration usually lands with whoever''s tired of maintaining 3-4 separate PSP integrations + their certifications."
   • "most payments engineering teams we talk to are fighting to keep PSP integration work off their roadmap — that''s where Yuno''s single API tends to land."
   • "the per-PSP integration tax (4-8 weeks per provider) usually sits with someone in your payments engineering org."'
  ),
  description = 'Day 7 V9 — Champion-collaboration + DEV COST value prop. Payments-engineering champion is the natural collaborator on dev-velocity pain.',
  updated_at = NOW()
WHERE id = v_id;
RAISE NOTICE '✓ Day 7 V9 (Dev Cost + champion collab)';

-- =====================================================
-- DAY 9: synthesis — weave Smart Routing + Negotiation + TTM + RECONCILIATION
-- =====================================================
SELECT id INTO v_id FROM ai_prompts WHERE org_id=v_org_id AND name='chief_outreach_day9_bc_email_v3';

UPDATE ai_prompts SET
  prompt_body = REPLACE(
    REPLACE(prompt_body,
      '2. THE BC + YUNO CAPABILITY + DEFENDIBLE NUMBER (3 sentences). Surface ONE specific number from the BC (rounded naturally) + name the Yuno capability driving it (smart routing / single API / NOVA / MDR optimization). Reference 2 of the 3 prior peers as "the comp set".',
      '2. THE BC + 3 OF 4 VALUE PROPS WOVEN + DEFENDIBLE NUMBER (3 sentences). Recap the cadence by weaving 3 of the 4 value props covered (Day 1 = Smart Routing, Day 3 = Time-to-Market, Day 5 = Negotiation Power, Day 7 = Dev Cost) PLUS introduce RECONCILIATION as the 4th BC pillar that hasn''t been mentioned yet. Surface ONE specific number from the BC (rounded). Reference 2 of the 3 prior peers as "the comp set".

  Example synthesis pattern:
  "The BC pencils out around +Xpp approval lift across [markets], with the comp set being [Rappi + McDonald''s]. Four pillars: smart routing for approval (covered Day 1), time-to-market for [your expansion context], negotiation leverage from going vendor-agnostic, and the unified-reconciliation layer that consolidates [N PSPs] into one settlement view — usually saves your finance team 70-90% of manual matching work."'
    ),
    '"Three pillars: approval rate uplift by market, MDR cost reduction, payment-method coverage for the post-merger entity."',
    '"Four pillars: smart routing for approval lift, time-to-market velocity for new geos, negotiation leverage across PSPs, and unified reconciliation across all settlement files."'
  ),
  description = 'Day 9 V8 — multi-prop synthesis: weaves Smart Routing + Time-to-Market + Negotiation + RECONCILIATION (introduced as 4th pillar in BC). Becc Holland soft-exit synthesis.',
  updated_at = NOW()
WHERE id = v_id;
RAISE NOTICE '✓ Day 9 V8 (multi-prop synthesis + Reconciliation)';

RAISE NOTICE '';
RAISE NOTICE '═══════════════════════════════════════════════════════════════';
RAISE NOTICE 'Migration 124 complete: value props diversified across 5 touches';
RAISE NOTICE '  Day 1 → Smart Routing (VP Payments)';
RAISE NOTICE '  Day 3 → Time-to-Market (CPO)';
RAISE NOTICE '  Day 5 → Negotiation Power (CFO)';
RAISE NOTICE '  Day 7 → Dev Cost (CTO/eng champion)';
RAISE NOTICE '  Day 9 → multi-prop synthesis + Reconciliation';
RAISE NOTICE '═══════════════════════════════════════════════════════════════';

END $MIGRATION$;
