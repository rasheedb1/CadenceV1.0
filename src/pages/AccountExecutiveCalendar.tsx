import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronLeft, ChevronRight, RefreshCw, Loader2, Users, Globe } from 'lucide-react'
import {
  useAECalendarWeek,
  groupByDayTZ,
  calcFreeSlotsInTZ,
  getWeekDays,
  localDateStr,
  localDateStrTZ,
  getTimeInTZ,
  formatTimeTZ,
  type CalendarEvent,
} from '@/hooks/useAECalendarWeek'
import { useAccountExecutive } from '@/contexts/AccountExecutiveContext'

const HOUR_START = 0   // midnight
const HOUR_END   = 24  // midnight
const TOTAL_HOURS = HOUR_END - HOUR_START
const HOUR_HEIGHT = 64 // px per hour

const DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const TIMEZONE_OPTIONS = [
  { value: 'America/Mexico_City',  label: 'Ciudad de México', abbr: 'GMT-6' },
  { value: 'America/New_York',     label: 'Eastern Time',     abbr: 'ET'    },
  { value: 'America/Chicago',      label: 'Central Time',     abbr: 'CT'    },
  { value: 'America/Denver',       label: 'Mountain Time',    abbr: 'MT'    },
  { value: 'America/Los_Angeles',  label: 'Pacific Time',     abbr: 'PT'    },
  { value: 'America/Bogota',       label: 'Colombia',         abbr: 'COT'   },
  { value: 'America/Lima',         label: 'Perú',             abbr: 'PET'   },
  { value: 'America/Santiago',     label: 'Chile',            abbr: 'CLT'   },
  { value: 'America/Buenos_Aires', label: 'Argentina',        abbr: 'ART'   },
  { value: 'America/Sao_Paulo',    label: 'São Paulo',        abbr: 'BRT'   },
  { value: 'Europe/London',        label: 'London',           abbr: 'GMT'   },
  { value: 'Europe/Madrid',        label: 'Madrid',           abbr: 'CET'   },
  { value: 'UTC',                  label: 'UTC',              abbr: 'UTC'   },
]

function eventColor(event: CalendarEvent): string {
  const external = (event.participants || []).some(p => !p.is_self && p.status !== 'organizer')
  if (external) return 'bg-blue-500 border-blue-600'
  return 'bg-emerald-500 border-emerald-600'
}

function EventBlock({ event, tz }: { event: CalendarEvent; tz: string }) {
  const start = new Date(event.occurred_at)
  const { hours, minutes } = getTimeInTZ(start, tz)
  const startMinFromDayStart = (hours - HOUR_START) * 60 + minutes
  const durationMin = event.duration_seconds ? Math.round(event.duration_seconds / 60) : 30
  const top = (startMinFromDayStart / 60) * HOUR_HEIGHT
  const height = Math.max((durationMin / 60) * HOUR_HEIGHT, 20)
  const isShort = height < 36

  return (
    <div
      className={`absolute left-0.5 right-0.5 rounded px-1.5 py-0.5 border-l-2 text-white overflow-hidden cursor-pointer hover:opacity-90 transition-opacity ${eventColor(event)}`}
      style={{ top: `${top}px`, height: `${height}px` }}
      title={`${event.title}\n${formatTimeTZ(start, tz)} · ${durationMin}min`}
    >
      <p className="text-[11px] font-semibold leading-tight truncate">{event.title}</p>
      {!isShort && (
        <p className="text-[10px] opacity-80 leading-tight">
          {formatTimeTZ(start, tz)}
          {durationMin < 60 ? ` · ${durationMin}m` : ` · ${Math.round(durationMin / 60 * 10) / 10}h`}
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
  const [selectedTZ, setSelectedTZ] = useState<string>(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Mexico_City'
  )
  const { syncCalendar, isSyncingCalendar } = useAccountExecutive()

  const { data: events = [], isLoading } = useAECalendarWeek(anchorDate)
  const byDay = groupByDayTZ(events, selectedTZ)
  const weekDays = getWeekDays(anchorDate)
  const todayStr = localDateStrTZ(new Date(), selectedTZ)

  const prevWeek = () => { const d = new Date(anchorDate); d.setDate(d.getDate() - 7); setAnchorDate(d) }
  const nextWeek = () => { const d = new Date(anchorDate); d.setDate(d.getDate() + 7); setAnchorDate(d) }
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
        <div className="flex items-center gap-2">
          {/* Timezone selector */}
          <Select value={selectedTZ} onValueChange={setSelectedTZ}>
            <SelectTrigger className="h-8 w-auto text-xs gap-1">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONE_OPTIONS.map(tz => (
                <SelectItem key={tz.value} value={tz.value} className="text-xs">
                  {tz.label} ({tz.abbr})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => syncCalendar()} disabled={isSyncingCalendar}>
            {isSyncingCalendar
              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Syncing...</>
              : <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Sync Calendar</>}
          </Button>
        </div>
      </div>

      {/* ── Day header row ── */}
      <div className="grid border-b shrink-0" style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>
        <div className="border-r" /> {/* time gutter */}
        {weekDays.map((day, i) => {
          const iso = localDateStr(day)
          const isoTZ = localDateStrTZ(day, selectedTZ)
          const isToday = isoTZ === todayStr
          const dayEvents = byDay[iso] || byDay[isoTZ] || []
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
                    {h === 0 ? '12am' : h === 12 ? '12pm' : h < 12 ? `${h}am` : `${h - 12}pm`}
                  </span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDays.map((day) => {
              const iso = localDateStr(day)
              const isoTZ = localDateStrTZ(day, selectedTZ)
              const isToday = isoTZ === todayStr
              const dayEvents = byDay[iso] || byDay[isoTZ] || []
              const freeSlots = calcFreeSlotsInTZ(dayEvents, selectedTZ)

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
                    <EventBlock key={event.id} event={event} tz={selectedTZ} />
                  ))}

                  {/* Current time indicator */}
                  {isToday && (() => {
                    const now = new Date()
                    const { hours: nowH, minutes: nowM } = getTimeInTZ(now, selectedTZ)
                    const minFromStart = (nowH - HOUR_START) * 60 + nowM
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
