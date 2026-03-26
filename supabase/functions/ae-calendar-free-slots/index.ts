// ae-calendar-free-slots — Compute free time slots from ae_activities meetings
// Accepts service role auth; user_id passed in body

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'

function getTimeInTZ(isoStr: string, tz: string): { hours: number; minutes: number } {
  const d = new Date(isoStr)
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: tz,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(d)
  return {
    hours: parseInt(parts.find(p => p.type === 'hour')?.value || '0'),
    minutes: parseInt(parts.find(p => p.type === 'minute')?.value || '0'),
  }
}

function formatMin(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`
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
    date?: string
    days?: number
    timezone?: string
    business_start?: number
    business_end?: number
  }
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const { user_id, org_id } = body
  if (!user_id || !org_id) return errorResponse('user_id and org_id are required', 400)

  const date = body.date || new Date().toISOString().split('T')[0]
  const days = Math.min(body.days || 1, 7)
  const tz = body.timezone || 'America/Mexico_City'
  const bizStart = body.business_start ?? 9
  const bizEnd = body.business_end ?? 18

  const supabase = createSupabaseClient()
  const results = []

  for (let i = 0; i < days; i++) {
    const d = new Date(date + 'T12:00:00Z')
    d.setUTCDate(d.getUTCDate() + i)
    const dateStr = d.toISOString().split('T')[0]

    const { data: events } = await supabase
      .from('ae_activities')
      .select('occurred_at, duration_seconds')
      .eq('user_id', user_id)
      .eq('org_id', org_id)
      .eq('type', 'meeting')
      .gte('occurred_at', `${dateStr}T00:00:00.000Z`)
      .lte('occurred_at', `${dateStr}T23:59:59.999Z`)
      .order('occurred_at', { ascending: true })

    const meetings = events || []

    // Build busy intervals (minutes since midnight in target tz)
    const busy = meetings
      .map(e => {
        const { hours, minutes } = getTimeInTZ(e.occurred_at, tz)
        const startMin = hours * 60 + minutes
        const durationMin = e.duration_seconds ? Math.round(e.duration_seconds / 60) : 30
        return {
          start: Math.max(startMin, bizStart * 60),
          end: Math.min(startMin + durationMin, bizEnd * 60),
        }
      })
      .filter(b => b.start < bizEnd * 60 && b.end > bizStart * 60)
      .sort((a, b) => a.start - b.start)

    // Calculate free slots
    const free: Array<{ start: number; end: number }> = []
    let cursor = bizStart * 60
    for (const b of busy) {
      if (b.start > cursor) free.push({ start: cursor, end: b.start })
      cursor = Math.max(cursor, b.end)
    }
    if (cursor < bizEnd * 60) free.push({ start: cursor, end: bizEnd * 60 })

    results.push({
      date: dateStr,
      meetings_count: meetings.length,
      free_slots: free
        .filter(s => s.end - s.start >= 15)
        .map(s => ({
          start_label: formatMin(s.start),
          end_label: formatMin(s.end),
          duration_min: s.end - s.start,
          start_time: `${String(Math.floor(s.start / 60)).padStart(2, '0')}:${String(s.start % 60).padStart(2, '0')}`,
          end_time: `${String(Math.floor(s.end / 60)).padStart(2, '0')}:${String(s.end % 60).padStart(2, '0')}`,
        })),
    })
  }

  return jsonResponse({ success: true, timezone: tz, results })
})
