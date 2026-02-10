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

// Map step types to their corresponding LinkedIn Edge Function endpoints
const STEP_TYPE_TO_ENDPOINT: Record<string, string> = {
  linkedin_message: '/functions/v1/linkedin-send-message',
  linkedin_connect: '/functions/v1/linkedin-send-connection',
  linkedin_like: '/functions/v1/linkedin-like-post',
  linkedin_comment: '/functions/v1/linkedin-comment',
}

// Default delay configuration (in milliseconds)
const DEFAULT_MIN_DELAY = 5000 // 5 seconds
const DEFAULT_MAX_DELAY = 10000 // 10 seconds

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
 * Advance a lead to the next step in their cadence after successful action
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

  // Create lead_step_instance for the next step if it doesn't exist
  const { data: existingInstance } = await supabase
    .from('lead_step_instances')
    .select('id')
    .eq('cadence_step_id', nextStep.id)
    .eq('lead_id', lead_id)
    .single()

  if (!existingInstance) {
    await supabase.from('lead_step_instances').insert({
      cadence_id,
      cadence_step_id: nextStep.id,
      lead_id,
      owner_id,
      status: 'pending',
    })
  }

  console.log(`Advanced lead ${lead_id} to next step ${nextStep.id} (${nextStep.step_label})`)

  return { advanced: true, nextStepId: nextStep.id, completed: false }
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
  }

  // Add step-type specific fields
  const configJson = cadenceStep.config_json || {}

  switch (cadenceStep.step_type) {
    case 'linkedin_message':
      baseBody.message = schedule.message_rendered_text ||
                         schedule.message_template_text ||
                         (configJson.message as string) ||
                         ''
      break

    case 'linkedin_connect':
      baseBody.message = schedule.message_rendered_text ||
                         schedule.message_template_text ||
                         (configJson.connection_message as string) ||
                         undefined
      break

    case 'linkedin_like':
      baseBody.postId = configJson.post_id as string
      baseBody.postUrl = configJson.post_url as string
      baseBody.reactionType = (configJson.reaction_type as string) || 'LIKE'
      break

    case 'linkedin_comment':
      baseBody.postId = configJson.post_id as string
      baseBody.postUrl = configJson.post_url as string
      baseBody.comment = schedule.message_rendered_text ||
                         schedule.message_template_text ||
                         (configJson.comment as string) ||
                         ''
      break
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
      },
    })

    console.error(`Schedule ${schedule.id} failed: ${result.error}`)

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

    for (let i = 0; i < schedules.length; i++) {
      const schedule = schedules[i]

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
