// Edge Function: Check LinkedIn Connection Status
// POST /functions/v1/check-linkedin-connection
// Polls Unipile API to check if user has connected their LinkedIn account
// This is a fallback when the webhook doesn't fire

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient, getAuthUser } from '../_shared/supabase.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

interface UnipileAccount {
  id: string
  name: string
  type: string
  created_at: string
}

interface UnipileAccountsResponse {
  object: string
  items: UnipileAccount[]
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
      return errorResponse('Invalid or expired token', 401)
    }

    console.log('Checking LinkedIn connection for user:', user.id)

    // Get Unipile credentials
    const unipileDsn = Deno.env.get('UNIPILE_DSN')
    const unipileAccessToken = Deno.env.get('UNIPILE_ACCESS_TOKEN')

    if (!unipileDsn || !unipileAccessToken) {
      console.error('Missing Unipile credentials')
      return errorResponse('Unipile integration not configured', 500)
    }

    const baseUrl = `https://${unipileDsn}`
    const supabase = createSupabaseClient()

    // First check if we already have a connection in the database
    const { data: existingAccount } = await supabase
      .from('unipile_accounts')
      .select('id, account_id, status, connected_at')
      .eq('user_id', user.id)
      .eq('provider', 'LINKEDIN')
      .eq('status', 'active')
      .single()

    if (existingAccount) {
      console.log('Found existing connection in database:', existingAccount.account_id)
      return jsonResponse({
        success: true,
        isConnected: true,
        accountId: existingAccount.account_id,
        connectedAt: existingAccount.connected_at,
        source: 'database',
      })
    }

    // Query Unipile for all accounts
    console.log('Querying Unipile for accounts...')
    const response = await fetch(`${baseUrl}/api/v1/accounts`, {
      headers: {
        'X-API-KEY': unipileAccessToken,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Unipile API error:', response.status, errorText)
      return jsonResponse({
        success: true,
        isConnected: false,
        error: 'Failed to query Unipile',
      })
    }

    const data: UnipileAccountsResponse = await response.json()
    console.log('Unipile accounts found:', data.items?.length || 0)

    // Find an account that matches our user ID in the name field
    // The name field was set to user.id when creating the hosted auth link
    const userAccount = data.items?.find(
      (account) => account.name === user.id && account.type === 'LINKEDIN'
    )

    if (userAccount) {
      console.log('Found matching Unipile account:', userAccount.id)

      // Ensure profile exists
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('user_id', user.id)
        .single()

      if (!existingProfile) {
        console.log('Creating profile for user:', user.id)
        await supabase
          .from('profiles')
          .insert({ user_id: user.id, full_name: '' })
      }

      // Save to database
      const { error: insertError } = await supabase
        .from('unipile_accounts')
        .upsert({
          user_id: user.id,
          provider: 'LINKEDIN',
          account_id: userAccount.id,
          status: 'active',
          connected_at: userAccount.created_at || new Date().toISOString(),
        }, {
          onConflict: 'user_id,provider',
        })

      if (insertError) {
        console.error('Error saving to database:', insertError)
      } else {
        console.log('Saved LinkedIn connection to database')

        // Also update profile
        await supabase
          .from('profiles')
          .update({ unipile_account_id: userAccount.id })
          .eq('user_id', user.id)
      }

      return jsonResponse({
        success: true,
        isConnected: true,
        accountId: userAccount.id,
        connectedAt: userAccount.created_at,
        source: 'unipile',
      })
    }

    console.log('No matching LinkedIn account found for user:', user.id)
    return jsonResponse({
      success: true,
      isConnected: false,
    })
  } catch (error) {
    console.error('Error checking LinkedIn connection:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500
    )
  }
})
