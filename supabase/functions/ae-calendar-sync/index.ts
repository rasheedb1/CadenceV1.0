import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createSupabaseClient, getAuthContext } from '../_shared/supabase.ts'

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || ''
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || ''

async function refreshGoogleToken(refreshToken: string): Promise<string | null> {
  try {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })
    if (!resp.ok) return null
    const data = await resp.json()
    return data.access_token || null
  } catch {
    return null
  }
}

async function fetchCalendarEvents(accessToken: string, timeMin: string, timeMax: string) {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  })
  const resp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Calendar API failed (${resp.status}): ${text}`)
  }
  const data = await resp.json()
  return (data.items || []) as Array<{
    id: string
    summary?: string
    start?: { dateTime?: string; date?: string }
    end?: { dateTime?: string; date?: string }
    attendees?: Array<{ displayName?: string; email?: string }>
    htmlLink?: string
  }>
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

  const supabase = createSupabaseClient()

  // Load Google Calendar tokens
  const { data: integration, error: intErr } = await supabase
    .from('ae_integrations')
    .select('access_token, refresh_token, token_expires_at')
    .eq('user_id', authCtx.userId)
    .eq('org_id', authCtx.orgId)
    .eq('provider', 'google_calendar')
    .single()

  if (intErr || !integration?.access_token) {
    return errorResponse('Google Calendar not connected. Connect it in Settings → Account Executive.', 400)
  }

  // Check if token needs refresh
  let accessToken = integration.access_token
  if (integration.token_expires_at) {
    const expiresAt = new Date(integration.token_expires_at)
    if (expiresAt <= new Date(Date.now() + 60_000)) {  // refresh if < 1 min left
      if (integration.refresh_token) {
        const newToken = await refreshGoogleToken(integration.refresh_token)
        if (newToken) {
          accessToken = newToken
          // Update token in DB
          await supabase.from('ae_integrations').update({
            access_token: newToken,
            token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
          }).eq('user_id', authCtx.userId).eq('org_id', authCtx.orgId).eq('provider', 'google_calendar')
        }
      }
    }
  }

  // Fetch: last 7 days + next 48h
  const timeMin = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const timeMax = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

  let events: Awaited<ReturnType<typeof fetchCalendarEvents>>
  try {
    events = await fetchCalendarEvents(accessToken, timeMin, timeMax)
  } catch (e) {
    return errorResponse(`Google Calendar API error: ${e instanceof Error ? e.message : 'Unknown'}`, 502)
  }

  console.log(`[ae-calendar-sync] Found ${events.length} events`)

  let synced = 0
  for (const event of events) {
    if (!event.summary) continue  // skip events with no title
    const startTime = event.start?.dateTime || event.start?.date
    if (!startTime) continue

    const endTime = event.end?.dateTime || event.end?.date
    const durationMs = startTime && endTime
      ? new Date(endTime).getTime() - new Date(startTime).getTime()
      : null
    const durationSeconds = durationMs ? Math.round(durationMs / 1000) : null

    const participants = (event.attendees || []).map(a => ({
      name: a.displayName || a.email || 'Unknown',
      email: a.email,
    }))

    const { error } = await supabase
      .from('ae_activities')
      .upsert({
        org_id: authCtx.orgId,
        user_id: authCtx.userId,
        ae_account_id: null,  // user can manually link later
        type: 'meeting',
        source: 'google_calendar',
        external_id: event.id,
        title: event.summary,
        occurred_at: new Date(startTime).toISOString(),
        duration_seconds: durationSeconds,
        participants,
        action_items: [],
        raw_data: { htmlLink: event.htmlLink },
      }, { onConflict: 'org_id,source,external_id', ignoreDuplicates: true })

    if (!error) synced++
  }

  console.log(`[ae-calendar-sync] Done: synced=${synced}`)
  return jsonResponse({ success: true, synced })
})
