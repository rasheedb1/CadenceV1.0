// chief-validate-message
// =============================================================================
// Pre-send QA validators. Called by process-queue right after generateAIMessage,
// before invoking Unipile/Gmail.
//
// Gates:
//   A. Subject validator (only for email steps)
//   B. Similarity check (Jaccard > 0.65 over 5-word shingles vs last 20 same-step)
//   C. Idempotency check (no duplicate sent message for same lead+step)
//
// Output:
//   { passed: true, suggestion: 'pass'|'hold_for_review' }
//   { passed: false, suggestion: 'regenerate'|'hold_for_review'|'skip_duplicate',
//     gate_a: {...}, gate_b: {...}, gate_c: {...} }
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthContext, createSupabaseClient } from '../_shared/supabase.ts'

interface ValidateRequest {
  schedule_id: string
  lead_id: string
  cadence_id: string
  cadence_step_id: string
  step_type: string
  generated_subject?: string | null
  generated_message: string
  signal_allocation?: string | null
  ownerId?: string
  orgId?: string
}

interface GateResult {
  passed: boolean
  reason?: string
  details?: Record<string, unknown>
}

const SIMILARITY_THRESHOLD = 0.65
const SHINGLE_SIZE = 5
const SIMILARITY_WINDOW_DAYS = 7
const SIMILARITY_COMPARE_LIMIT = 20

// ─── Gate A: Subject validator ────────────────────────────────────────
function validateSubject(subject: string | null | undefined, stepType: string): GateResult {
  // Only email steps need subject
  const isEmail = stepType === 'send_email' || stepType === 'email_reply'
  if (!isEmail) {
    return { passed: true, reason: 'not_email_step' }
  }

  if (!subject || typeof subject !== 'string') {
    return { passed: false, reason: 'subject_missing' }
  }

  const trimmed = subject.trim()
  if (trimmed.length === 0) {
    return { passed: false, reason: 'subject_empty' }
  }

  const lower = trimmed.toLowerCase()
  const blacklist = ['no subject', 'untitled', 'subject', 'todo', 'placeholder', 'replace', 'tbd', 'null', 'undefined']
  if (blacklist.some(b => lower === b || lower.includes('todo') || lower.includes('placeholder'))) {
    return { passed: false, reason: `subject_blacklisted_phrase`, details: { matched: trimmed } }
  }

  if (trimmed.includes('{{') || trimmed.includes('}}')) {
    return { passed: false, reason: 'subject_unrendered_template', details: { subject: trimmed } }
  }

  if (trimmed.length > 80) {
    return { passed: false, reason: 'subject_too_long', details: { length: trimmed.length, max: 80 } }
  }

  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length < 2) {
    return { passed: false, reason: 'subject_too_few_words', details: { count: words.length } }
  }
  if (words.length > 12) {
    return { passed: false, reason: 'subject_too_many_words', details: { count: words.length } }
  }

  // Reply prefix logic
  const startsWithRe = /^re:\s/i.test(trimmed)
  if (stepType === 'email_reply' && !startsWithRe) {
    return { passed: false, reason: 'reply_step_missing_re_prefix', details: { subject: trimmed } }
  }
  if (stepType === 'send_email' && startsWithRe) {
    return { passed: false, reason: 'cold_email_should_not_have_re_prefix', details: { subject: trimmed } }
  }

  return { passed: true, details: { subject: trimmed, word_count: words.length } }
}

// ─── Gate B: Similarity check via Jaccard on shingles ─────────────────
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s']/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0)
}

function shingles(text: string, n: number): Set<string> {
  const tokens = tokenize(text)
  const set = new Set<string>()
  if (tokens.length < n) {
    set.add(tokens.join(' '))
    return set
  }
  for (let i = 0; i <= tokens.length - n; i++) {
    set.add(tokens.slice(i, i + n).join(' '))
  }
  return set
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let intersection = 0
  for (const item of a) {
    if (b.has(item)) intersection++
  }
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

async function validateSimilarity(
  supabase: ReturnType<typeof createSupabaseClient>,
  newMessage: string,
  orgId: string,
  cadenceId: string,
  stepType: string,
  excludeLeadId: string
): Promise<GateResult> {
  const cutoff = new Date(Date.now() - SIMILARITY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // Fetch last N sent messages of same step_type
  const { data: rows } = await supabase
    .from('lead_step_instances')
    .select('lead_id, message_rendered_text, updated_at, cadence_step_id')
    .eq('owner_id', '76403628-d906-45e1-b673-c4231264da5c')  // org-bound (workaround until lead_step_instances has org_id)
    .eq('status', 'sent')
    .gte('updated_at', cutoff)
    .neq('lead_id', excludeLeadId)
    .not('message_rendered_text', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(SIMILARITY_COMPARE_LIMIT)

  // Filter by step_type via cadence_step lookup (lead_step_instances doesn't carry step_type directly)
  let comparable: Array<{ lead_id: string; message_rendered_text: string }> = []
  if (rows && rows.length > 0) {
    const stepIds = Array.from(new Set(rows.map(r => r.cadence_step_id))).filter(Boolean)
    if (stepIds.length > 0) {
      const { data: stepMatches } = await supabase
        .from('cadence_steps')
        .select('id')
        .in('id', stepIds)
        .eq('step_type', stepType)
        .eq('cadence_id', cadenceId)
      const validStepIds = new Set((stepMatches || []).map(s => s.id))
      comparable = rows.filter(r => validStepIds.has(r.cadence_step_id)) as typeof comparable
    }
  }

  if (comparable.length === 0) {
    return { passed: true, reason: 'no_prior_messages_to_compare', details: { compared_count: 0 } }
  }

  const newShingles = shingles(newMessage, SHINGLE_SIZE)
  let maxJaccard = 0
  let mostSimilarLead: string | null = null

  for (const row of comparable) {
    const otherShingles = shingles(row.message_rendered_text, SHINGLE_SIZE)
    const j = jaccard(newShingles, otherShingles)
    if (j > maxJaccard) {
      maxJaccard = j
      mostSimilarLead = row.lead_id
    }
  }

  const passed = maxJaccard < SIMILARITY_THRESHOLD
  return {
    passed,
    reason: passed ? 'similarity_acceptable' : 'similarity_too_high',
    details: {
      max_jaccard: Number(maxJaccard.toFixed(3)),
      threshold: SIMILARITY_THRESHOLD,
      compared_count: comparable.length,
      most_similar_lead: mostSimilarLead,
    },
  }
}

// ─── Gate C: Idempotency check ────────────────────────────────────────
async function validateIdempotency(
  supabase: ReturnType<typeof createSupabaseClient>,
  leadId: string,
  cadenceStepId: string,
  scheduleId: string
): Promise<GateResult> {
  const { data: existingSent } = await supabase
    .from('lead_step_instances')
    .select('id, status, updated_at')
    .eq('lead_id', leadId)
    .eq('cadence_step_id', cadenceStepId)
    .eq('status', 'sent')
    .limit(1)
    .maybeSingle()

  if (existingSent) {
    return {
      passed: false,
      reason: 'already_sent',
      details: { existing_instance_id: existingSent.id, sent_at: existingSent.updated_at },
    }
  }

  // Also check if another schedule already executed for this combo
  const { data: dupSchedule } = await supabase
    .from('schedules')
    .select('id, status, updated_at')
    .eq('lead_id', leadId)
    .eq('cadence_step_id', cadenceStepId)
    .eq('status', 'executed')
    .neq('id', scheduleId)
    .limit(1)
    .maybeSingle()

  if (dupSchedule) {
    return {
      passed: false,
      reason: 'duplicate_executed_schedule',
      details: { other_schedule_id: dupSchedule.id, executed_at: dupSchedule.updated_at },
    }
  }

  return { passed: true, reason: 'no_duplicate' }
}

// ─── Main handler ─────────────────────────────────────────────────────
serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const body = (await req.json().catch(() => ({}))) as ValidateRequest

    const auth = await getAuthContext(authHeader, { ownerId: body.ownerId, orgId: body.orgId })
    if (!auth) return errorResponse('Unauthorized', 401)

    if (!body.schedule_id || !body.lead_id || !body.cadence_step_id || !body.generated_message) {
      return errorResponse('Missing required fields')
    }

    const supabase = createSupabaseClient(authHeader)

    // ── Run gates ──
    const gateA = validateSubject(body.generated_subject, body.step_type)
    const gateB = await validateSimilarity(
      supabase, body.generated_message, auth.orgId,
      body.cadence_id, body.step_type, body.lead_id
    )
    const gateC = await validateIdempotency(supabase, body.lead_id, body.cadence_step_id, body.schedule_id)

    const allPassed = gateA.passed && gateB.passed && gateC.passed

    let suggestion: 'pass' | 'regenerate' | 'hold_for_review' | 'skip_duplicate'
    if (allPassed) {
      suggestion = 'pass'
    } else if (!gateC.passed) {
      // Idempotency failure → don't regenerate, just skip
      suggestion = 'skip_duplicate'
    } else {
      // Subject or similarity failure → suggest regenerate
      suggestion = 'regenerate'
    }

    return jsonResponse({
      passed: allPassed,
      suggestion,
      gate_a_subject: gateA,
      gate_b_similarity: gateB,
      gate_c_idempotency: gateC,
    })
  } catch (err) {
    console.error('chief-validate-message error:', err)
    return errorResponse(`Internal error: ${(err as Error).message}`, 500)
  }
})
