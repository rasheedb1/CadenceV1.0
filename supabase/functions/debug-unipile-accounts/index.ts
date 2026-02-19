// Edge Function: Debug Unipile Accounts
// GET /functions/v1/debug-unipile-accounts
// Lists all accounts in Unipile and database for debugging purposes

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient, getAuthContext } from '../_shared/supabase.ts'
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
      return errorResponse('Invalid or expired token', 401)
    }

    const supabase = createSupabaseClient()

    // Check what's in the database for this user
    const { data: dbAccounts, error: dbError } = await supabase
      .from('unipile_accounts')
      .select('*')
      .eq('user_id', ctx.userId)

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_id, unipile_account_id')
      .eq('user_id', ctx.userId)
      .single()

    // Get Unipile credentials
    const unipileDsn = Deno.env.get('UNIPILE_DSN')
    const unipileAccessToken = Deno.env.get('UNIPILE_ACCESS_TOKEN')

    if (!unipileDsn || !unipileAccessToken) {
      return errorResponse('Unipile integration not configured', 500)
    }

    const baseUrl = `https://${unipileDsn}`

    // Query Unipile for all accounts
    const response = await fetch(`${baseUrl}/api/v1/accounts`, {
      headers: {
        'X-API-KEY': unipileAccessToken,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      return jsonResponse({
        success: false,
        currentUserId: ctx.userId,
        database: {
          unipileAccounts: dbAccounts || [],
          dbError: dbError?.message,
          profile: profile || null,
          profileError: profileError?.message,
        },
        unipile: {
          error: `Unipile API error: ${response.status} - ${errorText}`,
        },
      })
    }

    const data = await response.json()

    // For each LinkedIn account, try to get more details including capabilities
    const accountsWithDetails = await Promise.all(
      (data.items || []).map(async (account: { id: string; name: string; type: string; created_at: string }) => {
        let accountDetails = null
        if (account.type?.toUpperCase() === 'LINKEDIN') {
          try {
            // Get detailed account info
            const detailResponse = await fetch(`${baseUrl}/api/v1/accounts/${account.id}`, {
              headers: {
                'X-API-KEY': unipileAccessToken,
              },
            })
            if (detailResponse.ok) {
              accountDetails = await detailResponse.json()
            }
          } catch (e) {
            console.error('Error fetching account details:', e)
          }
        }
        return {
          id: account.id,
          name: account.name,
          type: account.type,
          created_at: account.created_at,
          matchesUserId: account.name === ctx.userId,
          details: accountDetails,
        }
      })
    )

    // Return all info for debugging
    return jsonResponse({
      success: true,
      currentUserId: ctx.userId,
      database: {
        unipileAccounts: dbAccounts || [],
        dbError: dbError?.message,
        profile: profile || null,
        profileError: profileError?.message,
      },
      unipile: {
        totalAccounts: data.items?.length || 0,
        accounts: accountsWithDetails,
      },
    })
  } catch (error) {
    console.error('Error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500
    )
  }
})
