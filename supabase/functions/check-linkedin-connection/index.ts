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
    console.log('User ID we are looking for:', user.id)

    // Log all accounts for debugging
    if (data.items && data.items.length > 0) {
      data.items.forEach((account, index) => {
        console.log(`Account ${index}:`, JSON.stringify({
          id: account.id,
          name: account.name,
          type: account.type,
          created_at: account.created_at,
        }))
      })
    }

    // Get all LinkedIn accounts from Unipile
    const linkedinAccounts = data.items?.filter(
      (account) => account.type?.toUpperCase() === 'LINKEDIN'
    ) || []

    console.log('LinkedIn accounts in Unipile:', linkedinAccounts.length)

    // Strategy 1: Match by name field (user.id was set when creating auth link)
    let userAccount = linkedinAccounts.find(
      (account) => account.name === user.id
    )

    if (userAccount) {
      console.log('Matched by name field')
    }

    // Strategy 2: Find unclaimed accounts (not yet saved in our DB for any user)
    if (!userAccount && linkedinAccounts.length > 0) {
      const { data: claimedAccounts } = await supabase
        .from('unipile_accounts')
        .select('account_id')
        .eq('provider', 'LINKEDIN')

      const claimedIds = new Set((claimedAccounts || []).map(a => a.account_id))
      const unclaimedAccounts = linkedinAccounts.filter(a => !claimedIds.has(a.id))

      console.log('Claimed account IDs:', Array.from(claimedIds))
      console.log('Unclaimed LinkedIn accounts:', unclaimedAccounts.length)

      if (unclaimedAccounts.length === 1) {
        userAccount = unclaimedAccounts[0]
        console.log('Matched single unclaimed LinkedIn account:', userAccount.id)
      } else if (unclaimedAccounts.length > 1) {
        // Pick the most recently created unclaimed account
        userAccount = unclaimedAccounts.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0]
        console.log('Matched most recent unclaimed LinkedIn account:', userAccount.id)
      }
    }

    // Strategy 3: If only one LinkedIn account exists total, use it
    if (!userAccount && linkedinAccounts.length === 1) {
      userAccount = linkedinAccounts[0]
      console.log('Only one LinkedIn account found, using it')
    }

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
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({ user_id: user.id, full_name: '' })
        if (profileError) {
          console.error('Error creating profile:', profileError)
        }
      }

      // Check if record exists in unipile_accounts (any status)
      const { data: existingUnipileAccount } = await supabase
        .from('unipile_accounts')
        .select('id')
        .eq('user_id', user.id)
        .eq('provider', 'LINKEDIN')
        .single()

      let saveError = null
      const connectedAt = userAccount.created_at || new Date().toISOString()

      if (existingUnipileAccount) {
        // Update existing record
        console.log('Updating existing unipile_accounts record:', existingUnipileAccount.id)
        const { error } = await supabase
          .from('unipile_accounts')
          .update({
            account_id: userAccount.id,
            status: 'active',
            connected_at: connectedAt,
          })
          .eq('id', existingUnipileAccount.id)
        saveError = error
      } else {
        // Insert new record
        console.log('Inserting new unipile_accounts record')
        const { error } = await supabase
          .from('unipile_accounts')
          .insert({
            user_id: user.id,
            provider: 'LINKEDIN',
            account_id: userAccount.id,
            status: 'active',
            connected_at: connectedAt,
          })
        saveError = error
      }

      if (saveError) {
        console.error('Error saving to unipile_accounts:', saveError)
        // Return the connection info even if database save fails
        // The connection exists in Unipile, just not persisted locally
      } else {
        console.log('Successfully saved LinkedIn connection to database')
      }

      // Also update profile with unipile_account_id
      const { error: profileUpdateError } = await supabase
        .from('profiles')
        .update({ unipile_account_id: userAccount.id })
        .eq('user_id', user.id)

      if (profileUpdateError) {
        console.error('Error updating profile:', profileUpdateError)
      } else {
        console.log('Updated profile with unipile_account_id')
      }

      return jsonResponse({
        success: true,
        isConnected: true,
        accountId: userAccount.id,
        connectedAt: connectedAt,
        source: 'unipile',
        savedToDb: !saveError,
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
