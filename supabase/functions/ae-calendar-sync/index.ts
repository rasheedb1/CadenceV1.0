// ae-calendar-sync — Fetch Google Calendar events using direct Google API
// Uses OAuth tokens stored in ae_integrations (provider='google_calendar')

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createSupabaseClient, getAuthContext } from '../_shared/supabase.ts'

interface GoogleToken {
  access_token: string
  refresh_token?: string | null
  expires_at: string
  email?: string | null
}

interface GoogleCalendarItem {
  id: string
  summary?: string
  primary?: boolean
  accessRole?: string
}

interface GoogleEvent {
  id: string
  summary?: string
  description?: string
  location?: string
  start?: { dateTime?: string; date?: string; timeZone?: string }
  end?: { dateTime?: string; date?: string; timeZone?: string }
  attendees?: Array<{ email?: string; displayName?: string; self?: boolean; responseStatus?: string }>
  organizer?: { email?: string; displayName?: string }
  status?: string
  htmlLink?: string
}

interface GoogleEventsResponse {
  items?: GoogleEvent[]
  error?: { code: number; message: string }
}

interface GoogleCalendarListResponse {
  items?: GoogleCalendarItem[]
  error?: { code: number; message: string }
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_at: string } | null> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) return null

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  })
  const data = await resp.json()
  if (!data.access_token) return null
  return {
    access_token: data.access_token,
    expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
  }
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

  // ── 1. Load Google OAuth tokens from ae_integrations ─────────────────────
  const { data: integration, error: intErr } = await supabase
    .from('ae_integrations')
    .select('config, token_expires_at')
    .eq('user_id', authCtx.userId)
    .eq('org_id', authCtx.orgId)
    .eq('provider', 'google_calendar')
    .single()

  if (intErr || !integration?.config) {
    return errorResponse(
      'Google Calendar not connected. Go to Settings → Account Executive → Connect Google Calendar.',
      400
    )
  }

  let tokenConfig = integration.config as GoogleToken
  let accessToken = tokenConfig.access_token

  // ── 2. Refresh token if expired ───────────────────────────────────────────
  const expiresAt = new Date(tokenConfig.expires_at || integration.token_expires_at || 0).getTime()
  const isExpired = Date.now() > expiresAt - 60_000 // 1min buffer

  if (isExpired && tokenConfig.refresh_token) {
    console.log('[ae-calendar-sync] Token expired, refreshing...')
    const refreshed = await refreshAccessToken(tokenConfig.refresh_token)
    if (refreshed) {
      accessToken = refreshed.access_token
      tokenConfig = { ...tokenConfig, ...refreshed }
      // Update tokens in DB
      await supabase
        .from('ae_integrations')
        .update({
          config: tokenConfig,
          token_expires_at: refreshed.expires_at,
        })
        .eq('user_id', authCtx.userId)
        .eq('org_id', authCtx.orgId)
        .eq('provider', 'google_calendar')
      console.log('[ae-calendar-sync] Token refreshed and saved')
    } else {
      return errorResponse(
        'Google Calendar token expired and could not be refreshed. Please reconnect in Settings → Account Executive.',
        401
      )
    }
  }

  // ── 3. Get calendar list ──────────────────────────────────────────────────
  const calListResp = await fetch(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=10&minAccessRole=reader',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const calListData: GoogleCalendarListResponse = await calListResp.json()

  if (calListData.error) {
    console.error('[ae-calendar-sync] Calendar list error:', calListData.error)
    return errorResponse(`Google Calendar API error: ${calListData.error.message}`, 400)
  }

  const calendars = calListData.items || []
  console.log(`[ae-calendar-sync] Found ${calendars.length} calendars`)

  if (calendars.length === 0) {
    return errorResponse('No calendars found in your Google account.', 400)
  }

  // ── 4. Fetch events ───────────────────────────────────────────────────────
  // Sync from 1 week before start of current week to 5 weeks ahead
  const now = new Date()
  const dayOfWeek = now.getDay() // 0=Sun
  const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const startOfThisWeek = new Date(now)
  startOfThisWeek.setDate(now.getDate() + diffToMon)
  startOfThisWeek.setHours(0, 0, 0, 0)
  const timeMin = new Date(startOfThisWeek.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const timeMax = new Date(startOfThisWeek.getTime() + 5 * 7 * 24 * 60 * 60 * 1000).toISOString()

  let totalSynced = 0

  // Fetch from primary + up to 2 more calendars
  const targetCalendars = calendars
    .filter(c => c.accessRole === 'owner' || c.primary)
    .slice(0, 3)

  if (targetCalendars.length === 0) {
    targetCalendars.push(...calendars.slice(0, 3))
  }

  for (const cal of targetCalendars) {
    const encodedCalId = encodeURIComponent(cal.id)
    const eventsUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodedCalId}/events?` +
      new URLSearchParams({
        timeMin,
        timeMax,
        maxResults: '50',
        singleEvents: 'true',
        orderBy: 'startTime',
      })

    const eventsResp = await fetch(eventsUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const eventsData: GoogleEventsResponse = await eventsResp.json()

    if (eventsData.error) {
      console.warn(`[ae-calendar-sync] Events error for ${cal.id}:`, eventsData.error.message)
      continue
    }

    const events = eventsData.items || []
    console.log(`[ae-calendar-sync] Calendar "${cal.summary || cal.id}" → ${events.length} events`)

    for (const event of events) {
      const title = event.summary
      if (!title) continue

      const startTime = event.start?.dateTime || event.start?.date
      if (!startTime) continue
      const endTime = event.end?.dateTime || event.end?.date

      const durationSeconds = endTime
        ? Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000)
        : null

      const participants = (event.attendees || []).map(a => ({
        name: a.displayName || a.email || 'Unknown',
        email: a.email || null,
        is_self: a.self || false,
        status: a.responseStatus || null,
      }))

      if (event.organizer && !participants.some(p => p.email === event.organizer?.email)) {
        participants.unshift({
          name: event.organizer.displayName || event.organizer.email || 'Organizer',
          email: event.organizer.email || null,
          is_self: false,
          status: 'organizer',
        })
      }

      const { error } = await supabase
        .from('ae_activities')
        .upsert({
          org_id: authCtx.orgId,
          user_id: authCtx.userId,
          ae_account_id: null,
          type: 'meeting',
          source: 'google_calendar',
          external_id: `google::${event.id}`,
          title,
          summary: event.description || null,
          occurred_at: new Date(startTime).toISOString(),
          duration_seconds: durationSeconds,
          participants,
          action_items: [],
          raw_data: {
            location: event.location || null,
            calendar_id: cal.id,
            html_link: event.htmlLink || null,
            status: event.status || null,
          },
        }, { onConflict: 'org_id,source,external_id', ignoreDuplicates: false })

      if (!error) totalSynced++
      else console.warn('[ae-calendar-sync] Upsert error:', error.message)
    }
  }

  console.log(`[ae-calendar-sync] Done: synced=${totalSynced}`)
  return jsonResponse({
    success: true,
    synced: totalSynced,
    calendars_scanned: targetCalendars.length,
    email: tokenConfig.email,
  })
})
