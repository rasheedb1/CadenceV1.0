import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, RefreshCw, Loader2, Users } from 'lucide-react'
import {
  useAECalendarWeek,
  groupByDay,
  calcFreeSlots,
  getWeekDays,
  type CalendarEvent,
} from '@/hooks/useAECalendarWeek'
import { useAccountExecutive } from '@/contexts/AccountExecutiveContext'

const HOUR_START = 8   // 8am
const HOUR_END   = 20  // 8pm
const TOTAL_HOURS = HOUR_END - HOUR_START
const HOUR_HEIGHT = 64 // px per hour

const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function eventColor(event: CalendarEvent): string {
  // External meetings (has non-self attendees) = blue; internal = green; no attendees = gray
  const external = (event.participants || []).some(p => !p.is_self && p.status !== 'organizer')
  if (external) return 'bg-blue-500 border-blue-600'
  return 'bg-emerald-500 border-emerald-600'
}

function EventBlock({ event }: { event: CalendarEvent }) {
  const start = new Date(event.occurred_at)
  const startMinFromDayStart = (start.getHours() - HOUR_START) * 60 + start.getMinutes()
  const durationMin = event.duration_seconds ? Math.round(event.duration_seconds / 60) : 30
  const top = (startMinFromDayStart / 60) * HOUR_HEIGHT
  const height = Math.max((durationMin / 60) * HOUR_HEIGHT, 20)
  const isShort = height < 36

  return (
    <div
      className={`absolute left-0.5 right-0.5 rounded px-1.5 py-0.5 border-l-2 text-white overflow-hidden cursor-pointer hover:opacity-90 transition-opacity ${eventColor(event)}`}
      style={{ top: `${top}px`, height: `${height}px` }}
      title={`${event.title}\n${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${durationMin}min`}
    >
      <p className="text-[11px] font-semibold leading-tight truncate">{event.title}</p>
      {!isShort && (
        <p className="text-[10px] opacity-80 leading-tight">
          {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {durationMin < 60 ? ` · ${durationMin}m` : ` · ${Math.round(durationMin/60*10)/10}h`}
        </p>
      )}
      {!isShort && event.participants.length > 1 && (
        <p className="text-[10px] opacity-80 flex items-center gap-0.5 mt-0.5">
          <Users className="h-2.5 w-2.5" />
          {event.participants.filter(p => !p.is_self).length}
        </p>
      )}
    </div>
  )
}

function formatWeekLabel(days: Date[]): string {
  const first = days[0]
  const last = days[6]
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  if (first.getMonth() === last.getMonth()) {
    return `${first.toLocaleDateString(undefined, opts)} – ${last.getDate()}, ${first.getFullYear()}`
  }
  return `${first.toLocaleDateString(undefined, opts)} – ${last.toLocaleDateString(undefined, opts)}, ${last.getFullYear()}`
}

export function AccountExecutiveCalendar() {
  const navigate = useNavigate()
  const [anchorDate, setAnchorDate] = useState(new Date())
  const { syncCalendar, isSyncingCalendar } = useAccountExecutive()

  const { data: events = [], isLoading } = useAECalendarWeek(anchorDate)
  const byDay = groupByDay(events)
  const weekDays = getWeekDays(anchorDate)
  const todayStr = new Date().toISOString().slice(0, 10)

  const prevWeek = () => {
    const d = new Date(anchorDate)
    d.setDate(d.getDate() - 7)
    setAnchorDate(d)
  }
  const nextWeek = () => {
    const d = new Date(anchorDate)
    d.setDate(d.getDate() + 7)
    setAnchorDate(d)
  }
  const goToday = () => setAnchorDate(new Date())

  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => HOUR_START + i)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-3 border-b shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/account-executive')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">{formatWeekLabel(weekDays)}</h1>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={prevWeek}><ChevronLeft className="h-3.5 w-3.5" /></Button>
            <Button variant="outline" size="sm" onClick={goToday}>Today</Button>
            <Button variant="outline" size="sm" onClick={nextWeek}><ChevronRight className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => syncCalendar()} disabled={isSyncingCalendar}>
          {isSyncingCalendar
            ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Syncing...</>
            : <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Sync Calendar</>}
        </Button>
      </div>

      {/* ── Day header row ── */}
      <div className="grid border-b shrink-0" style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>
        <div className="border-r" /> {/* time gutter */}
        {weekDays.map((day, i) => {
          const iso = day.toISOString().slice(0, 10)
          const isToday = iso === todayStr
          const dayEvents = byDay[iso] || []
          return (
            <div key={iso} className={`px-2 py-2 border-r text-center ${isToday ? 'bg-primary/5' : ''}`}>
              <p className={`text-xs font-medium ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                {DAYS_SHORT[i]}
              </p>
              <p className={`text-lg font-bold leading-tight ${isToday ? 'text-primary' : ''}`}>
                {day.getDate()}
              </p>
              {dayEvents.length > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                  {dayEvents.length}
                </Badge>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Time grid ── */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid relative" style={{ gridTemplateColumns: '48px repeat(7, 1fr)', minHeight: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}>
            {/* Time labels */}
            <div className="border-r">
              {hours.map(h => (
                <div key={h} className="border-b" style={{ height: `${HOUR_HEIGHT}px` }}>
                  <span className="text-[10px] text-muted-foreground px-1 -mt-2 block">
                    {h === 12 ? '12pm' : h < 12 ? `${h}am` : `${h - 12}pm`}
                  </span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDays.map((day) => {
              const iso = day.toISOString().slice(0, 10)
              const isToday = iso === todayStr
              const dayEvents = byDay[iso] || []
              const freeSlots = calcFreeSlots(dayEvents)

              return (
                <div
                  key={iso}
                  className={`relative border-r ${isToday ? 'bg-primary/[0.03]' : ''}`}
                  style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}
                >
                  {/* Hour lines */}
                  {hours.map(h => (
                    <div key={h} className="border-b absolute left-0 right-0" style={{ top: `${(h - HOUR_START) * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }} />
                  ))}

                  {/* Free slot highlights */}
                  {freeSlots.map((slot, idx) => {
                    const topMin = slot.start - HOUR_START * 60
                    const heightMin = slot.end - slot.start
                    if (topMin < 0 || heightMin < 15) return null
                    return (
                      <div
                        key={idx}
                        className="absolute left-0.5 right-0.5 bg-green-50 border border-green-100 rounded opacity-60 pointer-events-none"
                        style={{
                          top: `${(topMin / 60) * HOUR_HEIGHT}px`,
                          height: `${(heightMin / 60) * HOUR_HEIGHT}px`,
                        }}
                      />
                    )
                  })}

                  {/* Events */}
                  {dayEvents.map(event => (
                    <EventBlock key={event.id} event={event} />
                  ))}

                  {/* Current time indicator */}
                  {isToday && (() => {
                    const now = new Date()
                    const minFromStart = (now.getHours() - HOUR_START) * 60 + now.getMinutes()
                    if (minFromStart < 0 || minFromStart > TOTAL_HOURS * 60) return null
                    return (
                      <div
                        className="absolute left-0 right-0 z-10 pointer-events-none"
                        style={{ top: `${(minFromStart / 60) * HOUR_HEIGHT}px` }}
                      >
                        <div className="flex items-center">
                          <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                          <div className="flex-1 border-t border-red-500" />
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Footer legend ── */}
      <div className="flex items-center gap-4 px-6 py-2 border-t text-[11px] text-muted-foreground shrink-0">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500 inline-block" /> External meeting</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> Internal meeting</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 border border-green-200 inline-block" /> Available slot</span>
        <span className="ml-auto">{events.length} meetings this week</span>
      </div>
    </div>
  )
}
