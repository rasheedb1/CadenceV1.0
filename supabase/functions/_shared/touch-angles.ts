// Per-touch angle lock — the 9-day cadence is designed so each touch covers
// a DIFFERENT Yuno value prop, with a different peer + different number.
// Without this lock, the AI defaults to "smart routing + approval lift +
// SpaceX/Uber" on every single touch (verified 2026-05-09 cadence test).
//
// Used by:
//   - ai-research-generate: injects ANGLE LOCK section so the AI knows
//     which capability/peer/number to use for THIS specific day.
//   - chief-supervise-message: validates the message uses the assigned
//     angle and not one reserved for another touch.

export interface TouchAngle {
  day_offset: number
  angle_name: string
  capability_keywords: string[]   // exact phrases the message must include
  forbidden_capabilities: string[] // capabilities reserved for OTHER touches
  primary_numbers: string[]       // defendible numbers for this touch
  primary_peers: string[]         // verified Yuno customers for this angle
  hook_pattern: string            // what kind of opener this touch uses
  cta_pattern: string             // what kind of CTA closes this touch
  narrative_role: string          // role within the 9-day arc
}

export const TOUCH_ANGLES: Record<number, TouchAngle> = {
  1: {
    day_offset: 1,
    angle_name: 'Smart Routing → Approval Rate Uplift',
    capability_keywords: ['smart routing', 'intelligent routing', 'cascading retries', 'auth uplift', 'transaction recovery', 'issuer affinity', 'BIN routing'],
    forbidden_capabilities: ['time-to-market', 'configuration not code', 'vendor-agnostic', 'PSP arbitrage', 'unified reconciliation', 'single pane of glass', 'engineering bandwidth'],
    primary_numbers: ['+5-12pp auth lift offshore→local', '+2-5pp same-market', '+5% approval (Reserva +4%)', '~75% recovery via NOVA'],
    primary_peers: ['inDrive (single API across 47 countries)', 'Open English (+5% approval)', 'Reserva (+4% in <3 months)', 'Livelo (+5% approval)', 'Uber (runs through Yuno)', 'SpaceX (runs through Yuno)'],
    hook_pattern: 'Specific payments problem this company likely faces (geo expansion gap, single-PSP risk, multi-market auth ceiling, post-merger stack collision). One specific pain.',
    cta_pattern: 'Calibrated question about CURRENT STATE of approval rates / routing setup. Permission exit if not on roadmap.',
    narrative_role: 'INSIGHT — first contact, identify a specific approval-rate gap, pitch routing as fix. Establish Yuno as orchestrator. NO multi-prop synthesis here.',
  },
  3: {
    day_offset: 3,
    angle_name: 'Time-to-Market → Configuration not Code',
    capability_keywords: ['time-to-market', 'time to market', 'configuration not code', 'go-live in days', 'geo expansion', 'drag-and-drop workflows', 'local acquiring at the click of a button', '1000+ payment methods', '200+ countries'],
    forbidden_capabilities: ['smart routing', 'approval rate uplift', 'auth lift', 'cascading retries', 'vendor-agnostic', 'PSP arbitrage', 'unified reconciliation'],
    primary_numbers: ['4-8 weeks per-PSP integration', '6-9 months for 5 PSPs', '18 months / €2M+ for in-house build', 'inDrive launched in 10 countries in <8 months', '1000+ APMs / 200+ countries'],
    primary_peers: ['inDrive (Vasiliy Everstov: single API across 47 countries, 10 new countries in <8 months)', 'Mattilda (LATAM geo expansion via orchestrator)'],
    hook_pattern: 'Tech-stack observation grounded in their company intel — recent expansion, new market launch, integration timeline visible. Tied to TIME pain.',
    cta_pattern: 'Calibrated question about current eng cycle for spinning up a new acquirer / market. NOT meeting request.',
    narrative_role: 'PEER STORY — show that companies in their pattern hit the integration-time wall, and inDrive solved it via orchestration. Day 1 angle (smart routing) is RESERVED — do not repeat.',
  },
  5: {
    day_offset: 5,
    angle_name: 'Negotiation Power → Vendor-Agnostic / PSP Arbitrage',
    capability_keywords: ['vendor-agnostic', 'PSP arbitrage', 'least-cost routing', 'acquirer markup compression', 'best-of-breed stack', 'credible exit path', 'RFP leverage', 'switching leverage'],
    forbidden_capabilities: ['smart routing', 'auth lift', 'time-to-market', 'configuration not code', 'go-live in days', 'unified reconciliation', 'single pane of glass'],
    primary_numbers: ['10-15% reduction in blended processing cost in 6 months', '10-50bps MDR savings via smart routing', '28% Spreedly card-update savings ($0.18 vs $0.25)', '20-40% savings cost-based routing in MENA'],
    primary_peers: ['SeatGeek (runs through Spreedly for switching leverage)', 'McDonald\'s (multi-channel ops scale)'],
    hook_pattern: 'Contrarian reframe — disrupt the default thinking that you renegotiate MDR with incumbent. The bigger lever is having credible exit.',
    cta_pattern: 'Calibrated question about last successful MDR renegotiation OR whether single-acquirer per market currently. NOT meeting request.',
    narrative_role: 'CONTRARIAN REFRAME — challenge the assumption that PSP cost is fixed. Position orchestration as the negotiation enabler. Day 1 (routing) and Day 3 (TTM) angles are RESERVED — do not repeat.',
  },
  7: {
    day_offset: 7,
    angle_name: 'NOVA AI Recovery → Failed Payment Retry',
    capability_keywords: ['NOVA', 'NOVA AI Agent', 'failed payment recovery', 'intelligent retry', 'cascading retries', 'failover', 'transaction recovery', 'retry across processors'],
    forbidden_capabilities: ['smart routing', 'auth lift', 'time-to-market', 'configuration not code', 'go-live in days', 'vendor-agnostic', 'PSP arbitrage', 'unified reconciliation', 'single pane of glass', 'engineering bandwidth', 'single API integration', 'abstract the PSP layer', '4-8 weeks per PSP', '6-9 months stealing roadmap'],
    primary_numbers: ['~75% recovery of failed payments via NOVA', '50-70% retry success rate after first decline', 'AI-driven retry across 300+ processors'],
    primary_peers: ['Avianca (runs through Yuno across LATAM)', 'Smartfit (runs through Yuno)', 'Open English (recovered transactions previously declined)'],
    hook_pattern: 'Soft observation about LOST REVENUE from declined transactions that get retried wrong (manual queues) or not at all. Specific to lead\'s vertical or volume scale.',
    cta_pattern: 'Calibrated question about how they currently handle failed payment retries — manual queues, none, primitive retry logic? Soft 3-way invite optional with payments ops champion.',
    narrative_role: 'RECOVERY ANGLE — show that the lifecycle of a payment doesn\'t end at first decline. NOVA recovers ~75% across multiple processors. Days 1/3/5 angles (routing / TTM / negotiation) RESERVED — use NOVA AI as the new value prop, not engineering cost (already implied in Day 3 TTM).',
  },
  9: {
    day_offset: 9,
    angle_name: 'Reconciliation + Multi-prop Synthesis (Soft-Exit Parting Gift)',
    capability_keywords: ['unified reconciliation', 'single pane of glass', 'consolidated settlement', 'reconciliation layer', 'multi-prop synthesis'],
    forbidden_capabilities: [], // synthesis allowed to weave 3 of 4 prior props
    primary_numbers: ['70-90% manual matching saved by finance team', 'aggregate "+Xpp approval lift across [markets]"', 'BC pencils out to specific Yuno-customer-equivalent number'],
    primary_peers: ['comp set: 2 of {Rappi, inDrive, McDonald\'s}', 'reference 2 prior peers WITHOUT listing all 3'],
    hook_pattern: 'NARRATIVE ARC OPENER (2 sentences). Acknowledge the multi-day investigation succinctly. ONE-line recap of arc using vocabulary lock. NOT breakup, NOT guilt-trip, NOT "last try".',
    cta_pattern: 'EFFORT + CALIBRATION ASK + SOFT EXIT. The BC was custom-built using the lead\'s actual public metrics (volume, market mix, processor count). Deliver BC URL UPFRONT, never gated. Frame the numbers as a "possible outcome with Yuno as orchestrator" + invite the lead to push back if assumptions are off ("if my volume is off by X%, telling me is the most useful feedback"). Soft exit + explicit permission to never reply. NOT a meeting request.',
    narrative_role: 'CUSTOM-BUILT BC + FEEDBACK LOOP — synthesize the prior 4 angles + introduce RECONCILIATION as the 4th BC pillar. Signal real EFFORT (built specifically for them, not generic). State assumptions explicitly (volume from earnings, market mix from disclosed footprint). Deliver URL upfront. Ask for calibration feedback as PRIMARY ask, not meeting. Becc Holland #5 highest-converter pattern.',
  },
}

// Day 0 (linkedin_connect) and Day 2 (linkedin_comment) don't get angle locks
// because they're either static templates or pure-presence reactions.

export function getTouchAngle(day_offset: number | null | undefined): TouchAngle | null {
  if (day_offset == null) return null
  return TOUCH_ANGLES[day_offset] || null
}

/**
 * Build the ANGLE LOCK section to inject into the AI prompt for this touch.
 * Returns empty string if this day has no lock (Day 0, 2).
 */
export function buildAngleLockSection(day_offset: number | null | undefined): string {
  const angle = getTouchAngle(day_offset)
  if (!angle) return ''
  return `## 🎯 DAY ${angle.day_offset} ANGLE LOCK — non-negotiable for narrative arc:

This touch OWNS: ${angle.angle_name}
Narrative role in the 9-day arc: ${angle.narrative_role}

CAPABILITY — pick ONE verbatim from this list:
${angle.capability_keywords.map(k => `  ✓ "${k}"`).join('\n')}

FORBIDDEN CAPABILITIES (reserved for other touches in this cadence — DO NOT mention):
${angle.forbidden_capabilities.length > 0 ? angle.forbidden_capabilities.map(k => `  ✗ "${k}"`).join('\n') : '  (none — synthesis touch can weave prior props)'}

NUMBER — use ONE from this list (defendible for THIS angle):
${angle.primary_numbers.map(n => `  • ${n}`).join('\n')}

PEER — pick ONE that fits THIS angle:
${angle.primary_peers.map(p => `  • ${p}`).join('\n')}

HOOK PATTERN: ${angle.hook_pattern}

CTA PATTERN: ${angle.cta_pattern}

→ This is the SPECIFIC angle for Day ${angle.day_offset}. The previous touches in this cadence covered other angles (you'll see them in PRIOR TOUCHES section). Do not repeat what was already said. Build the narrative arc — don't replay the same pitch in different words.`
}

/**
 * Compact summary of all 5 touches' angles, for inclusion in Carlos
 * supervise prompt so it can detect cross-touch repetition.
 */
export function buildAngleArcSummary(): string {
  return Object.values(TOUCH_ANGLES)
    .sort((a, b) => a.day_offset - b.day_offset)
    .map(a => `Day ${a.day_offset} → ${a.angle_name} (capability: ${a.capability_keywords[0]}; peer: ${a.primary_peers[0].split('(')[0].trim()}; number: ${a.primary_numbers[0]})`)
    .join('\n')
}
