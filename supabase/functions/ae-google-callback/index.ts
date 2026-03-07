import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || ''
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || ''
const REDIRECT_URI = 'https://arupeqczrxmfkcbjwyad.supabase.co/functions/v1/ae-google-callback'
const FRONTEND_URL = 'https://laiky-cadence.vercel.app'

serve(async (req: Request) => {
  // This is a redirect callback from Google — always GET
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const stateParam = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error) {
    return Response.redirect(`${FRONTEND_URL}/account-executive?error=calendar_auth_denied`, 302)
  }

  if (!code || !stateParam) {
    return Response.redirect(`${FRONTEND_URL}/account-executive?error=calendar_auth_failed`, 302)
  }

  let userId: string
  let orgId: string
  try {
    const decoded = JSON.parse(atob(stateParam))
    userId = decoded.userId
    orgId = decoded.orgId
    if (!userId || !orgId) throw new Error('Invalid state')
  } catch {
    return Response.redirect(`${FRONTEND_URL}/account-executive?error=calendar_auth_failed`, 302)
  }

  // Exchange code for tokens
  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenResp.ok) {
    console.error('[ae-google-callback] Token exchange failed:', await tokenResp.text())
    return Response.redirect(`${FRONTEND_URL}/account-executive?error=calendar_auth_failed`, 302)
  }

  const tokens = await tokenResp.json()

  // Get user email from Google
  let userEmail = ''
  try {
    const profileResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    if (profileResp.ok) {
      const profile = await profileResp.json()
      userEmail = profile.email || ''
    }
  } catch { /* non-fatal */ }

  // Save to ae_integrations
  const supabase = createSupabaseClient()
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null

  const { error: upsertErr } = await supabase
    .from('ae_integrations')
    .upsert({
      org_id: orgId,
      user_id: userId,
      provider: 'google_calendar',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      token_expires_at: expiresAt,
      config: { email: userEmail },
      connected_at: new Date().toISOString(),
    }, { onConflict: 'org_id,user_id,provider' })

  if (upsertErr) {
    console.error('[ae-google-callback] Upsert failed:', upsertErr)
    return Response.redirect(`${FRONTEND_URL}/account-executive?error=calendar_save_failed`, 302)
  }

  return Response.redirect(`${FRONTEND_URL}/account-executive?calendar=connected`, 302)
})
