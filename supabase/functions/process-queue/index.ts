// Edge Function: Process Scheduled Queue
// POST /functions/v1/process-queue
// This function processes scheduled items from the schedules table.
// Can be called via cron job (Supabase scheduled function) or manually.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient, logActivity } from '../_shared/supabase.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

// Types for schedule processing
interface Schedule {
  id: string
  cadence_id: string
  cadence_step_id: string
  lead_id: string
  owner_id: string
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
  send_email: '/functions/v1/send-email',
}

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
 * Generate AI message for a step that has ai_prompt_id configured.
 * Calls the ai-research-generate edge function with service-role auth.
 */
async function generateAIMessage(
  schedule: Schedule,
  cadenceStep: CadenceStep,
  authToken: string
): Promise<{ message: string; subject?: string } | null> {
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

  // Call ai-research-generate with ownerId (service-role auth)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!

  console.log(`Generating AI message for lead ${schedule.lead_id}, step ${cadenceStep.step_type}, prompt: ${aiPrompt.name}`)

  const maxRetries = 2
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/ai-research-generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken,
        },
        body: JSON.stringify({
          ownerId: schedule.owner_id,
          leadId: schedule.lead_id,
          stepType: cadenceStep.step_type,
          messageTemplate: aiPrompt.prompt_body,
          researchPrompt: researchPromptBody,
          tone: aiPrompt.tone || 'professional',
          language: aiPrompt.language || 'es',
          exampleMessages,
        }),
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

      if (scheduledTime) {
        const now = new Date()
        const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
        const todayStr = dateFmt.format(now)
        const [y, m, d] = todayStr.split('-').map(Number)
        const target = new Date(y, m - 1, d + dayDiff)
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
            scheduleAt = new Date(scheduleAt.getTime() + 86400000)
          }
        }

        console.log(`Step scheduled at ${scheduledTime} ${tz} → UTC: ${scheduleAt.toISOString()}`)
      } else {
        scheduleAt = new Date()
        if (dayDiff === 0) {
          scheduleAt.setMinutes(scheduleAt.getMinutes() + 60)
        } else {
          scheduleAt.setDate(scheduleAt.getDate() + dayDiff)
          scheduleAt.setHours(9 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60), 0, 0)
          if (scheduleAt <= new Date()) scheduleAt.setDate(scheduleAt.getDate() + 1)
        }
      }

      await supabase.from('schedules').insert({
        cadence_id,
        cadence_step_id: nextStep.id,
        lead_id,
        owner_id,
        scheduled_at: scheduleAt.toISOString(),
        timezone: 'UTC',
        status: 'scheduled',
      })

      console.log(`Auto-scheduled next step ${nextStep.id} for lead ${lead_id} at ${scheduleAt.toISOString()}`)
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
  authToken: string
): Promise<{ postId: string; postUrl: string } | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/linkedin-get-user-posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken,
      },
      body: JSON.stringify({ leadId, ownerId }),
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
    }
  } catch (error) {
    console.error(`Error fetching posts for lead ${leadId}:`, error)
    return null
  }
}

/**
 * Call the appropriate LinkedIn Edge Function based on step type
 */
async function executeLinkedInAction(
  schedule: Schedule,
  cadenceStep: CadenceStep,
  authToken: string
): Promise<{ success: boolean; error?: string; data?: unknown }> {
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

    case 'linkedin_like': {
      // If postId/postUrl are in config, use them; otherwise fetch the lead's latest post
      let likePostId = configJson.post_id as string | undefined
      let likePostUrl = configJson.post_url as string | undefined

      if (!likePostId && !likePostUrl) {
        console.log(`No post configured for linkedin_like, fetching latest post for lead ${schedule.lead_id}`)
        const latestPost = await fetchLatestPost(schedule.lead_id, schedule.owner_id, authToken)
        if (!latestPost) {
          return { success: false, error: 'No LinkedIn posts found for this lead to like' }
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
        const latestPost = await fetchLatestPost(schedule.lead_id, schedule.owner_id, authToken)
        if (!latestPost) {
          return { success: false, error: 'No LinkedIn posts found for this lead to comment on' }
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
      break
    }
  }

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
      return {
        success: false,
        error: data.error || `HTTP ${response.status}: ${response.statusText}`,
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
  // Prevent duplicate sends: check if this step was already executed for this lead
  const { data: alreadyExecuted } = await supabase
    .from('schedules')
    .select('id')
    .eq('cadence_step_id', schedule.cadence_step_id)
    .eq('lead_id', schedule.lead_id)
    .eq('status', 'executed')
    .neq('id', schedule.id)
    .limit(1)

  if (alreadyExecuted && alreadyExecuted.length > 0) {
    console.log(`Step ${schedule.cadence_step_id} already executed for lead ${schedule.lead_id}, skipping duplicate`)
    await supabase
      .from('schedules')
      .update({
        status: 'skipped_due_to_state_change',
        last_error: 'Duplicate: step already executed for this lead',
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

  // ── AI generation for automated steps ──
  const config = cadenceStep.config_json || {}
  const stepNeedsContent = ['linkedin_message', 'linkedin_comment', 'send_email'].includes(cadenceStep.step_type) ||
    (cadenceStep.step_type === 'linkedin_connect' && config.send_note === true)

  if (config.ai_prompt_id) {
    // Has explicit AI prompt → generate with it
    const aiResult = await generateAIMessage(schedule, cadenceStep, authToken)
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
    } else if (stepNeedsContent && !config.message_template && !schedule.message_template_text) {
      // AI generation failed and there's no fallback template — fail the schedule
      const error = 'AI generation failed and no fallback template available'
      console.error(`Schedule ${schedule.id}: ${error}`)
      await supabase
        .from('schedules')
        .update({ status: 'failed', last_error: error, updated_at: new Date().toISOString() })
        .eq('id', schedule.id)
      await supabase
        .from('lead_step_instances')
        .update({ status: 'failed', last_error: error, updated_at: new Date().toISOString() })
        .eq('cadence_step_id', schedule.cadence_step_id)
        .eq('lead_id', schedule.lead_id)

      // Still advance to next step so the pipeline doesn't get stuck
      await advanceLeadToNextStep(supabase, schedule, cadenceStep)

      return {
        scheduleId: schedule.id,
        leadId: schedule.lead_id,
        stepType: cadenceStep.step_type,
        success: false,
        error,
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
          leadId: schedule.lead_id,
          stepType: cadenceStep.step_type,
          tone: 'professional',
          language: 'es',
        }),
      })
      const data = await response.json()
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

  // Execute the LinkedIn action
  const result = await executeLinkedInAction(schedule, cadenceStep, authToken)

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

    // Advance the lead to the next step
    const advanceResult = await advanceLeadToNextStep(supabase, schedule, cadenceStep)

    // Log success activity
    await logActivity({
      ownerId: schedule.owner_id,
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
    // Update schedule status to failed
    await supabase
      .from('schedules')
      .update({
        status: 'failed',
        last_error: result.error,
        updated_at: new Date().toISOString(),
      })
      .eq('id', schedule.id)

    // Update lead_step_instance status to failed
    await supabase
      .from('lead_step_instances')
      .update({
        status: 'failed',
        last_error: result.error,
        updated_at: new Date().toISOString(),
      })
      .eq('cadence_step_id', schedule.cadence_step_id)
      .eq('lead_id', schedule.lead_id)

    // Still advance to next step even on failure (so the pipeline doesn't get stuck)
    const advanceResult = await advanceLeadToNextStep(supabase, schedule, cadenceStep)

    // Log failure activity
    await logActivity({
      ownerId: schedule.owner_id,
      cadenceId: schedule.cadence_id,
      cadenceStepId: schedule.cadence_step_id,
      leadId: schedule.lead_id,
      action: `queue_process_${cadenceStep.step_type}`,
      status: 'failed',
      details: {
        scheduleId: schedule.id,
        error: result.error,
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

    for (let i = 0; i < schedules.length; i++) {
      const schedule = schedules[i]

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

      // Process this schedule
      const result = await processSchedule(schedule, authHeader)
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
