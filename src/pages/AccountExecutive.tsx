import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
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
  Clock, ChevronRight, Building2, Star, Loader2
} from 'lucide-react'
import { useAEAccounts, useAEAccountMutations } from '@/hooks/useAEAccounts'
import { useAERecentActivities } from '@/hooks/useAEActivities'
import { useAEReminders, useAEReminderMutations } from '@/hooks/useAEReminders'
import { useAccountExecutive } from '@/contexts/AccountExecutiveContext'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import type { AEAccountStage } from '@/types/account-executive'
import { useAECalendarWeek, groupByDay, calcFreeSlots, getWeekDays } from '@/hooks/useAECalendarWeek'
import { AE_STAGE_LABELS, AE_STAGE_COLORS, healthScoreBg, healthScoreColor } from '@/types/account-executive'

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
          <DialogTitle>New Account</DialogTitle>
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
              <Label>Renewal Date</Label>
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
          <Button variant="outline" onClick={onClose}>Cancel</Button>
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
  const { session } = useAuth()
  const callbackProcessed = useRef(false)
  const { data: accounts = [], isLoading: loadingAccounts } = useAEAccounts()
  const { data: recentActivities = [], isLoading: loadingActivities } = useAERecentActivities(15)
  const { data: reminders = [] } = useAEReminders()
  const { completeReminder } = useAEReminderMutations()
  const { syncGong, isSyncingGong } = useAccountExecutive()
  const [showNewAccount, setShowNewAccount] = useState(false)

  // ── Handle Google Calendar OAuth callback ──────────────────────────────────
  useEffect(() => {
    if (callbackProcessed.current) return
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const calendarParam = params.get('calendar')
    const state = params.get('state')
    if (!code || calendarParam !== 'connected') return

    callbackProcessed.current = true
    window.history.replaceState({}, '', '/account-executive')

    if (!session?.access_token) return
    const token = session.access_token

    toast.loading('Connecting Google Calendar...')
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ae-google-callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code, state }),
    })
      .then(r => r.json())
      .then(result => {
        toast.dismiss()
        if (result.error) {
          toast.error('Google Calendar failed: ' + result.error)
        } else {
          toast.success('Google Calendar connected' + (result.email ? ' as ' + result.email : '') + '!')
          // Auto-sync calendar events after connecting
          fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ae-calendar-sync`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {/* silent - sync can be retried manually */})
        }
      })
      .catch(() => { toast.dismiss(); toast.error('Google Calendar connection failed') })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token])

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
  const { data: weekEvents = [] } = useAECalendarWeek(today)
  const weekDays = getWeekDays(today)
  const weekByDay = groupByDay(weekEvents)
  const todayStr = today.toISOString().slice(0, 10)

  // Today's calendar events — derived from already-fetched weekEvents
  const todayMeetings = (weekByDay[todayStr] || [])

  const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <div className="p-8 space-y-6">
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
            <div className="text-2xl font-bold">{accounts.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Total Accounts</p>
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
            <p className="text-xs text-muted-foreground mt-1">Renewals this month</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">{pendingReminders}</div>
            <p className="text-xs text-muted-foreground mt-1">Pending Reminders</p>
          </CardContent>
        </Card>
      </div>

      {/* Weekly Availability */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-500" />
              This Week
              <Badge variant="secondary" className="text-xs ml-1">{weekEvents.length} meetings</Badge>
            </CardTitle>
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
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-7 gap-1.5">
            {weekDays.map((day, i) => {
              const iso = day.toISOString().slice(0, 10)
              const isToday = iso === todayStr
              const dayEvents = weekByDay[iso] || []
              const freeSlots = calcFreeSlots(dayEvents)
              const freeMinutes = freeSlots.reduce((sum, s) => sum + (s.end - s.start), 0)
              const freeHours = Math.round(freeMinutes / 60 * 10) / 10

              return (
                <div
                  key={iso}
                  className={`rounded-lg border p-2 cursor-pointer hover:bg-muted/50 transition-colors ${isToday ? 'border-primary/40 bg-primary/5' : 'border-border'}`}
                  onClick={() => navigate('/account-executive/calendar')}
                >
                  {/* Day header */}
                  <p className={`text-[10px] font-medium text-center ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                    {DAYS_SHORT[i]}
                  </p>
                  <p className={`text-sm font-bold text-center mb-2 ${isToday ? 'text-primary' : ''}`}>
                    {day.getDate()}
                  </p>

                  {/* Meeting blocks (mini timeline) */}
                  <div className="space-y-0.5 min-h-[40px]">
                    {dayEvents.slice(0, 3).map(event => {
                      const start = new Date(event.occurred_at)
                      const hasExternal = (event.participants || []).some(p => !p.is_self && p.status !== 'organizer')
                      return (
                        <div
                          key={event.id}
                          className={`rounded px-1 py-0.5 text-[9px] font-medium text-white truncate ${hasExternal ? 'bg-blue-500' : 'bg-emerald-500'}`}
                          title={event.title}
                        >
                          {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} {event.title}
                        </div>
                      )
                    })}
                    {dayEvents.length > 3 && (
                      <p className="text-[9px] text-muted-foreground text-center">+{dayEvents.length - 3} more</p>
                    )}
                    {dayEvents.length === 0 && (
                      <p className="text-[9px] text-muted-foreground text-center py-1">Free</p>
                    )}
                  </div>

                  {/* Available time badge */}
                  <div className={`mt-1.5 rounded text-center py-0.5 text-[9px] font-semibold ${
                    freeHours >= 4 ? 'bg-green-100 text-green-700' :
                    freeHours >= 2 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-50 text-red-600'
                  }`}>
                    {freeHours}h free
                  </div>
                </div>
              )
            })}
          </div>
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
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              My Accounts
              {loadingAccounts && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {accounts.length === 0 && !loadingAccounts ? (
              <div className="px-6 pb-6 text-center">
                <Building2 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No accounts yet</p>
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
    </div>
  )
}
