// ae-google-oauth — Generate Google OAuth URL for Calendar + Gmail access

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthContext } from '../_shared/supabase.ts'

const REDIRECT_URI = 'https://laiky-cadence.vercel.app/account-executive?calendar=connected'
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

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

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  if (!clientId) return errorResponse('Google OAuth not configured', 500)

  // Encode userId:orgId as state for verification on callback
  const state = btoa(`${authCtx.userId}:${authCtx.orgId}`)

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',   // Force consent so we always get refresh_token
    state,
  })

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`

  console.log(`[ae-google-oauth] Generated auth URL for user ${authCtx.userId}`)
  return jsonResponse({ url: authUrl })
})
