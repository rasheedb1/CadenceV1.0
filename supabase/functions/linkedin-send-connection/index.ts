// Edge Function: Send LinkedIn Connection Request
// POST /functions/v1/linkedin-send-connection
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createUnipileClient } from '../_shared/unipile.ts'
import { createSupabaseClient, getAuthUser, logActivity, getUnipileAccountId } from '../_shared/supabase.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

interface SendConnectionRequest {
  leadId: string
  message?: string
  cadenceId?: string
  cadenceStepId?: string
  scheduleId?: string
  instanceId?: string
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

    const user = await getAuthUser(authHeader)
    if (!user) {
      return errorResponse('Unauthorized', 401)
    }

    // Parse request body
    const body: SendConnectionRequest = await req.json()
    const { leadId, message, cadenceId, cadenceStepId, scheduleId, instanceId } = body

    if (!leadId) {
      return errorResponse('leadId is required')
    }

    // Get Unipile account ID for this user
    const unipileAccountId = await getUnipileAccountId(user.id)
    if (!unipileAccountId) {
      return errorResponse('No Unipile account connected. Please connect your LinkedIn account in Settings.')
    }

    // Get lead details
    const supabase = createSupabaseClient()
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .eq('owner_id', user.id)
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

    // First, look up the user profile to get the provider_id
    // Unipile requires the provider_id (internal LinkedIn ID), not the username
    let providerId = username // Fallback to username if profile lookup fails

    console.log('Looking up user profile to get provider_id...')
    const profileResult = await unipile.getProfile(unipileAccountId, username)

    if (profileResult.success && profileResult.data) {
      const profileData = profileResult.data as { provider_id?: string; id?: string }
      if (profileData.provider_id) {
        providerId = profileData.provider_id
        console.log(`Found provider_id: ${providerId}`)
      } else if (profileData.id) {
        providerId = profileData.id
        console.log(`Using profile id: ${providerId}`)
      }
    } else {
      console.log('Profile lookup failed, trying with username directly')
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
          ownerId: user.id,
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
        ownerId: user.id,
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
      ownerId: user.id,
      cadenceId,
      cadenceStepId,
      leadId,
      action: 'linkedin_connect',
      status: 'ok',
      details: { invitationId: result.data?.id },
    })

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
