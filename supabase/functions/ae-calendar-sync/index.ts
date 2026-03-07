// ae-calendar-sync — Fetch calendar events via Unipile (Google / Microsoft)
//
// Looks up the user's connected email account from the local `unipile_accounts`
// table (provider='EMAIL', status='active'), then calls:
//   GET /api/v1/calendars?account_id=...
//   GET /api/v1/calendars/{id}/events?account_id=...&from=...&to=...
//
// ⚠ Calendar scopes must be enabled in your Unipile dashboard → Settings
//   before events are accessible. After enabling, the user may need to
//   reconnect their Gmail account.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createSupabaseClient, getAuthContext } from '../_shared/supabase.ts'
import { createUnipileClient } from '../_shared/unipile.ts'

interface UnipileCalendar {
  id: string
  name?: string
}

interface UnipileEventAttendee {
  name?: string
  display_name?: string
  email?: string
  identifier?: string
}

interface UnipileEvent {
  id: string
  title?: string
  summary?: string
  description?: string
  start_time?: string
  end_time?: string
  // Google-style nested objects
  start?: string | { dateTime?: string; date?: string }
  end?: string | { dateTime?: string; date?: string }
  attendees?: UnipileEventAttendee[]
  location?: string
}

function normalizeTime(v: UnipileEvent['start_time'] | UnipileEvent['start']): string | null {
  if (!v) return null
  if (typeof v === 'string') return v
  if (typeof v === 'object') return v.dateTime || v.date || null
  return null
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

  // ── 1. Look up the user's connected Gmail/Outlook account ─────────────────
  // This account was saved in unipile_accounts when the user connected Gmail
  // in Settings → Gmail using the Unipile hosted auth flow.
  const { data: emailAccount, error: emailErr } = await supabase
    .from('unipile_accounts')
    .select('account_id')
    .eq('user_id', authCtx.userId)
    .eq('provider', 'EMAIL')
    .eq('status', 'active')
    .single()

  if (emailErr || !emailAccount?.account_id) {
    console.warn(`[ae-calendar-sync] No active EMAIL account found for user ${authCtx.userId}:`, emailErr?.message)
    return errorResponse(
      'No Gmail or Outlook account connected. ' +
      'Go to Settings → Gmail, connect your email account first, ' +
      'then make sure calendar scopes are enabled in your Unipile dashboard.',
      400
    )
  }

  const unipileAccountId = emailAccount.account_id
  console.log(`[ae-calendar-sync] Using Unipile account: ${unipileAccountId}`)

  const unipile = createUnipileClient()

  // ── 2. Get calendars for this account ─────────────────────────────────────
  const calendarsResp = await unipile.getCalendars(unipileAccountId, 10)

  if (!calendarsResp.success || !calendarsResp.data) {
    console.error(`[ae-calendar-sync] Calendar API failed:`, calendarsResp.error)
    return errorResponse(
      'Could not access calendar data. ' +
      'Calendar scopes may not be enabled in your Unipile dashboard. ' +
      'Enable them at: https://app.unipile.com → Settings → Scopes → Calendar, ' +
      'then reconnect your Gmail account.',
      400
    )
  }

  const calendarsData = calendarsResp.data as { items?: UnipileCalendar[] }
  const calendars: UnipileCalendar[] = calendarsData.items || []
  console.log(`[ae-calendar-sync] Found ${calendars.length} calendar(s)`)

  if (calendars.length === 0) {
    return errorResponse(
      'No calendars found. ' +
      'Calendar scopes may not be enabled in Unipile dashboard → Settings → Scopes → Calendar.',
      400
    )
  }

  // ── 3. Fetch events for each calendar ─────────────────────────────────────
  // Time window: last 7 days + next 48h
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const to   = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

  let totalSynced = 0

  for (const calendar of calendars.slice(0, 5)) {
    const eventsResp = await unipile.getCalendarEvents(calendar.id, unipileAccountId, {
      limit: 50,
      from,
      to,
    })

    if (!eventsResp.success || !eventsResp.data) {
      console.warn(`[ae-calendar-sync] Events failed for calendar ${calendar.id}:`, eventsResp.error)
      continue
    }

    const eventsData = eventsResp.data as { items?: UnipileEvent[] }
    const events: UnipileEvent[] = eventsData.items || []
    console.log(`[ae-calendar-sync] Calendar "${calendar.name || calendar.id}" → ${events.length} events`)

    for (const event of events) {
      const title = event.title || event.summary
      if (!title) continue

      const startTime = normalizeTime(event.start_time ?? event.start)
      if (!startTime) continue
      const endTime = normalizeTime(event.end_time ?? event.end)

      const durationSeconds = endTime
        ? Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000)
        : null

      const participants = (event.attendees || []).map((a) => ({
        name: a.name || a.display_name || a.email || a.identifier || 'Unknown',
        email: a.email || a.identifier || null,
      }))

      const { error } = await supabase
        .from('ae_activities')
        .upsert({
          org_id: authCtx.orgId,
          user_id: authCtx.userId,
          ae_account_id: null,
          type: 'meeting',
          source: 'google_calendar',
          external_id: `${unipileAccountId}::${event.id}`,
          title,
          summary: event.description || null,
          occurred_at: new Date(startTime).toISOString(),
          duration_seconds: durationSeconds,
          participants,
          action_items: [],
          raw_data: { location: event.location, calendar_id: calendar.id },
        }, { onConflict: 'org_id,source,external_id', ignoreDuplicates: true })

      if (!error) totalSynced++
    }
  }

  console.log(`[ae-calendar-sync] Done: synced=${totalSynced}`)
  return jsonResponse({ success: true, synced: totalSynced })
})
