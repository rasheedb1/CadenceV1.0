// ae-google-callback — Exchange Google OAuth code for tokens, save to ae_integrations

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createSupabaseClient, getAuthContext } from '../_shared/supabase.ts'

const REDIRECT_URI = 'https://chief.yuno.tools/account-executive?calendar=connected'

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  scope: string
  error?: string
  error_description?: string
}

interface UserInfoResponse {
  email?: string
  name?: string
  sub?: string
  error?: string
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return errorResponse('Missing authorization', 401)

  let authCtx: { userId: string; orgId: string } | null
  try {
    authCtx = await getAuthContext(authHeader)
  } catch {
    return errorResponse('Authentication failed', 401)
  }
  if (!authCtx) return errorResponse('Unauthorized', 401)

  const body = await req.json().catch(() => ({})) as { code?: string; state?: string }
  if (!body.code) return errorResponse('Missing code', 400)

  // Verify state
  if (body.state) {
    try {
      const decoded = atob(body.state)
      const [stateUserId] = decoded.split(':')
      if (stateUserId !== authCtx.userId) {
        console.warn(`[ae-google-callback] State mismatch: ${stateUserId} vs ${authCtx.userId}`)
        return errorResponse('State mismatch — possible CSRF', 400)
      }
    } catch {
      console.warn('[ae-google-callback] Could not decode state')
    }
  }

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) return errorResponse('Google OAuth not configured', 500)

  // ── 1. Exchange code for tokens ───────────────────────────────────────────
  console.log(`[ae-google-callback] Exchanging code for tokens for user ${authCtx.userId}`)
  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: body.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  })

  const tokens: TokenResponse = await tokenResp.json()
  if (tokens.error || !tokens.access_token) {
    console.error('[ae-google-callback] Token exchange failed:', tokens.error, tokens.error_description)
    return errorResponse(tokens.error_description || tokens.error || 'Token exchange failed', 400)
  }

  // ── 2. Get user email from Google ─────────────────────────────────────────
  const userInfoResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const userInfo: UserInfoResponse = await userInfoResp.json()
  const email = userInfo.email || null
  console.log(`[ae-google-callback] Connected Google account: ${email}`)

  // ── 3. Save to ae_integrations ────────────────────────────────────────────
  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString()
  const supabase = createSupabaseClient()

  const config = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || null,
    expires_at: expiresAt,
    email,
    scope: tokens.scope,
  }

  // Upsert: save both google_calendar and gmail providers (same tokens, different provider key)
  const now = new Date().toISOString()
  const { error: calError } = await supabase
    .from('ae_integrations')
    .upsert({
      org_id: authCtx.orgId,
      user_id: authCtx.userId,
      provider: 'google_calendar',
      config,
      connected_at: now,
      token_expires_at: expiresAt,
    }, { onConflict: 'org_id,user_id,provider' })

  if (calError) {
    console.error('[ae-google-callback] Calendar upsert failed:', calError.message)
    return errorResponse('Failed to save calendar connection', 500)
  }

  const { error: gmailError } = await supabase
    .from('ae_integrations')
    .upsert({
      org_id: authCtx.orgId,
      user_id: authCtx.userId,
      provider: 'gmail',
      config,
      connected_at: now,
      token_expires_at: expiresAt,
    }, { onConflict: 'org_id,user_id,provider' })

  if (gmailError) {
    console.error('[ae-google-callback] Gmail upsert failed:', gmailError.message, gmailError.code, gmailError.details)
    return errorResponse('Failed to save Gmail connection: ' + gmailError.message, 500)
  }

  console.log(`[ae-google-callback] Saved calendar + gmail integration for user ${authCtx.userId}`)
  return jsonResponse({ success: true, email })
})
