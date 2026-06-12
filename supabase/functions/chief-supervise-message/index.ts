// chief-supervise-message — V2 (post peer review)
// =============================================================================
// Carlos QA Supervisor with Haiku 4.5 + 10 improvements from peer review:
//
//   1. Hybrid architecture: pre-flight code checks + LLM only for 3 subjective dims
//   2. 3 dimensions (Relevance, Quality, Voice) — reduced from 5 (overlap removed)
//   3. Uniform threshold 7.5 + dead band 7.2-7.8
//   4. linkedin_comment = rule-based binary (NO LLM)
//   5. email_reply Day 5+ anti-repeat vs Day 1 thread
//   6. Regenerate hint enum (7 values, no free text)
//   7. Failsafe: Carlos error/timeout → escalate (NEVER auto_approve)
//   8. Variable similarity thresholds (0.65 LinkedIn / 0.80 email)
//   9. Circuit breaker rolling 24h + min 20 samples
//  10. Shadow mode flag (Carlos V2 evaluates but doesn't act for 2 weeks)
//
// Anti-loop guards (still active):
//   - Hard cap regenerate=2
//   - Daily budget cap $30
//   - Temperature=0
//   - Prompt-version pinning
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthContext, createSupabaseClient } from '../_shared/supabase.ts'
import { detectAiTells, AI_TELL_VOCABULARY } from '../_shared/ai_tells.ts'
import { TOUCH_ANGLES, buildAngleArcSummary, getTouchAngle } from '../_shared/touch-angles.ts'
import { scanFields, summarizeHits } from '../_shared/placeholder-guard.ts'

interface SuperviseRequest {
  review_id: string
  ownerId?: string
  orgId?: string
}

// V3: upgraded to Sonnet 4.6 for deeper judgment on Voice + Structure dimensions
const SONNET_MODEL = 'claude-sonnet-4-6'
const SONNET_INPUT_PRICE = 3.0 / 1_000_000
const SONNET_OUTPUT_PRICE = 15.0 / 1_000_000
// Legacy aliases (still used in helper functions)
const HAIKU_MODEL = SONNET_MODEL  // backward compat name
const HAIKU_INPUT_PRICE = SONNET_INPUT_PRICE
const HAIKU_OUTPUT_PRICE = SONNET_OUTPUT_PRICE
const ESTIMATED_COST_USD = 0.025  // Sonnet ~$0.009-0.012 typical, round up for safety
const MAX_REGENERATE = 5  // V8: bumped from 2 → 5 (philosophy: keep improving, don't skip)
const MIN_ACCEPTABLE_SCORE = 5.0  // V8: below this = truly bad, skip; above = send best attempt

// V8: Deterministic verified customer list (replaces fabricated_proof LLM judgment)
const VERIFIED_CUSTOMERS_NORM = [
  'rappi', 'indrive', 'uber', "mcdonald's", 'mcdonalds', 'mcdonald',
  'avianca', 'viva aerobus', 'vivaaerobus', 'viva',
  'xcaret', 'livelo', 'reserva', 'open english', 'openenglish',
  'smartfit', 'smart fit', 'spacex', 'space x',
  // Other orchestrator customers OK to reference (industry context, not Yuno claim)
  'seatgeek', 'mattilda', 'firstgroup', 'first group',
]

function detectFabricatedYunoCustomer(body: string): string[] {
  const violations: string[] = []
  const claimPatterns = [
    /\b([A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,2})\s+(?:uses?|runs?(?:\s+through)?|moved\s+to|integrated\s+with|launched\s+(?:on|with))\s+Yuno/g,
    /\bAt\s+([A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,2}),\s+[\w\s]{3,40}\s+used?\s+Yuno/g,
    /\b([A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,2})'s\s+payments?\s+(?:team|lead)\s+used?\s+Yuno/g,
  ]
  for (const pat of claimPatterns) {
    for (const m of body.matchAll(pat)) {
      const name = (m[1] || '').trim().toLowerCase()
      if (!name) continue
      if (['most', 'many', 'some', 'platforms', 'companies', 'merchants', 'teams'].includes(name)) continue
      const isVerified = VERIFIED_CUSTOMERS_NORM.some(c =>
        name === c || name.startsWith(c + ' ') || name.endsWith(' ' + c) || name.includes(c)
      )
      if (!isVerified) violations.push(name)
    }
  }
  return violations
}

// V8: Auto-fix common LLM bad habits BEFORE pre-flight (mechanical)
function autoFixCommon(body: string): { fixed: string, fixesApplied: string[] } {
  const fixesApplied: string[] = []
  let fixed = body
  if (/\s*—\s*/.test(fixed)) {
    fixed = fixed.replace(/\s*—\s*/g, '. ').replace(/\.\s+\./g, '.')
    fixesApplied.push('em_dash→period')
  }
  if (/[a-z]–[a-z]/i.test(fixed)) {
    fixed = fixed.replace(/([a-z])–([a-z])/gi, '$1-$2')
    fixesApplied.push('en_dash→hyphen')
  }
  if (/~\s*\$?\d/.test(fixed)) {
    fixed = fixed.replace(/~\s*(\$?)/g, 'around $1')
    fixesApplied.push('tilde→around')
  }
  if (/[‘’]/.test(fixed)) { fixed = fixed.replace(/[‘’]/g, "'"); fixesApplied.push('curly_single→straight') }
  if (/[“”]/.test(fixed)) { fixed = fixed.replace(/[“”]/g, '"'); fixesApplied.push('curly_double→straight') }
  if (/\bleverage\b/i.test(fixed)) {
    fixed = fixed.replace(/\bleverages?\b/gi, (m: string) => {
      if (m === 'Leverages') return 'Uses'
      if (m === 'Leverage') return 'Use'
      if (m === 'leverages') return 'uses'
      return 'use'
    })
    fixesApplied.push('leverage→use')
  }
  if (/•/.test(fixed)) { fixed = fixed.replace(/•/g, '-'); fixesApplied.push('bullet→hyphen') }
  if (/…/.test(fixed)) { fixed = fixed.replace(/…/g, '...'); fixesApplied.push('ellipsis→dots') }
  return { fixed, fixesApplied }
}

// Variable similarity thresholds by step type
const SIMILARITY_THRESHOLDS = {
  linkedin: 0.65,
  email: 0.80,
} as const

// Anti-repeat threshold for email_reply Day 5+ vs Day 1 thread
const EMAIL_REPLY_ANTI_REPEAT_THRESHOLD = 0.40

// Allowed regenerate hint enum (closed set)
type RegenerateHint = 'shorter' | 'more_specific' | 'different_angle' | 'different_signal' | 'fix_structure' | 'soften_tone' | 'add_proof_point'
const VALID_HINTS: RegenerateHint[] = ['shorter', 'more_specific', 'different_angle', 'different_signal', 'fix_structure', 'soften_tone', 'add_proof_point']

// Allowed risk triggers (V14: REMOVED fabricated_proof — see V14 priority order
// in CARLOS_V2_SYSTEM_PROMPT. Yuno customers ARE real, metrics aren't public,
// don't penalize the AI for citing realistic estimates. Only flag absurd
// numbers via claims_undefensible.)
const VALID_RISK_TRIGGERS = [
  'competitor_aggressive', 'claims_undefensible', 'tone_pushy',
  'yuno_as_replacement', 'pricing_comparison', 'amateur_vocab',
  'content_offensive', 'regulatory_blindness',
  // V14: Removed 'fabricated_proof' — Yuno customers are real, metrics aren't public.
  // Removed 'no_engineering_work_lie' — too easily mistriggered.
  'persona_mismatch', 'false_scarcity_or_urgency', 'guilt_trip',
  // V15 narrative arc: detect when this touch repeats angle/peer/number from
  // a prior touch in the same cadence. Carlos receives PRIOR TOUCHES context
  // and judges whether the new message builds on the arc or just rehashes.
  'angle_duplication',
  // V16: AI sometimes leaks template placeholders ({{first_name}}, [BC_URL],
  // <recipient>, etc.) when it copies prompt examples too literally or fails
  // to substitute a value. Carlos auto-rejects → force regenerate. The
  // outbound endpoints (send-email / linkedin-*) ALSO check + block as last
  // line of defense — but Carlos catches it first to avoid wasting an attempt.
  'unsubstituted_placeholder',
]

// LinkedIn comment allowed patterns (pre-defined for rule-based path)
// V12 (2026-05-18): COMMENT_PATTERNS removed. The structural bans in
// validateLinkedinComment (word count 1-4, no questions, no @mentions, no
// Yuno mention, no ALL CAPS, no generic praise) are sufficient; requiring
// the comment to match a hardcoded phrase library was rejecting good
// context-aware reactions the LLM picks based on actual post content.

// ─── Tokenize + shingles ─────────────────────────────────────────────
function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^\w\s']/g, ' ').split(/\s+/).filter(w => w.length > 0)
}
function shingles(text: string, n = 5): Set<string> {
  const tokens = tokenize(text)
  const set = new Set<string>()
  if (tokens.length < n) { set.add(tokens.join(' ')); return set }
  for (let i = 0; i <= tokens.length - n; i++) set.add(tokens.slice(i, i + n).join(' '))
  return set
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let intersection = 0
  for (const item of a) if (b.has(item)) intersection++
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

// ════════════════════════════════════════════════════════════════════
// PRE-FLIGHT CODE CHECKS (deterministic, no LLM)
// ════════════════════════════════════════════════════════════════════
interface PreflightResult {
  passed: boolean
  failures: string[]
  hint: RegenerateHint | null
}

function runPreflightChecks(
  subject: string | null,
  body: string,
  stepType: string,
  dayOffset: number | null
): PreflightResult {
  const failures: string[] = []

  // 1. Em-dashes detection
  if (/—/.test(body)) failures.push('em_dashes')

  // 2. Template variables unrendered (V16: full placeholder-guard scan
  //    catches {{x}}, {x}, [X], <x>, ${x}, XXX, etc. — anything that smells
  //    like an unsubstituted placeholder)
  const placeholderHits = scanFields({ subject: subject || null, body })
  if (placeholderHits.length > 0) {
    failures.push(`unsubstituted_placeholder:${summarizeHits(placeholderHits).slice(0, 200)}`)
  }

  // 3. Markdown leakage (** ## - bullets)
  if (/\*\*|##|^[-*]\s/m.test(body)) failures.push('markdown_leakage')

  // 4. ALL CAPS detection (10+ char run all uppercase, excluding common acronyms)
  const capsMatches = body.match(/\b[A-Z]{10,}\b/g)
  if (capsMatches && capsMatches.length > 0) failures.push('all_caps_run')

  // 5. Calendar links Day 1 (not allowed in cold)
  if (dayOffset !== null && dayOffset <= 1 &&
      /(calendly\.com|hubspot\.com\/meetings|cal\.com|savvycal\.com|chilipiper\.com)/.test(body)) {
    failures.push('calendar_link_day1')
  }

  // 6. Length check by step_type (V9 ranges from migration 120 — explicit value prop)
  const wordCount = body.trim().split(/\s+/).filter(Boolean).length
  const lengthRanges: Record<string, [number, number]> = {
    'linkedin_connect_0': [10, 60],
    'send_email_1': [100, 220],         // V13: generous range per user feedback (don't pre-flight reject good messages over 5w).
    'linkedin_comment_2': [1, 4],
    'linkedin_message_3': [80, 180],    // V13: generous.
    'email_reply_5': [100, 220],        // V13: generous.
    'linkedin_message_7': [40, 180],    // V15b: 130→180. AI consistently generates 140-170w for Day 7 (orchestrator + capability + peer + 3-way invite). User feedback 2026-05-09.
    'send_email_9': [100, 250],         // V13: synthesis can run long.
    'task_9': [100, 250],
  }
  // SKIP_COMMENT escape hatch: if message is exactly that, allow it
  if (stepType === 'linkedin_comment' && body.trim() === 'SKIP_COMMENT') {
    return { passed: true, failures: [], hint: null }
  }
  const rangeKey = dayOffset !== null ? `${stepType}_${dayOffset}` : stepType
  const range = lengthRanges[rangeKey]
  if (range) {
    if (wordCount < range[0]) failures.push(`length_too_short:${wordCount}/${range[0]}`)
    if (wordCount > range[1]) failures.push(`length_too_long:${wordCount}/${range[1]}`)
  }

  // 6b. AI-tells detection (research-backed bans 2025-2026)
  const aiTells = detectAiTells(body).filter(v => {
    if (stepType === 'linkedin_connect' && v.category === 'opener' && /saw\s+your/i.test(v.match)) return false
    return true
  })
  if (aiTells.length > 0) {
    const summary = aiTells.slice(0, 3).map(v => `${v.category}:${v.pattern}`).join(',')
    failures.push(`ai_tell:${summary}`)
  }

  // 6c. SUBSTANCE CHECK (V6 — content quality, not just form)
  const substance = runSubstanceCheck(body, stepType, dayOffset)
  if (!substance.passed) {
    failures.push(`substance:${substance.failures.join(',')}`)
  }

  // 7. Subject Title Case detection (email steps)
  const isEmailStep = stepType === 'send_email' || stepType === 'email_reply'
  if (isEmailStep && subject) {
    const words = subject.split(/\s+/).filter(Boolean)
    if (words.length >= 3) {
      const titleCaseCount = words.filter(w => /^[A-Z]/.test(w) && w.length > 3).length
      if (titleCaseCount >= words.length - 1) failures.push('subject_title_case')
    }
    if (subject.length > 80) failures.push(`subject_too_long:${subject.length}`)
    if (/^Re:/i.test(subject) && stepType === 'send_email') failures.push('cold_email_re_prefix')
    if (!/^Re:/i.test(subject) && stepType === 'email_reply') failures.push('reply_missing_re_prefix')
  }

  // 8. Cliché openers — but allow "Saw your X" for linkedin_connect (SMYKM anchor)
  if (stepType !== 'linkedin_connect') {
    const clichePatterns = [
      /hope (this|the email) finds you well/i,
      /i hope you('|')re doing well/i,
      /just (checking|circling back|following up|bumping)/i,
      /quick question/i,
      /per my (last|previous) (email|message)/i,
    ]
    for (const pattern of clichePatterns) {
      if (pattern.test(body)) {
        failures.push(`cliché_opener:${pattern.source.slice(0, 30)}`)
        break
      }
    }
  }

  // 9. Banned vocabulary (full AI_TELL_VOCABULARY list)
  for (const word of AI_TELL_VOCABULARY) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(body)) {
      failures.push(`ai_vocab:${word}`)
      break
    }
  }

  // Determine hint based on first failure
  let hint: RegenerateHint | null = null
  if (failures.length > 0) {
    const f = failures[0]
    if (f.startsWith('length_too_long')) hint = 'shorter'
    else if (f.startsWith('length_too_short')) hint = 'add_proof_point'
    else if (f === 'em_dashes' || f === 'markdown_leakage' || f === 'all_caps_run' ||
             f.startsWith('subject_') || f.startsWith('cold_email_re_') || f.startsWith('reply_missing_re_')) hint = 'fix_structure'
    else if (f.startsWith('cliché_opener') || f.startsWith('banned_jargon')) hint = 'different_angle'
    else if (f === 'calendar_link_day1') hint = 'fix_structure'
    else hint = 'fix_structure'
  }

  return { passed: failures.length === 0, failures, hint }
}

// ════════════════════════════════════════════════════════════════════
// LINKEDIN COMMENT RULE-BASED PATH (no LLM)
// ════════════════════════════════════════════════════════════════════
interface CommentValidationResult {
  passed: boolean
  failures: string[]
  hint: RegenerateHint | null
}

function validateLinkedinComment(message: string): CommentValidationResult {
  const failures: string[] = []
  const trimmed = message.trim()

  // V6: SKIP_COMMENT escape hatch (post not company-relevant)
  if (trimmed === 'SKIP_COMMENT') {
    return { passed: true, failures: [], hint: null }
  }

  // V6: Length: 1-4 words STRICT
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length
  if (wordCount > 4) failures.push(`comment_too_long:${wordCount}`)
  if (wordCount === 0) failures.push('comment_empty')

  // No questions
  if (/\?/.test(trimmed)) failures.push('comment_has_question')

  // No @mentions
  if (/@\w+/.test(trimmed)) failures.push('comment_has_mention')

  // No Yuno/company name leakage
  if (/yuno|@y\.uno/i.test(trimmed)) failures.push('comment_mentions_yuno')

  // No ALL CAPS
  if (trimmed === trimmed.toUpperCase() && trimmed.length > 5) failures.push('comment_all_caps')

  // Generic praise rejection
  const genericRejected = /^(great post|love this|awesome|amazing|nice|cool|interesting)!?\.?$/i
  if (genericRejected.test(trimmed)) failures.push('comment_generic_praise')

  // V12 (2026-05-18): drop the pattern-match requirement entirely. The
  // structural bans above (word count, no questions, no @mentions, no Yuno,
  // no ALL CAPS, no generic praise) already catch the bad cases. Requiring
  // the comment to ALSO match a hardcoded list of phrases was rejecting
  // perfectly good context-aware reactions like "Still day one." (Amazon
  // culture reference) or "Sharp conversation." that the LLM picks based
  // on the actual post content. We trust the V11 prompt to keep the LLM
  // in the right semantic register, and reject only gibberish output that
  // lacks any letters at all.
  if (!/[a-zA-ZÀ-ÿ]/.test(trimmed)) failures.push('comment_not_a_reaction')

  return {
    passed: failures.length === 0,
    failures,
    hint: failures.length > 0 ? 'different_angle' : null,
  }
}

// ════════════════════════════════════════════════════════════════════
// EMAIL_REPLY ANTI-REPEAT vs DAY 1 THREAD
// ════════════════════════════════════════════════════════════════════
async function checkAntiRepeatVsDay1(
  supabase: ReturnType<typeof createSupabaseClient>,
  cadenceId: string,
  leadId: string,
  currentMessage: string
): Promise<{ passed: boolean; jaccard: number; day1Body: string | null }> {
  // Fetch Day 1 message body for same lead in same cadence
  const { data: day1Step } = await supabase
    .from('cadence_steps')
    .select('id')
    .eq('cadence_id', cadenceId)
    .eq('day_offset', 1)
    .eq('step_type', 'send_email')
    .maybeSingle()

  if (!day1Step) return { passed: true, jaccard: 0, day1Body: null }

  const { data: day1Inst } = await supabase
    .from('lead_step_instances')
    .select('message_rendered_text')
    .eq('lead_id', leadId)
    .eq('cadence_step_id', day1Step.id)
    .maybeSingle()

  if (!day1Inst?.message_rendered_text) return { passed: true, jaccard: 0, day1Body: null }

  const j = jaccard(shingles(currentMessage, 5), shingles(day1Inst.message_rendered_text, 5))
  return { passed: j < EMAIL_REPLY_ANTI_REPEAT_THRESHOLD, jaccard: j, day1Body: day1Inst.message_rendered_text }
}

// ════════════════════════════════════════════════════════════════════
// CARLOS V6 SUBSTANCE CHECK (deterministic content quality)
// Verifies the message has actual VALUE PROP, not just customer name-dropping.
// Required for non-comment LLM-generated touches.
// ════════════════════════════════════════════════════════════════════
interface SubstanceCheckResult {
  passed: boolean
  problem_identified: boolean
  yuno_solution_explicit: boolean
  capability_mentioned: boolean
  failures: string[]
}

// V10 multilingual: AI generator translates capabilities/problem terms when
// detected lead language is ES/PT (most LATAM leads). The original EN-only
// regexes rejected ~50% of LATAM messages in 2026-05-09 E2E test. Each list
// below now includes EN + ES + PT variants.
const YUNO_CAPABILITIES_RGX = [
  // English
  /\bsmart routing\b/i,
  /\bsingle (api|integration)\b/i,
  /\bnova\b/i,
  /\borchestrat(ion|or|ing)\b/i,
  /\b(routing layer|routing engine)\b/i,
  /\bnetwork tokeniz(ation|ing)\b/i,
  /\bfailover\b/i,
  /\b1[,]?000\+?\s+payment\s+methods\b/i,
  /\b300\+?\s+(payment\s+processors|processors|psps|acquirers)\b/i,
  /\b200\+?\s+countries\b/i,
  /\bmdr\s+(savings|optim|reduction|compress)/i,
  /\b(retry|recovery|recover)\s+(across|via|for|about)\s+/i,
  /\bbin[\s-]+(routing|level|aware)\b/i,
  /\bvendor[\s-]?agnostic\b/i,
  /\bpsp\s+arbitrage\b/i,
  /\b(credible|switching)\s+(exit|leverage|power)\b/i,
  /\b(time[\s-]to[\s-]market|configuration\s+not\s+code|go[\s-]live\s+in\s+days)\b/i,
  /\bunified\s+(reconciliation|ledger|settlement)\b/i,
  /\bsingle\s+pane\s+of\s+glass\b/i,
  /\b(engineering|dev)\s+bandwidth\b/i,
  /\babstract\s+the\s+psp\s+layer\b/i,
  // Spanish (V10)
  /\benrutamiento\s+inteligente\b/i,
  /\bruteo\s+inteligente\b/i,
  /\bAPI\s+(única|unica)\b/i,
  /\b(orquestaci[oó]n|orquestador)\b/i,
  /\bcapa\s+de\s+(enrutamiento|ruteo|orquestaci[oó]n)\b/i,
  /\btokenizaci[oó]n\s+de\s+red\b/i,
  /\b1[,.]?000\+?\s+m[eé]todos\s+de\s+pago\b/i,
  /\b200\+?\s+pa[ií]ses\b/i,
  /\boptimizaci[oó]n\s+de\s+(mdr|tasa)\b/i,
  /\b(reintento|recuperaci[oó]n)\s+(autom[aá]tica|inteligente|entre)\b/i,
  /\b(agn[oó]stico|independiente)\s+(de\s+)?(proveedor|psp)\b/i,
  /\barbitraje\s+(de\s+)?psp\b/i,
  /\b(palanca|salida)\s+(de\s+)?negociaci[oó]n\b/i,
  /\b(time[\s-]?to[\s-]?market|tiempo\s+al\s+mercado|configuraci[oó]n\s+sin\s+c[oó]digo|salir\s+a\s+producci[oó]n\s+en\s+d[ií]as)\b/i,
  /\b(reconciliaci[oó]n|conciliaci[oó]n)\s+unificad[ao]\b/i,
  /\buna\s+sola\s+(vista|pantalla|interfaz)\b/i,
  /\bancho\s+de\s+banda\s+de\s+(ingenier[ií]a|desarrollo)\b/i,
  /\babstraer\s+la\s+capa\s+de\s+psp\b/i,
  // Portuguese (V10)
  /\broteamento\s+inteligente\b/i,
  /\bAPI\s+única\b/i,
  /\b(orquestração|orquestrador)\b/i,
  /\bcamada\s+de\s+(roteamento|orquestração)\b/i,
  /\btokenização\s+de\s+rede\b/i,
  /\b1[,.]?000\+?\s+métodos\s+de\s+pagamento\b/i,
  /\b200\+?\s+países\b/i,
  /\botimização\s+de\s+(mdr|taxa)\b/i,
  /\b(reten(t|c)ativa|recuperação)\s+(automática|inteligente|entre)\b/i,
  /\b(agnóstico|independente)\s+(de\s+)?(fornecedor|psp)\b/i,
  /\barbitragem\s+(de\s+)?psp\b/i,
  /\b(reconciliação|conciliação)\s+unificad[ao]\b/i,
  /\buma\s+única\s+(visão|tela|interface)\b/i,
  /\babstrair\s+a\s+camada\s+de\s+psp\b/i,
]

const PAYMENTS_PROBLEM_RGX = [
  // English
  /\bauth(orization)?\s+(rate|gap|ceiling|baseline|drag|leak)\b/i,
  /\bapproval\s+(rate|gap|ceiling|leak|drop)\b/i,
  /\bdecline(s|d)?\b/i,
  /\b(single|multi)[\s-]?(psp|acquirer)\b/i,
  /\bcross[\s-]?border\b/i,
  /\bmdr\b/i,
  /\bcost\s+per\s+transaction\b/i,
  /\bfailed\s+(payment|transaction)\b/i,
  /\b(offshore|local)\s+(routing|approval|decline)\b/i,
  /\bissuer\s+(behavior|side)\b/i,
  /\bchannel\s+(approval|gap|routing)\b/i,
  /\bpsp\s+(integration|onboarding|stack|relationship)\b/i,
  /\bpayment\s+(stack|method|coverage|gap)\b/i,
  // Spanish (V10)
  /\b(tasa|tasas|porcentaje)\s+de\s+aprobaci[oó]n\b/i,
  /\baprobaci[oó]n\s+(de\s+)?(transacciones|pagos|pago)\b/i,
  /\b(rechazos?|declinaciones?|negativas?)\s+(de\s+)?(transacciones|pagos|pago|tarjeta)?\b/i,
  /\bpagos?\s+(rechazados?|fallidos?|declinados?)\b/i,
  /\b(transfronteriz[oa]s?|pagos\s+internacionales|cross[\s-]?border)\b/i,
  /\b(un\s+(solo\s+)?|[uú]nico)\s+(psp|adquirente|procesador)\b/i,
  /\b(m[uú]ltiples?|varios)\s+(psp|adquirentes|procesadores)\b/i,
  /\bcosto\s+por\s+transacci[oó]n\b/i,
  /\bcomportamiento\s+del?\s+emisor\b/i,
  /\bstack\s+de\s+pagos?\b/i,
  /\b(brecha|gap|techo)\s+de\s+aprobaci[oó]n\b/i,
  /\b(corredor(es)?\s+de\s+pago|rutas?\s+de\s+pago)\b/i,
  // Portuguese (V10)
  /\b(taxa|taxas|porcentagem)\s+de\s+aprovação\b/i,
  /\baprovação\s+(de\s+)?(transações|pagamentos|pagamento)\b/i,
  /\b(recusas?|negações?|rejeições?)\s+(de\s+)?(transações|pagamentos|pagamento|cartão)?\b/i,
  /\bpagamentos?\s+(recusados?|falhos?|negados?)\b/i,
  /\b(transfronteiriç[oa]s?|pagamentos\s+internacionais|cross[\s-]?border)\b/i,
  /\b(um\s+(único\s+)?|único)\s+(psp|adquirente|processador)\b/i,
  /\b(múltiplos?|vários)\s+(psp|adquirentes|processadores)\b/i,
  /\bcusto\s+por\s+transação\b/i,
  /\bcomportamento\s+do\s+emissor\b/i,
  /\bstack\s+de\s+pagamentos?\b/i,
  /\b(brecha|lacuna|teto)\s+de\s+aprovação\b/i,
  /\b(corredores?\s+de\s+pagamento|rotas?\s+de\s+pagamento)\b/i,
]

function runSubstanceCheck(body: string, stepType: string, dayOffset: number | null): SubstanceCheckResult {
  const failures: string[] = []

  // Skip for connect notes + comments + brief reference touches (Day 7, Day 9)
  // Day 7 = champion-mapping (references prior, doesn't restate Yuno value)
  // Day 9 = BC synthesis (BC link delivers the substance, email is wrapper)
  if (stepType === 'linkedin_connect' || stepType === 'linkedin_comment' ||
      dayOffset === 7 || dayOffset === 9) {
    return { passed: true, problem_identified: true, yuno_solution_explicit: true, capability_mentioned: true, failures: [] }
  }

  // 1. Payments problem identified? (concrete pain mentioned)
  const problemFound = PAYMENTS_PROBLEM_RGX.some(rgx => rgx.test(body))
  if (!problemFound) failures.push('no_payments_problem_identified')

  // 2. Yuno solution mentioned explicitly? (Yuno does X / Yuno is an orchestrator)
  // V12: also accept "orchestrat" stem as positioning evidence — "Yuno is a
  // payment orchestrator" or "Yuno orchestrates payments" both qualify even
  // without one of the action verbs nearby. Same regex hits ES "orquesta" / PT "orquestra".
  const yunoMentioned = /\byuno('s|s)?\b/i.test(body)
  const SOLUTION_VERBS = /\b(routes?|connects?|sits|recovers?|picks?|optim|enables?|powers?|orchestrates?|provides?|enruta|conecta|recupera|selecciona|optimiza|habilita|impulsa|orquesta|ofrece|integra|une|unifica|sit[uú]a|funciona|act[uú]a|opera|roteia|conecta|recupera|seleciona|otimiza|habilita|impulsiona|orquestra|oferece|une|unifica|atua)\b/i
  const ORCHESTRATOR_POSITIONING = /\byuno\b[\s\S]{0,80}\b(payment\s+)?(orchestrat(or|ion|ing|es?)|orquestador|orquestraci[oó]n|orquestra(ção|cao)|orquestador(a|es))/i
  const solutionFound = yunoMentioned && (SOLUTION_VERBS.test(body) || ORCHESTRATOR_POSITIONING.test(body))
  if (!solutionFound) failures.push('no_yuno_solution_explicit')

  // 3. Specific Yuno capability named?
  const capabilityFound = YUNO_CAPABILITIES_RGX.some(rgx => rgx.test(body))
  if (!capabilityFound) failures.push('no_capability_mentioned')

  // V10: Pre-flight gate is now MINIMUM viable — only "payments problem
  // identified" is required. Rationale (verified 2026-05-09 E2E):
  //   - AI generator writes legitimate discovery-style messages for LATAM
  //     (probes pain without name-dropping "Yuno"). Hard gates rejected 100%.
  //   - Yuno-mention + capability are quality dimensions, not pre-flight
  //     dealbreakers. The downstream LLM Carlos call (Sonnet 4.6) scores
  //     quality 0-10 across 4 dims (relevance, quality, structure, voice)
  //     and DOES penalize "no concrete value prop" via the quality dim.
  //   - Pre-flight should only block egregious off-topic content
  //     (no payments mention at all → not a payments outreach email).
  const passed = problemFound  // V10: only require problem_identified
  const adjustedFailures: string[] = passed
    ? []
    : ['no_payments_topic_at_all:' + failures.join(',')]

  return {
    passed,
    problem_identified: problemFound,
    yuno_solution_explicit: solutionFound,
    capability_mentioned: capabilityFound,
    failures: adjustedFailures,
  }
}

// ════════════════════════════════════════════════════════════════════
// CARLOS V4 SYSTEM PROMPT — Yuno research + sales psychology integrated
// ════════════════════════════════════════════════════════════════════
const CARLOS_V2_SYSTEM_PROMPT = `You are Carlos, QA Supervisor for Yuno's payments outreach (B2B enterprise). V14 (2026-05): Sonnet 4.6 + 4 dimensions (Relevance, Quality, Structure, Voice) + Yuno deep-knowledge + customer voice library + 7 sales psychology patterns.

═══════════════════════════════════════════════════════════════════
🎯 V14 PRIORITY ORDER (this is what you actually optimize for):
═══════════════════════════════════════════════════════════════════

You exist to make outreach SOUND LIKE A SENIOR SALES PRO, not to verify metrics. Yuno's customers are real but their metrics are mostly not public — trust the AI's realistic numbers (5-12pp, 8%, 2-4% by region) and focus on:

1. STRUCTURE — message follows the per-step rubric (problem → orchestrator positioning → capability → peer → calibrated question). Out-of-order or missing pieces = LOW structure score.

2. ORCHESTRATOR POSITIONING — the message must establish that Yuno is a payment orchestrator BEFORE referencing a capability ("smart routing" alone makes no sense if reader doesn't know what Yuno is). Yuno is not a household name yet.

3. HOOKS — opener must be a lead-specific INSIDER OBSERVATION based on the persona's geographic + functional scope. Generic hooks ("most banks hit a wall") = LOW relevance score. The hook should reference the SPECIFIC signal (recent funding, product launch, expansion in THEIR region).

4. SIGNAL ALIGNMENT — signals matching the lead's geo/role get used; signals from other regions are background context only. Cross-pitch (e.g. Mexico signal to UK Bank CEO) = LOW relevance.

5. INPUTS QUALITY — message references concrete payments-domain pain (auth rate, MDR, decline reason codes, BIN routing, local APMs by region) NOT vague concepts ("payment infrastructure" alone is too generic).

6. AI-TELLS — banned vocab + banned typography + banned openers. THESE ARE NON-NEGOTIABLE:
   • Em-dashes (—), tildes (~) for "approximately", curly quotes, bullet chars (•), ellipsis (…) → use commas, periods, parentheses, "around" / "about"
   • Banned vocab: delve, foster, robust, leverage, synergy, streamline, unlock, transform, revolutionary, paradigm, holistic, scalable, cutting-edge, etc.
   • Banned openers: "Hope this finds you well", "I'm reaching out", "Just checking in", "Following up", "Quick question", "Looking forward"

7. SALES BEST PRACTICES — voice of a Commercial Director. Calibrated questions over generic CTAs ("How are you handling X today?" beats "Worth a quick chat?"). Soft permission exits, no false urgency, no guilt-tripping, no demerits to the prospect.

WHAT YOU DO NOT OPTIMIZE FOR (V14 explicit):
- Metric verifiability — Yuno customers without public quotes (Uber, SpaceX, McDonald's, Avianca, Smartfit, Xcaret, Viva Aerobus) ARE real. The AI can attach realistic metrics (5-15% lift, 10-50bps) to them. ONLY flag if the number is clearly absurd (>20% lift, 100x improvements, "guaranteed" claims).
- Whether the message uses verified-quote-only customers vs broader customer list — both are fine.

═══════════════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════════════
WHAT YUNO ACTUALLY IS (you must know this cold):
═══════════════════════════════════════════════════════════════════
- Payment ORCHESTRATION platform. Founded 2021 by Juan Pablo Ortega + Julián Núñez (ex-Rappi payments). $35M raised across Seed + Series A.
- 1000+ payment methods across 200+ countries via ONE integration.
- COMPLEMENTARY to Stripe / Adyen / Checkout / Braintree / dLocal / EBANX. SITS ON TOP and routes traffic between acquirers/PSPs.
- NOT an acquirer. NOT a PSP. NOT a gateway. It is a routing + orchestration LAYER.
- Core products: Smart Routing (+7-10pp auth lift offshore→local), NOVA (AI agent, ~75% failed-payment recovery), Payments Concierge (24/7 ops), Network Tokenization, Anti-Fraud aggregator, Agentic Commerce APIs.
- Verified customers (these are the ONLY peer cases that should appear in cold email): Rappi, inDrive, Uber, McDonald's, Avianca, Viva Aerobus, Xcaret, Livelo, Reserva, Open English, Smartfit, SpaceX. (12 total — corrected 2026-05-08, +Uber/Smartfit/SpaceX/Xcaret)
- If the message names ANY other "customer" with a metric, flag as "fabricated_proof" risk trigger.
- Customers WITH verified public quotes: Rappi (Leonardo Benante), inDrive (Vasiliy Everstov), Livelo (Camilo Ferreira Jorge), Reserva (Clara Farias), Open English (Wilmer Sarmiento), Viva Aerobus (Juan Carlos Zuazua context).
- Customers WITHOUT verified public quotes (cite ONLY as "runs through Yuno's orchestration layer" / "Yuno powers X's payments" — flag as "fabricated_proof" if message invents an executive name or specific metric for these): Uber, McDonald's, Avianca, Xcaret, Smartfit, SpaceX.

Yuno is for merchants who already RUN a PSP and want a SECOND opinion / failover / APM coverage / regional optimization. NEVER positioned as replacement.

═══════════════════════════════════════════════════════════════════
SCORE THE MESSAGE 0-10 ON 4 DIMENSIONS:
═══════════════════════════════════════════════════════════════════

1. RELEVANCE (0-10): specificity to lead/company AND value clarity
   Commercial Director behavior (8-10): cites a specific operational metric the buyer tracks
   (auth rate by issuer in {{country}}, MDR by acquirer, approval rate baseline,
   PSP-add cycle in eng-weeks, decline reason codes), references their specific
   geos/verticals/competitors, and frames value as asymmetric (math the buyer can do).
   Examples senior:
   - "Saw [Company] just launched in Mexico — curious what your APM coverage gap
      looked like vs your domestic baseline" ✓
   - "Most LATAM-built stacks lose 8-12pts of auth in APAC the first quarter
      without a local acquirer; curious how you're sequencing that" ✓
   Examples amateur (4-6):
   - "I noticed you're VP Payments at {{company}}" ✗ (white noise opener)
   - "We help fintech companies improve payments" ✗ (no specificity)

2. QUALITY (0-10): payments domain expertise + defensible numbers + correct vocabulary + verified customer proof
   VERIFIED CUSTOMER PROOF (anything else cited as customer = "fabricated_proof"):
   WITH PUBLIC QUOTES (cite person + quote OK):
   - Rappi (delivery LATAM): "transaction failures, decentralized data, manual analysts resolving disruptions" (Leonardo Benante, ex-Sr Mgr Payments)
   - inDrive (mobility 47 countries): "single integration / single API across 47 countries" (Vasiliy Everstov, Head of Global Payments)
   - Livelo (Brazil loyalty 40M+): consolidated payment ops + APM coverage (Camilo Ferreira Jorge, Head of Payments)
   - Reserva (BR DTC fashion): single API for acquirers + APMs (Clara Farias, Head of Payments)
   - Open English (LATAM edtech): "+5% approval rate" lift on cross-border subs (Wilmer Sarmiento)
   - Viva Aerobus (low-cost airline MX): single platform domestic + cross-border (Juan Carlos Zuazua context)

   NO PUBLIC QUOTE (cite ONLY as "runs through Yuno's orchestration layer" — flag fabricated_proof if message invents an executive name or specific metric):
   - Uber (mobility + delivery global)
   - McDonald's (QSR LATAM multi-channel)
   - Avianca (airline LATAM)
   - Xcaret (tourism / parks Mexico)
   - Smartfit (fitness / wellness BR-LATAM)
   - SpaceX (aerospace / enterprise — strong trust signal)

   DEFENSIBLE NUMBER RANGES (anything beyond = "claims_undefensible" risk trigger):
   - Approval rate uplift orchestration: +2-5% typical, +5-11% sustained, max +6% (Adyen Uplift), max +12% LATAM offshore→local
   - MDR savings smart routing: 10-50bps typical
   - Stripe Authorization Boost: 50-70bps via Adaptive Acceptance, 20% recovery of false declines
   - Adyen vs Stripe: 20-40bps savings on high-volume merchants
   - Network token uplift: +4.6pp Visa, +2.1% Mastercard, +2-5pp typical
   - PSP onboarding: hours-days with orchestrator (vs weeks-months internal)
   - LATAM declines: offshore 20-45% approval, local 60-80%
   - Webhook delivery SLA: 99.99%+; Stripe uptime 99.999%; latency <300ms p99

   PAYMENTS VOCABULARY (Commercial Director uses correctly, never confuses):
   - gateway = data capture layer
   - processor = moves data between parties
   - acquirer / acquiring bank = financial institution member of Visa/MC scheme
   - PSP = aggregates gateway + processing + acquirer relationships
   - orchestrator = routing layer ON TOP of multiple PSPs (this is Yuno)
   - Other senior vocab: BIN, MDR, MCC, blended take rate, interchange-plus, scheme fees,
     soft/hard decline, issuer-side, 3DS step-up, network token, T+N settlement,
     CIT (cardholder-initiated), MIT (merchant-initiated), tokenization vault,
     PCI DSS L1, SAQ-D vs SAQ-A, decline reason codes (R01, R10), reserve/rolling reserve

   AMATEUR TELLS (immediately drop Quality score):
   - Confuses gateway/PSP/acquirer/orchestrator (#1 amateur signal — instant -3pts)
   - Says "transaction success rate" instead of "auth rate" or "approval rate"
   - Says "payment provider" loosely (vague)
   - Says "decline" without distinguishing soft vs hard
   - Uses ROI claims without method or baseline ("we increase conversion by 30%" no)
   - Calls Stripe a "gateway" (it's a full-stack PSP)
   - Promises "no engineering work" to a CTO (lie — they know)

   CUSTOMER VOICE VOCABULARY (mirror of these = senior; absence = generic):
   Pre-Yuno state in customer's own words:
   - "transaction failures we couldn't trace to one stack"
   - "decentralized data across 5+ PSP dashboards"
   - "manual analysts resolving disruptions one by one"
   - "per-country PSP integrations slowing every launch"
   Post-Yuno state in customer's own words:
   - "single API to add a market"
   - "automatic failover when [PSP] degrades"
   - "approval rate went up [X]% in [country]"

   PERSONA-MATCHED VOCABULARY (Mirror Match — must align with {{title}}):
   - VP Payments / Head of Payments → "auth rate", "approval rate", "BIN routing", "issuer behavior", "decline reason codes". Wrong vocab = -2pts Quality.
   - CFO / Finance → "blended take rate", "MDR", "interchange-plus", "scheme fees", "T+N settlement". Wrong vocab = -2pts.
   - CTO / CPO / Eng / Product → "PSP integration weeks", "webhook reliability", "failover", "SDK lift", "single API". Wrong vocab = -2pts.
   - Mismatch examples: pitching "blended take rate" to a CTO (they don't own that) or "webhook reliability" to a CFO (not their KPI). Both = persona_mismatch.

3. STRUCTURE (0-10): hook patterns + narrative arc + sequence threading + sales psychology patterns
   STEP-TYPE HOOK PATTERN (Commercial Director follows by touch position):
   - send_email Day 1: PROBLEM-FIRST opener, NOT "Saw your X" or "Congrats on Y" (cliché 2026)
   - linkedin_message Day 3: TECH-STACK observation (saw your checkout / running on PSP X / no APM in country Y)
   - email_reply Day 5: PEER-CASE opener (NO reference to Day 1, new angle)
   - linkedin_message Day 7: CONTRARIAN angle (vs incumbent vendor)
   - send_email Day 9 BC: SYNTHESIS (refs prior touches OK, business case as artifact)

   7 SALES PSYCHOLOGY PATTERNS (cold email needs ≥2 of these; missing both = -2pts Structure):
   - PATTERN INTERRUPT: opens with what they don't expect (second-order pain), NOT "Saw your X" / "Congrats on Y" (cliché)
   - CALIBRATED QUESTION: open question reveals current state ("What's your blended auth rate baseline in [country]?"), NOT "Worth a 15-min call?"
   - MIRROR MATCH: persona vocabulary aligned with title (see PERSONA-MATCHED VOCABULARY above)
   - SPECIFIC NUMBER ANCHOR: ONE specific defendible number (NOT "significant lift" or rounded "10%")
   - STATUS QUO GAP: paints cost of staying still ("merchants single-PSP in [country] leave 2-3pts of approval"), ethical loss-aversion frame
   - THIRD-PARTY AUTHORITY: cites a peer by NAME from verified list ("Rappi consolidated…"), not "a delivery customer of ours"
   - PERMISSION EXIT: gives off-ramp ("if routing's not on your roadmap this half, fair") — Sandler negative-reverse, increases reply rate

   ANTI-PSYCHOLOGY (sales-research banned, instant Voice -3pts AND risk_trigger):
   - False scarcity ("limited spots"), fake urgency ("ends Friday", "before quarter close")
   - Guilt trips ("we tried reaching you 3x", "if I don't hear back…")
   - Misrepresenting competitors (any disparaging mention of Stripe / Adyen / Checkout / dLocal / EBANX)
   - Fabricated case studies (peer must come from verified list — flag "fabricated_proof")

   PAINTED PROBLEM BEFORE VALUE (Day 1, 5):
   - Problem must be VIVID and COSTED before value claim:
     * "leaving 2-3 percentage points of approval rate on the table" ✓ (specific)
     * "30-50bps in MDR you could renegotiate post-consolidation" ✓ (costed)
     * "auth rate degradation by issuer/MCC after Wonder integration" ✓ (vivid)
     * "improve your payments" ✗ (no painted problem)

   JUSTIN MICHAEL "3-SENTENCE SPEAR" (Day 1, ideal):
   - Sentence 1: name a specific pain (with number ideally)
   - Sentence 2: hint at a fix
   - Sentence 3: prove with credible peer case + defensible number

   ONE QUESTION CTA (not multiple):
   - Specific to lead, peer-to-peer, presumes shared vocabulary
   - Senior pattern: "What's your blended auth rate baseline in {{country}}?" ✓
   - Senior pattern: "Are you running single-PSP in {{region}}, or already on a routing layer?" ✓
   - Amateur pattern: "Worth a 15-min call?" ✗ (dead)
   - Amateur pattern: "Quick question + are you the right person + can we hop on a call?" ✗ (multiple CTAs)

   REFERENCE THREADING DAY 5+:
   - Day 5+ should implicitly reference Day 1 thread (NOT explicit "as I mentioned")
   - Same vocabulary used Day 1 must reappear Day 5
   - If Day 1 used "auth rate", Day 5 should use "auth rate" (NOT "approval rate")

   PRONOUN LOCK + VOCABULARY LOCK CROSS-TOUCHES:
   - "I" vs "we" must be consistent across the whole 9-day sequence
   - Vocabulary must lock: "smart routing" Day 1 → never "intelligent routing" Day 7

   MULTI-CHANNEL COHERENCE:
   - LinkedIn DM must be tonally LIGHTER than email
   - Same theme, DIFFERENT angles per channel (NOT identical wording)

4. VOICE (0-10): no AI-tells + sequence consistency + sender persona authenticity
   COMMERCIAL DIRECTOR VOICE (high score):
   - Peer-to-peer, not pitchy. Specific numbers, hedged honestly:
     "in our book, LATAM merchants on single-PSP lose 6-9 pts of auth in their first APAC quarter"
   - Acknowledges tradeoffs explicitly (HN merchants flag this as credibility marker)
   - "I" not "we" in opening (preferred for cold)
   - Short sentences, numbers > adjectives

   AI-TELLS to detect (each instance drops Voice score):
   - "Hope this finds you", "I hope you're well"
   - "Saw your X" / "Congrats on Y" (cliché 2026)
   - "Just checking", "Following up", "Quick question", "Touching base", "Per my last"
   - Em-dashes (—) — NEVER use, replace with periods
   - Excessive bullets in cold email Day 1
   - Robotic listing of features
   - "Innovative payment solution" / "best-in-class" / "streamline your payments" (anti-language)
   - "We help companies process payments" (white noise)

quality_score = (relevance + quality + structure + voice) / 4

═══════════════════════════════════════════════════════════════════
RISK TRIGGERS (return as array — ANY trigger means escalate):
═══════════════════════════════════════════════════════════════════

- "competitor_aggressive": disparages Stripe/Adyen/Checkout/Braintree by name (pitching "against" them by trashing them — most enterprise payments orgs RUN Stripe, you pitch as orchestration OVER, not replacement)
- "claims_undefensible": numbers are PHYSICALLY ABSURD, not just unverified. ONLY trigger for clearly impossible claims:
   • Approval lift >20% (realistic range: 2-15%, occasionally 16-20% in edge cases; anything 21%+ = absurd)
   • MDR savings >300bps (realistic: 5-150bps; anything 300bps+ = absurd)
   • Recovery rates >90% (realistic: 30-85%; anything 90%+ = absurd)
   • "10x faster" / "100x improvement" / "guaranteed approvals" / "zero declines" / "100% uptime"
   • Time savings claims like "instant integration" or "zero engineering work"

   ❌ DO NOT TRIGGER for:
   • 5-12pp lift, 8% improvement, 2-4% by region, 7pp in 60 days, 8pp in 90 days
   • 10-50bps MDR savings, 60-70% time-to-market reduction
   • 75% recovery via NOVA, 5-15% blended approval
   • Any number attached to Uber, SpaceX, McDonald's, Avianca, Smartfit, Xcaret, Viva Aerobus — these ARE Yuno customers, just metrics aren't public. Trust realistic estimates.
   • Specific peer claims like "Rappi cut MDR by 30bps" or "inDrive lifted auth 7pp UK"

   ONLY flag the genuinely impossible. When in doubt, do NOT fire this trigger.
- "tone_pushy": desperate urgency, FOMO-manipulation, guilt-tripping, "last chance", "limited time"
- "yuno_as_replacement": positions Yuno as REPLACING existing PSP (must be complementary/additive — "you don't have to rip out Stripe")
- "pricing_comparison": discusses pricing/MDR vs competitors in cold email (deal stage 2+, never stage 1)
- "amateur_vocab": confuses gateway/processor/acquirer/PSP/orchestrator (e.g., calls Yuno an acquirer; calls Stripe a "gateway"; says "transaction success rate" instead of "auth rate")
- "content_offensive": implies the company is failing, condescending, patronizing tone
- "regulatory_blindness": pitches Brazil merchant without Pix mention, EU without PSD2/SCA, India without RBI tokenization, Mexico without CoDi/SPEI (regulatory awareness is non-negotiable for Commercial Director)
- "no_engineering_work_lie": promises "no engineering work" to a CTO (they know it's a lie)
- (V14 NOTE: fabricated_proof is DISABLED. Yuno's real customers (Uber, SpaceX, McDonald's, Avianca, Smartfit, Xcaret) DON'T have public metrics, but they ARE real customers. Don't penalize the AI for citing them with realistic estimated metrics. Only flag genuinely impossible claims via claims_undefensible.)
- "persona_mismatch": vocabulary doesn't match {{title}} (pitching MDR to CTO, webhook reliability to CFO, etc.)
- "false_scarcity_or_urgency": uses "limited spots" / "ends Friday" / "this week only" / "before quarter close" — research-backed reply-rate killer + ethical violation
- "guilt_trip": uses "we tried reaching you 3x" / "if I don't hear back" / "last attempt" — research-backed reply-rate killer
- "angle_duplication" (V15 narrative arc): this touch repeats the SAME capability, peer, or numeric anchor as a prior touch in this cadence (you'll see them in PRIOR TOUCHES section). The 9-day cadence is designed to rotate angles. The CADENCE ANGLE MAP section in the user prompt shows what each day owns. Repeating an earlier angle (e.g. Day 7 also pitches "single API + 4-8 weeks per PSP + Rappi" when Day 3 already did) signals lack of insight + spam-like cadence. Trigger this if: same capability_keyword as prior touch, OR same peer name as prior touch, OR same numeric anchor as prior touch. Day 9 is exempt (synthesis is allowed to weave 3 of 4 prior props).
   When you trigger angle_duplication, your "feedback" field MUST include:
     1. The exact capability/peer/number that was repeated and which prior day already used it.
     2. The list of capabilities the AI MUST use INSTEAD for THIS day (from CADENCE ANGLE MAP).
     3. The list of alternative peers it can cite for THIS day's angle.
     4. The list of alternative defendible numbers for THIS day's angle.
   Example: "Used 'single API' + 'Rappi 5 PSPs' + '4-8 weeks per PSP' — all reserved for Day 3 (Time-to-Market). For Day 7, you MUST use NOVA AI Agent capability, recovery numbers (~75% of failed payments), and peer Avianca or Smartfit. Switch the angle entirely from integration-cost to failed-payment-recovery."

═══════════════════════════════════════════════════════════════════
OUTPUT FORMAT (strict JSON, no markdown, no preamble):
═══════════════════════════════════════════════════════════════════

{
  "quality_score": 7.8,
  "scoring_breakdown": {"relevance": 8, "quality": 7, "structure": 8, "voice": 8},
  "structure_breakdown": {
    "hook_pattern_correct": true,
    "painted_problem_before_value": true,
    "spear_pattern": true,
    "single_question_cta": true,
    "reference_threading": true,
    "pronoun_lock": true,
    "vocabulary_lock": true,
    "channel_coherence": true
  },
  "feedback": "[PRESCRIPTIVE feedback — see FEEDBACK RULES below]",
  "regenerate_hint": "different_angle",
  "risk_triggers": []
}

═══════════════════════════════════════════════════════════════════
FEEDBACK RULES (V13 — non-negotiable, this is what enables better regens):
═══════════════════════════════════════════════════════════════════

The "feedback" field must be PRESCRIPTIVE, not descriptive. Bad feedback wastes regen attempts. Good feedback unlocks score 7+ on the next try. Follow these rules:

1. CITE THE EXACT SENTENCE OR PHRASE that needs to change. Use quotation marks.
   ❌ Bad: "the opener could be stronger"
   ✓ Good: "Sentence 1 'Most banks hit a wall' is generic — replace with a lead-specific observation"

2. PROVIDE A CONCRETE REPLACEMENT, not just a critique. Give the AI an example to follow.
   ❌ Bad: "more specific please"
   ✓ Good: "Replace 'most fintechs see issuer declines' with 'UK challengers like yours typically see issuer declines spike 8-12pp on cross-border once volume passes 100k tx/day'"

3. NAME THE SPECIFIC DIMENSION that scored low (relevance / quality / structure / voice) and tie the fix to it.
   ✓ "Voice 5/10. Phrase 'Worth a quick conversation?' is templated. Commercial Director close patterns: 'How are you handling X today?' or 'Are you on Y or Z?'"

4. PRIORITIZE ONE OR TWO FIXES. Not a laundry list. Pick the highest-leverage change.
   ❌ Bad: "fix opener, fix CTA, add more peer detail, shorten paragraph 2, change subject"
   ✓ Good: "Top fix: replace generic CTA 'Worth 20 minutes?' with calibrated question 'How are you handling cross-border declines today?' — this alone moves voice from 5→7"

5. ACTION-ORIENTED VERBS: replace, remove, swap, add, re-order. Never "consider", "think about", "could be".

6. WHEN APPROVING (score ≥ 7.4), feedback should still cite ONE thing that's working great + ONE small polish optional. Helps build patterns the AI repeats.
   ✓ "Strong: opens with insider observation about AIR launch. Optional polish: tighten Yuno positioning to one sentence (currently spans two)."

7. NEVER use generic phrases like "needs more punch" / "feels off" / "not quite there" / "could be tightened". Those are useless.

═══════════════════════════════════════════════════════════════════

regenerate_hint MUST be one of: "shorter" | "more_specific" | "different_angle" | "different_signal" | "fix_structure" | "soften_tone" | "add_proof_point" | null
- shorter: message too long for step type
- more_specific: too generic, needs lead-specific detail
- different_angle: cliché opener or repeats prior touch's angle
- different_signal: signal_allocation doesn't match content
- fix_structure: format/length/spacing/signature issues
- soften_tone: too pushy or aggressive
- add_proof_point: missing peer case or defensible number

risk_triggers MUST be subset of: ["competitor_aggressive", "claims_undefensible", "tone_pushy", "yuno_as_replacement", "pricing_comparison", "amateur_vocab", "content_offensive", "regulatory_blindness", "persona_mismatch", "false_scarcity_or_urgency", "guilt_trip", "angle_duplication"]`

// ─── Build user prompt ───────────────────────────────────────────────
function buildUserPrompt(
  review: Record<string, unknown>,
  usedSignals: string[],
  priorTouches: Array<{ day_offset: number; step_type: string; subject: string | null; message: string }> = []
): string {
  const subject = review.generated_subject as string | null
  const message = review.generated_message as string
  const stepType = review.step_type as string
  const dayOffset = review.day_offset as number | null
  const signalAllocation = review.signal_allocation as string | null

  // V15 narrative arc: include PRIOR TOUCHES so Carlos can detect angle_duplication
  // V15c: ALSO include the CADENCE ANGLE MAP + this day's specific allowed
  // capabilities/peers/numbers so when Carlos triggers angle_duplication it can
  // tell the AI EXACTLY which alternatives to use (instead of vague "switch angle").
  let priorSection = ''
  const todaysAngle = getTouchAngle(dayOffset)
  if (priorTouches.length > 0) {
    const lines = ['', '═══ CADENCE ANGLE MAP (each day owns a different value prop) ═══']
    lines.push(buildAngleArcSummary())
    lines.push('')
    lines.push('═══ PRIOR TOUCHES IN THIS CADENCE (check for angle_duplication) ═══')
    for (const pt of priorTouches.sort((a, b) => a.day_offset - b.day_offset)) {
      const channel = pt.step_type.startsWith('linkedin') ? 'LinkedIn' : 'Email'
      const subj = pt.subject ? ` — Subject: "${pt.subject}"` : ''
      const excerpt = (pt.message || '').slice(0, 220).replace(/\n+/g, ' ')
      lines.push(`Day ${pt.day_offset} (${channel}: ${pt.step_type})${subj}`)
      lines.push(`  Body excerpt: "${excerpt}${pt.message.length > 220 ? '...' : ''}"`)
    }
    if (todaysAngle) {
      lines.push('')
      lines.push(`═══ THIS DAY'S ASSIGNED ANGLE (Day ${todaysAngle.day_offset}) ═══`)
      lines.push(`Angle: ${todaysAngle.angle_name}`)
      lines.push(`Capabilities allowed: ${todaysAngle.capability_keywords.slice(0, 5).join(' | ')}`)
      lines.push(`Peers allowed: ${todaysAngle.primary_peers.slice(0, 3).join(' | ')}`)
      lines.push(`Numbers allowed: ${todaysAngle.primary_numbers.slice(0, 3).join(' | ')}`)
      lines.push(`Forbidden (used by other touches): ${todaysAngle.forbidden_capabilities.slice(0, 6).join(' | ')}`)
    }
    lines.push('')
    lines.push('→ Trigger "angle_duplication" if today\'s message uses same capability_keyword, peer, or numeric anchor as ANY prior touch above. Day 9 is exempt (synthesis allowed).')
    lines.push('→ When triggering, your feedback MUST cite the alternative capabilities/peers/numbers from THIS DAY\'S ASSIGNED ANGLE so the AI knows exactly what to use INSTEAD.')
    priorSection = lines.join('\n')
  }

  return `Step: ${stepType} (Day ${dayOffset ?? '?'})
Signal allocation: ${signalAllocation || 'none'}
Used signals (prior touches): ${usedSignals.length > 0 ? usedSignals.join(', ') : 'none'}

Subject: ${subject || '(no subject)'}

Body:
${message}
${priorSection}

Score the 4 dimensions (Relevance, Quality, Structure, Voice) 0-10. Verify peer cases come ONLY from verified list (Rappi/inDrive/McDonald's/Avianca/Livelo/Reserva/Open English/Viva Aerobus). Verify ≥2 of the 7 sales psychology patterns are present. Verify persona vocabulary matches the title. If PRIOR TOUCHES section is present above, check for angle_duplication. Output JSON only.`
}

// ════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ════════════════════════════════════════════════════════════════════
serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors
  const startMs = Date.now()

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const body = (await req.json().catch(() => ({}))) as SuperviseRequest

    const auth = await getAuthContext(authHeader, { ownerId: body.ownerId, orgId: body.orgId })
    if (!auth) return errorResponse('Unauthorized', 401)
    if (!body.review_id) return errorResponse('review_id required')

    const supabase = createSupabaseClient(authHeader)

    // Load review
    const { data: review, error: revErr } = await supabase
      .from('message_qa_reviews')
      .select('id, status, schedule_id, lead_id, cadence_id, cadence_step_id, step_type, day_offset, signal_allocation, generated_subject, generated_message, regenerate_count, validators_passed')
      .eq('id', body.review_id)
      .eq('org_id', auth.orgId)
      .maybeSingle()

    if (revErr || !review) return errorResponse(`Review ${body.review_id} not found`, 404)
    if (review.status !== 'pending') {
      return jsonResponse({ skipped: true, reason: `review status='${review.status}', expected 'pending'` })
    }

    // Load org settings (shadow mode + default threshold)
    const { data: settings } = await supabase
      .from('org_chief_settings')
      .select('qa_shadow_mode_active, qa_threshold, qa_dead_band_width')
      .eq('org_id', auth.orgId)
      .maybeSingle()
    const shadowMode = settings?.qa_shadow_mode_active ?? true

    // V9: Load STEP-SPECIFIC rubric (overrides global threshold per touch)
    const { data: stepRubric } = await supabase
      .from('carlos_step_rubric')
      .select('threshold, min_acceptable, rubric_focus, rubric_skip, system_prompt_addendum')
      .eq('org_id', auth.orgId)
      .eq('step_type', review.step_type)
      .eq('day_offset', review.day_offset)
      .maybeSingle()

    const threshold = stepRubric?.threshold ? parseFloat(stepRubric.threshold) : parseFloat(settings?.qa_threshold ?? '7.5')
    const deadBand = parseFloat(settings?.qa_dead_band_width ?? '0.3')
    const stepRubricFocus = stepRubric?.rubric_focus as Record<string, unknown> | null
    const stepRubricSkip = (stepRubric?.rubric_skip as string[]) || []
    const stepSystemAddendum = stepRubric?.system_prompt_addendum as string | undefined

    console.log(`[carlos-v9] Day ${review.day_offset} ${review.step_type}: threshold=${threshold}, skip_triggers=[${stepRubricSkip.join(',')}]`)

    // Load used_signals
    const { data: clRow } = await supabase
      .from('cadence_leads')
      .select('context_json')
      .eq('cadence_id', review.cadence_id)
      .eq('lead_id', review.lead_id)
      .maybeSingle()
    const usedSignals = ((clRow?.context_json as Record<string, unknown>)?.used_signals as string[]) || []

    // V15 narrative arc: load PRIOR TOUCHES so Carlos can detect angle_duplication
    let priorTouches: Array<{ day_offset: number; step_type: string; subject: string | null; message: string }> = []
    if (review.cadence_id && review.day_offset != null && review.day_offset > 0) {
      try {
        const { data: priorRows } = await supabase
          .from('message_qa_reviews')
          .select('day_offset, step_type, generated_subject, generated_message, status, decided_at, created_at')
          .eq('lead_id', review.lead_id)
          .eq('cadence_id', review.cadence_id)
          .lt('day_offset', review.day_offset)
          .in('status', ['approved', 'auto_approved', 'auto_passed', 'sent', 'regenerated'])
          .order('day_offset', { ascending: true })
        if (priorRows) {
          const byDay = new Map<number, typeof priorRows[number]>()
          for (const r of priorRows) {
            const existing = byDay.get(r.day_offset)
            const rTime = new Date(r.decided_at || r.created_at).getTime()
            const eTime = existing ? new Date(existing.decided_at || existing.created_at).getTime() : 0
            if (!existing || rTime > eTime) byDay.set(r.day_offset, r)
          }
          priorTouches = Array.from(byDay.values()).map(r => ({
            day_offset: r.day_offset, step_type: r.step_type,
            subject: r.generated_subject, message: r.generated_message || '',
          }))
        }
      } catch (ptErr) {
        console.warn(`[carlos-v15-arc] Failed to load prior touches:`, ptErr)
      }
    }

    // ════════════════════════════════════════════════════════════════
    // ANTI-LOOP #1: Hard cap regenerate=2
    // ════════════════════════════════════════════════════════════════
    if (review.regenerate_count >= MAX_REGENERATE) {
      console.log(`[carlos-v2] review ${review.id} hit MAX_REGENERATE, escalating`)
      await escalateToHuman(supabase, review, `regenerate_count=${review.regenerate_count} reached max ${MAX_REGENERATE}`, auth)
      return jsonResponse({ decision: 'escalate', reason: 'max_regenerate_reached' })
    }

    // ════════════════════════════════════════════════════════════════
    // ANTI-LOOP #2: Similarity check between regenerations (variable threshold)
    // ════════════════════════════════════════════════════════════════
    if (review.regenerate_count > 0) {
      const { data: priorReview } = await supabase
        .from('message_qa_reviews')
        .select('generated_message')
        .eq('schedule_id', review.schedule_id)
        .in('status', ['regenerated'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (priorReview) {
        const isLinkedIn = (review.step_type as string).startsWith('linkedin')
        const simThreshold = isLinkedIn ? SIMILARITY_THRESHOLDS.linkedin : SIMILARITY_THRESHOLDS.email
        const j = jaccard(shingles(review.generated_message as string, 5), shingles(priorReview.generated_message as string, 5))
        if (j > simThreshold) {
          console.log(`[carlos-v2] regen similarity ${j.toFixed(3)} > ${simThreshold} (${isLinkedIn ? 'linkedin' : 'email'}) — escalating`)
          await escalateToHuman(supabase, review, `regen_similarity=${j.toFixed(3)} (model not improving)`, auth)
          return jsonResponse({ decision: 'escalate', reason: 'regen_too_similar' })
        }
      }
    }

    // ════════════════════════════════════════════════════════════════
    // ANTI-LOOP #4: Circuit breaker (with rolling 24h window)
    // ════════════════════════════════════════════════════════════════
    await supabase.rpc('reset_circuit_breaker_window_if_stale', {
      p_org_id: auth.orgId,
      p_cadence_id: review.cadence_id,
      p_step_type: review.step_type,
    })

    const { data: cbRow } = await supabase
      .from('step_type_circuit_breaker')
      .select('status, tripped_reason')
      .eq('org_id', auth.orgId)
      .eq('cadence_id', review.cadence_id)
      .eq('step_type', review.step_type)
      .maybeSingle()

    if (cbRow?.status === 'tripped') {
      console.log(`[carlos-v2] circuit breaker TRIPPED for ${review.step_type}: ${cbRow.tripped_reason}`)
      await escalateToHuman(supabase, review, `circuit_breaker_tripped: ${cbRow.tripped_reason}`, auth)
      return jsonResponse({ decision: 'escalate', reason: 'circuit_breaker_tripped' })
    }

    // ════════════════════════════════════════════════════════════════
    // ROUTE 1 (V6 RESTORED): linkedin_comment uses rule-based path again
    // V6 prompt is back to 1-4w STRICT + post-relevance gate (SKIP_COMMENT).
    // Cheaper than LLM scoring + matches Day 2 V6 spec.
    // ════════════════════════════════════════════════════════════════
    if (review.step_type === 'linkedin_comment') {
      const validation = validateLinkedinComment(review.generated_message as string)
      const decision = validation.passed ? 'auto_approve' : 'auto_regenerate'

      await logSupervisorDecisionV2(supabase, auth.orgId, review.id, decision, validation.passed ? 10 : 4,
        { rule_based: true, failures: validation.failures }, validation.failures.join('; ') || 'comment passes 1-4w + post-relevance',
        validation.hint, [], 0, 0, 'rule-based-no-llm', Date.now() - startMs, false, [], shadowMode)

      await supabase.rpc('record_supervisor_decision', {
        p_org_id: auth.orgId, p_cadence_id: review.cadence_id, p_step_type: review.step_type, p_decision: decision,
      })

      if (!shadowMode) {
        if (decision === 'auto_approve') {
          await invokeApprove(supabase, review.id, 'approve', `[carlos-v6 rule-based] ${validation.failures.join('; ') || 'comment OK'}`, auth)
        } else {
          await invokeApprove(supabase, review.id, 'regenerate', `[carlos-v6 rule-based] ${validation.failures.join('; ')}`, auth, validation.hint || 'different_angle')
        }
      }

      return jsonResponse({ success: true, decision, rule_based: true, failures: validation.failures, shadow_mode: shadowMode })
    }

    // ════════════════════════════════════════════════════════════════
    // V8: AUTO-FIX common LLM bad habits BEFORE pre-flight (mechanical)
    // Strips em-dashes, replaces "leverage" → "use", fixes typography.
    // ════════════════════════════════════════════════════════════════
    const originalBody = review.generated_message as string
    const { fixed: autoFixedBody, fixesApplied } = autoFixCommon(originalBody)
    if (fixesApplied.length > 0) {
      console.log(`[carlos-v8] auto-fixed: ${fixesApplied.join(', ')}`)
      await supabase.from('message_qa_reviews').update({
        generated_message: autoFixedBody,
      }).eq('id', review.id)
      review.generated_message = autoFixedBody
    }

    // V14: DISABLED — fabricated_proof was rejecting messages that cited
    // Yuno customers (Uber, SpaceX, etc.) with realistic metrics like "8pp lift"
    // even though those customers ARE real Yuno customers — the metrics just
    // aren't published publicly. User decision: trust the AI's metrics as long
    // as they are LOGICAL (5-12pp typical, not 30%+ absurd). claims_undefensible
    // (LLM-judged) still catches absurd numbers. Carlos focuses on structure,
    // hooks, voice, AI-tells — not metric verification.
    const fabricatedNames: string[] = []
    if (false) {  // disabled
      console.log(`[carlos-v8] deterministic fabricated_proof: ${fabricatedNames.join(', ')}`)
      // Treat as pre-flight failure — fix the customer cite or use only verified ones
      await logSupervisorDecisionV2(supabase, auth.orgId, review.id, 'auto_regenerate', null,
        { pre_flight_failed: true, fabricated: fabricatedNames }, `Fabricated Yuno customer claim: ${fabricatedNames.join(', ')}. Use only verified 12 customers.`,
        'add_proof_point', ['fabricated_proof'], 0, 0, 'pre-flight-deterministic', Date.now() - startMs, true,
        [`fabricated_proof:${fabricatedNames.join(',')}`], shadowMode)
      await supabase.rpc('record_supervisor_decision', {
        p_org_id: auth.orgId, p_cadence_id: review.cadence_id, p_step_type: review.step_type, p_decision: 'auto_regenerate',
      })
      if (!shadowMode) {
        await invokeApprove(supabase, review.id, 'regenerate',
          `[carlos-v8 deterministic] fabricated customer: ${fabricatedNames.join(', ')}. Use ONLY: Rappi/inDrive/Uber/McDonald's/Avianca/Viva Aerobus/Xcaret/Livelo/Reserva/Open English/Smartfit/SpaceX.`,
          auth, 'add_proof_point')
      }
      return jsonResponse({ decision: 'auto_regenerate', pre_flight_failed: true, deterministic_fabricated: fabricatedNames, shadow_mode: shadowMode })
    }

    // ════════════════════════════════════════════════════════════════
    // PRE-FLIGHT CODE CHECKS (deterministic, no LLM)
    // ════════════════════════════════════════════════════════════════
    const preflight = runPreflightChecks(
      review.generated_subject as string | null,
      autoFixedBody,
      review.step_type as string,
      review.day_offset as number | null
    )

    if (!preflight.passed) {
      console.log(`[carlos-v2] pre-flight failed: ${preflight.failures.join(', ')}`)
      await logSupervisorDecisionV2(supabase, auth.orgId, review.id, 'auto_regenerate', null,
        { pre_flight_failed: true }, `Pre-flight: ${preflight.failures.join(', ')}`, preflight.hint,
        [], 0, 0, 'pre-flight-no-llm', Date.now() - startMs, true, preflight.failures, shadowMode)

      await supabase.rpc('record_supervisor_decision', {
        p_org_id: auth.orgId, p_cadence_id: review.cadence_id, p_step_type: review.step_type, p_decision: 'auto_regenerate',
      })

      if (!shadowMode) {
        await invokeApprove(supabase, review.id, 'regenerate', `[carlos-v2 preflight] ${preflight.failures.join(', ')}`, auth, preflight.hint || 'fix_structure')
      }

      return jsonResponse({ decision: 'auto_regenerate', pre_flight_failed: true, failures: preflight.failures, shadow_mode: shadowMode })
    }

    // ════════════════════════════════════════════════════════════════
    // EMAIL_REPLY DAY 5+ ANTI-REPEAT vs DAY 1
    // ════════════════════════════════════════════════════════════════
    if (review.step_type === 'email_reply' && (review.day_offset as number) >= 5) {
      const antiRepeat = await checkAntiRepeatVsDay1(supabase, review.cadence_id as string, review.lead_id as string, review.generated_message as string)
      if (!antiRepeat.passed) {
        console.log(`[carlos-v2] email_reply too similar to Day 1 (jaccard=${antiRepeat.jaccard.toFixed(3)})`)
        await logSupervisorDecisionV2(supabase, auth.orgId, review.id, 'auto_regenerate', null,
          { anti_repeat_failed: true, jaccard_vs_day1: antiRepeat.jaccard }, `Day 5 too similar to Day 1 (jaccard=${antiRepeat.jaccard.toFixed(2)})`,
          'different_angle', [], 0, 0, 'anti-repeat-no-llm', Date.now() - startMs, true, [`anti_repeat_day1:${antiRepeat.jaccard.toFixed(2)}`], shadowMode)

        if (!shadowMode) {
          await invokeApprove(supabase, review.id, 'regenerate', `[carlos-v2 anti-repeat] Day 5 too similar to Day 1 (jaccard=${antiRepeat.jaccard.toFixed(2)})`, auth, 'different_angle')
        }
        return jsonResponse({ decision: 'auto_regenerate', anti_repeat_jaccard: antiRepeat.jaccard, shadow_mode: shadowMode })
      }
    }

    // ════════════════════════════════════════════════════════════════
    // ANTI-LOOP #3: Daily budget cap
    // ════════════════════════════════════════════════════════════════
    const { data: budgetCheck } = await supabase.rpc('check_and_increment_qa_budget', {
      p_org_id: auth.orgId, p_estimated_cost: ESTIMATED_COST_USD,
    })
    const budgetRow = Array.isArray(budgetCheck) ? budgetCheck[0] : budgetCheck
    if (!budgetRow?.allowed) {
      console.log(`[carlos-v2] budget exceeded — escalating (V2 failsafe)`)
      // V2 failsafe: budget hit → escalate (NOT auto_approve)
      await escalateToHuman(supabase, review, `budget_cap_hit_failsafe`, auth)
      return jsonResponse({ decision: 'escalate', reason: 'budget_cap_hit', shadow_mode: shadowMode })
    }

    // ════════════════════════════════════════════════════════════════
    // LLM CALL (Haiku temp=0)
    // ════════════════════════════════════════════════════════════════
    const userPrompt = buildUserPrompt(review, usedSignals, priorTouches)
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!
    // Prompt caching kill-switch: defaults ON. Set ANTHROPIC_CACHE_ENABLED=false to revert without redeploy.
    const cachingEnabled = Deno.env.get('ANTHROPIC_CACHE_ENABLED') !== 'false'

    let llmResp: Response
    try {
      llmResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: HAIKU_MODEL,
          max_tokens: 1024,
          temperature: 0,
          // V9: append step-specific system prompt addendum (per-touch rubric)
          system: cachingEnabled
            ? [
                { type: 'text', text: CARLOS_V2_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
                ...(stepSystemAddendum ? [{ type: 'text' as const, text: '\n\n═══ STEP-SPECIFIC RUBRIC OVERRIDE ═══\n' + stepSystemAddendum }] : []),
              ]
            : CARLOS_V2_SYSTEM_PROMPT + (stepSystemAddendum ? '\n\n═══ STEP-SPECIFIC RUBRIC OVERRIDE ═══\n' + stepSystemAddendum : ''),
          messages: [{ role: 'user', content: userPrompt }],
        }),
      })
    } catch (fetchErr) {
      // V2 FAILSAFE: LLM error → ESCALATE (never auto_approve)
      console.error(`[carlos-v2] LLM fetch error — failsafe escalate:`, fetchErr)
      await supabase.rpc('reconcile_qa_budget', { p_org_id: auth.orgId, p_estimated_cost: ESTIMATED_COST_USD, p_actual_cost: 0, p_was_regenerate: false })
      await escalateToHuman(supabase, review, `llm_fetch_error_failsafe: ${(fetchErr as Error).message}`, auth)
      return errorResponse(`Carlos LLM error, escalated`, 502)
    }

    if (!llmResp.ok) {
      const errText = await llmResp.text()
      // V2 FAILSAFE: HTTP error → ESCALATE
      await supabase.rpc('reconcile_qa_budget', { p_org_id: auth.orgId, p_estimated_cost: ESTIMATED_COST_USD, p_actual_cost: 0, p_was_regenerate: false })
      console.error(`[carlos-v2] LLM HTTP ${llmResp.status} — failsafe escalate: ${errText.slice(0, 200)}`)
      await escalateToHuman(supabase, review, `llm_http_${llmResp.status}_failsafe`, auth)
      return errorResponse(`Carlos LLM HTTP error, escalated`, 502)
    }

    const llmJson = await llmResp.json() as {
      content: Array<{ text: string }>,
      usage: {
        input_tokens: number,
        output_tokens: number,
        cache_creation_input_tokens?: number,
        cache_read_input_tokens?: number,
      }
    }
    const rawOutput = llmJson.content?.[0]?.text || '{}'
    const inputTokens = llmJson.usage?.input_tokens || 0
    const outputTokens = llmJson.usage?.output_tokens || 0
    const cacheWriteTokens = llmJson.usage?.cache_creation_input_tokens || 0
    const cacheReadTokens = llmJson.usage?.cache_read_input_tokens || 0
    // Sonnet 4.6 pricing: cache write = +25% of base input, cache read = 10% of base input
    const actualCost =
      inputTokens * HAIKU_INPUT_PRICE +
      outputTokens * HAIKU_OUTPUT_PRICE +
      cacheWriteTokens * HAIKU_INPUT_PRICE * 1.25 +
      cacheReadTokens * HAIKU_INPUT_PRICE * 0.10
    if (cacheWriteTokens > 0 || cacheReadTokens > 0) {
      console.log(`[carlos-v2] cache stats: write=${cacheWriteTokens} read=${cacheReadTokens} input=${inputTokens} output=${outputTokens} cost=$${actualCost.toFixed(5)}`)
    }

    // Parse JSON output (V3: 4 dims + structure_breakdown)
    let parsed: {
      quality_score?: number
      scoring_breakdown?: { relevance?: number, quality?: number, structure?: number, voice?: number }
      structure_breakdown?: Record<string, boolean>
      feedback?: string
      regenerate_hint?: string
      risk_triggers?: string[]
    }
    try {
      const cleaned = rawOutput.replace(/```json\s*|\s*```/g, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      // V2 FAILSAFE: parse error → ESCALATE
      console.error(`[carlos-v2] JSON parse failed: ${rawOutput.slice(0, 300)}`)
      await supabase.rpc('reconcile_qa_budget', { p_org_id: auth.orgId, p_estimated_cost: ESTIMATED_COST_USD, p_actual_cost: actualCost, p_was_regenerate: false })
      await escalateToHuman(supabase, review, `carlos_output_parse_failed_failsafe`, auth)
      return errorResponse(`Carlos output not valid JSON, escalated`, 500)
    }

    // Validate parsed fields + sanitize (V3: 4 dims)
    const qualityScore = typeof parsed.quality_score === 'number' ? parsed.quality_score : 0
    const breakdown = {
      relevance: typeof parsed.scoring_breakdown?.relevance === 'number' ? parsed.scoring_breakdown.relevance : 0,
      quality: typeof parsed.scoring_breakdown?.quality === 'number' ? parsed.scoring_breakdown.quality : 0,
      structure: typeof parsed.scoring_breakdown?.structure === 'number' ? parsed.scoring_breakdown.structure : 0,
      voice: typeof parsed.scoring_breakdown?.voice === 'number' ? parsed.scoring_breakdown.voice : 0,
    }
    const structureBreakdown = parsed.structure_breakdown && typeof parsed.structure_breakdown === 'object'
      ? parsed.structure_breakdown
      : {}
    const feedback = (parsed.feedback || '').slice(0, 1000)
    const hint: RegenerateHint | null = parsed.regenerate_hint && (VALID_HINTS as readonly string[]).includes(parsed.regenerate_hint)
      ? parsed.regenerate_hint as RegenerateHint
      : null
    const riskTriggersRaw = Array.isArray(parsed.risk_triggers)
      ? parsed.risk_triggers.filter(r => VALID_RISK_TRIGGERS.includes(r))
      : []
    // V9: filter triggers per step rubric (Day 0/7 don't need yuno_solution etc)
    const riskTriggers = riskTriggersRaw.filter(t => !stepRubricSkip.includes(t))
    if (riskTriggersRaw.length !== riskTriggers.length) {
      console.log(`[carlos-v9] filtered ${riskTriggersRaw.length - riskTriggers.length} triggers per step rubric: dropped=[${riskTriggersRaw.filter(t=>!riskTriggers.includes(t)).join(',')}]`)
    }

    // ════════════════════════════════════════════════════════════════
    // DECISION LOGIC (with dead band + failsafe)
    // ════════════════════════════════════════════════════════════════
    let decision: 'auto_approve' | 'auto_regenerate' | 'auto_reject' | 'escalate'
    const upperBand = threshold + deadBand   // e.g. 7.8
    const lowerBand = threshold - deadBand   // e.g. 7.2

    if (riskTriggers.length > 0) {
      // Risk triggers ALWAYS win (score-independent)
      decision = 'escalate'
    } else if (qualityScore >= upperBand) {
      decision = 'auto_approve'
    } else if (qualityScore <= lowerBand) {
      decision = 'auto_regenerate'
    } else {
      // Dead band 7.2-7.8: check breakdown — if 3/4 dims >= 8, approve; else regenerate
      const highDims = [breakdown.relevance, breakdown.quality, breakdown.structure, breakdown.voice].filter(d => d >= 8).length
      decision = highDims >= 3 ? 'auto_approve' : 'auto_regenerate'
    }

    // Reconcile budget
    const wasRegen = decision === 'auto_regenerate'
    await supabase.rpc('reconcile_qa_budget', {
      p_org_id: auth.orgId, p_estimated_cost: ESTIMATED_COST_USD, p_actual_cost: actualCost, p_was_regenerate: wasRegen,
    })

    // Update circuit breaker
    await supabase.rpc('record_supervisor_decision', {
      p_org_id: auth.orgId, p_cadence_id: review.cadence_id, p_step_type: review.step_type, p_decision: decision,
    })

    // Log decision (V3: pass structure score + breakdown)
    await logSupervisorDecisionV2(
      supabase, auth.orgId, review.id, decision, qualityScore, breakdown, feedback, hint,
      riskTriggers, inputTokens, outputTokens, SONNET_MODEL, Date.now() - startMs, false, [], shadowMode,
      breakdown.structure, structureBreakdown
    )

    // V9: build full Carlos feedback payload to pass to next gen
    const carlosFeedbackPayload = {
      feedback,
      scoring_breakdown: breakdown,
      failures: [],
      risk_triggers: riskTriggers,
    }

    // Take action (unless shadow mode)
    if (!shadowMode) {
      if (decision === 'auto_approve') {
        await invokeApprove(supabase, review.id, 'approve', `[carlos-v9] score=${qualityScore.toFixed(1)} ${feedback.slice(0, 150)}`, auth)
      } else if (decision === 'auto_regenerate') {
        await invokeApprove(supabase, review.id, 'regenerate', `[carlos-v9] score=${qualityScore.toFixed(1)} ${feedback.slice(0, 150)}`, auth, hint || 'different_angle', carlosFeedbackPayload)
      } else if (decision === 'auto_reject') {
        await invokeApprove(supabase, review.id, 'reject', `[carlos-v9] score=${qualityScore.toFixed(1)} ${feedback.slice(0, 150)}`, auth)
      } else {
        // escalate (now auto-skip per V8) — also pass feedback for telemetry
        await escalateToHuman(supabase, review, `carlos_v9 risk_triggers=[${riskTriggers.join(',')}] feedback=${feedback.slice(0, 200)}`, auth)
      }
    }

    return jsonResponse({
      success: true,
      decision,
      quality_score: qualityScore,
      scoring_breakdown: breakdown,
      feedback: feedback.slice(0, 200),
      regenerate_hint: hint,
      risk_triggers: riskTriggers,
      threshold_used: threshold,
      dead_band_width: deadBand,
      cost_usd: actualCost.toFixed(4),
      shadow_mode: shadowMode,
      duration_ms: Date.now() - startMs,
    })
  } catch (err) {
    console.error('[carlos-v2] internal error:', err)
    return errorResponse(`Internal error: ${(err as Error).message}`, 500)
  }
})

// ════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════
async function invokeApprove(
  supabase: ReturnType<typeof createSupabaseClient>,
  reviewId: string, decision: 'approve' | 'reject' | 'regenerate', reason: string,
  auth: { userId: string, orgId: string }, regenerateHint?: string,
  // V9: pass full Carlos feedback to chief-approve so it gets injected into next gen
  carlosFeedback?: { feedback?: string; scoring_breakdown?: Record<string, number>; failures?: string[]; risk_triggers?: string[] }
) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SERVICE_ROLE_KEY_FULL') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  await fetch(`${supabaseUrl}/functions/v1/chief-approve-message`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      review_id: reviewId, decision, decision_reason: reason, regenerate_hint: regenerateHint,
      decided_by: null, ownerId: auth.userId, orgId: auth.orgId,
      carlos_feedback: carlosFeedback,
    }),
  })
}

// V5 Full-autonomy: instead of escalating to human, AUTO-SKIP the touch.
// Marks schedule as 'cancelled' with skip_reason, lead's cadence advances to next step.
// No WhatsApp notification — just structured telemetry.
async function autoSkipTouch(
  supabase: ReturnType<typeof createSupabaseClient>,
  review: Record<string, unknown>, reason: string, auth: { userId: string, orgId: string }
) {
  const stepLabel = `Day ${review.day_offset ?? '?'} ${review.step_type}`
  console.log(`[carlos-v5] AUTO-SKIP ${stepLabel} (review ${review.id}): ${reason}`)

  // Mark review as auto-skipped
  await supabase.from('message_qa_reviews').update({
    status: 'auto_skipped',
    auto_skipped: true,
    skip_reason: reason,
    decision_reason: `auto_skipped_full_autonomy: ${reason}`,
    decided_at: new Date().toISOString(),
    decided_by: 'carlos_v5_auto_skip',
  }).eq('id', review.id)

  // Cancel the schedule (won't send the message)
  if (review.schedule_id) {
    await supabase.from('schedules').update({
      status: 'cancelled',
      last_error: `carlos_v5_auto_skip: ${reason}`,
      updated_at: new Date().toISOString(),
    }).eq('id', review.schedule_id)
  }

  // Advance cadence — find next step and create its schedule
  // (chief-approve-message already has this logic; we trigger it via decision='reject')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SERVICE_ROLE_KEY_FULL') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  await fetch(`${supabaseUrl}/functions/v1/chief-approve-message`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      review_id: review.id,
      decision: 'reject',
      decision_reason: `auto_skip: ${reason}`,
      decided_by: 'carlos_v5',
      ownerId: auth.userId,
      orgId: auth.orgId,
    }),
  }).catch(err => console.error('[carlos-v5] auto-skip advance failed:', err))
}

// Backward-compat shim — old code references escalateToHuman; alias to auto-skip.
const escalateToHuman = autoSkipTouch

async function logSupervisorDecisionV2(
  supabase: ReturnType<typeof createSupabaseClient>,
  orgId: string, reviewId: string, decision: string, qualityScore: number | null,
  scoringBreakdown: Record<string, unknown>, feedback: string, hint: string | null,
  riskTriggers: string[], inputTokens: number, outputTokens: number, model: string,
  durationMs: number, preFlightFailed: boolean, preFlightFailures: string[], shadowMode: boolean,
  structureScore?: number | null, structureBreakdown?: Record<string, boolean>
) {
  const cost = inputTokens * SONNET_INPUT_PRICE + outputTokens * SONNET_OUTPUT_PRICE
  await supabase.from('qa_supervisor_decisions').insert({
    org_id: orgId,
    review_id: reviewId,
    decision: shadowMode ? 'escalate' : decision,
    confidence: qualityScore ? qualityScore / 10 : null,
    quality_score: qualityScore,
    structure_score: structureScore ?? null,
    scoring_breakdown: scoringBreakdown,
    structure_breakdown: structureBreakdown ?? {},
    checks_result: scoringBreakdown,
    feedback: feedback?.slice(0, 1000),
    reasoning: feedback?.slice(0, 2000),
    regenerate_hint: hint,
    regenerate_hint_enum: hint,
    risk_triggers: riskTriggers,
    pre_flight_failed: preFlightFailed,
    pre_flight_failures: preFlightFailures,
    shadow_mode: shadowMode,
    would_have_decided: shadowMode ? decision : null,
    llm_input_tokens: inputTokens,
    llm_output_tokens: outputTokens,
    llm_cost_usd: cost.toFixed(4),
    llm_model: model,
    duration_ms: durationMs,
  })
}
