// ae-calendar-create-event — Create Google Calendar event and send invitations
// Accepts service role auth; user_id passed in body

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'

interface GoogleToken {
  access_token: string
  refresh_token?: string | null
  expires_at: string
  email?: string | null
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

  let body: {
    user_id: string
    org_id: string
    title: string
    start_datetime: string
    end_datetime: string
    timezone?: string
    description?: string
    location?: string
    attendees?: Array<{ email: string; name?: string }>
  }
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const { user_id, org_id, title, start_datetime, end_datetime } = body
  if (!user_id || !org_id || !title || !start_datetime || !end_datetime) {
    return errorResponse('user_id, org_id, title, start_datetime, end_datetime are required', 400)
  }

  const tz = body.timezone || 'America/Mexico_City'
  const supabase = createSupabaseClient()

  // ── 1. Load Google Calendar OAuth tokens ─────────────────────────────────
  const { data: integration, error: intErr } = await supabase
    .from('ae_integrations')
    .select('config, token_expires_at')
    .eq('user_id', user_id)
    .eq('org_id', org_id)
    .eq('provider', 'google_calendar')
    .single()

  if (intErr || !integration?.config) {
    return errorResponse(
      'Google Calendar not connected. Connect it in Settings → Account Executive.',
      400
    )
  }

  let tokenConfig = integration.config as GoogleToken
  let accessToken = tokenConfig.access_token

  // ── 2. Refresh token if expired ───────────────────────────────────────────
  const expiresAt = new Date(tokenConfig.expires_at || integration.token_expires_at || 0).getTime()
  if (Date.now() > expiresAt - 60_000 && tokenConfig.refresh_token) {
    const refreshed = await refreshAccessToken(tokenConfig.refresh_token)
    if (refreshed) {
      accessToken = refreshed.access_token
      tokenConfig = { ...tokenConfig, ...refreshed }
      await supabase
        .from('ae_integrations')
        .update({ config: tokenConfig, token_expires_at: refreshed.expires_at })
        .eq('user_id', user_id)
        .eq('org_id', org_id)
        .eq('provider', 'google_calendar')
    } else {
      return errorResponse('Google Calendar token expired. Please reconnect in Settings.', 401)
    }
  }

  // ── 3. Build event payload ────────────────────────────────────────────────
  const googleEvent: Record<string, unknown> = {
    summary: title,
    start: { dateTime: start_datetime, timeZone: tz },
    end: { dateTime: end_datetime, timeZone: tz },
    guestsCanModify: false,
    guestsCanSeeOtherGuests: true,
  }

  if (body.description) googleEvent.description = body.description
  if (body.location) googleEvent.location = body.location
  if (body.attendees?.length) {
    googleEvent.attendees = body.attendees.map(a => ({
      email: a.email,
      displayName: a.name || a.email,
    }))
    // Enable conference data (Google Meet)
    googleEvent.conferenceData = {
      createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
    }
  }

  // ── 4. Create event via Google Calendar API ───────────────────────────────
  const createUrl = 'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all&conferenceDataVersion=1'
  const createResp = await fetch(createUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(googleEvent),
  })
  const created = await createResp.json()

  if (created.error) {
    console.error('[ae-calendar-create-event] Google API error:', created.error)
    return errorResponse(`Google Calendar error: ${created.error.message}`, 400)
  }

  // ── 5. Compute duration ───────────────────────────────────────────────────
  const startMs = new Date(start_datetime).getTime()
  const endMs = new Date(end_datetime).getTime()
  const durationSeconds = Math.round((endMs - startMs) / 1000)

  // ── 6. Save to ae_activities ──────────────────────────────────────────────
  const participants = [
    ...(body.attendees || []).map(a => ({
      name: a.name || a.email,
      email: a.email,
      is_self: false,
      status: 'needsAction',
    })),
  ]

  await supabase.from('ae_activities').insert({
    org_id,
    user_id,
    ae_account_id: null,
    type: 'meeting',
    source: 'google_calendar',
    external_id: `google::${created.id}`,
    title,
    summary: body.description || null,
    occurred_at: new Date(start_datetime).toISOString(),
    duration_seconds: durationSeconds,
    participants,
    action_items: [],
    raw_data: {
      location: body.location || null,
      calendar_id: 'primary',
      html_link: created.htmlLink || null,
      status: 'confirmed',
      meet_link: created.conferenceData?.entryPoints?.find((e: { entryPointType?: string }) => e.entryPointType === 'video')?.uri || null,
    },
  })

  return jsonResponse({
    success: true,
    event_id: created.id,
    title,
    start: start_datetime,
    end: end_datetime,
    timezone: tz,
    html_link: created.htmlLink,
    meet_link: created.conferenceData?.entryPoints?.find((e: { entryPointType?: string }) => e.entryPointType === 'video')?.uri || null,
    attendees_invited: body.attendees?.length || 0,
  })
})
