import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthContext } from '../_shared/supabase.ts'

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || ''
const REDIRECT_URI = 'https://arupeqczrxmfkcbjwyad.supabase.co/functions/v1/ae-google-callback'

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

  if (!GOOGLE_CLIENT_ID) {
    return errorResponse('GOOGLE_CLIENT_ID not configured', 500)
  }

  // State encodes userId and orgId for the callback
  const state = btoa(JSON.stringify({ userId: authCtx.userId, orgId: authCtx.orgId }))

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email openid',
    access_type: 'offline',
    prompt: 'consent',
    state,
  })

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`

  return jsonResponse({ url })
})
