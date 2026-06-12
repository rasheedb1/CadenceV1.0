// Edge Function: Process Scheduled Queue
// POST /functions/v1/process-queue
// This function processes scheduled items from the schedules table.
// Can be called via cron job (Supabase scheduled function) or manually.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient, logActivity, getUnipileAccountId } from '../_shared/supabase.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createUnipileClient } from '../_shared/unipile.ts'

// Types for schedule processing
interface Schedule {
  id: string
  cadence_id: string
  cadence_step_id: string
  lead_id: string
  owner_id: string
  org_id: string
  scheduled_at: string
  timezone: string
  status: string
  message_template_text: string | null
  message_rendered_text: string | null
}

interface CadenceStep {
  id: string
  cadence_id: string
  owner_id: string
  step_type: string
  step_label: string
  day_offset: number
  order_in_day: number
  config_json: Record<string, unknown>
}

interface ProcessResult {
  scheduleId: string
  leadId: string
  stepType: string
  success: boolean
  error?: string
}

// Map step types to their corresponding Edge Function endpoints
const STEP_TYPE_TO_ENDPOINT: Record<string, string> = {
  linkedin_message: '/functions/v1/linkedin-send-message',
  linkedin_connect: '/functions/v1/linkedin-send-connection',
  linkedin_like: '/functions/v1/linkedin-like-post',
  linkedin_comment: '/functions/v1/linkedin-comment',
  linkedin_profile_view: '/functions/v1/linkedin-view-profile',
  send_email: '/functions/v1/send-email',
  email_reply: '/functions/v1/send-email',
  // generate_ss_deck is dispatched manually in processSchedule (it doesn't
  // follow the LinkedIn/email body shape); the entry here is symbolic so the
  // "Unsupported step type" guard at line ~1182 doesn't short-circuit it.
  generate_ss_deck: '/functions/v1/ss-deck-generate',
}

const SS_DECK_PDF_BASE = 'https://bridge.yuno.tools/api/m'

// Default delay configuration (in milliseconds)
const DEFAULT_MIN_DELAY = 5000 // 5 seconds
const DEFAULT_MAX_DELAY = 10000 // 10 seconds

/**
 * Convert plain text to HTML for email bodies.
 * Preserves existing HTML content. Converts \n\n to paragraph breaks, \n to <br>.
 */
function textToHtml(text: string): string {
  // If it already contains HTML tags, return as-is
  if (/<[a-z][\s\S]*>/i.test(text)) return text

  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const paragraphs = escaped.split(/\n{2,}/)
  return paragraphs
    .map(p => `<p style="margin:0 0 16px 0">${p.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/**
 * Strip any "SUBJECT: ..." prefix from a message (safety net).
 * Returns { body, subject } where subject is extracted if found.
 */
function stripSubjectPrefix(text: string): { body: string; subject: string | null } {
  const match = text.match(/^SUBJECT:\s*(.+?)(?:\n|$)/i)
  if (match) {
    const subject = match[1].trim()
    const body = text.replace(/^SUBJECT:\s*.+\n*/i, '').trim()
    return { body, subject }
  }
  return { body: text, subject: null }
}

/**
 * Generate a random delay between min and max (inclusive)
 */
function getRandomDelay(minMs: number, maxMs: number): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
}

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Run the 3 QA gates (subject, similarity, idempotency) + burn-in mode.
 * Returns one of:
 *   - { action: 'pass' } → proceed with executeStep
 *   - { action: 'skip_duplicate', reason } → mark schedule as skipped_duplicate
 *   - { action: 'hold_for_review', reason, reviewId } → put on hold + WhatsApp notify
 */
async function runQaGates(
  supabase: ReturnType<typeof createSupabaseClient>,
  schedule: Schedule,
  cadenceStep: CadenceStep,
  generatedMessage: string,
  generatedSubject: string | null,
  authToken: string
): Promise<{ action: 'pass' | 'skip_duplicate' | 'hold_for_review'; reason?: string; reviewId?: string }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const config = cadenceStep.config_json || {}
  const signalAllocation = (config.signal_allocation as string) || null

  // ── Call validator edge function ──
  const validateResp = await fetch(`${supabaseUrl}/functions/v1/chief-validate-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': authToken },
    body: JSON.stringify({
      schedule_id: schedule.id,
      lead_id: schedule.lead_id,
      cadence_id: schedule.cadence_id,
      cadence_step_id: schedule.cadence_step_id,
      step_type: cadenceStep.step_type,
      generated_subject: generatedSubject,
      generated_message: generatedMessage,
      signal_allocation: signalAllocation,
      ownerId: schedule.owner_id,
      orgId: schedule.org_id,
    }),
  })

  const validation = await validateResp.json().catch(() => ({ passed: false, suggestion: 'hold_for_review' }))

  // ── Determine burn-in status for this step_type ──
  const { data: burnInRow } = await supabase
    .from('step_burn_in_status')
    .select('in_burn_in, approvals_count, approval_threshold')
    .eq('org_id', schedule.org_id)
    .eq('cadence_id', schedule.cadence_id)
    .eq('step_type', cadenceStep.step_type)
    .maybeSingle()

  const inBurnIn = !burnInRow || burnInRow.in_burn_in !== false  // default true if no row

  // ── Decide action ──
  let action: 'pass' | 'skip_duplicate' | 'hold_for_review'
  let reason: string | undefined

  if (validation.suggestion === 'skip_duplicate') {
    action = 'skip_duplicate'
    reason = `gate_c_idempotency_failed: ${validation.gate_c_idempotency?.reason || 'duplicate'}`
  } else if (!validation.passed) {
    // Gate A or B failed → hold_for_review (regenerate via human action)
    action = 'hold_for_review'
    reason = validation.gate_a_subject?.passed === false
      ? `gate_a_subject_failed: ${validation.gate_a_subject.reason}`
      : `gate_b_similarity_failed: jaccard=${validation.gate_b_similarity?.details?.max_jaccard}`
  } else if (inBurnIn) {
    // Validators passed but step is in burn-in → require human approval
    action = 'hold_for_review'
    reason = `step_in_burn_in (approvals=${burnInRow?.approvals_count || 0}/${burnInRow?.approval_threshold || 1})`
  } else {
    action = 'pass'
  }

  // ── Always log to message_qa_reviews (audit trail) ──
  let reviewId: string | undefined
  if (action !== 'skip_duplicate') {
    const { data: review } = await supabase.from('message_qa_reviews').insert({
      org_id: schedule.org_id,
      schedule_id: schedule.id,
      lead_id: schedule.lead_id,
      cadence_id: schedule.cadence_id,
      cadence_step_id: schedule.cadence_step_id,
      step_type: cadenceStep.step_type,
      day_offset: cadenceStep.day_offset,
      signal_allocation: signalAllocation,
      generated_subject: generatedSubject,
      generated_message: generatedMessage,
      validators_passed: {
        gate_a_subject: validation.gate_a_subject,
        gate_b_similarity: validation.gate_b_similarity,
        gate_c_idempotency: validation.gate_c_idempotency,
      },
      all_validators_passed: validation.passed,
      status: action === 'pass' ? 'auto_passed' : 'pending',
      regenerate_count: (config.regenerate_count as number) || 0,
      expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),  // 4h timeout
    }).select('id').single()
    reviewId = review?.id

    // ── If hold_for_review: invoke Carlos (QA supervisor) instead of WhatsApp directly ──
    // Carlos auto-decides approve/regenerate/reject/escalate. Only escalate sends WhatsApp.
    if (action === 'hold_for_review' && reviewId) {
      try {
        const supabaseUrl2 = Deno.env.get('SUPABASE_URL')!
        const serviceKey = Deno.env.get('SERVICE_ROLE_KEY_FULL') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const carlosResp = await fetch(`${supabaseUrl2}/functions/v1/chief-supervise-message`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            review_id: reviewId,
            ownerId: schedule.owner_id,
            orgId: schedule.org_id,
          }),
        })
        const carlosJson = await carlosResp.json().catch(() => ({}))
        console.log(`[carlos] decision for review ${reviewId}: ${carlosJson.decision || 'unknown'} (cost=$${carlosJson.cost_usd || '0'})`)
      } catch (err) {
        console.error(`[carlos] Failed to invoke supervisor for review ${reviewId}:`, err)
        // Fallback: send to WhatsApp directly so message doesn't get stuck
        await sendQaNotificationWhatsApp(
          supabase, schedule, cadenceStep, generatedSubject, generatedMessage,
          reviewId, validation, reason
        )
      }
    }
  }

  return { action, reason, reviewId }
}

/**
 * Send a WhatsApp notification to the cadence owner with the message preview
 * and validators result. Inserts a pending_whatsapp_actions row so bridge can
 * resolve a "1/2/3" reply.
 */
async function sendQaNotificationWhatsApp(
  supabase: ReturnType<typeof createSupabaseClient>,
  schedule: Schedule,
  cadenceStep: CadenceStep,
  subject: string | null,
  body: string,
  reviewId: string,
  validation: Record<string, unknown>,
  reason?: string
): Promise<void> {
  // Resolve user phone from rasheedbayter@gmail.com or via chief_sessions
  const { data: chiefSession } = await supabase
    .from('chief_sessions')
    .select('whatsapp_number')
    .eq('owner_id', schedule.owner_id)
    .eq('org_id', schedule.org_id)
    .maybeSingle()

  if (!chiefSession?.whatsapp_number) {
    console.warn(`No WhatsApp number found for owner ${schedule.owner_id}, skipping notification`)
    return
  }

  // Get lead name for context
  const { data: lead } = await supabase
    .from('leads')
    .select('first_name, last_name, company, title')
    .eq('id', schedule.lead_id)
    .maybeSingle()

  const leadLabel = lead ? `${lead.first_name} ${lead.last_name} (${lead.title || '?'} @ ${lead.company || '?'})` : 'lead'

  // Build validators summary
  const v = validation as { gate_a_subject?: { passed: boolean; reason?: string }, gate_b_similarity?: { passed: boolean; details?: { max_jaccard?: number } }, gate_c_idempotency?: { passed: boolean } }
  const subjOk = v.gate_a_subject?.passed ? '✅' : '❌'
  const simJaccard = v.gate_b_similarity?.details?.max_jaccard
  const simOk = v.gate_b_similarity?.passed ? '✅' : '❌'
  const idemOk = v.gate_c_idempotency?.passed ? '✅' : '❌'

  const stepLabel = `Day ${cadenceStep.day_offset} ${cadenceStep.step_type}`
  const subjectLine = subject ? `SUBJECT: ${subject}\n\n` : ''
  const bodyPreview = body.length > 400 ? body.substring(0, 400) + '...' : body

  const message = `📨 ${stepLabel} · ${leadLabel}

${subjectLine}${bodyPreview}

Validators:
  ${subjOk} Subject (${v.gate_a_subject?.reason || 'ok'})
  ${simOk} Similarity${simJaccard !== undefined ? ` (jaccard=${simJaccard})` : ''}
  ${idemOk} Idempotency

${reason ? `Hold reason: ${reason}\n\n` : ''}Responde:
1 = aprobar y enviar
2 = rechazar (skip step)
3 = regenerar (different angle)`

  // Insert pending_whatsapp_actions so bridge can resolve the 1/2/3 reply
  const phoneNormalized = chiefSession.whatsapp_number.replace(/^whatsapp:/, '').replace(/[^\d+]/g, '')
  await supabase.from('pending_whatsapp_actions').insert({
    org_id: schedule.org_id,
    user_phone: phoneNormalized,
    action_type: 'qa_review',
    target_id: reviewId,
    context_summary: `${stepLabel} · ${leadLabel}`,
    expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
  })

  // Send via bridge
  const bridgeUrl = Deno.env.get('BRIDGE_URL') || 'https://bridge.yuno.tools'
  try {
    await fetch(`${bridgeUrl}/api/whatsapp/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: chiefSession.whatsapp_number,
        body: message,
        org_id: schedule.org_id,
      }),
    })
    await supabase.from('message_qa_reviews').update({ notified_at: new Date().toISOString() }).eq('id', reviewId)
    console.log(`QA notification sent for review ${reviewId} to ${phoneNormalized}`)
  } catch (err) {
    console.error(`Failed to send QA WhatsApp notification:`, err)
  }
}

/**
 * Generate AI message for a step that has ai_prompt_id configured.
 * Calls the ai-research-generate edge function with service-role auth.
 */
async function generateAIMessage(
  schedule: Schedule,
  cadenceStep: CadenceStep,
  authToken: string,
  postContext?: string
): Promise<{ message: string; subject?: string; skipStep?: boolean; skipReason?: string } | null> {
  const config = cadenceStep.config_json || {}
  const aiPromptId = config.ai_prompt_id as string | undefined

  if (!aiPromptId) return null // No AI prompt configured

  const supabase = createSupabaseClient()

  // Fetch the AI prompt
  const { data: aiPrompt } = await supabase
    .from('ai_prompts')
    .select('*')
    .eq('id', aiPromptId)
    .single()

  if (!aiPrompt) {
    console.error(`AI prompt ${aiPromptId} not found for step ${cadenceStep.id}`)
    return null
  }

  // V14: pre-generated company deck URLs (cached on amc by chief-prepare-decks-for-company)
  // Day 5 (email_reply) + Day 7 (linkedin_message follow-up) optionally cite ss_deck_url.
  // Day 9 (BC delivery) uses sdr_bc_url. Missing URLs → prompt degrades silently.
  let ssDeckUrl: string | null = null
  let sdrBcUrl: string | null = null
  try {
    const { data: leadRow } = await supabase
      .from('leads')
      .select('account_map_company_id')
      .eq('id', schedule.lead_id)
      .maybeSingle()
    const amcId = leadRow?.account_map_company_id
    if (amcId) {
      const { data: amcRow } = await supabase
        .from('account_map_companies')
        .select('ss_deck_url, sdr_bc_url')
        .eq('id', amcId)
        .maybeSingle()
      if (amcRow) {
        ssDeckUrl = amcRow.ss_deck_url || null
        sdrBcUrl = amcRow.sdr_bc_url || null
      }
    }
  } catch (deckErr) {
    console.warn(`[process-queue] deck URL lookup failed (non-fatal):`, (deckErr as Error).message)
  }

  // Fetch research prompt if configured
  const aiResearchPromptId = config.ai_research_prompt_id as string | undefined
  let researchPromptBody: string | undefined

  if (aiResearchPromptId) {
    const { data: researchPrompt } = await supabase
      .from('ai_prompts')
      .select('prompt_body')
      .eq('id', aiResearchPromptId)
      .single()
    researchPromptBody = researchPrompt?.prompt_body
  }

  // Fetch example messages if configured
  const exampleSectionId = config.ai_example_section_id as string | undefined
  let exampleMessages: string[] | undefined

  if (exampleSectionId) {
    const { data: examples } = await supabase
      .from('example_messages')
      .select('body')
      .eq('section_id', exampleSectionId)
      .order('sort_order', { ascending: true })
    exampleMessages = examples?.map((e: { body: string }) => e.body) || undefined
  }

  // ── Signal-Based Selling: read used_signals from cadence_lead.context_json ──
  // Allows the prompt to know which angles previous touches already covered.
  const signalAllocation = config.signal_allocation as string | undefined
  let usedSignalsContext = ''

  if (signalAllocation) {
    const { data: cadenceLeadRow } = await supabase
      .from('cadence_leads')
      .select('context_json')
      .eq('cadence_id', schedule.cadence_id)
      .eq('lead_id', schedule.lead_id)
      .maybeSingle()

    const usedSignals = (cadenceLeadRow?.context_json?.used_signals as string[] | undefined) || []
    usedSignalsContext = `

================================================================
SIGNAL ALLOCATION FOR THIS TOUCH: ${signalAllocation}
================================================================
This touch is ALLOCATED the "${signalAllocation}" angle. Use ONLY this signal as your hook.
Other signals are reserved for other touches in the sequence.

USED SIGNALS (already covered in prior touches — DO NOT REUSE):
${usedSignals.length > 0 ? usedSignals.map(s => `- ${s}`).join('\n') : '(none yet — this is the first AI touch in the sequence)'}

If your allocated signal is "synthesis", you may reference prior signals as a comp set,
but do not recap previous emails — recap the research findings.
================================================================`
  }

  // Call ai-research-generate with ownerId (service-role auth)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!

  console.log(`Generating AI message for lead ${schedule.lead_id}, step ${cadenceStep.step_type}, prompt: ${aiPrompt.name}, signal: ${signalAllocation || '(none)'}`)

  const maxRetries = 2
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/ai-research-generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken,
        },
        body: (() => {
          // V9: pull Carlos feedback history from schedule.config_json (persisted by chief-approve-message)
          const cfg = (schedule as Schedule & { config_json?: Record<string, unknown> }).config_json || {}
          const feedbackHistory = (cfg.carlos_feedback_history as Array<Record<string, unknown>>) || []
          let carlosCustomInstr = ''
          if (feedbackHistory.length > 0) {
            carlosCustomInstr = '\n\n═══ CARLOS QA FEEDBACK FROM PRIOR ATTEMPTS (FIX THESE) ═══\n'
            for (const fb of feedbackHistory.slice(-3)) {  // last 3 attempts
              const fbData = (fb.feedback as Record<string, unknown>) || {}
              carlosCustomInstr += `\n--- Attempt ${fb.attempt} ---\n`
              if (fbData.feedback) carlosCustomInstr += `Carlos said: "${fbData.feedback}"\n`
              if (fbData.scoring_breakdown) carlosCustomInstr += `Scores: ${JSON.stringify(fbData.scoring_breakdown)}\n`
              if (fbData.risk_triggers && (fbData.risk_triggers as string[]).length > 0) {
                carlosCustomInstr += `Risk triggers: ${(fbData.risk_triggers as string[]).join(', ')}\n`
              }
              if (fb.decision_reason) carlosCustomInstr += `Reason: ${fb.decision_reason}\n`
            }
            carlosCustomInstr += '\nFIX SPECIFICALLY what Carlos flagged. Match the per-step rubric. Do NOT repeat the same mistakes.'
          }
          return JSON.stringify({
            ownerId: schedule.owner_id,
            orgId: schedule.org_id,
            leadId: schedule.lead_id,
            stepType: cadenceStep.step_type,
            messageTemplate: aiPrompt.prompt_body,
            customInstructions: (usedSignalsContext || '') + carlosCustomInstr || undefined,
            researchPrompt: researchPromptBody,
            tone: aiPrompt.tone || 'professional',
            language: aiPrompt.language || 'es',
            exampleMessages,
            useSignals: config.use_signals !== false,
            // V15 narrative arc: ai-research-generate uses these to inject ANGLE LOCK
            // for this day + query prior message_qa_reviews for the same lead+cadence
            // and inject as PRIOR TOUCHES context.
            dayOffset: cadenceStep.day_offset,
            cadenceId: schedule.cadence_id,
            // V14: per-company deck URLs (cached on amc). Day 5/7 use ssDeckUrl,
            // Day 9 uses sdrBcUrl. NULL → prompt skips deck reference.
            ssDeckUrl,
            sdrBcUrl,
            ...(postContext ? { postContext } : {}),
            ...(cfg.regenerate_hint ? { regenerateHint: cfg.regenerate_hint } : {}),
          })
        })(),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        console.error(`AI generation failed (attempt ${attempt}/${maxRetries}):`, data.error || `HTTP ${response.status}`)
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 3000)) // Wait 3s before retry
          continue
        }
        return null
      }

      console.log(`AI message generated successfully for lead ${schedule.lead_id}`)

      // Deterministic skip signal: ai-research-generate decided the post isn't
      // worth commenting (no post / personal / not company news). Propagate
      // the signal so the caller can skip the step instead of treating
      // "SKIP_COMMENT" as the comment body.
      if (data.deterministic_skip === true) {
        return {
          message: '',
          subject: undefined,
          skipStep: true,
          skipReason: (data.skip_reason as string) || 'deterministic_skip',
        }
      }

      return {
        message: data.generatedMessage,
        subject: data.generatedSubject || undefined,
      }
    } catch (error) {
      console.error(`AI generation error (attempt ${attempt}/${maxRetries}):`, error)
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 3000))
        continue
      }
      return null
    }
  }
  return null
}

/**
 * Get the next step in a cadence after the current step
 */
async function getNextCadenceStep(
  supabase: ReturnType<typeof createSupabaseClient>,
  cadenceId: string,
  currentStepId: string
): Promise<CadenceStep | null> {
  // Get current step to find its position
  const { data: currentStep } = await supabase
    .from('cadence_steps')
    .select('*')
    .eq('id', currentStepId)
    .single()

  if (!currentStep) return null

  // Find the next step by day_offset and order_in_day
  const { data: nextSteps } = await supabase
    .from('cadence_steps')
    .select('*')
    .eq('cadence_id', cadenceId)
    .or(
      `day_offset.gt.${currentStep.day_offset},` +
      `and(day_offset.eq.${currentStep.day_offset},order_in_day.gt.${currentStep.order_in_day})`
    )
    .order('day_offset', { ascending: true })
    .order('order_in_day', { ascending: true })
    .limit(1)

  return nextSteps && nextSteps.length > 0 ? nextSteps[0] : null
}

/**
 * Advance a lead to the next step in their cadence after successful action.
 * For automated cadences, also creates a schedule for the next step.
 */
async function advanceLeadToNextStep(
  supabase: ReturnType<typeof createSupabaseClient>,
  schedule: Schedule,
  cadenceStep: CadenceStep
): Promise<{ advanced: boolean; nextStepId: string | null; completed: boolean }> {
  const { cadence_id, lead_id, owner_id, cadence_step_id } = schedule

  // Get the next step in the cadence
  const nextStep = await getNextCadenceStep(supabase, cadence_id, cadence_step_id)

  if (!nextStep) {
    // No more steps - mark the cadence_lead as completed
    await supabase
      .from('cadence_leads')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('cadence_id', cadence_id)
      .eq('lead_id', lead_id)

    console.log(`Lead ${lead_id} completed cadence ${cadence_id} - no more steps`)

    return { advanced: false, nextStepId: null, completed: true }
  }

  // Update cadence_lead to point to the next step
  await supabase
    .from('cadence_leads')
    .update({
      current_step_id: nextStep.id,
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('cadence_id', cadence_id)
    .eq('lead_id', lead_id)

  // Create lead_step_instance for the next step (upsert to avoid duplicate key)
  await supabase.from('lead_step_instances').upsert({
    cadence_id,
    cadence_step_id: nextStep.id,
    lead_id,
    owner_id,
    status: 'pending',
  }, { onConflict: 'cadence_step_id,lead_id' })

  console.log(`Advanced lead ${lead_id} to next step ${nextStep.id} (${nextStep.step_label})`)

  // ── Auto-schedule next step for automated cadences ──
  const { data: cadence } = await supabase
    .from('cadences')
    .select('automation_mode, timezone')
    .eq('id', cadence_id)
    .single()

  if (cadence?.automation_mode === 'automated') {
    // Check if a schedule already exists for this lead+step (created upfront by StartAutomation)
    const { data: existingSchedule } = await supabase
      .from('schedules')
      .select('id')
      .eq('cadence_step_id', nextStep.id)
      .eq('lead_id', lead_id)
      .in('status', ['scheduled', 'processing'])
      .limit(1)
      .single()

    if (existingSchedule) {
      console.log(`Schedule already exists for lead ${lead_id} step ${nextStep.id}, skipping creation`)
    } else {
      // No pre-existing schedule — create one (e.g., for steps added after automation started)
      const nextConfig = nextStep.config_json || {}
      const scheduledTime = nextConfig.scheduled_time as string | undefined
      const tz = (cadence?.timezone as string) || 'America/New_York'
      const dayDiff = nextStep.day_offset - cadenceStep.day_offset
      let scheduleAt: Date

      // Helper: add business days (skip weekends) to a base date
      const addBusinessDays = (year: number, month: number, day: number, bizDays: number): Date => {
        const bd = new Date(year, month, day)
        let remaining = bizDays
        while (remaining > 0) {
          bd.setDate(bd.getDate() + 1)
          if (bd.getDay() !== 0 && bd.getDay() !== 6) remaining--
        }
        return bd
      }

      if (scheduledTime) {
        const now = new Date()
        const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
        const todayStr = dateFmt.format(now)
        const [y, m, d] = todayStr.split('-').map(Number)
        const target = dayDiff === 0
          ? new Date(y, m - 1, d)
          : addBusinessDays(y, m - 1, d, dayDiff)
        const [hours, minutes] = scheduledTime.split(':').map(Number)
        const guessUTC = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate(), hours, minutes, 0)
        const guess = new Date(guessUTC)
        const timeFmt = new Intl.DateTimeFormat('en-US', {
          timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23' as const,
        })
        const parts = timeFmt.formatToParts(guess)
        const lH = parseInt(parts.find((p: Intl.DateTimeFormatPart) => p.type === 'hour')?.value || '0')
        const lM = parseInt(parts.find((p: Intl.DateTimeFormatPart) => p.type === 'minute')?.value || '0')
        const lD = parseInt(parts.find((p: Intl.DateTimeFormatPart) => p.type === 'day')?.value || '0')
        let diffMin = (hours * 60 + minutes) - (lH * 60 + lM)
        if (lD !== target.getDate()) diffMin += (target.getDate() > lD ? 1 : -1) * 1440
        scheduleAt = new Date(guessUTC + diffMin * 60 * 1000)

        if (scheduleAt <= now) {
          if (dayDiff === 0) {
            // Same-day step: execute in 5 minutes, don't push to next day
            scheduleAt = new Date(now.getTime() + 5 * 60 * 1000)
            console.log(`Same-day step scheduled_time already passed, executing in 5 min`)
          } else {
            // Push to next business day
            do { scheduleAt.setDate(scheduleAt.getDate() + 1) } while (scheduleAt.getDay() === 0 || scheduleAt.getDay() === 6)
          }
        }

        console.log(`Step scheduled at ${scheduledTime} ${tz} → UTC: ${scheduleAt.toISOString()}`)
      } else {
        scheduleAt = new Date()
        if (dayDiff === 0) {
          scheduleAt.setMinutes(scheduleAt.getMinutes() + 60)
        } else {
          // Add business days instead of calendar days
          let remaining = dayDiff
          while (remaining > 0) {
            scheduleAt.setDate(scheduleAt.getDate() + 1)
            if (scheduleAt.getDay() !== 0 && scheduleAt.getDay() !== 6) remaining--
          }
          scheduleAt.setHours(9 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60), 0, 0)
          // If time passed, push to next business day
          if (scheduleAt <= new Date()) {
            do { scheduleAt.setDate(scheduleAt.getDate() + 1) } while (scheduleAt.getDay() === 0 || scheduleAt.getDay() === 6)
          }
        }
      }

      // Re-check right before insert to prevent race condition with concurrent workers
      const { data: lastMinuteCheck } = await supabase
        .from('schedules')
        .select('id')
        .eq('cadence_step_id', nextStep.id)
        .eq('lead_id', lead_id)
        .in('status', ['scheduled', 'processing', 'executed'])
        .limit(1)

      if (lastMinuteCheck && lastMinuteCheck.length > 0) {
        console.log(`Schedule already exists for lead ${lead_id} step ${nextStep.id} (found in last-minute check), skipping auto-schedule`)
      } else {
        await supabase.from('schedules').insert({
          cadence_id,
          cadence_step_id: nextStep.id,
          lead_id,
          owner_id,
          org_id: schedule.org_id,
          scheduled_at: scheduleAt.toISOString(),
          timezone: 'UTC',
          status: 'scheduled',
        })

        console.log(`Auto-scheduled next step ${nextStep.id} for lead ${lead_id} at ${scheduleAt.toISOString()}`)
      }
    }

    // Update cadence_lead to 'scheduled'
    await supabase
      .from('cadence_leads')
      .update({
        status: 'scheduled',
        updated_at: new Date().toISOString(),
      })
      .eq('cadence_id', cadence_id)
      .eq('lead_id', lead_id)
  }

  return { advanced: true, nextStepId: nextStep.id, completed: false }
}

/**
 * Fetch the latest LinkedIn post for a lead by calling linkedin-get-user-posts.
 * Returns { postId, postUrl } or null if no posts found.
 */
async function fetchLatestPost(
  leadId: string,
  ownerId: string,
  orgId: string,
  authToken: string
): Promise<{ postId: string; postUrl: string; postText?: string } | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/linkedin-get-user-posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken,
      },
      body: JSON.stringify({ leadId, ownerId, orgId }),
    })

    const data = await response.json()

    if (!response.ok || !data.success || !data.posts || data.posts.length === 0) {
      console.warn(`No posts found for lead ${leadId}: ${data.error || 'empty'}`)
      return null
    }

    const latestPost = data.posts[0]
    return {
      postId: latestPost.id || '',
      postUrl: latestPost.url || '',
      postText: latestPost.text || latestPost.original_post?.text || undefined,
    }
  } catch (error) {
    console.error(`Error fetching posts for lead ${leadId}:`, error)
    return null
  }
}

// Replace cross-step tokens that come from cadence_lead_state. Currently:
//   {{deck_url}}      — chief.yuno.tools/m/<slug>
//   {{deck_pdf_url}}  — bridge.yuno.tools/api/m/<slug>/pdf
//   {{deck_slug}}     — the merchants_ss slug
// All synonyms with the ss_deck_ prefix are also honored so existing templates
// authored against the upstream skill naming continue to work.
async function interpolateLeadStateVars(
  supabase: ReturnType<typeof createSupabaseClient>,
  schedule: Schedule,
  baseBody: Record<string, unknown>,
): Promise<void> {
  const { data: row } = await supabase
    .from('cadence_lead_state')
    .select('state')
    .eq('cadence_id', schedule.cadence_id)
    .eq('lead_id', schedule.lead_id)
    .maybeSingle()
  const state = (row?.state || {}) as Record<string, unknown>
  if (!state.deck_url && !state.deck_slug && !state.deck_pdf_url) return

  const tokens: Record<string, string> = {
    '{{deck_url}}':         String(state.deck_url || ''),
    '{{ss_deck_url}}':      String(state.deck_url || ''),
    '{{deck_pdf_url}}':     String(state.deck_pdf_url || ''),
    '{{ss_deck_pdf_url}}':  String(state.deck_pdf_url || ''),
    '{{deck_slug}}':        String(state.deck_slug || ''),
    '{{ss_deck_slug}}':     String(state.deck_slug || ''),
  }

  const replace = (s: string): string => {
    let out = s
    for (const [k, v] of Object.entries(tokens)) {
      if (v) out = out.split(k).join(v)
    }
    return out
  }

  for (const key of ['subject', 'body', 'message', 'comment']) {
    const val = baseBody[key]
    if (typeof val === 'string' && val.includes('{{')) {
      baseBody[key] = replace(val)
    }
  }
}

/**
 * Call the appropriate LinkedIn Edge Function based on step type
 */
async function executeLinkedInAction(
  schedule: Schedule,
  cadenceStep: CadenceStep,
  authToken: string,
  options: { useInMail?: boolean } = {}
): Promise<{ success: boolean; error?: string; rateLimited?: boolean; data?: unknown }> {
  const endpoint = STEP_TYPE_TO_ENDPOINT[cadenceStep.step_type]

  if (!endpoint) {
    return {
      success: false,
      error: `Unsupported step type: ${cadenceStep.step_type}`,
    }
  }

  // Get lead_step_instance ID for this schedule
  const supabase = createSupabaseClient()
  const { data: instance } = await supabase
    .from('lead_step_instances')
    .select('id')
    .eq('cadence_step_id', schedule.cadence_step_id)
    .eq('lead_id', schedule.lead_id)
    .single()

  // Build request body based on step type
  const baseBody: Record<string, unknown> = {
    leadId: schedule.lead_id,
    cadenceId: schedule.cadence_id,
    cadenceStepId: schedule.cadence_step_id,
    scheduleId: schedule.id,
    instanceId: instance?.id,
    ownerId: schedule.owner_id, // Allow sub-functions to auth via service role + ownerId
    orgId: schedule.org_id,
  }

  // Add step-type specific fields
  const configJson = cadenceStep.config_json || {}

  switch (cadenceStep.step_type) {
    case 'linkedin_message': {
      let msgText = schedule.message_rendered_text ||
                    schedule.message_template_text ||
                    (configJson.message_template as string) ||
                    (configJson.message as string) ||
                    ''
      // Safety: strip any SUBJECT prefix that shouldn't be in LinkedIn messages
      const stripped = stripSubjectPrefix(msgText)
      baseBody.message = stripped.body
      // Fase B E2: when invite has been pending >48h, switch to InMail.
      // useInMail flag is set by the pre-dispatch hook in processSchedule().
      // linkedin-send-message accepts inmailMode='auto' (Unipile picks Sales
      // Navigator if available, falls back to classic if not).
      if (options.useInMail) {
        baseBody.inmailMode = 'auto'
        baseBody.inmailSubject = stripped.subject || `Following up`
        console.log(`[FaseB-E2] Sending as InMail for lead ${schedule.lead_id} (invite was pending)`)
      }
      break
    }

    case 'linkedin_connect': {
      let connMsg = schedule.message_rendered_text ||
                    schedule.message_template_text ||
                    (configJson.message_template as string) ||
                    (configJson.connection_message as string) ||
                    undefined
      if (connMsg) {
        const stripped = stripSubjectPrefix(connMsg)
        connMsg = stripped.body
      }
      baseBody.message = connMsg
      break
    }

    case 'linkedin_profile_view': {
      // No additional fields — edge function looks up lead's LinkedIn URL
      break
    }

    case 'linkedin_like': {
      // If postId/postUrl are in config, use them; otherwise fetch the lead's latest post
      let likePostId = configJson.post_id as string | undefined
      let likePostUrl = configJson.post_url as string | undefined

      if (!likePostId && !likePostUrl) {
        console.log(`No post configured for linkedin_like, fetching latest post for lead ${schedule.lead_id}`)
        const latestPost = await fetchLatestPost(schedule.lead_id, schedule.owner_id, schedule.org_id, authToken)
        if (!latestPost) {
          // Graceful skip: lead has no posts — mark step as skipped and advance pipeline
          console.warn(`No LinkedIn posts found for lead ${schedule.lead_id}, skipping like step gracefully`)
          await supabase
            .from('schedules')
            .update({ status: 'skipped_due_to_state_change', last_error: 'No LinkedIn posts found for this lead — step skipped', updated_at: new Date().toISOString() })
            .eq('id', schedule.id)
          await supabase
            .from('lead_step_instances')
            .update({ status: 'skipped', last_error: 'No LinkedIn posts found — step skipped', updated_at: new Date().toISOString() })
            .eq('cadence_step_id', schedule.cadence_step_id)
            .eq('lead_id', schedule.lead_id)
          await advanceLeadToNextStep(supabase, schedule, cadenceStep)
          return {
            scheduleId: schedule.id,
            leadId: schedule.lead_id,
            stepType: cadenceStep.step_type,
            success: true,
          }
        }
        likePostId = latestPost.postId
        likePostUrl = latestPost.postUrl
      }

      baseBody.postId = likePostId
      baseBody.postUrl = likePostUrl
      baseBody.reactionType = (configJson.reaction_type as string) || 'LIKE'
      break
    }

    case 'linkedin_comment': {
      // If postId/postUrl are in config, use them; otherwise fetch the lead's latest post
      let commentPostId = configJson.post_id as string | undefined
      let commentPostUrl = configJson.post_url as string | undefined

      if (!commentPostId && !commentPostUrl) {
        console.log(`No post configured for linkedin_comment, fetching latest post for lead ${schedule.lead_id}`)
        const latestPost = await fetchLatestPost(schedule.lead_id, schedule.owner_id, schedule.org_id, authToken)
        if (!latestPost) {
          // Graceful skip: lead has no posts — mark step as skipped and advance pipeline
          console.warn(`No LinkedIn posts found for lead ${schedule.lead_id}, skipping comment step gracefully`)
          await supabase
            .from('schedules')
            .update({ status: 'skipped_due_to_state_change', last_error: 'No LinkedIn posts found for this lead — step skipped', updated_at: new Date().toISOString() })
            .eq('id', schedule.id)
          await supabase
            .from('lead_step_instances')
            .update({ status: 'skipped', last_error: 'No LinkedIn posts found — step skipped', updated_at: new Date().toISOString() })
            .eq('cadence_step_id', schedule.cadence_step_id)
            .eq('lead_id', schedule.lead_id)
          await advanceLeadToNextStep(supabase, schedule, cadenceStep)
          return {
            scheduleId: schedule.id,
            leadId: schedule.lead_id,
            stepType: cadenceStep.step_type,
            success: true,
          }
        }
        commentPostId = latestPost.postId
        commentPostUrl = latestPost.postUrl
      }

      baseBody.postId = commentPostId
      baseBody.postUrl = commentPostUrl

      let commentText = schedule.message_rendered_text ||
                        schedule.message_template_text ||
                        (configJson.message_template as string) ||
                        (configJson.comment as string) ||
                        ''
      // Strip any SUBJECT prefix from comments
      const stripped = stripSubjectPrefix(commentText)
      baseBody.comment = stripped.body
      break
    }

    case 'send_email': {
      let emailBody = schedule.message_rendered_text ||
                      schedule.message_template_text ||
                      (configJson.message_template as string) ||
                      (configJson.body as string) ||
                      ''
      // Strip any remaining SUBJECT prefix from the body
      const stripped = stripSubjectPrefix(emailBody)
      emailBody = stripped.body

      baseBody.to = (configJson.to_email as string) || ''
      baseBody.subject = (configJson.subject as string) ||
                         stripped.subject ||
                         'No subject'
      // Convert plain text to HTML for proper email formatting
      baseBody.body = textToHtml(emailBody)
      if (configJson.cc) baseBody.cc = configJson.cc as string

      // V14b: Day 9 attaches SDR BC PDF. Pass attachDeck flag to send-email
      // which fetches internally (server-to-server, bypasses ~6MB request body
      // limit). If the BC isn't available, send-email degrades silently.
      if (cadenceStep.day_offset === 9) {
        baseBody.attachDeck = 'sdr_bc'
        console.log(`[process-queue Day 9] requesting send-email to attach sdr-bc PDF for lead ${schedule.lead_id}`)
      }
      break
    }

    case 'email_reply': {
      let emailBody = schedule.message_rendered_text ||
                      schedule.message_template_text ||
                      (configJson.message_template as string) ||
                      (configJson.body as string) ||
                      ''
      const stripped = stripSubjectPrefix(emailBody)
      emailBody = stripped.body

      baseBody.to = (configJson.to_email as string) || ''
      baseBody.body = textToHtml(emailBody)

      // Look up original email: get gmail_message_id AND subject (Unipile requires subject to match original)
      const replyToStepId = configJson.reply_to_step_id as string | undefined
      let replyToMessageId: string | null = null
      let originalSubject: string | null = null

      if (replyToStepId) {
        const { data: prevEmail } = await supabase
          .from('email_messages')
          .select('gmail_message_id, subject')
          .eq('cadence_id', schedule.cadence_id)
          .eq('cadence_step_id', replyToStepId)
          .eq('lead_id', schedule.lead_id)
          .not('gmail_message_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        replyToMessageId = prevEmail?.gmail_message_id || null
        originalSubject = prevEmail?.subject || null
      }

      // Fallback: most recent email in this cadence to this lead
      if (!replyToMessageId) {
        const { data: prevEmail } = await supabase
          .from('email_messages')
          .select('gmail_message_id, subject')
          .eq('cadence_id', schedule.cadence_id)
          .eq('lead_id', schedule.lead_id)
          .not('gmail_message_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        replyToMessageId = prevEmail?.gmail_message_id || null
        if (!originalSubject) originalSubject = prevEmail?.subject || null
      }

      // Unipile requires: reply subject = original subject (with optional Re: prefix)
      // Strip any existing Re: from original to avoid "Re: Re: ..."
      const cleanOriginal = originalSubject ? originalSubject.replace(/^re:\s*/i, '').trim() : null
      const fallbackSubject = (configJson.subject as string) || stripped.subject || 'Follow-up'
      const subjectBase = cleanOriginal || fallbackSubject.replace(/^re:\s*/i, '').trim()
      baseBody.subject = `Re: ${subjectBase}`

      if (replyToMessageId) {
        baseBody.replyToMessageId = replyToMessageId
        console.log(`email_reply: threading onto ${replyToMessageId}, subject: "${baseBody.subject}" for lead ${schedule.lead_id}`)
      } else {
        console.warn(`email_reply: no previous gmail_message_id found for lead ${schedule.lead_id}, sending as new email with subject: "${baseBody.subject}"`)
      }
      if (configJson.cc) baseBody.cc = configJson.cc as string

      // V14b: Day 5 email_reply also attaches the ss-deck PDF. Same path as
      // Day 9 — pass attachDeck flag, send-email fetches internally.
      if (cadenceStep.day_offset === 5) {
        baseBody.attachDeck = 'ss_deck'
        console.log(`[process-queue Day 5] requesting send-email to attach ss-deck PDF for lead ${schedule.lead_id}`)
      }
      break
    }
  }

  // === Interpolate cross-step state vars ({{deck_url}}, etc.) ===
  // Read cadence_lead_state for this (cadence,lead) and substitute the tokens
  // a previous generate_ss_deck step persisted. Done as a final pass so any
  // upstream AI gen / template path benefits without further wiring.
  await interpolateLeadStateVars(supabase, schedule, baseBody)

  // Make the request to the LinkedIn Edge Function
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const url = `${supabaseUrl}${endpoint}`

  try {
    console.log(`Calling ${endpoint} for schedule ${schedule.id}`)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken,
      },
      body: JSON.stringify(baseBody),
    })

    const data = await response.json()

    if (!response.ok) {
      // Detect LinkedIn rate limiting
      const errorMsg = typeof data?.error === 'string' ? data.error : ''
      const isRateLimit =
        response.status === 429 ||
        errorMsg.includes('429') ||
        errorMsg.toLowerCase().includes('rate limit') ||
        errorMsg.toLowerCase().includes('too many') ||
        errorMsg.toLowerCase().includes('quota exceeded') ||
        errorMsg.toLowerCase().includes('action blocked') ||
        errorMsg.toLowerCase().includes('restricted') ||
        errorMsg.toLowerCase().includes('weekly limit')

      return {
        success: false,
        error: isRateLimit
          ? `LinkedIn rate limit detectado. Retry manual necesario. (${errorMsg || response.status})`
          : errorMsg || `HTTP ${response.status}: ${response.statusText}`,
        rateLimited: isRateLimit,
        data,
      }
    }

    return {
      success: data.success === true,
      error: data.error,
      data,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error calling LinkedIn function',
    }
  }
}

/**
 * Process a single schedule item
 */
// Handle generate_ss_deck step: fetch lead.company → call ss-deck-generate →
// upsert cadence_lead_state with {deck_url, deck_pdf_url, deck_slug}. Reuses
// existing deck if one is already on state (dedup — avoids duplicate $0.30+
// deep-research charges within the same cadence).
async function processGenerateSsDeck(
  supabase: ReturnType<typeof createSupabaseClient>,
  schedule: Schedule,
  _cadenceStep: CadenceStep,
): Promise<ProcessResult> {
  const stepType = 'generate_ss_deck'

  // Pull lead's company + optional website
  const { data: lead } = await supabase
    .from('leads')
    .select('company, website')
    .eq('id', schedule.lead_id)
    .single()
  const company = (lead?.company || '').trim()
  if (!company) {
    const error = 'Lead has no company — cannot generate SS deck'
    await supabase.from('schedules').update({
      status: 'failed', last_error: error, updated_at: new Date().toISOString(),
    }).eq('id', schedule.id)
    return { scheduleId: schedule.id, leadId: schedule.lead_id, stepType, success: false, error }
  }

  // Dedup: if cadence_lead_state already has a deck_url for this (cadence,lead),
  // reuse it. chief-deep-research-company has its own 30-day cache, but the
  // ss-deck-generate edge function still inserts a new merchants_ss row each
  // call — and that pollutes the deck list. Skip the call entirely if we
  // already generated one in this cadence run.
  const { data: existing } = await supabase
    .from('cadence_lead_state')
    .select('state')
    .eq('cadence_id', schedule.cadence_id)
    .eq('lead_id', schedule.lead_id)
    .maybeSingle()
  const existingState = (existing?.state || {}) as Record<string, unknown>
  if (existingState.deck_url) {
    console.log(`[generate_ss_deck] reusing existing deck for lead ${schedule.lead_id}: ${existingState.deck_url}`)
    await supabase.from('schedules').update({
      status: 'executed', updated_at: new Date().toISOString(),
    }).eq('id', schedule.id)
    await supabase.from('lead_step_instances').update({
      status: 'sent', updated_at: new Date().toISOString(),
    }).eq('cadence_step_id', schedule.cadence_step_id).eq('lead_id', schedule.lead_id)
    return { scheduleId: schedule.id, leadId: schedule.lead_id, stepType, success: true }
  }

  // Call ss-deck-generate. Service-role auth; the function injects company_name
  // + org_id and runs research (cached 30d via chief-deep-research-company).
  const supaUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRole =
    Deno.env.get('SERVICE_ROLE_KEY_FULL') ||
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!serviceRole) {
    const error = 'Service role key not configured — cannot call ss-deck-generate'
    await supabase.from('schedules').update({
      status: 'failed', last_error: error, updated_at: new Date().toISOString(),
    }).eq('id', schedule.id)
    return { scheduleId: schedule.id, leadId: schedule.lead_id, stepType, success: false, error }
  }

  const reqBody: Record<string, unknown> = {
    company_name: company,
    org_id: schedule.org_id,
  }
  if (lead?.website) reqBody.website = lead.website
  // language defaults to 'en' per 2026-05-18 automatic policy (cadence-generated
  // decks always render English / USD). Do NOT add language inference from
  // country or per-lead overrides here — manual decks pick language via the UI
  // form / skill prompt. Per-cadence overrides are out of scope for Phase 3.

  let resp: Response
  try {
    resp = await fetch(`${supaUrl}/functions/v1/ss-deck-generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRole}` },
      body: JSON.stringify(reqBody),
    })
  } catch (e) {
    const error = `ss-deck-generate fetch threw: ${(e as Error).message}`
    await supabase.from('schedules').update({
      status: 'failed', last_error: error, updated_at: new Date().toISOString(),
    }).eq('id', schedule.id)
    return { scheduleId: schedule.id, leadId: schedule.lead_id, stepType, success: false, error }
  }

  const text = await resp.text()
  let data: { url?: string; slug?: string; content_source?: string; region?: string | null; error?: string } = {}
  try { data = JSON.parse(text) } catch { /* fall through */ }

  if (!resp.ok || !data.slug || !data.url) {
    const error = `ss-deck-generate failed (${resp.status}): ${data.error || text.slice(0, 200)}`
    await supabase.from('schedules').update({
      status: 'failed', last_error: error, updated_at: new Date().toISOString(),
    }).eq('id', schedule.id)
    return { scheduleId: schedule.id, leadId: schedule.lead_id, stepType, success: false, error }
  }

  // Persist on cadence_lead_state — later steps interpolate from here.
  const nextState = {
    ...existingState,
    deck_url: data.url,
    deck_slug: data.slug,
    deck_pdf_url: `${SS_DECK_PDF_BASE}/${data.slug}/pdf`,
    deck_content_source: data.content_source || null,
    deck_region: data.region || null,
    deck_generated_at: new Date().toISOString(),
  }
  await supabase.from('cadence_lead_state').upsert({
    cadence_id: schedule.cadence_id,
    lead_id: schedule.lead_id,
    state: nextState,
  })

  // Mark schedule + instance as executed
  await supabase.from('schedules').update({
    status: 'executed', updated_at: new Date().toISOString(),
  }).eq('id', schedule.id)
  await supabase.from('lead_step_instances').update({
    status: 'sent', updated_at: new Date().toISOString(),
  }).eq('cadence_step_id', schedule.cadence_step_id).eq('lead_id', schedule.lead_id)

  console.log(`[generate_ss_deck] generated deck for lead ${schedule.lead_id}: ${data.url} (${data.content_source})`)
  return { scheduleId: schedule.id, leadId: schedule.lead_id, stepType, success: true }
}

async function processSchedule(
  schedule: Schedule,
  authToken: string
): Promise<ProcessResult> {
  const supabase = createSupabaseClient()

  console.log(`Processing schedule ${schedule.id} for lead ${schedule.lead_id}`)

  // === ATOMIC CLAIM ===
  // Prevent race conditions: atomically set status from 'scheduled' to 'processing'.
  // If another worker already claimed this schedule, the update will match 0 rows.
  const { data: claimed } = await supabase
    .from('schedules')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', schedule.id)
    .eq('status', 'scheduled')
    .select('id')

  if (!claimed || claimed.length === 0) {
    console.log(`Schedule ${schedule.id} already claimed by another worker, skipping`)
    return {
      scheduleId: schedule.id,
      leadId: schedule.lead_id,
      stepType: 'skipped',
      success: true,
    }
  }

  // === DEDUPLICATION CHECK ===
  // Prevent duplicate sends: check if this step was already executed OR is being processed
  // by another worker for this lead. Must check both 'executed' and 'processing' to catch
  // concurrent workers that claimed duplicate schedule rows.
  const { data: alreadyHandled } = await supabase
    .from('schedules')
    .select('id, status')
    .eq('cadence_step_id', schedule.cadence_step_id)
    .eq('lead_id', schedule.lead_id)
    .in('status', ['executed', 'processing'])
    .neq('id', schedule.id)
    .limit(1)

  if (alreadyHandled && alreadyHandled.length > 0) {
    console.log(`Step ${schedule.cadence_step_id} already ${alreadyHandled[0].status} for lead ${schedule.lead_id}, skipping duplicate (schedule ${schedule.id})`)
    await supabase
      .from('schedules')
      .update({
        status: 'skipped_due_to_state_change',
        last_error: `Duplicate: step already ${alreadyHandled[0].status} for this lead (${alreadyHandled[0].id})`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', schedule.id)

    return {
      scheduleId: schedule.id,
      leadId: schedule.lead_id,
      stepType: 'skipped',
      success: true,
    }
  }

  // Also check lead_step_instance - if already 'sent', skip
  const { data: existingInstance } = await supabase
    .from('lead_step_instances')
    .select('id, status')
    .eq('cadence_step_id', schedule.cadence_step_id)
    .eq('lead_id', schedule.lead_id)
    .single()

  if (existingInstance?.status === 'sent') {
    console.log(`Lead step instance already sent for lead ${schedule.lead_id}, step ${schedule.cadence_step_id}`)
    await supabase
      .from('schedules')
      .update({
        status: 'skipped_due_to_state_change',
        last_error: 'Duplicate: lead_step_instance already sent',
        updated_at: new Date().toISOString(),
      })
      .eq('id', schedule.id)

    return {
      scheduleId: schedule.id,
      leadId: schedule.lead_id,
      stepType: 'skipped',
      success: true,
    }
  }

  // Get the cadence step details
  const { data: cadenceStep, error: stepError } = await supabase
    .from('cadence_steps')
    .select('*')
    .eq('id', schedule.cadence_step_id)
    .single()

  if (stepError || !cadenceStep) {
    const error = 'Cadence step not found'
    console.error(`Schedule ${schedule.id}: ${error}`)

    // Update schedule status to failed
    await supabase
      .from('schedules')
      .update({
        status: 'failed',
        last_error: error,
        updated_at: new Date().toISOString(),
      })
      .eq('id', schedule.id)

    return {
      scheduleId: schedule.id,
      leadId: schedule.lead_id,
      stepType: 'unknown',
      success: false,
      error,
    }
  }

  // === HANDLE generate_ss_deck SEPARATELY ===
  // This step doesn't send a message — it generates the Yuno+<Client> deck
  // for the lead's company and stashes the URL on cadence_lead_state. Later
  // send_email / linkedin_message / email_reply steps interpolate {{deck_url}},
  // {{deck_pdf_url}}, {{deck_slug}} from that state.
  if (cadenceStep.step_type === 'generate_ss_deck') {
    return await processGenerateSsDeck(supabase, schedule, cadenceStep)
  }

  // Check if step type is supported
  if (!STEP_TYPE_TO_ENDPOINT[cadenceStep.step_type]) {
    const error = `Unsupported step type: ${cadenceStep.step_type}`
    console.error(`Schedule ${schedule.id}: ${error}`)

    // Update schedule status to skipped
    await supabase
      .from('schedules')
      .update({
        status: 'skipped_due_to_state_change',
        last_error: error,
        updated_at: new Date().toISOString(),
      })
      .eq('id', schedule.id)

    return {
      scheduleId: schedule.id,
      leadId: schedule.lead_id,
      stepType: cadenceStep.step_type,
      success: false,
      error,
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // FASE B: lead-state aware dispatch (E3 channel skip + E2 InMail flag)
  // ════════════════════════════════════════════════════════════════════
  // Fetch lead's LinkedIn state before dispatching. Two outcomes possible:
  //   E3: lead.linkedin_blocked=true → skip ALL linkedin_* steps gracefully,
  //       cadence continues for email steps (Day 1, Day 5, Day 9).
  //   E2: lead.linkedin_invite_status='pending' for >48h on a linkedin_message
  //       step → flag use_inmail=true. linkedin-send-message will use Sales
  //       Navigator InMail mode (already supported in shared/unipile.ts).
  // ════════════════════════════════════════════════════════════════════
  const isLinkedInStep = cadenceStep.step_type.startsWith('linkedin_')
  let useInMail = false
  if (isLinkedInStep) {
    const { data: leadState } = await supabase
      .from('leads')
      .select('linkedin_blocked, linkedin_invite_status, linkedin_invite_sent_at')
      .eq('id', schedule.lead_id)
      .maybeSingle()

    // E3: blocked → graceful skip
    if (leadState?.linkedin_blocked === true) {
      console.log(`[FaseB-E3] Lead ${schedule.lead_id} is linkedin_blocked — skipping ${cadenceStep.step_type} step ${schedule.id}`)
      await supabase
        .from('schedules')
        .update({
          status: 'skipped_due_to_state_change',
          last_error: 'Lead linkedin_blocked=true — channel-aware skip (Fase B E3). Email steps continue.',
          updated_at: new Date().toISOString(),
        })
        .eq('id', schedule.id)
      // Mark instance as skipped too so next-step scheduling can advance
      try {
        await supabase
          .from('lead_step_instances')
          .update({ status: 'skipped', last_error: 'linkedin_blocked', updated_at: new Date().toISOString() })
          .eq('cadence_step_id', schedule.cadence_step_id)
          .eq('lead_id', schedule.lead_id)
      } catch (_) { /* non-fatal */ }
      // Trigger next-step auto-scheduling so cadence doesn't stall (uses
      // existing helper, same as graceful-skip pattern in linkedin_like/comment).
      try {
        await advanceLeadToNextStep(supabase, schedule, cadenceStep)
      } catch (e) {
        console.warn(`[FaseB-E3] Failed to auto-schedule next step after skip:`, e)
      }
      return {
        scheduleId: schedule.id,
        leadId: schedule.lead_id,
        stepType: cadenceStep.step_type,
        success: true,
      }
    }

    // E2: linkedin_message + invite pending >48h → use InMail
    // BUT first verify with Unipile that the recipient hasn't accepted in the
    // meantime. The lead.linkedin_invite_status column is never updated to
    // 'accepted' automatically (no Unipile webhook wired up), so without this
    // live check every Day 3 falls into InMail mode — which burns scarce Sales
    // Navigator InMail credits even on prospects who accepted normally.
    if (cadenceStep.step_type === 'linkedin_message' &&
        leadState?.linkedin_invite_status === 'pending' &&
        leadState?.linkedin_invite_sent_at) {
      const sentAt = new Date(leadState.linkedin_invite_sent_at).getTime()
      const ageHours = (Date.now() - sentAt) / (1000 * 60 * 60)
      if (ageHours >= 48) {
        // Live-check connection status before forcing InMail
        let livelyConnected = false
        try {
          const { data: leadRow } = await supabase
            .from('leads')
            .select('linkedin_url, linkedin_provider_id, owner_id, org_id')
            .eq('id', schedule.lead_id)
            .maybeSingle()
          if (leadRow?.linkedin_url || leadRow?.linkedin_provider_id) {
            const unipileAccountId = await getUnipileAccountId(leadRow.owner_id, leadRow.org_id)
            if (unipileAccountId) {
              const unipile = createUnipileClient()
              // Prefer provider_id (stable), fall back to URL slug
              let identifier = leadRow.linkedin_provider_id as string | undefined
              if (!identifier && leadRow.linkedin_url) {
                const m = (leadRow.linkedin_url as string).match(/linkedin\.com\/in\/([^\/\?]+)/)
                identifier = m?.[1]
              }
              if (identifier) {
                const profile = await unipile.getProfile(unipileAccountId, identifier)
                const profileData = (profile?.data ?? profile) as Record<string, unknown>
                const networkDistance = profileData?.network_distance as string | undefined
                const isConnected = profileData?.is_connected as boolean | undefined
                const relationship = profileData?.relationship as string | undefined
                livelyConnected = networkDistance === 'DISTANCE_1' || isConnected === true || relationship === 'CONNECTED'
                if (livelyConnected) {
                  console.log(`[FaseB-E2] Lead ${schedule.lead_id}: invite ACCEPTED (live check) — using regular DM, persisting status`)
                  await supabase
                    .from('leads')
                    .update({
                      linkedin_invite_status: 'accepted',
                      linkedin_invite_accepted_at: new Date().toISOString(),
                    })
                    .eq('id', schedule.lead_id)
                }
              }
            }
          }
        } catch (probeErr) {
          console.warn(`[FaseB-E2] connection probe failed for lead ${schedule.lead_id}, falling through to InMail:`, (probeErr as Error).message)
        }
        if (!livelyConnected) {
          useInMail = true
          console.log(`[FaseB-E2] Lead ${schedule.lead_id}: invite pending ${ageHours.toFixed(1)}h (not accepted on live check) → switching to InMail`)
        }
      }
    }
  }

  // ── AI generation for automated steps ──
  const config = cadenceStep.config_json || {}
  const stepNeedsContent = ['linkedin_message', 'linkedin_comment', 'send_email', 'email_reply'].includes(cadenceStep.step_type) ||
    (cadenceStep.step_type === 'linkedin_connect' && config.send_note === true)

  // For linkedin_comment: pre-fetch the latest post so AI can generate a contextual comment
  let prefetchedPostContext: string | undefined
  if (cadenceStep.step_type === 'linkedin_comment') {
    const latestPost = await fetchLatestPost(schedule.lead_id, schedule.owner_id, schedule.org_id, authToken)
    if (latestPost?.postText) {
      prefetchedPostContext = latestPost.postText
      console.log(`Pre-fetched post context for linkedin_comment (${latestPost.postText.length} chars)`)
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // Pre-approved short-circuit: if schedule.message_rendered_text already
  // has content (set by chief-approve-message after Carlos auto-approved),
  // skip AI generation + validators + supervisor.
  // ════════════════════════════════════════════════════════════════════
  if (config.ai_prompt_id && schedule.message_rendered_text && schedule.message_rendered_text.trim().length > 0) {
    console.log(`[process-queue] Schedule ${schedule.id} already has message_rendered_text (pre-approved), skipping AI+QA gates`)
    // Resolve subject from approved review (if any)
    const { data: approvedReview } = await supabase
      .from('message_qa_reviews')
      .select('generated_subject')
      .eq('schedule_id', schedule.id)
      .eq('status', 'approved')
      .order('decided_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (approvedReview?.generated_subject) {
      cadenceStep.config_json = { ...cadenceStep.config_json, subject: approvedReview.generated_subject }
    }
    // Mark instance as generated (in case it isn't already)
    await supabase
      .from('lead_step_instances')
      .update({
        message_rendered_text: schedule.message_rendered_text,
        status: 'generated',
        updated_at: new Date().toISOString(),
      })
      .eq('cadence_step_id', schedule.cadence_step_id)
      .eq('lead_id', schedule.lead_id)
    // Skip the AI generation + validators + supervisor block below.
  } else if (config.ai_prompt_id) {
    // No pre-approved message — generate fresh with AI
    const aiResult = await generateAIMessage(schedule, cadenceStep, authToken, prefetchedPostContext)
    if (aiResult?.skipStep) {
      // ai-research-generate signaled a deterministic skip (e.g., post not
      // relevant for linkedin_comment). Mark schedule + instance as skipped
      // and advance the lead to the next step. Never post "SKIP_COMMENT".
      console.log(`[process-queue] deterministic skip for schedule ${schedule.id}: ${aiResult.skipReason}`)
      await supabase
        .from('schedules')
        .update({
          status: 'skipped_due_to_state_change',
          last_error: `skip:${aiResult.skipReason || 'deterministic_skip'}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', schedule.id)
      await supabase
        .from('lead_step_instances')
        .update({
          status: 'skipped',
          last_error: `skip:${aiResult.skipReason || 'deterministic_skip'}`,
          updated_at: new Date().toISOString(),
        })
        .eq('cadence_step_id', schedule.cadence_step_id)
        .eq('lead_id', schedule.lead_id)
      await advanceLeadToNextStep(supabase, schedule, cadenceStep)
      return {
        scheduleId: schedule.id,
        leadId: schedule.lead_id,
        stepType: cadenceStep.step_type,
        success: true,
      }
    }
    if (aiResult) {
      schedule.message_rendered_text = aiResult.message
      if (aiResult.subject) {
        cadenceStep.config_json = { ...cadenceStep.config_json, subject: aiResult.subject }
      }
      await supabase
        .from('lead_step_instances')
        .update({
          message_rendered_text: aiResult.message,
          status: 'generated',
          updated_at: new Date().toISOString(),
        })
        .eq('cadence_step_id', schedule.cadence_step_id)
        .eq('lead_id', schedule.lead_id)

      // ════════════════════════════════════════════════════════════════════
      // QA VALIDATORS + BURN-IN GATE (3 capas de QA en producción)
      // Skip if pre_approved=true (already passed via WhatsApp approval)
      // ════════════════════════════════════════════════════════════════════
      if (!config.pre_approved) {
        const qaGateResult = await runQaGates(
          supabase,
          schedule,
          cadenceStep,
          aiResult.message,
          aiResult.subject || null,
          authToken
        )

        if (qaGateResult.action === 'skip_duplicate') {
          await supabase.from('schedules').update({
            status: 'skipped_duplicate',
            last_error: qaGateResult.reason,
            updated_at: new Date().toISOString(),
          }).eq('id', schedule.id)
          return {
            scheduleId: schedule.id,
            leadId: schedule.lead_id,
            stepType: cadenceStep.step_type,
            success: false,
            error: qaGateResult.reason,
          }
        }

        if (qaGateResult.action === 'hold_for_review') {
          await supabase.from('schedules').update({
            status: 'hold_for_review',
            last_error: qaGateResult.reason,
            updated_at: new Date().toISOString(),
          }).eq('id', schedule.id)
          return {
            scheduleId: schedule.id,
            leadId: schedule.lead_id,
            stepType: cadenceStep.step_type,
            success: true,  // not a failure, just paused for human review
            error: undefined,
            heldForReview: true,
            reviewId: qaGateResult.reviewId,
          } as Awaited<ReturnType<typeof processSchedule>>
        }
        // action === 'pass' → continue to executeStep below
      }
      // ════════════════════════════════════════════════════════════════════
    } else if (stepNeedsContent && !config.message_template && !schedule.message_template_text) {
      // AI generation failed and no explicit template — use the prompt_body as fallback
      // This renders the prompt itself (which has {{variables}}) rather than failing the step
      console.warn(`AI generation failed for schedule ${schedule.id}, falling back to prompt_body template`)
      const { data: aiPromptFallback } = await supabase
        .from('ai_prompts')
        .select('prompt_body')
        .eq('id', config.ai_prompt_id as string)
        .single()

      if (aiPromptFallback?.prompt_body) {
        schedule.message_rendered_text = aiPromptFallback.prompt_body
        await supabase
          .from('lead_step_instances')
          .update({ message_rendered_text: aiPromptFallback.prompt_body, status: 'generated', updated_at: new Date().toISOString() })
          .eq('cadence_step_id', schedule.cadence_step_id)
          .eq('lead_id', schedule.lead_id)
        console.log(`Using prompt_body as fallback message for schedule ${schedule.id}`)
      } else {
        // Last resort: minimal default per step type
        const defaults: Record<string, string> = {
          send_email: 'Hi {{first_name}},\n\nI wanted to reach out about {{company}}.\n\nBest regards',
          email_reply: 'Hi {{first_name}},\n\nI wanted to follow up on my previous email regarding {{company}}.\n\nLooking forward to hearing from you.\n\nBest regards',
          linkedin_message: 'Hi {{first_name}}, I came across your profile and wanted to connect.',
          linkedin_comment: 'Great post! Thanks for sharing this.',
          linkedin_connect: 'Hi {{first_name}}, I\'d love to connect.',
        }
        const fallback = defaults[cadenceStep.step_type] || 'Hi {{first_name}}, I wanted to reach out.'
        schedule.message_rendered_text = fallback
        console.warn(`Using minimal default message for schedule ${schedule.id} step ${cadenceStep.step_type}`)
      }
    } else {
      console.warn(`AI generation returned null for schedule ${schedule.id}, proceeding with template message`)
    }
  } else if (stepNeedsContent && !config.message_template && !schedule.message_template_text) {
    // No AI prompt AND no template → auto-generate with default step-type rules
    console.log(`No prompt/template for step ${cadenceStep.step_type}, auto-generating with defaults`)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/ai-research-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': authToken },
        body: JSON.stringify({
          ownerId: schedule.owner_id,
          orgId: schedule.org_id,
          leadId: schedule.lead_id,
          stepType: cadenceStep.step_type,
          tone: 'professional',
          language: (config.language as string) || undefined,
          useSignals: config.use_signals !== false,
          ...(prefetchedPostContext ? { postContext: prefetchedPostContext } : {}),
        }),
      })
      const data = await response.json()
      if (response.ok && data.success && data.deterministic_skip === true) {
        console.log(`[process-queue] deterministic skip for schedule ${schedule.id} (auto-gen path): ${data.skip_reason}`)
        await supabase
          .from('schedules')
          .update({
            status: 'skipped_due_to_state_change',
            last_error: `skip:${data.skip_reason || 'deterministic_skip'}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', schedule.id)
        await supabase
          .from('lead_step_instances')
          .update({
            status: 'skipped',
            last_error: `skip:${data.skip_reason || 'deterministic_skip'}`,
            updated_at: new Date().toISOString(),
          })
          .eq('cadence_step_id', schedule.cadence_step_id)
          .eq('lead_id', schedule.lead_id)
        await advanceLeadToNextStep(supabase, schedule, cadenceStep)
        return {
          scheduleId: schedule.id,
          leadId: schedule.lead_id,
          stepType: cadenceStep.step_type,
          success: true,
        }
      }
      if (response.ok && data.success && data.generatedMessage) {
        schedule.message_rendered_text = data.generatedMessage
        if (data.generatedSubject) {
          cadenceStep.config_json = { ...cadenceStep.config_json, subject: data.generatedSubject }
        }
        await supabase
          .from('lead_step_instances')
          .update({
            message_rendered_text: data.generatedMessage,
            status: 'generated',
            updated_at: new Date().toISOString(),
          })
          .eq('cadence_step_id', schedule.cadence_step_id)
          .eq('lead_id', schedule.lead_id)
        console.log(`Auto-generated message for lead ${schedule.lead_id}`)
      } else {
        console.warn(`Auto-generation failed for schedule ${schedule.id}: ${data.error || 'unknown'}`)
      }
    } catch (err) {
      console.error(`Auto-generation error for schedule ${schedule.id}:`, err)
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // PRE-EXECUTE SAFETY CHECKS (Fase 8 safety rails — migration 110)
  // ════════════════════════════════════════════════════════════════════

  // Check 1: lead.email_invalid (skip silently if email step)
  if (cadenceStep.step_type === 'send_email' || cadenceStep.step_type === 'email_reply') {
    const { data: lead } = await supabase
      .from('leads')
      .select('email_invalid, bounce_reason, do_not_contact')
      .eq('id', schedule.lead_id)
      .single()

    if (lead?.email_invalid || lead?.do_not_contact) {
      const reason = lead.email_invalid ? `email_invalid: ${lead.bounce_reason || 'unknown'}` : 'do_not_contact'
      console.log(`[process-queue] Skipping ${cadenceStep.step_type} for lead ${schedule.lead_id}: ${reason}`)
      await supabase.from('schedules').update({
        status: 'skipped_due_to_state_change',
        last_error: reason,
        updated_at: new Date().toISOString(),
      }).eq('id', schedule.id)
      await advanceLeadToNextStep(supabase, schedule, cadenceStep)
      return {
        scheduleId: schedule.id,
        leadId: schedule.lead_id,
        stepType: cadenceStep.step_type,
        success: true,  // skipping is success — pipeline keeps moving
        error: reason,
      }
    }
  }

  // Check 2: LinkedIn rate limits (Unipile + LinkedIn server-side caps)
  const isLinkedinStep = cadenceStep.step_type.startsWith('linkedin_')
  if (isLinkedinStep) {
    // 2a. WEEKLY DM CAP (linkedin_message only — LinkedIn enforces ~150/week server-side)
    if (cadenceStep.step_type === 'linkedin_message') {
      const { data: weeklyCheck } = await supabase.rpc('increment_weekly_linkedin_message', {
        p_org_id: schedule.org_id,
      })
      const weeklyRow = Array.isArray(weeklyCheck) ? weeklyCheck[0] : weeklyCheck

      if (!weeklyRow?.allowed) {
        // Weekly cap hit — pushing to tomorrow doesn't help, week resets Monday.
        // Reschedule to next Monday 9am ET (jitter +0-29 min).
        const { data: nextMon } = await supabase.rpc('next_monday_9am_et')
        const target = new Date(nextMon as string)
        target.setUTCMinutes(target.getUTCMinutes() + Math.floor(Math.random() * 30))

        console.log(`[process-queue] LinkedIn WEEKLY DM cap hit (${weeklyRow?.weekly_count}/${weeklyRow?.cap_value}) — rescheduling ${schedule.id} to next Monday ${target.toISOString()}`)

        await supabase.from('schedules').update({
          status: 'scheduled',
          scheduled_at: target.toISOString(),
          last_error: `linkedin_weekly_dm_cap_hit: ${weeklyRow?.weekly_count}/${weeklyRow?.cap_value}`,
          updated_at: new Date().toISOString(),
        }).eq('id', schedule.id)

        return {
          scheduleId: schedule.id,
          leadId: schedule.lead_id,
          stepType: cadenceStep.step_type,
          success: true,
          rateLimited: true,
          error: `linkedin_weekly_dm_cap_hit_rescheduled_to_${target.toISOString()}`,
        } as Awaited<ReturnType<typeof processSchedule>>
      }
      console.log(`[process-queue] LinkedIn weekly DM ${weeklyRow?.weekly_count}/${weeklyRow?.cap_value} for org ${schedule.org_id}`)
    }

    // 2b. DAILY TOTAL ACTIONS CAP (all linkedin_* steps share — Unipile safety)
    const { data: settings } = await supabase
      .from('org_chief_settings')
      .select('max_linkedin_actions_per_day')
      .eq('org_id', schedule.org_id)
      .maybeSingle()
    const cap = settings?.max_linkedin_actions_per_day ?? 70

    const { data: capCheck } = await supabase.rpc('increment_if_under_cap', {
      p_org_id: schedule.org_id,
      p_action_type: 'linkedin_total',
      p_cap: cap,
    })
    const capRow = Array.isArray(capCheck) ? capCheck[0] : capCheck

    if (!capRow?.allowed) {
      console.log(`[process-queue] LinkedIn daily cap hit (${capRow?.current_count}/${capRow?.cap_value}) — rescheduling ${schedule.id} to tomorrow 9am ET`)
      const tomorrow = new Date()
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
      tomorrow.setUTCHours(13, 0, 0, 0)
      tomorrow.setUTCMinutes(Math.floor(Math.random() * 30))

      await supabase.from('schedules').update({
        status: 'scheduled',
        scheduled_at: tomorrow.toISOString(),
        last_error: `linkedin_daily_cap_hit: ${capRow?.current_count}/${capRow?.cap_value}`,
        updated_at: new Date().toISOString(),
      }).eq('id', schedule.id)

      return {
        scheduleId: schedule.id,
        leadId: schedule.lead_id,
        stepType: cadenceStep.step_type,
        success: true,
        rateLimited: true,
        error: `linkedin_daily_cap_hit_rescheduled_to_${tomorrow.toISOString()}`,
      } as Awaited<ReturnType<typeof processSchedule>>
    }
    console.log(`[process-queue] LinkedIn daily action ${capRow?.current_count}/${capRow?.cap_value} for org ${schedule.org_id}`)
  }

  // Execute the LinkedIn action
  const result = await executeLinkedInAction(schedule, cadenceStep, authToken, { useInMail })

  if (result.success) {
    // Update schedule status to executed
    await supabase
      .from('schedules')
      .update({
        status: 'executed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', schedule.id)

    // Update lead_step_instance status to sent
    await supabase
      .from('lead_step_instances')
      .update({
        status: 'sent',
        result_snapshot: result.data as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      })
      .eq('cadence_step_id', schedule.cadence_step_id)
      .eq('lead_id', schedule.lead_id)

    // ── Signal-Based Selling: append used signal to cadence_lead.context_json ──
    const signalAllocationUsed = (cadenceStep.config_json || {}).signal_allocation as string | undefined
    if (signalAllocationUsed) {
      try {
        const { data: clRow } = await supabase
          .from('cadence_leads')
          .select('id, context_json')
          .eq('cadence_id', schedule.cadence_id)
          .eq('lead_id', schedule.lead_id)
          .maybeSingle()

        if (clRow?.id) {
          const existing = (clRow.context_json as Record<string, unknown>) || {}
          const used = (existing.used_signals as string[] | undefined) || []
          if (!used.includes(signalAllocationUsed)) {
            used.push(signalAllocationUsed)
          }
          await supabase
            .from('cadence_leads')
            .update({ context_json: { ...existing, used_signals: used } })
            .eq('id', clRow.id)
          console.log(`Appended "${signalAllocationUsed}" to used_signals for cadence_lead ${clRow.id}`)
        }
      } catch (err) {
        console.warn(`Failed to append used_signals: ${(err as Error).message}`)
      }
    }

    // Advance the lead to the next step
    const advanceResult = await advanceLeadToNextStep(supabase, schedule, cadenceStep)

    // Log success activity
    await logActivity({
      ownerId: schedule.owner_id,
      orgId: schedule.org_id,
      cadenceId: schedule.cadence_id,
      cadenceStepId: schedule.cadence_step_id,
      leadId: schedule.lead_id,
      action: `queue_process_${cadenceStep.step_type}`,
      status: 'ok',
      details: {
        scheduleId: schedule.id,
        result: result.data,
        advancedToNextStep: advanceResult.advanced,
        nextStepId: advanceResult.nextStepId,
        cadenceCompleted: advanceResult.completed,
        aiGenerated: !!config.ai_prompt_id,
        signalAllocation: signalAllocationUsed,
      },
    })

    console.log(`Schedule ${schedule.id} executed successfully`)

    return {
      scheduleId: schedule.id,
      leadId: schedule.lead_id,
      stepType: cadenceStep.step_type,
      success: true,
    }
  } else {
    // InMail credit exhaustion is not a real failure — Sales Navigator quota
    // refreshes monthly and burning a lead's cadence on a quota-driven skip
    // wastes the rest of the steps. Tag these with `skipped_due_to_state_change`
    // so dashboards distinguish them from genuine send failures (network errors,
    // bounces, etc.) and the schedule/instance status reflects the intent.
    const errStr = String(result.error || '')
    const isInMailQuotaSkip =
      cadenceStep.step_type === 'linkedin_message' &&
      /insufficient credits/i.test(errStr)
    const finalStatus = isInMailQuotaSkip ? 'skipped_due_to_state_change' : 'failed'
    const lastErr = isInMailQuotaSkip
      ? `InMail quota exhausted (Sales Navigator monthly cap) — skipped per policy. Original: ${errStr}`
      : errStr

    if (isInMailQuotaSkip) {
      console.log(`[InMail-quota-skip] Schedule ${schedule.id} (${cadenceStep.step_type}) → skipped_due_to_state_change, advancing cadence`)
    }

    // Update schedule status
    await supabase
      .from('schedules')
      .update({
        status: finalStatus,
        last_error: lastErr,
        updated_at: new Date().toISOString(),
      })
      .eq('id', schedule.id)

    // Update lead_step_instance status to match
    await supabase
      .from('lead_step_instances')
      .update({
        status: isInMailQuotaSkip ? 'skipped' : 'failed',
        last_error: lastErr,
        updated_at: new Date().toISOString(),
      })
      .eq('cadence_step_id', schedule.cadence_step_id)
      .eq('lead_id', schedule.lead_id)

    // Still advance to next step even on failure (so the pipeline doesn't get stuck)
    const advanceResult = await advanceLeadToNextStep(supabase, schedule, cadenceStep)

    // Log failure activity
    await logActivity({
      ownerId: schedule.owner_id,
      orgId: schedule.org_id,
      cadenceId: schedule.cadence_id,
      cadenceStepId: schedule.cadence_step_id,
      leadId: schedule.lead_id,
      action: `queue_process_${cadenceStep.step_type}`,
      status: 'failed',
      details: {
        scheduleId: schedule.id,
        error: result.error,
        rateLimited: result.rateLimited || false,
        advancedToNextStep: advanceResult.advanced,
        nextStepId: advanceResult.nextStepId,
      },
    })

    console.error(`Schedule ${schedule.id} failed: ${result.error}`)
    if (advanceResult.advanced) {
      console.log(`Despite failure, advanced lead ${schedule.lead_id} to next step ${advanceResult.nextStepId}`)
    }

    return {
      scheduleId: schedule.id,
      leadId: schedule.lead_id,
      stepType: cadenceStep.step_type,
      success: false,
      error: result.error,
    }
  }
}

/**
 * Pre-flight auth check: ping each sub-function with the current auth token.
 * If any returns HTTP 401, log a warning — indicates that function needs redeployment.
 * Non-blocking: does not fail the batch if checks fail.
 */
async function preflightAuthCheck(
  authToken: string,
  ownerId: string,
  orgId: string
): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const checks = [
    { name: 'send-email', endpoint: '/functions/v1/send-email' },
    { name: 'linkedin-comment', endpoint: '/functions/v1/linkedin-comment' },
    { name: 'linkedin-send-connection', endpoint: '/functions/v1/linkedin-send-connection' },
    { name: 'linkedin-send-message', endpoint: '/functions/v1/linkedin-send-message' },
  ]
  for (const check of checks) {
    try {
      const res = await fetch(`${supabaseUrl}${check.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': authToken },
        body: JSON.stringify({ ownerId, orgId, _healthcheck: true }),
      })
      if (res.status === 401) {
        console.error(`PREFLIGHT AUTH FAIL: ${check.name} returned 401 — function may need redeployment`)
      } else {
        console.log(`PREFLIGHT OK: ${check.name} returned HTTP ${res.status}`)
      }
    } catch (err) {
      console.warn(`PREFLIGHT ERROR: ${check.name} unreachable:`, err)
    }
  }
}

serve(async (req: Request) => {
  // Handle CORS
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    // Get auth token - can be service role key for cron jobs or user token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('Missing authorization header', 401)
    }

    // CRITICAL: Build a fresh service-role token from env vars to use when calling
    // sub-functions. We MUST NOT forward the received authHeader — the Supabase cron
    // runner may inject the anon key or an old/rotated key that doesn't match
    // SUPABASE_SERVICE_ROLE_KEY. Sub-functions use isServiceRoleToken() which compares
    // the raw JWT string against SERVICE_ROLE_KEY_FULL / SUPABASE_SERVICE_ROLE_KEY.
    const _serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY_FULL') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!_serviceRoleKey) {
      console.error('FATAL: No service role key available in environment (SERVICE_ROLE_KEY_FULL / SUPABASE_SERVICE_ROLE_KEY)')
      return errorResponse('Server misconfiguration: missing service role key', 500)
    }
    const subFunctionAuth = `Bearer ${_serviceRoleKey}`
    console.log(`Auth: received token length=${authHeader.length}, sub-function auth uses SERVICE_ROLE key (length=${_serviceRoleKey.length})`)

    // Parse optional configuration from request body
    let config = {
      minDelayMs: DEFAULT_MIN_DELAY,
      maxDelayMs: DEFAULT_MAX_DELAY,
      limit: 50, // Max items to process in one invocation
      dryRun: false, // If true, just return what would be processed
    }

    if (req.method === 'POST') {
      try {
        const body = await req.json()
        if (body.minDelayMs !== undefined) config.minDelayMs = body.minDelayMs
        if (body.maxDelayMs !== undefined) config.maxDelayMs = body.maxDelayMs
        if (body.limit !== undefined) config.limit = Math.min(body.limit, 100)
        if (body.dryRun !== undefined) config.dryRun = body.dryRun
      } catch {
        // Empty body or invalid JSON - use defaults
      }
    }

    const supabase = createSupabaseClient()
    const startTime = Date.now()

    // ── STALE RECOVERY: Handle zombie "processing" items ──
    // If process-queue timed out or crashed, items stay in "processing" forever.
    // Mark as failed (not re-scheduled!) to avoid duplicate sends. User can manually retry.
    const STALE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes
    const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString()
    const { data: staleItems } = await supabase
      .from('schedules')
      .update({
        status: 'failed',
        last_error: 'Timed out in processing state (function crash/timeout). Marked failed to prevent duplicate sends.',
        updated_at: new Date().toISOString(),
      })
      .eq('status', 'processing')
      .lt('updated_at', staleThreshold)
      .select('id')
    if (staleItems && staleItems.length > 0) {
      console.log(`STALE RECOVERY: Reset ${staleItems.length} zombie "processing" items back to "scheduled"`)
    }

    // Query schedules that are due to be processed
    const now = new Date().toISOString()
    const { data: schedules, error: queryError } = await supabase
      .from('schedules')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(config.limit)

    if (queryError) {
      console.error('Error querying schedules:', queryError)
      return errorResponse('Failed to query schedules', 500)
    }

    if (!schedules || schedules.length === 0) {
      console.log('No scheduled items to process')
      return jsonResponse({
        success: true,
        message: 'No scheduled items to process',
        processed: 0,
        results: [],
      })
    }

    console.log(`Found ${schedules.length} scheduled items to process`)

    // Run pre-flight auth check to detect stale deployments
    if (schedules.length > 0) {
      await preflightAuthCheck(subFunctionAuth, schedules[0].owner_id, schedules[0].org_id)
    }

    // If dry run, just return what would be processed
    if (config.dryRun) {
      return jsonResponse({
        success: true,
        message: 'Dry run - no items processed',
        wouldProcess: schedules.length,
        schedules: schedules.map(s => ({
          id: s.id,
          leadId: s.lead_id,
          cadenceStepId: s.cadence_step_id,
          scheduledAt: s.scheduled_at,
        })),
      })
    }

    // Process schedules one at a time with delay between each
    const results: ProcessResult[] = []
    // Track processed lead+step combos within this batch to prevent duplicates
    const processedLeadSteps = new Set<string>()

    // ── EXECUTION TIME GUARD ──
    // Supabase Edge Functions timeout after ~150s. Stop processing well before that
    // to avoid claiming items we can't finish (which creates zombies).
    const MAX_EXECUTION_MS = 120_000 // Stop after 2 minutes (leaves 30s safety margin)

    for (let i = 0; i < schedules.length; i++) {
      const schedule = schedules[i]

      // Check if we're running out of time BEFORE claiming the next item
      const elapsed = Date.now() - startTime
      if (elapsed > MAX_EXECUTION_MS) {
        console.log(`TIME GUARD: Stopping after ${results.length} items (${Math.round(elapsed / 1000)}s elapsed). ${schedules.length - i} items deferred to next invocation.`)
        break
      }

      // In-batch deduplication: skip if we already processed this lead+step
      const dedupeKey = `${schedule.lead_id}:${schedule.cadence_step_id}`
      if (processedLeadSteps.has(dedupeKey)) {
        console.log(`Skipping duplicate schedule ${schedule.id} (same lead+step already in batch)`)
        await supabase
          .from('schedules')
          .update({
            status: 'skipped_due_to_state_change',
            last_error: 'Duplicate: same lead+step already processed in batch',
            updated_at: new Date().toISOString(),
          })
          .eq('id', schedule.id)
        continue
      }
      processedLeadSteps.add(dedupeKey)

      // Process this schedule (use subFunctionAuth — service role key — not the forwarded cron token)
      // Wrap in try/catch so one item crash doesn't kill the entire batch
      let result: ProcessResult
      try {
        result = await processSchedule(schedule, subFunctionAuth)
      } catch (err) {
        console.error(`UNCAUGHT ERROR processing schedule ${schedule.id}:`, err)
        // Mark as failed so it doesn't stay as "processing" zombie
        await supabase
          .from('schedules')
          .update({
            status: 'failed',
            last_error: `Uncaught error: ${err instanceof Error ? err.message : String(err)}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', schedule.id)
        result = {
          scheduleId: schedule.id,
          leadId: schedule.lead_id,
          stepType: 'unknown' as string,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
      results.push(result)

      // Add random delay before next item (except for the last one)
      if (i < schedules.length - 1) {
        const delay = getRandomDelay(config.minDelayMs, config.maxDelayMs)
        console.log(`Waiting ${delay}ms before next schedule...`)
        await sleep(delay)
      }
    }

    // Summarize results
    const successCount = results.filter(r => r.success).length
    const failureCount = results.filter(r => !r.success).length

    console.log(`Queue processing complete: ${successCount} succeeded, ${failureCount} failed`)

    return jsonResponse({
      success: true,
      message: `Processed ${results.length} scheduled items`,
      processed: results.length,
      succeeded: successCount,
      failed: failureCount,
      results,
    })
  } catch (error) {
    console.error('Error processing queue:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error processing queue',
      500
    )
  }
})

// ════════════════════════════════════════════════════════════════════════
// V14 helpers — SDR BC PDF attachment for Day 9
// ════════════════════════════════════════════════════════════════════════

/**
 * Compute the HMAC-SHA256 print-bypass token used by bridge.yuno.tools/api/{bc,sdr-bc,m}/<slug>/pdf.
 * Mirrors openclaw/bridge/server.js — same BC_PRINT_SECRET, same algorithm.
 */
async function computePrintToken(slug: string): Promise<string | null> {
  const secret = Deno.env.get('BC_PRINT_SECRET') || ''
  if (!secret) {
    console.warn('[computePrintToken] BC_PRINT_SECRET not set — PDF attachment skipped')
    return null
  }
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(slug))
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
  return hex.slice(0, 16)
}

type DeckKind = 'sdr_bc' | 'ss_deck'

/**
 * Fetch the deck PDF (sdr_bc or ss_deck) for the lead's company. Returns null if:
 *   - lead has no account_map_company_id
 *   - amc has no slug for the requested kind
 *   - BC_PRINT_SECRET env var missing
 *   - bridge fetch fails or PDF is empty
 *
 * Bridge endpoint mapping:
 *   - sdr_bc → bridge.yuno.tools/api/sdr-bc/<slug>/pdf
 *   - ss_deck → bridge.yuno.tools/api/m/<slug>/pdf
 */
async function fetchDeckPdfForLead(
  leadId: string,
  kind: DeckKind,
): Promise<{ filename: string; contentBase64: string; contentType: string } | null> {
  const supabase = createSupabaseClient()
  const slugColumn = kind === 'sdr_bc' ? 'sdr_bc_slug' : 'ss_deck_slug'
  const filenamePrefix = kind === 'sdr_bc' ? 'yuno-bc' : 'yuno-overview'
  const bridgePath = kind === 'sdr_bc' ? 'sdr-bc' : 'm'

  try {
    const { data: leadRow } = await supabase
      .from('leads')
      .select('account_map_company_id, company')
      .eq('id', leadId)
      .maybeSingle()
    const amcId = leadRow?.account_map_company_id
    if (!amcId) return null

    const { data: amc } = await supabase
      .from('account_map_companies')
      .select(`${slugColumn}, company_name`)
      .eq('id', amcId)
      .maybeSingle()
    const slug = (amc as Record<string, unknown> | null)?.[slugColumn] as string | null
    if (!slug) {
      console.log(`[fetchDeckPdfForLead ${kind}] amc ${amcId} has no ${slugColumn} — PDF unavailable`)
      return null
    }

    const token = await computePrintToken(slug)
    if (!token) return null

    const pdfUrl = `https://bridge.yuno.tools/api/${bridgePath}/${slug}/pdf?print=${token}`
    const resp = await fetch(pdfUrl, { method: 'GET' })
    if (!resp.ok) {
      console.warn(`[fetchDeckPdfForLead ${kind}] bridge returned ${resp.status} for ${slug}`)
      return null
    }
    const buf = new Uint8Array(await resp.arrayBuffer())
    if (buf.length === 0) {
      console.warn(`[fetchDeckPdfForLead ${kind}] empty PDF from bridge for ${slug}`)
      return null
    }

    // base64 encode without Node's Buffer
    let binary = ''
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i])
    const b64 = btoa(binary)

    const companyName = (amc as Record<string, unknown> | null)?.company_name as string | undefined
    const companySlug = (companyName || leadRow?.company || 'deck')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)
    return {
      filename: `${filenamePrefix}-${companySlug}.pdf`,
      contentBase64: b64,
      contentType: 'application/pdf',
    }
  } catch (err) {
    console.warn(`[fetchDeckPdfForLead ${kind}] error:`, (err as Error).message)
    return null
  }
}

// Backward-compat shim — kept so existing call site doesn't break
async function fetchSdrBcPdfForLead(leadId: string) {
  return fetchDeckPdfForLead(leadId, 'sdr_bc')
}
