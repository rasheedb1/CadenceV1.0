// Edge Function: Handle Salesforce OAuth callback
// POST /functions/v1/salesforce-callback
// Exchanges the authorization code for tokens and saves the connection.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient, getAuthContext } from '../_shared/supabase.ts'
import { getSalesforceOAuthConfig } from '../_shared/salesforce.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Missing authorization header', 401)

    const ctx = await getAuthContext(authHeader)
    if (!ctx) return errorResponse('Invalid or expired token', 401)

    const { code, state } = await req.json()
    if (!code) return errorResponse('Missing authorization code', 400)

    // Validate state parameter and extract code_verifier for PKCE
    let codeVerifier = ''
    if (state) {
      try {
        const decoded = JSON.parse(atob(state))
        if (decoded.orgId !== ctx.orgId || decoded.userId !== ctx.userId) {
          return errorResponse('State mismatch — possible CSRF', 400)
        }
        codeVerifier = decoded.codeVerifier || ''
      } catch {
        return errorResponse('Invalid state parameter', 400)
      }
    }

    const { clientId, clientSecret, redirectUri } = getSalesforceOAuthConfig()

    // Exchange code for tokens (with PKCE code_verifier)
    const tokenParams: Record<string, string> = {
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }
    if (codeVerifier) {
      tokenParams.code_verifier = codeVerifier
    }

    const tokenResponse = await fetch('https://login.salesforce.com/services/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(tokenParams),
    })

    if (!tokenResponse.ok) {
      const err = await tokenResponse.text()
      console.error('Salesforce token exchange failed:', err)
      return errorResponse(`Token exchange failed: ${err}`, 400)
    }

    const tokens = await tokenResponse.json()

    // Extract SF user_id and org_id from the id URL
    // Format: https://login.salesforce.com/id/{org_id}/{user_id}
    let sfUserId = ''
    let sfOrgId = ''
    if (tokens.id) {
      const parts = tokens.id.split('/')
      sfUserId = parts[parts.length - 1] || ''
      sfOrgId = parts[parts.length - 2] || ''
    }

    // Fetch user info for username
    let sfUsername = ''
    try {
      const userInfoRes = await fetch(`${tokens.instance_url}/services/oauth2/userinfo`, {
        headers: { 'Authorization': `Bearer ${tokens.access_token}` },
      })
      if (userInfoRes.ok) {
        const userInfo = await userInfoRes.json()
        sfUsername = userInfo.preferred_username || userInfo.email || ''
      }
    } catch (e) {
      console.warn('Could not fetch Salesforce user info:', e)
    }

    // Upsert connection (one per org)
    const supabase = createSupabaseClient()
    const { error: upsertError } = await supabase
      .from('salesforce_connections')
      .upsert({
        org_id: ctx.orgId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        instance_url: tokens.instance_url,
        sf_user_id: sfUserId,
        sf_org_id: sfOrgId,
        sf_username: sfUsername,
        token_issued_at: tokens.issued_at
          ? new Date(parseInt(tokens.issued_at)).toISOString()
          : new Date().toISOString(),
        connected_by: ctx.userId,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_active: true,
        last_error: null,
      }, { onConflict: 'org_id' })

    if (upsertError) {
      console.error('Failed to save Salesforce connection:', upsertError)
      return errorResponse('Failed to save connection', 500)
    }

    console.log('Salesforce connected for org:', ctx.orgId, 'instance:', tokens.instance_url)

    return jsonResponse({
      success: true,
      sfUsername,
      instanceUrl: tokens.instance_url,
    })
  } catch (error) {
    console.error('salesforce-callback error:', error)
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500)
  }
})
