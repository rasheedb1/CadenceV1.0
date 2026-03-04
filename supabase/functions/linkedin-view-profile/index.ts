// Edge Function: View a LinkedIn Profile
// POST /functions/v1/linkedin-view-profile
// Triggers LinkedIn's "X viewed your profile" notification by fetching the lead's profile via Unipile
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createUnipileClient } from '../_shared/unipile.ts'
import { createSupabaseClient, getAuthContext, logActivity, getUnipileAccountId } from '../_shared/supabase.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

interface ViewProfileRequest {
  leadId: string
  cadenceId?: string
  cadenceStepId?: string
  scheduleId?: string
  instanceId?: string
  ownerId?: string
  orgId?: string
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('Missing authorization header', 401)
    }

    const body: ViewProfileRequest = await req.json()
    const { leadId, cadenceId, cadenceStepId, scheduleId, instanceId, ownerId, orgId } = body

    const ctx = await getAuthContext(authHeader, { ownerId, orgId })
    if (!ctx) {
      return errorResponse('Unauthorized', 401)
    }

    if (!leadId) {
      return errorResponse('leadId is required')
    }

    // Get Unipile account ID for this user
    const unipileAccountId = await getUnipileAccountId(ctx.userId)
    if (!unipileAccountId) {
      return errorResponse('No Unipile account connected. Please connect your LinkedIn account in Settings.')
    }

    const supabase = createSupabaseClient()

    // Look up the lead's LinkedIn URL
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('linkedin_url')
      .eq('id', leadId)
      .eq('org_id', ctx.orgId)
      .single()

    if (leadError || !lead) {
      return errorResponse('Lead not found')
    }

    let linkedinUrl = lead.linkedin_url?.trim()
    if (!linkedinUrl) {
      return errorResponse('Lead does not have a LinkedIn URL')
    }

    if (!linkedinUrl.startsWith('http')) {
      linkedinUrl = `https://www.linkedin.com/in/${linkedinUrl}`
    }
    linkedinUrl = linkedinUrl.replace(/\/+$/, '')

    // Extract username from URL
    const usernameMatch = linkedinUrl.match(/linkedin\.com\/in\/([^\/\?]+)/)
    const username = usernameMatch ? usernameMatch[1] : null

    if (!username) {
      return errorResponse('Lead does not have a valid LinkedIn URL')
    }

    console.log(`Viewing profile for: ${username}`)

    // View the profile via Unipile (triggers "X viewed your profile" notification)
    const unipile = createUnipileClient()
    const result = await unipile.getProfile(unipileAccountId, username)

    if (!result.success) {
      await logActivity({
        ownerId: ctx.userId,
        orgId: ctx.orgId,
        cadenceId,
        cadenceStepId,
        leadId,
        action: 'linkedin_profile_view',
        status: 'failed',
        details: { error: result.error, username },
      })

      return errorResponse(result.error || 'Failed to view profile')
    }

    // Log success
    await logActivity({
      ownerId: ctx.userId,
      orgId: ctx.orgId,
      cadenceId,
      cadenceStepId,
      leadId,
      action: 'linkedin_profile_view',
      status: 'ok',
      details: { username },
    })

    // Update schedule and instance if provided (for process-queue automation)
    if (scheduleId) {
      await supabase
        .from('schedules')
        .update({ status: 'executed', updated_at: new Date().toISOString() })
        .eq('id', scheduleId)
    }

    if (instanceId) {
      await supabase
        .from('lead_step_instances')
        .update({
          status: 'sent',
          result_snapshot: result.data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', instanceId)
    }

    return jsonResponse({
      success: true,
      username,
    })
  } catch (error) {
    console.error('Error:', error)
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500)
  }
})
