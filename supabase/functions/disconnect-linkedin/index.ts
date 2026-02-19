// Edge Function: Disconnect LinkedIn
// POST /functions/v1/disconnect-linkedin
// Disconnects the user's LinkedIn account from Unipile

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient, getAuthContext, logActivity } from '../_shared/supabase.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

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

    const ctx = await getAuthContext(authHeader)
    if (!ctx) {
      return errorResponse('Unauthorized', 401)
    }

    const supabase = createSupabaseClient()

    // Get the current LinkedIn connection
    const { data: account, error: fetchError } = await supabase
      .from('unipile_accounts')
      .select('id, account_id')
      .eq('user_id', ctx.userId)
      .eq('provider', 'LINKEDIN')
      .eq('status', 'active')
      .single()

    if (fetchError || !account) {
      return errorResponse('No active LinkedIn connection found', 404)
    }

    // Get Unipile credentials
    const unipileDsn = Deno.env.get('UNIPILE_DSN')
    const unipileAccessToken = Deno.env.get('UNIPILE_ACCESS_TOKEN')

    if (unipileDsn && unipileAccessToken) {
      // Try to delete the account from Unipile
      try {
        const baseUrl = `https://${unipileDsn}`
        const response = await fetch(`${baseUrl}/api/v1/accounts/${account.account_id}`, {
          method: 'DELETE',
          headers: {
            'X-API-KEY': unipileAccessToken,
          },
        })

        if (!response.ok) {
          console.warn('Failed to delete account from Unipile:', response.status)
          // Continue anyway - we'll mark it as disconnected locally
        } else {
          console.log('Successfully deleted account from Unipile')
        }
      } catch (error) {
        console.warn('Error deleting account from Unipile:', error)
        // Continue anyway
      }
    }

    // Mark the account as disconnected in our database
    const { error: updateError } = await supabase
      .from('unipile_accounts')
      .update({
        status: 'disconnected',
        disconnected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', account.id)

    if (updateError) {
      console.error('Error updating unipile account:', updateError)
      return errorResponse('Failed to disconnect account', 500)
    }

    // Clear the unipile_account_id from profiles
    await supabase
      .from('profiles')
      .update({ unipile_account_id: null })
      .eq('user_id', ctx.userId)

    // Log the activity
    await logActivity({
      ownerId: ctx.userId,
      orgId: ctx.orgId,
      action: 'linkedin_disconnected',
      status: 'ok',
      details: {
        account_id: account.account_id,
      },
    })

    console.log(`LinkedIn disconnected for user ${ctx.userId}`)

    return jsonResponse({
      success: true,
      message: 'LinkedIn account disconnected successfully',
    })
  } catch (error) {
    console.error('Error disconnecting LinkedIn:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500
    )
  }
})
