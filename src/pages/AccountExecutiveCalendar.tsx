import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  ChevronLeft, ChevronRight, RefreshCw, Loader2, Users, Globe,
  Plus, MapPin, Video, ExternalLink, Clock, Calendar, X, Mail,
} from 'lucide-react'
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
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

const HOUR_START = 0
const HOUR_END   = 24
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

function formatDuration(seconds: number | null): string {
  if (!seconds) return '30 min'
  const min = Math.round(seconds / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

// ── Event Detail Dialog ──────────────────────────────────────────────────────
function EventDetailDialog({ event, tz, onClose }: { event: CalendarEvent | null; tz: string; onClose: () => void }) {
  if (!event) return null
  const start = new Date(event.occurred_at)
  const end = event.duration_seconds ? new Date(start.getTime() + event.duration_seconds * 1000) : null
  const external = (event.participants || []).filter(p => !p.is_self && p.status !== 'organizer')
  const meetLink = event.raw_data?.meet_link
  const htmlLink = event.raw_data?.html_link
  const location = event.raw_data?.location

  return (
    <Dialog open={!!event} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-8 leading-snug">{event.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {/* Time */}
          <div className="flex items-start gap-2.5 text-muted-foreground">
            <Clock className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p>{formatTimeTZ(start, tz)}{end ? ` – ${formatTimeTZ(end, tz)}` : ''}</p>
              <p className="text-xs">{formatDuration(event.duration_seconds)}</p>
            </div>
          </div>

          {/* Location */}
          {location && (
            <div className="flex items-start gap-2.5 text-muted-foreground">
              <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
              <p>{location}</p>
            </div>
          )}

          {/* Google Meet */}
          {meetLink && (
            <div className="flex items-start gap-2.5 text-muted-foreground">
              <Video className="h-4 w-4 mt-0.5 shrink-0" />
              <a href={meetLink} target="_blank" rel="noopener noreferrer"
                className="text-primary hover:underline truncate">
                Google Meet
              </a>
            </div>
          )}

          {/* Participants */}
          {external.length > 0 && (
            <div className="flex items-start gap-2.5 text-muted-foreground">
              <Users className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="space-y-1">
                {external.map((p, i) => (
                  <p key={i} className="leading-tight">
                    {p.name}
                    {p.email && <span className="text-xs opacity-70 ml-1">({p.email})</span>}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {event.summary && (
            <p className="text-xs text-muted-foreground border-t pt-3 whitespace-pre-wrap line-clamp-4">
              {event.summary}
            </p>
          )}
        </div>

        <DialogFooter className="flex-row gap-2 justify-between">
          {htmlLink ? (
            <a href={htmlLink} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir en Google Calendar
              </Button>
            </a>
          ) : <div />}
          <Button size="sm" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Event Block ──────────────────────────────────────────────────────────────
function EventBlock({ event, tz, onClick }: { event: CalendarEvent; tz: string; onClick: (e: CalendarEvent) => void }) {
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
      onClick={() => onClick(event)}
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

// ── Create Event Dialog ──────────────────────────────────────────────────────
interface Attendee { email: string; name: string }

function CreateEventDialog({
  open, onClose, defaultDate, tz,
}: { open: boolean; onClose: () => void; defaultDate: string; tz: string }) {
  const { user, session } = useAuth()
  const { orgId } = useOrg()
  const qc = useQueryClient()

  const [title, setTitle] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  // Reset when opened
  useEffect(() => {
    if (open) {
      setTitle('')
      setDate(defaultDate)
      setStartTime('09:00')
      setEndTime('10:00')
      setDescription('')
      setLocation('')
      setAttendees([])
      setNewEmail('')
      setNewName('')
    }
  }, [open, defaultDate])

  const addAttendee = () => {
    const email = newEmail.trim()
    if (!email || !email.includes('@')) return
    if (attendees.some(a => a.email === email)) return
    setAttendees(prev => [...prev, { email, name: newName.trim() || email }])
    setNewEmail('')
    setNewName('')
  }

  const removeAttendee = (email: string) => {
    setAttendees(prev => prev.filter(a => a.email !== email))
  }

  const handleCreate = async () => {
    if (!title.trim() || !date || !startTime || !endTime) {
      toast.error('Completa título, fecha y horario')
      return
    }
    if (!user || !orgId || !session) {
      toast.error('No hay sesión activa')
      return
    }

    const startDatetime = `${date}T${startTime}:00`
    const endDatetime = `${date}T${endTime}:00`

    if (new Date(endDatetime) <= new Date(startDatetime)) {
      toast.error('La hora de fin debe ser después de la hora de inicio')
      return
    }

    setIsCreating(true)
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ae-calendar-create-event`
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          user_id: user.id,
          org_id: orgId,
          title: title.trim(),
          start_datetime: startDatetime,
          end_datetime: endDatetime,
          timezone: tz,
          description: description.trim() || undefined,
          location: location.trim() || undefined,
          attendees: attendees.length > 0 ? attendees : undefined,
        }),
      })
      const data = await resp.json()
      if (!data.success) throw new Error(data.error || 'Error al crear el evento')

      toast.success(`Evento creado${attendees.length > 0 ? ` · ${attendees.length} invitación(es) enviadas` : ''}`)
      qc.invalidateQueries({ queryKey: ['ae-calendar-week'] })
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear el evento')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Crear evento
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Title */}
          <div className="space-y-1.5">
            <Label>Título *</Label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Demo con empresa / Reunión interna..."
              autoFocus
            />
          </div>

          {/* Date & Times */}
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5 col-span-3 sm:col-span-1">
              <Label>Fecha *</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Inicio *</Label>
              <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Fin *</Label>
              <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              Ubicación
            </Label>
            <Input
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Sala de juntas / Link de Zoom..."
            />
          </div>

          {/* Attendees */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              Invitados
              {attendees.length > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">{attendees.length}</Badge>
              )}
            </Label>
            <div className="flex gap-1.5">
              <Input
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addAttendee()}
                placeholder="email@empresa.com"
                className="text-sm"
              />
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addAttendee()}
                placeholder="Nombre"
                className="text-sm w-28"
              />
              <Button type="button" variant="outline" size="icon" onClick={addAttendee} className="shrink-0">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {attendees.length > 0 && (
              <div className="space-y-1">
                {attendees.map(a => (
                  <div key={a.email} className="flex items-center justify-between text-sm bg-muted rounded px-2 py-1">
                    <span className="truncate">{a.name !== a.email ? `${a.name} · ` : ''}{a.email}</span>
                    <button onClick={() => removeAttendee(a.email)} className="text-muted-foreground hover:text-foreground ml-2 shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {attendees.length > 0 && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Video className="h-3 w-3" />
                Google Meet se generará automáticamente
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Descripción / Agenda</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Agenda de la reunión..."
              rows={3}
              className="text-sm resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isCreating}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={isCreating || !title.trim()}>
            {isCreating ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Creando...</> : 'Crear evento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Week label ────────────────────────────────────────────────────────────────
function formatWeekLabel(days: Date[]): string {
  const first = days[0]
  const last = days[6]
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  if (first.getMonth() === last.getMonth()) {
    return `${first.toLocaleDateString(undefined, opts)} – ${last.getDate()}, ${first.getFullYear()}`
  }
  return `${first.toLocaleDateString(undefined, opts)} – ${last.toLocaleDateString(undefined, opts)}, ${last.getFullYear()}`
}

// ── Main Calendar Component ──────────────────────────────────────────────────
export function AccountExecutiveCalendar() {
  const navigate = useNavigate()
  const [anchorDate, setAnchorDate] = useState(new Date())
  const [selectedTZ, setSelectedTZ] = useState<string>(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Mexico_City'
  )
  const { syncCalendar, isSyncingCalendar } = useAccountExecutive()
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const hasScrolled = useRef(false)

  const { data: events = [], isLoading } = useAECalendarWeek(anchorDate)
  const byDay = groupByDayTZ(events, selectedTZ)
  const weekDays = getWeekDays(anchorDate)
  const todayStr = localDateStrTZ(new Date(), selectedTZ)

  const prevWeek = () => { const d = new Date(anchorDate); d.setDate(d.getDate() - 7); setAnchorDate(d) }
  const nextWeek = () => { const d = new Date(anchorDate); d.setDate(d.getDate() + 7); setAnchorDate(d) }
  const goToday = () => setAnchorDate(new Date())

  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => HOUR_START + i)

  // Auto-scroll to current time (or 8am) on first render
  const scrollToCurrent = useCallback(() => {
    if (!scrollRef.current || hasScrolled.current) return
    const now = new Date()
    const { hours: nowH } = getTimeInTZ(now, selectedTZ)
    // Scroll to 1 hour before current time, or 7am minimum
    const targetHour = Math.max(nowH - 1, 7)
    const scrollTop = (targetHour - HOUR_START) * HOUR_HEIGHT
    scrollRef.current.scrollTop = scrollTop
    hasScrolled.current = true
  }, [selectedTZ])

  useEffect(() => {
    if (!isLoading) {
      // Small delay to ensure DOM is painted
      requestAnimationFrame(scrollToCurrent)
    }
  }, [isLoading, scrollToCurrent])

  // Reset scroll flag when timezone changes so we re-scroll
  useEffect(() => { hasScrolled.current = false }, [selectedTZ])

  // Today's free slots for footer
  const todayEvents = Object.values(byDay).flat().filter(e => localDateStrTZ(new Date(e.occurred_at), selectedTZ) === todayStr)
  const todayFreeSlots = calcFreeSlotsInTZ(todayEvents, selectedTZ)

  // Default date for create dialog (today or anchor week start)
  const defaultCreateDate = todayStr

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
            <Button variant="outline" size="sm" onClick={goToday}>Hoy</Button>
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
              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Sincronizando...</>
              : <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Sincronizar</>}
          </Button>
          <Button size="sm" onClick={() => setShowCreateDialog(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Crear evento
          </Button>
        </div>
      </div>

      {/* ── Day header row ── */}
      <div className="grid border-b shrink-0" style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>
        <div className="border-r" />
        {weekDays.map((day, i) => {
          const iso = localDateStr(day)
          const isoTZ = localDateStrTZ(day, selectedTZ)
          const isToday = isoTZ === todayStr
          const dayEvents = byDay[iso] || byDay[isoTZ] || []
          const freeCount = calcFreeSlotsInTZ(dayEvents, selectedTZ).length
          return (
            <div key={iso} className={`px-2 py-2 border-r text-center ${isToday ? 'bg-primary/5' : ''}`}>
              <p className={`text-xs font-medium ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                {DAYS_SHORT[i]}
              </p>
              <p className={`text-lg font-bold leading-tight ${isToday ? 'text-primary' : ''}`}>
                {day.getDate()}
              </p>
              <div className="flex items-center justify-center gap-1 mt-0.5">
                {dayEvents.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                    {dayEvents.length}
                  </Badge>
                )}
                {freeCount > 0 && (
                  <Badge className="text-[10px] px-1 py-0 h-4 bg-green-100 text-green-700 border-0 hover:bg-green-100">
                    {freeCount} libre{freeCount !== 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Time grid ── */}
      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
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
                    <EventBlock key={event.id} event={event} tz={selectedTZ} onClick={setSelectedEvent} />
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
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500 inline-block" /> Reunión externa</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> Reunión interna</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 border border-green-200 inline-block" /> Disponible</span>
        {todayFreeSlots.length > 0 && (
          <span className="flex items-center gap-1 text-green-700">
            · Hoy tienes {todayFreeSlots.length} slot{todayFreeSlots.length !== 1 ? 's' : ''} libre{todayFreeSlots.length !== 1 ? 's' : ''}
          </span>
        )}
        <span className="ml-auto">{events.length} reuniones esta semana</span>
      </div>

      {/* ── Dialogs ── */}
      <EventDetailDialog
        event={selectedEvent}
        tz={selectedTZ}
        onClose={() => setSelectedEvent(null)}
      />
      <CreateEventDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        defaultDate={defaultCreateDate}
        tz={selectedTZ}
      />
    </div>
  )
}
