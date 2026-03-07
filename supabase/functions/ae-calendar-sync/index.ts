// ae-calendar-sync — Fetch calendar events via Unipile (Google / Microsoft)
// Uses the user's already-connected Unipile account — no extra OAuth needed.
//
// Unipile docs: https://developer.unipile.com/docs/calendars-and-events
//   GET /api/v1/calendars?account_id=...
//   GET /api/v1/calendars/{calendarId}/events?account_id=...&from=...&to=...

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createSupabaseClient, getAuthContext } from '../_shared/supabase.ts'
import { createUnipileClient } from '../_shared/unipile.ts'

// Types for Unipile calendar responses
interface UnipileAccount {
  id: string
  type: string
  name?: string
  username?: string
}

interface UnipileCalendar {
  id: string
  name?: string
  description?: string
  color?: string
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
  // Unipile may return start/end as ISO string or as object
  start_time?: string
  end_time?: string
  start?: string | { dateTime?: string; date?: string }
  end?: string | { dateTime?: string; date?: string }
  attendees?: UnipileEventAttendee[]
  location?: string
}

// Calendar-capable account types in Unipile
const CALENDAR_ACCOUNT_TYPES = ['GOOGLE', 'GMAIL', 'MICROSOFT', 'OUTLOOK', 'OFFICE365', 'EXCHANGE']

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
  const unipile = createUnipileClient()

  // ── 1. Get all Unipile connected accounts ─────────────────────────────────
  const accountsResp = await unipile.getAccounts()
  if (!accountsResp.success || !accountsResp.data) {
    return errorResponse('Failed to reach Unipile. Check UNIPILE_DSN and UNIPILE_ACCESS_TOKEN.', 502)
  }

  const accountsData = accountsResp.data as { items?: UnipileAccount[] } | UnipileAccount[]
  const allAccounts: UnipileAccount[] = Array.isArray(accountsData)
    ? accountsData
    : (accountsData as { items?: UnipileAccount[] }).items || []

  // Filter to calendar-capable accounts (Google / Microsoft)
  const calendarAccounts = allAccounts.filter((a) =>
    CALENDAR_ACCOUNT_TYPES.includes((a.type || '').toUpperCase())
  )

  if (calendarAccounts.length === 0) {
    return errorResponse(
      'No Google or Microsoft account connected via Unipile. ' +
      'Connect your email account in Settings → Gmail, then enable calendar scopes in your Unipile dashboard.',
      400
    )
  }

  console.log(`[ae-calendar-sync] Found ${calendarAccounts.length} calendar-capable accounts`)

  // Time window: past 7 days + next 48h
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const to   = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

  let totalSynced = 0

  // ── 2. For each calendar account, fetch calendars then events ─────────────
  for (const account of calendarAccounts.slice(0, 2)) {
    const calendarsResp = await unipile.getCalendars(account.id, 10)
    if (!calendarsResp.success || !calendarsResp.data) {
      console.warn(`[ae-calendar-sync] No calendars for account ${account.id}: ${calendarsResp.error}`)
      console.warn('Calendar scopes may not be enabled. Enable them in your Unipile dashboard → Settings → Calendar.')
      continue
    }

    const calendarsData = calendarsResp.data as { items?: UnipileCalendar[] }
    const calendars: UnipileCalendar[] = calendarsData.items || []
    console.log(`[ae-calendar-sync] Account ${account.id} has ${calendars.length} calendar(s)`)

    for (const calendar of calendars.slice(0, 5)) {
      const eventsResp = await unipile.getCalendarEvents(calendar.id, account.id, {
        limit: 50,
        from,
        to,
      })

      if (!eventsResp.success || !eventsResp.data) {
        console.warn(`[ae-calendar-sync] Failed to get events for calendar ${calendar.id}: ${eventsResp.error}`)
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
            external_id: `${account.id}::${event.id}`,  // prefix with account ID to avoid collisions
            title,
            summary: event.description || null,
            occurred_at: new Date(startTime).toISOString(),
            duration_seconds: durationSeconds,
            participants,
            action_items: [],
            raw_data: { location: event.location, calendar_id: calendar.id, unipile_account_id: account.id },
          }, { onConflict: 'org_id,source,external_id', ignoreDuplicates: true })

        if (!error) totalSynced++
      }
    }
  }

  console.log(`[ae-calendar-sync] Done: synced=${totalSynced}`)
  return jsonResponse({ success: true, synced: totalSynced })
})
