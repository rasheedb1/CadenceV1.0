// Edge Function: Initiate Salesforce OAuth 2.0 Web Server Flow
// POST /functions/v1/salesforce-auth
// Returns the Salesforce authorization URL for the user to grant access.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getAuthContext } from '../_shared/supabase.ts'
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

    const { clientId, redirectUri } = getSalesforceOAuthConfig()

    // Check if frontend requests forced login (for switching accounts)
    let forceLogin = false
    try {
      const body = await req.json()
      forceLogin = body.forceLogin === true
    } catch {
      // No body or not JSON — default behavior
    }

    // Generate PKCE code_verifier and code_challenge
    const verifierBytes = new Uint8Array(32)
    crypto.getRandomValues(verifierBytes)
    const codeVerifier = btoa(String.fromCharCode(...verifierBytes))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    const challengeBuffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(codeVerifier)
    )
    const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(challengeBuffer)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    // Encode org_id, user_id, and code_verifier in state to validate on callback
    const state = btoa(JSON.stringify({ orgId: ctx.orgId, userId: ctx.userId, codeVerifier }))

    const authUrl = new URL(`${`https://login.salesforce.com`}/services/oauth2/authorize`)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('scope', 'full refresh_token')
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('code_challenge', codeChallenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')
    if (forceLogin) {
      authUrl.searchParams.set('prompt', 'login')
    }

    console.log('Salesforce OAuth initiated for user:', ctx.userId, 'org:', ctx.orgId)

    return jsonResponse({ authUrl: authUrl.toString() })
  } catch (error) {
    console.error('salesforce-auth error:', error)
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500)
  }
})
