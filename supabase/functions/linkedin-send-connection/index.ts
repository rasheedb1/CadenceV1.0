// Edge Function: Send LinkedIn Connection Request
// POST /functions/v1/linkedin-send-connection
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createUnipileClient } from '../_shared/unipile.ts'
import { createSupabaseClient, getAuthContext, logActivity, getUnipileAccountId, trackProspectedCompany } from '../_shared/supabase.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

interface SendConnectionRequest {
  leadId: string
  message?: string
  cadenceId?: string
  cadenceStepId?: string
  scheduleId?: string
  instanceId?: string
  ownerId?: string // For service-role calls from process-queue
  orgId?: string   // For service-role calls from process-queue
}

serve(async (req: Request) => {
  // Handle CORS
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    // Authenticate user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('Missing authorization header', 401)
    }

    // Parse request body
    const body: SendConnectionRequest = await req.json()
    const { leadId, message, cadenceId, cadenceStepId, scheduleId, instanceId, ownerId, orgId } = body

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

    // Get lead details
    const supabase = createSupabaseClient()
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .eq('org_id', ctx.orgId)
      .single()

    if (leadError || !lead) {
      return errorResponse('Lead not found')
    }

    // Normalize the LinkedIn URL
    let linkedinUrl = lead.linkedin_url?.trim()
    if (!linkedinUrl) {
      return errorResponse('Lead does not have a LinkedIn URL')
    }

    if (!linkedinUrl.startsWith('http')) {
      linkedinUrl = `https://www.linkedin.com/in/${linkedinUrl}`
    }
    // Remove trailing slashes
    linkedinUrl = linkedinUrl.replace(/\/+$/, '')

    // Extract username from URL
    const usernameMatch = linkedinUrl.match(/linkedin\.com\/in\/([^\/\?]+)/)
    const username = usernameMatch ? usernameMatch[1] : null

    if (!username) {
      return errorResponse('Lead does not have a valid LinkedIn URL')
    }

    console.log(`Sending connection request to: ${linkedinUrl}`)
    console.log(`Username extracted: ${username}`)

    // Send connection request via Unipile
    const unipile = createUnipileClient()

    // Resolve provider_id (LinkedIn internal ID like "ACoAAA...")
    // Chain: lead cache → prospect source → Unipile profile lookup
    let providerId: string | null = null

    // 1. Check if lead already has a cached provider_id
    if (lead.linkedin_provider_id) {
      providerId = lead.linkedin_provider_id
      console.log(`Using stored linkedin_provider_id from lead: ${providerId}`)
    }

    // 2. Check if the original prospect has it (from Sales Navigator search)
    if (!providerId) {
      const { data: sourceProspect } = await supabase
        .from('prospects')
        .select('linkedin_provider_id')
        .eq('promoted_lead_id', leadId)
        .not('linkedin_provider_id', 'is', null)
        .limit(1)
        .single()
      if (sourceProspect?.linkedin_provider_id) {
        providerId = sourceProspect.linkedin_provider_id
        console.log(`Found provider_id from source prospect: ${providerId}`)
      }
    }

    // 3. Unipile profile lookup (username with retries, then URL)
    if (!providerId) {
      const resolved = await unipile.resolveProviderId(unipileAccountId, username, linkedinUrl)
      providerId = resolved.providerId
    }

    if (!providerId) {
      return errorResponse(
        `Could not resolve LinkedIn ID for "${username}". Please check that the LinkedIn account is still connected in Settings, or try reconnecting it.`
      )
    }

    // Validate provider_id format — LinkedIn IDs start with "ACoAAA"
    if (!providerId.startsWith('ACoAAA')) {
      console.warn(`provider_id has unexpected format: ${providerId} — may not work with Unipile invite`)
    }

    // Cache the provider_id on the lead for next time
    if (!lead.linkedin_provider_id) {
      try {
        await supabase
          .from('leads')
          .update({ linkedin_provider_id: providerId, updated_at: new Date().toISOString() })
          .eq('id', leadId)
          .eq('org_id', ctx.orgId)
        console.log(`Saved provider_id ${providerId} to lead ${leadId}`)
      } catch (e) {
        console.warn('Could not cache provider_id on lead:', e)
      }
    }

    // Send the connection request
    const result = await unipile.sendConnection({
      accountId: unipileAccountId,
      profileId: providerId,
      message: message || undefined,
    })

    if (!result.success) {
      // Check if already connected
      const isAlreadyConnected = unipile.isAlreadyConnectedError(result.error)

      if (isAlreadyConnected) {
        // Log as already connected (not a failure)
        await logActivity({
          ownerId: ctx.userId,
          orgId: ctx.orgId,
          cadenceId,
          cadenceStepId,
          leadId,
          action: 'linkedin_connect',
          status: 'ok',
          details: { alreadyConnected: true },
        })

        return jsonResponse({
          success: true,
          alreadyConnected: true,
          message: 'Already connected with this user',
        })
      }

      // Log failure
      await logActivity({
        ownerId: ctx.userId,
        orgId: ctx.orgId,
        cadenceId,
        cadenceStepId,
        leadId,
        action: 'linkedin_connect',
        status: 'failed',
        details: { error: result.error },
      })

      return errorResponse(result.error || 'Failed to send connection request')
    }

    // Log success
    await logActivity({
      ownerId: ctx.userId,
      orgId: ctx.orgId,
      cadenceId,
      cadenceStepId,
      leadId,
      action: 'linkedin_connect',
      status: 'ok',
      details: { invitationId: result.data?.id },
    })

    // Track company as prospected in registry
    if (lead?.company) {
      trackProspectedCompany({
        ownerId: ctx.userId,
        orgId: ctx.orgId,
        companyName: lead.company,
        prospectedVia: 'linkedin_connect',
      })
    }

    // Update schedule and instance if provided
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
      invitationId: result.data?.id,
    })
  } catch (error) {
    console.error('Error:', error)
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500)
  }
})

// Extract LinkedIn profile ID from URL
function extractLinkedInId(url: string | null): string | null {
  if (!url) return null
  const match = url.match(/linkedin\.com\/in\/([^\/\?]+)/)
  return match ? match[1] : null
}
