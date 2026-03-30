import { useState, useMemo } from 'react'
import { PageTransition } from '@/components/PageTransition'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  MessageSquare, UserPlus, ThumbsUp, MessageCircle, Mail, Phone, PhoneCall,
  ClipboardList, Clock, CheckCircle, XCircle, RefreshCw, Filter, Send,
  AlertTriangle, Search, ChevronDown, X, Reply, Eye,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { supabase } from '@/integrations/supabase/client'
import type { StepType } from '@/types'

// ─── Step icons ───────────────────────────────────────────────────────────────
const STEP_ICONS: Record<StepType, React.ComponentType<{ className?: string }>> = {
  linkedin_message: MessageSquare,
  linkedin_connect: UserPlus,
  linkedin_like: ThumbsUp,
  linkedin_comment: MessageCircle,
  send_email: Mail,
  email_reply: Reply,
  whatsapp: Phone,
  cold_call: PhoneCall,
  task: ClipboardList,
  linkedin_profile_view: Eye,
}

const STEP_LABELS: Record<StepType, string> = {
  linkedin_message: 'LinkedIn Message',
  linkedin_connect: 'LinkedIn Connect',
  linkedin_like: 'LinkedIn Like',
  linkedin_comment: 'LinkedIn Comment',
  send_email: 'Email',
  email_reply: 'Email Reply',
  whatsapp: 'WhatsApp',
  cold_call: 'Cold Call',
  task: 'Task',
  linkedin_profile_view: 'LinkedIn Profile View',
}

// ─── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  scheduled:  { label: 'Programado',  className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  executed:   { label: 'Enviado',     className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  failed:     { label: 'Fallido',     className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  canceled:   { label: 'Cancelado',   className: 'bg-gray-100 text-gray-700 dark:bg-gray-900/40 dark:text-gray-400' },
  skipped_due_to_state_change: { label: 'Omitido', className: 'bg-gray-100 text-gray-600 dark:bg-gray-900/40 dark:text-gray-400' },
}

// ─── Types ─────────────────────────────────────────────────────────────────────
interface ScheduleRow {
  id: string
  cadence_id: string
  cadence_step_id: string
  lead_id: string
  scheduled_at: string
  timezone: string | null
  status: string
  message_rendered_text: string | null
  last_error: string | null
  created_at: string
  updated_at: string
  leads: { first_name: string; last_name: string; company: string | null } | null
  cadences: { name: string } | null
  cadence_steps: { step_type: StepType; day_offset: number; step_label: string } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(iso: string, tz = 'America/Mexico_City') {
  try {
    return new Date(iso).toLocaleString('es-MX', {
      timeZone: tz,
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    })
  } catch {
    return new Date(iso).toLocaleString()
  }
}

function timeUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'pendiente'
  const min = Math.round(diff / 60000)
  if (min < 60) return `en ${min}m`
  if (min < 1440) return `en ${Math.round(min / 60)}h`
  return `en ${Math.round(min / 1440)}d`
}

// ─── Main component ────────────────────────────────────────────────────────────
export function OutreachActivity() {
  const { user } = useAuth()
  const { orgId } = useOrg()
  const queryClient = useQueryClient()

  // ─── Filters state ─────────────────────────────────────────────────────────
  const [tab, setTab] = useState<'scheduled' | 'history'>('scheduled')
  const [search, setSearch] = useState('')
  const [filterCadence, setFilterCadence] = useState<string | null>(null)
  const [filterStepType, setFilterStepType] = useState<StepType | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // ─── Query scheduled ───────────────────────────────────────────────────────
  const { data: scheduled = [], refetch: refetchScheduled, isFetching: fetchingScheduled } = useQuery({
    queryKey: ['outreach-scheduled', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schedules')
        .select(`
          id, cadence_id, cadence_step_id, lead_id,
          scheduled_at, timezone, status, message_rendered_text,
          last_error, created_at, updated_at,
          leads(first_name, last_name, company),
          cadences(name),
          cadence_steps(step_type, day_offset, step_label)
        `)
        .eq('org_id', orgId!)
        .in('status', ['scheduled', 'failed'])
        .order('scheduled_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return (data || []) as unknown as ScheduleRow[]
    },
    enabled: !!user && !!orgId,
    refetchInterval: 30000,
  })

  // ─── Query history ─────────────────────────────────────────────────────────
  const { data: history = [], refetch: refetchHistory, isFetching: fetchingHistory } = useQuery({
    queryKey: ['outreach-history', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schedules')
        .select(`
          id, cadence_id, cadence_step_id, lead_id,
          scheduled_at, timezone, status, message_rendered_text,
          last_error, created_at, updated_at,
          leads(first_name, last_name, company),
          cadences(name),
          cadence_steps(step_type, day_offset, step_label)
        `)
        .eq('org_id', orgId!)
        .in('status', ['executed', 'canceled', 'skipped_due_to_state_change'])
        .order('updated_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return (data || []) as unknown as ScheduleRow[]
    },
    enabled: !!user && !!orgId,
    refetchInterval: 60000,
  })

  // ─── Derived cadence list for filter ──────────────────────────────────────
  const allRows = tab === 'scheduled' ? scheduled : history
  const cadenceOptions = useMemo(() => {
    const map = new Map<string, string>()
    ;[...scheduled, ...history].forEach((r) => {
      if (r.cadence_id && r.cadences?.name) map.set(r.cadence_id, r.cadences.name)
    })
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [scheduled, history])

  // ─── Filtered rows ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return allRows.filter((r) => {
      if (filterCadence && r.cadence_id !== filterCadence) return false
      if (filterStepType && r.cadence_steps?.step_type !== filterStepType) return false
      if (search) {
        const q = search.toLowerCase()
        const leadName = `${r.leads?.first_name ?? ''} ${r.leads?.last_name ?? ''}`.toLowerCase()
        const company = (r.leads?.company ?? '').toLowerCase()
        const cadence = (r.cadences?.name ?? '').toLowerCase()
        if (!leadName.includes(q) && !company.includes(q) && !cadence.includes(q)) return false
      }
      return true
    })
  }, [allRows, filterCadence, filterStepType, search])

  // ─── Stats ────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    scheduled: scheduled.filter((r) => r.status === 'scheduled').length,
    failed:    scheduled.filter((r) => r.status === 'failed').length,
    sentToday: history.filter((r) => {
      const d = new Date(r.updated_at)
      const now = new Date()
      return r.status === 'executed' &&
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
    }).length,
    totalSent: history.filter((r) => r.status === 'executed').length,
  }), [scheduled, history])

  // ─── Actions ──────────────────────────────────────────────────────────────
  const cancelOne = async (id: string) => {
    const { error } = await supabase
      .from('schedules')
      .update({ status: 'canceled', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'scheduled')
    if (error) { toast.error('Error al cancelar'); return }
    toast.success('Envío cancelado')
    queryClient.invalidateQueries({ queryKey: ['outreach-scheduled', orgId] })
  }

  const cancelSelected = async () => {
    if (selectedIds.size === 0) return
    const { error } = await supabase
      .from('schedules')
      .update({ status: 'canceled', updated_at: new Date().toISOString() })
      .in('id', Array.from(selectedIds))
      .eq('status', 'scheduled')
    if (error) { toast.error('Error al cancelar'); return }
    toast.success(`${selectedIds.size} envíos cancelados`)
    setSelectedIds(new Set())
    queryClient.invalidateQueries({ queryKey: ['outreach-scheduled', orgId] })
  }

  const retryFailed = async () => {
    const failedIds = scheduled.filter((r) => r.status === 'failed').map((r) => r.id)
    if (failedIds.length === 0) return
    const { error } = await supabase
      .from('schedules')
      .update({
        status: 'scheduled',
        scheduled_at: new Date(Date.now() + 60_000).toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .in('id', failedIds)
    if (error) { toast.error('Error al reintentar'); return }
    toast.success(`${failedIds.length} paso${failedIds.length !== 1 ? 's' : ''} serán reintentados`)
    queryClient.invalidateQueries({ queryKey: ['outreach-scheduled', orgId] })
  }

  // ─── Selection helpers ────────────────────────────────────────────────────
  const scheduledInView = filtered.filter((r) => r.status === 'scheduled')
  const allSelected = scheduledInView.length > 0 && scheduledInView.every((r) => selectedIds.has(r.id))

  const toggleSelectAll = () => {
    if (allSelected) {
      const next = new Set(selectedIds)
      scheduledInView.forEach((r) => next.delete(r.id))
      setSelectedIds(next)
    } else {
      const next = new Set(selectedIds)
      scheduledInView.forEach((r) => next.add(r.id))
      setSelectedIds(next)
    }
  }

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelectedIds(next)
  }

  const refetch = () => {
    refetchScheduled()
    refetchHistory()
  }

  const isFetching = fetchingScheduled || fetchingHistory

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Outreach Activity</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Todos los envíos programados e historial de todas las cadencias
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refetch} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-amber-200 dark:border-amber-800">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div>
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{stats.scheduled}</p>
                <p className="text-xs text-muted-foreground">Programados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-200 dark:border-red-800">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
              <div>
                <p className="text-2xl font-bold text-red-700 dark:text-red-300">{stats.failed}</p>
                <p className="text-xs text-muted-foreground">Fallidos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-200 dark:border-green-800">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Send className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
              <div>
                <p className="text-2xl font-bold text-green-700 dark:text-green-300">{stats.sentToday}</p>
                <p className="text-xs text-muted-foreground">Enviados hoy</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
              <div>
                <p className="text-2xl font-bold">{stats.totalSent}</p>
                <p className="text-xs text-muted-foreground">Total enviados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => { setTab(v as typeof tab); setSelectedIds(new Set()) }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <TabsList>
            <TabsTrigger value="scheduled" className="gap-1.5">
              <Clock className="h-4 w-4" />
              Programados
              {stats.scheduled + stats.failed > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1 text-xs">
                  {stats.scheduled + stats.failed}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <CheckCircle className="h-4 w-4" />
              Historial
            </TabsTrigger>
          </TabsList>

          {/* Filter bar */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar lead, empresa..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 w-48 text-sm"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
            </div>

            {/* Cadence filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1">
                  <Filter className="h-3.5 w-3.5" />
                  {filterCadence ? cadenceOptions.find((c) => c[0] === filterCadence)?.[1]?.slice(0, 20) : 'Cadencia'}
                  <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 max-h-72 overflow-y-auto">
                <DropdownMenuItem onClick={() => setFilterCadence(null)}>
                  Todas las cadencias
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {cadenceOptions.map(([id, name]) => (
                  <DropdownMenuItem key={id} onClick={() => setFilterCadence(id)}>
                    {name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Step type filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1">
                  <Filter className="h-3.5 w-3.5" />
                  {filterStepType ? STEP_LABELS[filterStepType] : 'Tipo'}
                  <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => setFilterStepType(null)}>Todos los tipos</DropdownMenuItem>
                <DropdownMenuSeparator />
                {(Object.keys(STEP_LABELS) as StepType[]).map((t) => {
                  const Icon = STEP_ICONS[t]
                  return (
                    <DropdownMenuItem key={t} onClick={() => setFilterStepType(t)}>
                      <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                      {STEP_LABELS[t]}
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Clear filters */}
            {(filterCadence || filterStepType || search) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground"
                onClick={() => { setFilterCadence(null); setFilterStepType(null); setSearch('') }}
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Limpiar
              </Button>
            )}
          </div>
        </div>

        {/* ── Scheduled tab ───────────────────────────────────────────────── */}
        <TabsContent value="scheduled" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
              <div>
                <CardTitle className="text-sm font-medium">
                  {filtered.length} elemento{filtered.length !== 1 ? 's' : ''}
                  {(filterCadence || filterStepType || search) ? ' (filtrado)' : ''}
                </CardTitle>
              </div>
              <div className="flex gap-2">
                {selectedIds.size > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={cancelSelected}
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1" />
                    Cancelar {selectedIds.size} seleccionados
                  </Button>
                )}
                {stats.failed > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs text-orange-600 border-orange-200 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-800"
                    onClick={retryFailed}
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1" />
                    Reintentar fallidos ({stats.failed})
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScheduleTable
                rows={filtered}
                showCancel
                selectedIds={selectedIds}
                allSelected={allSelected}
                onToggleAll={toggleSelectAll}
                onToggleOne={toggleOne}
                onCancel={cancelOne}
                emptyMessage="No hay envíos programados. Inicia una automatización para ver la cola de ejecución."
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── History tab ─────────────────────────────────────────────────── */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-medium">
                {filtered.length} elemento{filtered.length !== 1 ? 's' : ''}
                {(filterCadence || filterStepType || search) ? ' (filtrado)' : ''}
                <span className="text-muted-foreground font-normal ml-1">(últimos 500)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScheduleTable
                rows={filtered}
                showCancel={false}
                selectedIds={new Set()}
                allSelected={false}
                onToggleAll={() => {}}
                onToggleOne={() => {}}
                onCancel={() => {}}
                emptyMessage="No hay historial de envíos."
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Reusable table ────────────────────────────────────────────────────────────
function ScheduleTable({
  rows,
  showCancel,
  selectedIds,
  allSelected,
  onToggleAll,
  onToggleOne,
  onCancel,
  emptyMessage,
}: {
  rows: ScheduleRow[]
  showCancel: boolean
  selectedIds: Set<string>
  allSelected: boolean
  onToggleAll: () => void
  onToggleOne: (id: string) => void
  onCancel: (id: string) => void
  emptyMessage: string
}) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50 border-y">
            {showCancel && (
              <th className="px-3 py-2 w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleAll}
                  className="rounded"
                />
              </th>
            )}
            <th className="text-left px-3 py-2 font-medium">Lead</th>
            <th className="text-left px-3 py-2 font-medium">Cadencia</th>
            <th className="text-left px-3 py-2 font-medium">Paso</th>
            <th className="text-left px-3 py-2 font-medium">Programado</th>
            <th className="text-left px-3 py-2 font-medium">Estado</th>
            <th className="text-left px-3 py-2 font-medium">Detalle</th>
            {showCancel && <th className="px-3 py-2 w-24" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const StepIcon = row.cadence_steps ? STEP_ICONS[row.cadence_steps.step_type] : Clock
            const sc = STATUS_CONFIG[row.status] || { label: row.status, className: 'bg-gray-100 text-gray-800' }
            const tz = row.timezone || 'America/Mexico_City'
            const isScheduled = row.status === 'scheduled'
            const isFailed = row.status === 'failed'

            return (
              <tr key={row.id} className="border-b last:border-b-0 hover:bg-muted/30">
                {showCancel && (
                  <td className="px-3 py-2">
                    {isScheduled && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        onChange={() => onToggleOne(row.id)}
                        className="rounded"
                      />
                    )}
                  </td>
                )}
                {/* Lead */}
                <td className="px-3 py-2">
                  <div className="font-medium leading-tight">
                    {row.leads
                      ? `${row.leads.first_name} ${row.leads.last_name}`
                      : row.lead_id.slice(0, 8)}
                  </div>
                  {row.leads?.company && (
                    <div className="text-xs text-muted-foreground">{row.leads.company}</div>
                  )}
                </td>
                {/* Cadence */}
                <td className="px-3 py-2 max-w-[160px]">
                  <span className="truncate block text-xs text-muted-foreground" title={row.cadences?.name}>
                    {row.cadences?.name ?? '—'}
                  </span>
                </td>
                {/* Step */}
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <StepIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs">
                      {row.cadence_steps
                        ? `Day ${row.cadence_steps.day_offset}: ${row.cadence_steps.step_label}`
                        : '—'}
                    </span>
                  </div>
                </td>
                {/* Scheduled at */}
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="text-xs">{formatDate(row.scheduled_at, tz)}</div>
                  {isScheduled && (
                    <div className="text-xs text-muted-foreground">{timeUntil(row.scheduled_at)}</div>
                  )}
                  {row.status === 'executed' && row.updated_at && (
                    <div className="text-xs text-green-600 dark:text-green-400">
                      Enviado {formatDate(row.updated_at, tz)}
                    </div>
                  )}
                </td>
                {/* Status */}
                <td className="px-3 py-2">
                  <Badge className={`${sc.className} text-xs`}>{sc.label}</Badge>
                </td>
                {/* Detail */}
                <td className="px-3 py-2 max-w-[220px]">
                  {isFailed && row.last_error && (
                    <span
                      className="text-xs text-red-600 dark:text-red-400 truncate block"
                      title={row.last_error}
                    >
                      {row.last_error.length > 80 ? row.last_error.slice(0, 80) + '…' : row.last_error}
                    </span>
                  )}
                  {row.message_rendered_text && !isFailed && (
                    <span
                      className="text-xs text-muted-foreground truncate block"
                      title={row.message_rendered_text}
                    >
                      {row.message_rendered_text.slice(0, 60)}…
                    </span>
                  )}
                </td>
                {/* Cancel action */}
                {showCancel && (
                  <td className="px-3 py-2">
                    {isScheduled && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                        onClick={() => onCancel(row.id)}
                      >
                        <X className="h-3 w-3 mr-0.5" />
                        Cancelar
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
