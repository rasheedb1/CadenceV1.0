// Edge Function: LinkedIn Webhook (Unipile Hosted Auth Callback)
// POST /functions/v1/linkedin-webhook
// Receives the callback from Unipile after successful LinkedIn authentication
// Stores the account_id in unipile_accounts table linked to the user

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient, logActivity } from '../_shared/supabase.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

interface UnipileWebhookPayload {
  // The status of the auth attempt
  status: 'CONNECTED' | 'FAILED' | 'EXPIRED' | 'CANCELLED'
  // The Unipile account ID (only present on success)
  account_id?: string
  // The name we passed (user ID)
  name?: string
  // Provider that was connected
  provider?: string
  // Error message if failed
  error?: string
}

serve(async (req: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  // Only accept POST requests
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  try {
    // Log all incoming request details for debugging
    console.log('========== WEBHOOK CALLED ==========')
    console.log('Request method:', req.method)
    console.log('Request URL:', req.url)
    console.log('Request headers:', JSON.stringify(Object.fromEntries(req.headers.entries()), null, 2))

    // Parse the webhook payload
    const payload: UnipileWebhookPayload = await req.json()

    console.log('Received Unipile webhook payload:', JSON.stringify(payload, null, 2))

    // Validate required fields
    if (!payload.status) {
      console.error('Missing status in webhook payload')
      return errorResponse('Missing status in payload', 400)
    }

    // The name field contains our user ID
    const userId = payload.name
    if (!userId) {
      console.error('Missing user ID (name) in webhook payload')
      return errorResponse('Missing user identifier', 400)
    }

    const supabase = createSupabaseClient()

    // Handle different statuses
    if (payload.status === 'CONNECTED') {
      if (!payload.account_id) {
        console.error('Missing account_id in successful connection')
        return errorResponse('Missing account_id', 400)
      }

      console.log(`LinkedIn connected for user ${userId}, account_id: ${payload.account_id}`)

      // Ensure profile exists before inserting into unipile_accounts
      // (unipile_accounts has a foreign key to profiles)
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('user_id', userId)
        .single()

      if (!existingProfile) {
        console.log(`Creating profile for user ${userId}`)
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({ user_id: userId, full_name: '' })

        if (profileError && profileError.code !== '23505') {
          console.error('Error creating profile:', profileError)
          return errorResponse('Failed to create user profile', 500)
        }
      }

      // Check if there's an existing record for this user/provider
      const { data: existingAccount } = await supabase
        .from('unipile_accounts')
        .select('id')
        .eq('user_id', userId)
        .eq('provider', 'LINKEDIN')
        .single()

      if (existingAccount) {
        // Update existing record
        const { error: updateError } = await supabase
          .from('unipile_accounts')
          .update({
            account_id: payload.account_id,
            status: 'active',
            connected_at: new Date().toISOString(),
            disconnected_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingAccount.id)

        if (updateError) {
          console.error('Error updating unipile account:', updateError)
          return errorResponse('Failed to update account', 500)
        }
      } else {
        // Insert new record
        const { error: insertError } = await supabase
          .from('unipile_accounts')
          .insert({
            user_id: userId,
            provider: 'LINKEDIN',
            account_id: payload.account_id,
            status: 'active',
            connected_at: new Date().toISOString(),
          })

        if (insertError) {
          console.error('Error inserting unipile account:', insertError)
          return errorResponse('Failed to save account', 500)
        }
      }

      // Also update the profile for backwards compatibility
      await supabase
        .from('profiles')
        .update({ unipile_account_id: payload.account_id })
        .eq('user_id', userId)

      // Log the activity
      await logActivity({
        ownerId: userId,
        action: 'linkedin_connected',
        status: 'ok',
        details: {
          account_id: payload.account_id,
          provider: 'LINKEDIN',
        },
      })

      console.log(`Successfully saved LinkedIn connection for user ${userId}`)

      return jsonResponse({
        success: true,
        message: 'LinkedIn account connected successfully',
      })
    } else if (payload.status === 'FAILED' || payload.status === 'EXPIRED' || payload.status === 'CANCELLED') {
      // Log the failed attempt
      console.log(`LinkedIn connection ${payload.status.toLowerCase()} for user ${userId}`)

      await logActivity({
        ownerId: userId,
        action: 'linkedin_connection_failed',
        status: 'failed',
        details: {
          status: payload.status,
          error: payload.error,
        },
      })

      return jsonResponse({
        success: false,
        message: `LinkedIn connection ${payload.status.toLowerCase()}`,
        error: payload.error,
      })
    }

    // Unknown status
    console.warn('Unknown webhook status:', payload.status)
    return jsonResponse({
      success: false,
      message: 'Unknown status',
    })
  } catch (error) {
    console.error('Error processing LinkedIn webhook:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500
    )
  }
})
