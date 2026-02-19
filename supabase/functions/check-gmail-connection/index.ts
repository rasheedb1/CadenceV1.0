// Edge Function: Check Gmail Connection Status
// POST /functions/v1/check-gmail-connection
// Polls Unipile API to check if user has connected their Gmail account
// This is a fallback when the webhook doesn't fire

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient, getAuthContext } from '../_shared/supabase.ts'
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

    const ctx = await getAuthContext(authHeader)
    if (!ctx) {
      return errorResponse('Invalid or expired token', 401)
    }

    console.log('Checking Gmail connection for user:', ctx.userId)

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
      .eq('user_id', ctx.userId)
      .eq('provider', 'EMAIL')
      .eq('status', 'active')
      .single()

    if (existingAccount) {
      console.log('Found existing Gmail connection in database:', existingAccount.account_id)
      return jsonResponse({
        success: true,
        isConnected: true,
        accountId: existingAccount.account_id,
        connectedAt: existingAccount.connected_at,
        source: 'database',
      })
    }

    // Query Unipile for all accounts
    console.log('Querying Unipile for Gmail accounts...')
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
    console.log('User ID we are looking for:', ctx.userId)

    // Log all accounts for debugging
    const allTypes: string[] = []
    if (data.items && data.items.length > 0) {
      data.items.forEach((account, index) => {
        allTypes.push(account.type || 'unknown')
        console.log(`Account ${index}:`, JSON.stringify({
          id: account.id,
          name: account.name,
          type: account.type,
          created_at: account.created_at,
        }))
      })
    }
    console.log('All account types in Unipile:', JSON.stringify(allTypes))

    // Get all non-LinkedIn/non-WhatsApp accounts from Unipile
    // Unipile may return various type names for Google/email accounts
    const EXCLUDED_TYPES = new Set(['LINKEDIN', 'WHATSAPP'])
    const gmailAccounts = data.items?.filter(
      (account) => !EXCLUDED_TYPES.has(account.type?.toUpperCase())
    ) || []

    console.log('Potential Gmail accounts:', gmailAccounts.length, JSON.stringify(gmailAccounts.map(a => ({ id: a.id, type: a.type, name: a.name }))))

    // Strategy 1: Match by name field (ctx.userId was set when creating auth link)
    let userAccount = gmailAccounts.find(
      (account) => account.name === ctx.userId
    )

    if (userAccount) {
      console.log('Matched Gmail account by name field')
    }

    // Strategy 2: Find unclaimed accounts (not yet saved in our DB for any user)
    if (!userAccount && gmailAccounts.length > 0) {
      const { data: claimedAccounts } = await supabase
        .from('unipile_accounts')
        .select('account_id')
        .eq('provider', 'EMAIL')

      const claimedIds = new Set((claimedAccounts || []).map(a => a.account_id))
      const unclaimedAccounts = gmailAccounts.filter(a => !claimedIds.has(a.id))

      console.log('Claimed EMAIL account IDs:', Array.from(claimedIds))
      console.log('Unclaimed Gmail accounts:', unclaimedAccounts.length)

      if (unclaimedAccounts.length === 1) {
        userAccount = unclaimedAccounts[0]
        console.log('Matched single unclaimed Gmail account:', userAccount.id)
      } else if (unclaimedAccounts.length > 1) {
        // Pick the most recently created unclaimed account
        userAccount = unclaimedAccounts.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0]
        console.log('Matched most recent unclaimed Gmail account:', userAccount.id)
      }
    }

    // Strategy 3: If only one non-LinkedIn account exists total, use it
    if (!userAccount && gmailAccounts.length === 1) {
      userAccount = gmailAccounts[0]
      console.log('Only one Gmail account found, using it')
    }

    if (userAccount) {
      console.log('Found matching Unipile Gmail account:', userAccount.id)

      // Ensure profile exists
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('user_id', ctx.userId)
        .single()

      if (!existingProfile) {
        console.log('Creating profile for user:', ctx.userId)
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({ user_id: ctx.userId, full_name: '' })
        if (profileError) {
          console.error('Error creating profile:', profileError)
        }
      }

      // Check if record exists in unipile_accounts (any status)
      const { data: existingUnipileAccount } = await supabase
        .from('unipile_accounts')
        .select('id')
        .eq('user_id', ctx.userId)
        .eq('provider', 'EMAIL')
        .single()

      let saveError = null
      const connectedAt = userAccount.created_at || new Date().toISOString()

      if (existingUnipileAccount) {
        // Update existing record
        console.log('Updating existing unipile_accounts record for Gmail:', existingUnipileAccount.id)
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
        console.log('Inserting new unipile_accounts record for Gmail')
        const { error } = await supabase
          .from('unipile_accounts')
          .insert({
            user_id: ctx.userId,
            provider: 'EMAIL',
            account_id: userAccount.id,
            status: 'active',
            connected_at: connectedAt,
          })
        saveError = error
      }

      if (saveError) {
        console.error('Error saving Gmail connection to unipile_accounts:', saveError)
        // Return the connection info even if database save fails
        // The connection exists in Unipile, just not persisted locally
      } else {
        console.log('Successfully saved Gmail connection to database')
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

    console.log('No matching Gmail account found for user:', ctx.userId)
    return jsonResponse({
      success: true,
      isConnected: false,
      debug: {
        totalAccounts: data.items?.length || 0,
        accountTypes: allTypes,
        potentialGmailAccounts: gmailAccounts.length,
      },
    })
  } catch (error) {
    console.error('Error checking Gmail connection:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500
    )
  }
})
