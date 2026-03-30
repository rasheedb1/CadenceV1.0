import { PageTransition } from '@/components/PageTransition'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'
import {
  Plus, RefreshCw, Phone, Mail, Calendar, Bell,
  Clock, ChevronLeft, ChevronRight, Building2, Star, Loader2, Settings, Copy, Globe
} from 'lucide-react'
import { useAEAccounts, useAEAccountMutations } from '@/hooks/useAEAccounts'
import { useAERecentActivities } from '@/hooks/useAEActivities'
import { useAEReminders, useAEReminderMutations } from '@/hooks/useAEReminders'
import { useAccountExecutive } from '@/contexts/AccountExecutiveContext'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import type { AEAccountStage } from '@/types/account-executive'
import {
  useAECalendarWeek, groupByDayTZ, calcFreeSlotsInTZ,
  getWeekDays, localDateStr, localDateStrTZ, type CalendarEvent,
} from '@/hooks/useAECalendarWeek'
import { AE_STAGE_LABELS, AE_STAGE_COLORS, healthScoreBg, healthScoreColor } from '@/types/account-executive'

// ── Timezone options ───────────────────────────────────────────────
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

const DAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function formatDateES(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  return `${DAYS_ES[d.getDay()]} ${day} de ${MONTHS_ES[month - 1]}`
}

function minsTo12h(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`
}

function buildCopyText(
  days: string[],
  weekByDay: Record<string, CalendarEvent[]>,
  tz: string,
  tzAbbr: string,
): string {
  const sections: string[] = []
  for (const dayStr of [...days].sort()) {
    const freeSlots = calcFreeSlotsInTZ(weekByDay[dayStr] || [], tz)
    if (freeSlots.length === 0) continue
    const lines = [formatDateES(dayStr)]
    let optNum = 1
    for (const s of freeSlots) {
      for (let t = s.start; t < s.end; t += 30) {
        lines.push(`- Opción ${optNum++}: ${minsTo12h(t)} ${tzAbbr}`)
      }
    }
    sections.push(lines.join('\n'))
  }
  return sections.join('\n\n')
}

interface SFAccount {
  sf_account_id: string
  name: string
  website: string | null
  industry: string | null
  latest_opportunity_stage: string | null
  latest_opportunity_name: string | null
  total_pipeline_value: number
  active_opportunities_count: number
  has_active_opportunities: boolean
}

function useSFOwnerAccounts(sfOwnerName: string | null) {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: ['sf-owner-accounts', orgId, sfOwnerName],
    queryFn: async () => {
      if (!orgId || !sfOwnerName) return []
      const { data, error } = await supabase
        .from('salesforce_accounts')
        .select('sf_account_id, name, website, industry, latest_opportunity_stage, latest_opportunity_name, total_pipeline_value, active_opportunities_count, has_active_opportunities')
        .eq('org_id', orgId)
        .ilike('opp_owner_name', sfOwnerName)
        .order('total_pipeline_value', { ascending: false })
      if (error) throw error
      return (data || []) as SFAccount[]
    },
    enabled: !!orgId && !!sfOwnerName,
  })
}

// ── Health Score Ring ──────────────────────────────────────────────
function HealthRing({ score }: { score: number }) {
  const color = healthScoreBg(score)
  return (
    <div className="relative w-10 h-10 flex items-center justify-center">
      <div className={`w-10 h-10 rounded-full ${color} opacity-20 absolute inset-0`} />
      <span className={`text-xs font-bold ${healthScoreColor(score)}`}>{score}</span>
    </div>
  )
}

// ── Activity source icon ──────────────────────────────────────────────
function ActivityIcon({ source }: { source: string }) {
  if (source === 'gong') return <Phone className="h-3.5 w-3.5 text-orange-500" />
  if (source === 'gmail') return <Mail className="h-3.5 w-3.5 text-blue-500" />
  if (source === 'google_calendar') return <Calendar className="h-3.5 w-3.5 text-green-500" />
  return <Building2 className="h-3.5 w-3.5 text-gray-400" />
}

// ── Format date helper ──────────────────────────────────────────────
function formatRelative(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  const diffH = Math.round(diffMs / (1000 * 60 * 60))
  if (diffH < 0 && diffH > -24) return `${Math.abs(diffH)}h ago`
  if (diffH >= 0 && diffH < 24) return `in ${diffH}h`
  return d.toLocaleDateString()
}

// ── New Account Dialog ──────────────────────────────────────────────
function NewAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createAccount } = useAEAccountMutations()
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [industry, setIndustry] = useState('')
  const [contractValue, setContractValue] = useState('')
  const [renewalDate, setRenewalDate] = useState('')
  const [stage, setStage] = useState<AEAccountStage>('active')
  const [saving, setSaving] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await createAccount.mutateAsync({
        name: name.trim(),
        domain: domain.trim() || undefined,
        industry: industry.trim() || undefined,
        contract_value: contractValue ? parseFloat(contractValue) : undefined,
        renewal_date: renewalDate || undefined,
        stage,
      })
      onClose()
      setName(''); setDomain(''); setIndustry(''); setContractValue(''); setRenewalDate('')
      setStage('active')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Nueva Cuenta</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Account Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Acme Corp" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Domain</Label>
              <Input value={domain} onChange={e => setDomain(e.target.value)} placeholder="acme.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Industry</Label>
              <Input value={industry} onChange={e => setIndustry(e.target.value)} placeholder="SaaS" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Contract Value (USD)</Label>
              <Input type="number" value={contractValue} onChange={e => setContractValue(e.target.value)} placeholder="50000" />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha de Renovación</Label>
              <Input type="date" value={renewalDate} onChange={e => setRenewalDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Stage</Label>
            <Select value={stage} onValueChange={v => setStage(v as AEAccountStage)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(AE_STAGE_LABELS) as [AEAccountStage, string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={!name.trim() || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Main Page ───────────────────────────────────────────────────────────────
export function AccountExecutive() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: accounts = [], isLoading: loadingAccounts } = useAEAccounts()
  const { data: recentActivities = [], isLoading: loadingActivities } = useAERecentActivities(15)
  const { data: reminders = [] } = useAEReminders()
  const { completeReminder } = useAEReminderMutations()
  const { syncGong, isSyncingGong, syncCalendar, isSyncingCalendar } = useAccountExecutive()
  const [showNewAccount, setShowNewAccount] = useState(false)
  const [calAnchor, setCalAnchor] = useState(new Date())
  const [selectedTZ, setSelectedTZ] = useState<string>(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Mexico_City')
  const [selectedDays, setSelectedDays] = useState<string[]>([])

  // Load sales profile to get sf_owner_name
  const [sfOwnerName, setSfOwnerName] = useState<string | null>(null)
  const [jobRole, setJobRole] = useState<string | null>(null)
  useEffect(() => {
    if (!user?.id) return
    supabase
      .from('profiles')
      .select('sf_owner_name, job_role')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setSfOwnerName(data.sf_owner_name || null)
          setJobRole(data.job_role || null)
        }
      })
  }, [user?.id])

  const { data: sfAccounts = [], isLoading: loadingSF } = useSFOwnerAccounts(sfOwnerName)

  // ── Derived stats ──────────────────────────────────────────────────────────
  const atRisk = accounts.filter(a => a.stage === 'at_risk').length
  const thisMonth = accounts.filter(a => {
    if (!a.renewal_date) return false
    const d = new Date(a.renewal_date)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length
  const pendingReminders = reminders.length

  // Upcoming 48h reminders
  const urgentReminders = reminders.filter(r => {
    const due = new Date(r.due_at)
    const h48 = new Date(Date.now() + 48 * 60 * 60 * 1000)
    return due <= h48
  })

  // Weekly calendar data
  const today = new Date()
  const { data: weekEvents = [] } = useAECalendarWeek(calAnchor)
  const weekDays = getWeekDays(calAnchor)
  const weekByDay = groupByDayTZ(weekEvents, selectedTZ)
  const todayStr = localDateStrTZ(today, selectedTZ)

  // Today's calendar events — derived from already-fetched weekEvents
  const todayMeetings = (weekByDay[todayStr] || [])

  const prevWeek = () => { const d = new Date(calAnchor); d.setDate(d.getDate() - 7); setCalAnchor(d); setSelectedDays([]) }
  const nextWeek = () => { const d = new Date(calAnchor); d.setDate(d.getDate() + 7); setCalAnchor(d); setSelectedDays([]) }
  const goToday = () => { setCalAnchor(new Date()); setSelectedDays([]) }

  const tzOption = TIMEZONE_OPTIONS.find(o => o.value === selectedTZ) || TIMEZONE_OPTIONS[0]

  const toggleDay = (iso: string) => {
    setSelectedDays(prev => prev.includes(iso) ? prev.filter(d => d !== iso) : [...prev, iso])
  }

  const handleCopyAvailability = () => {
    const text = buildCopyText(selectedDays, weekByDay, selectedTZ, tzOption.abbr)
    if (!text) { toast.error('No hay horarios disponibles en los días seleccionados'); return }
    navigator.clipboard.writeText(text).then(() => toast.success('Horarios copiados al portapapeles'))
  }

  const DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

  return (
    <PageTransition className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight font-heading flex items-center gap-2">
            <Star className="h-7 w-7 text-yellow-500" />
            Account Executive
          </h1>
          <p className="text-muted-foreground mt-1">Manage your accounts, activities, and follow-ups</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => syncGong()}
            disabled={isSyncingGong}
          >
            {isSyncingGong ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Sync Gong
          </Button>
          <Button onClick={() => setShowNewAccount(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Account
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {jobRole === 'bdm' ? (
                loadingSF ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : sfAccounts.length
              ) : accounts.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Total Accounts</p>
            {jobRole === 'bdm' && !sfOwnerName && (
              <p className="text-[10px] text-orange-500 mt-0.5">Configura el nombre de Salesforce en Configuración</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">{atRisk}</div>
            <p className="text-xs text-muted-foreground mt-1">At Risk</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-orange-600">{thisMonth}</div>
            <p className="text-xs text-muted-foreground mt-1">Renovaciones este mes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">{pendingReminders}</div>
            <p className="text-xs text-muted-foreground mt-1">Recordatorios Pendientes</p>
          </CardContent>
        </Card>
      </div>

      {/* Weekly Availability */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-500" />
                {weekDays[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – {weekDays[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                <Badge variant="secondary" className="text-xs ml-1">{weekEvents.length} meetings</Badge>
              </CardTitle>
              <div className="flex items-center gap-0.5">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={prevWeek}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={goToday} title="Today"><span className="text-[10px] font-semibold">T</span></Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={nextWeek}><ChevronRight className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* Timezone selector */}
              <Select value={selectedTZ} onValueChange={setSelectedTZ}>
                <SelectTrigger className="h-7 w-auto text-[11px] gap-1 border-border/60 bg-transparent pr-2">
                  <Globe className="h-3 w-3 text-muted-foreground" />
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
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground h-7 px-2"
                onClick={() => syncCalendar()}
                disabled={isSyncingCalendar}
              >
                {isSyncingCalendar ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground gap-1"
                onClick={() => navigate('/account-executive/calendar')}
              >
                Full calendar
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-[10px] text-muted-foreground mb-2">Haz clic en un día para seleccionarlo y copiar tu disponibilidad</p>
          <div className="grid grid-cols-7 gap-1.5">
            {weekDays.map((day, i) => {
              const iso = localDateStr(day)
              const isToday = iso === todayStr
              const isSelected = selectedDays.includes(iso)
              const dayEvents = weekByDay[iso] || []
              const freeSlots = calcFreeSlotsInTZ(dayEvents, selectedTZ)

              return (
                <div
                  key={iso}
                  className={`rounded-lg border p-2 cursor-pointer transition-colors ${
                    isSelected
                      ? 'border-primary ring-2 ring-primary/30 bg-primary/8'
                      : isToday
                      ? 'border-primary/40 bg-primary/5 hover:bg-primary/10'
                      : 'border-border hover:bg-muted/50'
                  }`}
                  onClick={() => toggleDay(iso)}
                >
                  {/* Day header */}
                  <p className={`text-[10px] font-medium text-center ${isToday || isSelected ? 'text-primary' : 'text-muted-foreground'}`}>
                    {DAYS_SHORT[i]}
                  </p>
                  <p className={`text-sm font-bold text-center mb-2 ${isToday || isSelected ? 'text-primary' : ''}`}>
                    {day.getDate()}
                  </p>

                  {/* Free time slot ranges */}
                  {freeSlots.length > 0 ? (
                    <div className="mt-1.5 space-y-0.5">
                      {freeSlots.slice(0, 2).map((s, si) => (
                        <div key={si} className="rounded bg-green-100 text-green-700 text-[8px] font-semibold text-center py-0.5 px-1 truncate">
                          {minsTo12h(s.start)}–{minsTo12h(s.end)}
                        </div>
                      ))}
                      {freeSlots.length > 2 && (
                        <div className="text-[8px] text-muted-foreground text-center">+{freeSlots.length - 2} más</div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-1.5 rounded text-center py-0.5 text-[9px] font-semibold bg-red-50 text-red-600">
                      Busy
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Copy availability panel */}
          {selectedDays.length > 0 && (
            <div className="mt-3 p-3 bg-primary/5 rounded-lg border border-primary/20 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {selectedDays.length} día{selectedDays.length > 1 ? 's' : ''} seleccionado{selectedDays.length > 1 ? 's' : ''} · {tzOption.abbr}
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => setSelectedDays([])}>
                  Limpiar
                </Button>
                <Button size="sm" className="text-xs h-7 gap-1" onClick={handleCopyAvailability}>
                  <Copy className="h-3 w-3" />
                  Copiar disponibilidad
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main 3-column grid */}
      <div className="grid grid-cols-3 gap-6">

        {/* LEFT: Today */}
        <div className="space-y-4">
          {/* Meetings */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4 text-green-500" />
                Today's Meetings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {todayMeetings.length === 0 ? (
                <p className="text-xs text-muted-foreground">No meetings today</p>
              ) : (
                todayMeetings.map(m => (
                  <div key={m.id} className="flex items-start gap-2">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{m.title}</p>
                      <p className="text-xs text-muted-foreground">{formatRelative(m.occurred_at)}</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Urgent Reminders */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bell className="h-4 w-4 text-orange-500" />
                Upcoming Reminders
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {urgentReminders.length === 0 ? (
                <p className="text-xs text-muted-foreground">No urgent reminders</p>
              ) : (
                urgentReminders.slice(0, 5).map(r => (
                  <div key={r.id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{r.title}</p>
                      <p className="text-xs text-muted-foreground">Due {formatRelative(r.due_at)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => completeReminder.mutate(r.id)}
                    >
                      ✓
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* CENTER: My Accounts */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3 shrink-0">
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              My Accounts
              {(loadingAccounts || loadingSF) && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-y-auto max-h-[480px]">
            {/* BDM/AE: show Salesforce accounts */}
            {jobRole === 'bdm' ? (
              sfOwnerName ? (
                sfAccounts.length === 0 && !loadingSF ? (
                  <div className="px-6 pb-6 text-center">
                    <Building2 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Sin cuentas activas de Salesforce para "{sfOwnerName}"</p>
                    <p className="text-xs text-muted-foreground mt-1">Sync Salesforce or check your name in Settings</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {sfAccounts.map(acc => (
                      <div
                        key={acc.sf_account_id}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{acc.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {acc.industry || acc.website || '—'}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {acc.latest_opportunity_stage && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {acc.latest_opportunity_stage}
                            </Badge>
                          )}
                          {acc.total_pipeline_value > 0 && (
                            <p className="text-[10px] text-muted-foreground">
                              ${acc.total_pipeline_value.toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div className="px-6 pb-6 text-center py-8">
                  <Settings className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Set your Salesforce name to see your accounts</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate('/settings')}>
                    Go to Settings
                  </Button>
                </div>
              )
            ) : (
              /* SDR or no role: show manual ae_accounts */
              accounts.length === 0 && !loadingAccounts ? (
                <div className="px-6 pb-6 text-center">
                  <Building2 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Sin cuentas aún</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowNewAccount(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Account
                  </Button>
                </div>
              ) : (
                <div className="divide-y">
                  {accounts.map(acc => (
                    <div
                      key={acc.id}
                      className="flex items-center gap-3 px-6 py-3 hover:bg-muted/40 cursor-pointer transition-colors"
                      onClick={() => navigate(`/account-executive/${acc.id}`)}
                    >
                      <HealthRing score={acc.health_score} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{acc.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {acc.domain || acc.industry || '—'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="secondary" className={`text-xs ${AE_STAGE_COLORS[acc.stage]}`}>
                          {AE_STAGE_LABELS[acc.stage]}
                        </Badge>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </CardContent>
        </Card>

        {/* RIGHT: Recent Activity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Recent Activity
              {loadingActivities && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentActivities.length === 0 && !loadingActivities ? (
              <p className="text-xs text-muted-foreground">No activity yet. Sync Gong to import calls.</p>
            ) : (
              recentActivities.slice(0, 10).map(a => (
                <div key={a.id} className="flex items-start gap-2">
                  <ActivityIcon source={a.source} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{formatRelative(a.occurred_at)}</p>
                  </div>
                  {a.action_items.length > 0 && (
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {a.action_items.length} items
                    </Badge>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* New Account Dialog */}
      <NewAccountDialog open={showNewAccount} onClose={() => setShowNewAccount(false)} />
    </PageTransition>
  )
}
