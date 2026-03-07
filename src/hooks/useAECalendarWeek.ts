import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'

export interface CalendarEvent {
  id: string
  title: string
  occurred_at: string      // ISO — start time
  duration_seconds: number | null
  participants: Array<{ name: string; email: string | null; is_self?: boolean; status?: string }>
  summary: string | null
  raw_data: { location?: string | null; calendar_id?: string; html_link?: string | null; status?: string | null } | null
}

function getWeekBounds(anchorDate: Date): { start: Date; end: Date } {
  const d = new Date(anchorDate)
  const day = d.getDay() // 0=Sun
  const diffToMon = day === 0 ? -6 : 1 - day
  const mon = new Date(d)
  mon.setDate(d.getDate() + diffToMon)
  mon.setHours(0, 0, 0, 0)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  sun.setHours(23, 59, 59, 999)
  return { start: mon, end: sun }
}

export function useAECalendarWeek(anchorDate: Date) {
  const { user } = useAuth()
  const { orgId } = useOrg()
  const { start, end } = getWeekBounds(anchorDate)

  return useQuery({
    queryKey: ['ae-calendar-week', orgId, user?.id, start.toISOString()],
    queryFn: async () => {
      if (!user || !orgId) return []
      const { data, error } = await supabase
        .from('ae_activities')
        .select('id, title, occurred_at, duration_seconds, participants, summary, raw_data')
        .eq('user_id', user.id)
        .eq('type', 'meeting')
        .eq('source', 'google_calendar')
        .gte('occurred_at', start.toISOString())
        .lte('occurred_at', end.toISOString())
        .order('occurred_at', { ascending: true })
      if (error) throw error
      return (data || []) as CalendarEvent[]
    },
    enabled: !!user && !!orgId,
  })
}

/** Group events by local date string (YYYY-MM-DD) */
export function groupByDay(events: CalendarEvent[]): Record<string, CalendarEvent[]> {
  const map: Record<string, CalendarEvent[]> = {}
  for (const e of events) {
    const d = new Date(e.occurred_at)
    // Use LOCAL date to avoid UTC-midnight boundary mismatches
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!map[key]) map[key] = []
    map[key].push(e)
  }
  return map
}

/** Get local YYYY-MM-DD string for a Date (avoids UTC offset issues) */
export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Calculate free slots in business hours (9-18) for a list of events on one day */
export function calcFreeSlots(events: CalendarEvent[], businessStart = 9, businessEnd = 18): Array<{ start: number; end: number }> {
  if (!events.length) return [{ start: businessStart * 60, end: businessEnd * 60 }]

  // Build busy intervals in minutes since midnight
  const busy = events
    .map(e => {
      const s = new Date(e.occurred_at)
      const startMin = s.getHours() * 60 + s.getMinutes()
      const durationMin = e.duration_seconds ? Math.round(e.duration_seconds / 60) : 30
      const endMin = startMin + durationMin
      return { start: Math.max(startMin, businessStart * 60), end: Math.min(endMin, businessEnd * 60) }
    })
    .filter(b => b.start < businessEnd * 60 && b.end > businessStart * 60)
    .sort((a, b) => a.start - b.start)

  const free: Array<{ start: number; end: number }> = []
  let cursor = businessStart * 60

  for (const b of busy) {
    if (b.start > cursor) free.push({ start: cursor, end: b.start })
    cursor = Math.max(cursor, b.end)
  }
  if (cursor < businessEnd * 60) free.push({ start: cursor, end: businessEnd * 60 })

  return free.filter(s => s.end - s.start >= 15) // min 15min slot
}

export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}:${m.toString().padStart(2, '0')}`
}

export function getWeekDays(anchorDate: Date): Date[] {
  const { start } = getWeekBounds(anchorDate)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}
