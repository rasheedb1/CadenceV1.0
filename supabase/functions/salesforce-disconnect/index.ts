// Edge Function: Disconnect Salesforce
// POST /functions/v1/salesforce-disconnect
// Revokes the token and removes all cached Salesforce data for the org.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient, getAuthContext } from '../_shared/supabase.ts'
import { getSalesforceConnection } from '../_shared/salesforce.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Missing authorization header', 401)

    const ctx = await getAuthContext(authHeader)
    if (!ctx) return errorResponse('Invalid or expired token', 401)

    const connection = await getSalesforceConnection(ctx.orgId)

    // Try to revoke token in Salesforce (best-effort)
    if (connection) {
      try {
        await fetch(`${connection.instance_url}/services/oauth2/revoke?token=${connection.access_token}`, {
          method: 'POST',
        })
        console.log('Salesforce token revoked')
      } catch (e) {
        console.warn('Token revocation failed (non-critical):', e)
      }
    }

    const supabase = createSupabaseClient()

    // Delete cached data
    await Promise.all([
      supabase.from('salesforce_opportunities').delete().eq('org_id', ctx.orgId),
      supabase.from('salesforce_accounts').delete().eq('org_id', ctx.orgId),
      supabase.from('salesforce_connections').delete().eq('org_id', ctx.orgId),
    ])

    console.log('Salesforce disconnected for org:', ctx.orgId)

    return jsonResponse({ success: true })
  } catch (error) {
    console.error('salesforce-disconnect error:', error)
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500)
  }
})
