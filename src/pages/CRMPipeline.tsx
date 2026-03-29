import { PageTransition } from '@/components/PageTransition'
import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { useSalesforceConnection } from '@/hooks/useSalesforceConnection'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  RefreshCw,
  Search,
  TrendingUp,
  DollarSign,
  CheckCircle2,
  BarChart2,
  AlertCircle,
  Link2,
  Loader2,
  ChevronUp,
  ChevronDown,
  X,
  Users,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SalesforceOpportunity {
  id: string
  org_id: string
  sf_account_id: string
  sf_opportunity_id: string
  name: string
  stage_name: string
  opportunity_type: string | null
  amount: number | null
  currency_code: string | null
  close_date: string | null
  probability: number | null
  is_closed: boolean
  is_won: boolean
  owner_name: string | null
  synced_at: string | null
}

interface SalesforceAccount {
  sf_account_id: string
  name: string
  owner_name: string | null
  website: string | null
}

interface OppWithAccount extends SalesforceOpportunity {
  account_name: string
  account_owner: string | null
}

type SortField = 'account_name' | 'stage_name' | 'owner_name' | 'amount' | 'close_date' | 'probability'
type SortDir = 'asc' | 'desc'

// ── Stage config ──────────────────────────────────────────────────────────────

const STAGE_COLORS: Record<string, string> = {
  'Prospecting':             'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  'Qualification':           'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'Needs Analysis':          'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  'Value Proposition':       'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  'Id. Decision Makers':     'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  'Perception Analysis':     'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  'Proposal/Price Quote':    'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  'Negotiation/Review':      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  'Closed Won':              'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  'Closed Lost':             'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

function stageColor(stage: string): string {
  return STAGE_COLORS[stage] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
}

function isNewMerchant(type: string | null, name?: string): boolean {
  // If type is populated (post-sync), use it directly
  if (type) {
    const t = type.toLowerCase()
    return t.includes('new merchant') || t.includes('nuevo merchant')
  }
  // Type not yet populated (pre-sync) — detect upsell/crossell by opp name
  if (name) {
    const n = name.toLowerCase()
    if (
      n.includes('upsell') || n.includes('crossell') || n.includes('cross-sell') ||
      n.includes('cross sell') || n.includes('upsale') || n.includes('expansion')
    ) return false
  }
  return true
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(amount: number | null, currency = 'USD'): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false
  return new Date(dateStr + 'T00:00:00') < new Date()
}

// ── Main Component ────────────────────────────────────────────────────────────

export function CRMPipeline() {
  const { user } = useAuth()
  const { orgId } = useOrg()
  const queryClient = useQueryClient()
  const { status: sfStatus, isLoading: sfLoading, actionLoading, sync, connect } = useSalesforceConnection()

  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [ownerInput, setOwnerInput] = useState('')
  const [selectedOwner, setSelectedOwner] = useState<string | null>(null)
  const [ownerDropdownOpen, setOwnerDropdownOpen] = useState(false)
  const [onlyNewMerchants, setOnlyNewMerchants] = useState(true)
  const [sortField, setSortField] = useState<SortField>('close_date')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const ownerRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ownerRef.current && !ownerRef.current.contains(e.target as Node)) {
        setOwnerDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: opportunities = [], isLoading: oppsLoading } = useQuery({
    queryKey: ['sf-opportunities', orgId],
    queryFn: async (): Promise<SalesforceOpportunity[]> => {
      if (!orgId) return []
      const { data, error } = await supabase
        .from('salesforce_opportunities')
        .select('*')
        .eq('org_id', orgId)
        .or('is_won.eq.true,is_closed.eq.false')
        .order('close_date', { ascending: true })
      if (error) throw error
      return (data || []) as SalesforceOpportunity[]
    },
    enabled: !!orgId && !!user?.id,
    refetchInterval: false,
  })

  const { data: accounts = [] } = useQuery({
    queryKey: ['sf-accounts-map', orgId],
    queryFn: async (): Promise<SalesforceAccount[]> => {
      if (!orgId) return []
      const { data, error } = await supabase
        .from('salesforce_accounts')
        .select('sf_account_id, name, owner_name, website')
        .eq('org_id', orgId)
      if (error) throw error
      return (data || []) as SalesforceAccount[]
    },
    enabled: !!orgId && !!user?.id,
    refetchInterval: false,
  })

  // ── Enriched data ─────────────────────────────────────────────────────────

  const accountMap = useMemo(() => {
    const m = new Map<string, SalesforceAccount>()
    accounts.forEach(a => m.set(a.sf_account_id, a))
    return m
  }, [accounts])

  const enriched: OppWithAccount[] = useMemo(() =>
    opportunities.map(opp => ({
      ...opp,
      account_name: accountMap.get(opp.sf_account_id)?.name || opp.sf_account_id,
      account_owner: accountMap.get(opp.sf_account_id)?.owner_name || null,
    })),
    [opportunities, accountMap]
  )

  // ── Filters ───────────────────────────────────────────────────────────────

  const stages = useMemo(() =>
    Array.from(new Set(enriched.map(o => o.stage_name))).sort(),
    [enriched]
  )

  const allOwners = useMemo(() =>
    Array.from(new Set(enriched.map(o => o.owner_name).filter(Boolean) as string[])).sort(),
    [enriched]
  )

  const ownerSuggestions = useMemo(() => {
    if (!ownerInput) return allOwners
    const q = ownerInput.toLowerCase()
    return allOwners.filter(name => name.toLowerCase().includes(q))
  }, [allOwners, ownerInput])

  const filtered = useMemo(() => {
    let rows = enriched

    // 1. Solo New Merchants (uses opportunity_type if populated, falls back to name detection)
    if (onlyNewMerchants) {
      rows = rows.filter(o => isNewMerchant(o.opportunity_type, o.name))
    }

    // 2. General search (account / opp name)
    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter(o =>
        o.account_name.toLowerCase().includes(q) ||
        o.name.toLowerCase().includes(q)
      )
    }

    // 3. Stage
    if (stageFilter !== 'all') {
      rows = rows.filter(o => o.stage_name === stageFilter)
    }

    // 4. Owner — exact match on opportunity owner_name only
    if (selectedOwner) {
      rows = rows.filter(o => o.owner_name === selectedOwner)
    }

    return rows
  }, [enriched, onlyNewMerchants, search, stageFilter, selectedOwner])

  const sorted = useMemo(() => {
    const rows = [...filtered]
    rows.sort((a, b) => {
      let va: string | number | null
      let vb: string | number | null
      if (sortField === 'account_name') { va = a.account_name; vb = b.account_name }
      else if (sortField === 'stage_name') { va = a.stage_name; vb = b.stage_name }
      else if (sortField === 'owner_name') { va = a.owner_name; vb = b.owner_name }
      else if (sortField === 'amount') { va = a.amount; vb = b.amount }
      else if (sortField === 'close_date') { va = a.close_date; vb = b.close_date }
      else { va = a.probability; vb = b.probability }

      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (typeof va === 'string' && typeof vb === 'string') {
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      }
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number)
    })
    return rows
  }, [filtered, sortField, sortDir])

  // ── Stats (computed from filtered) ────────────────────────────────────────

  const stats = useMemo(() => {
    const openOpps = filtered.filter(o => !o.is_closed)
    const wonOpps  = filtered.filter(o => o.is_won)
    return {
      openPipeline: openOpps.reduce((s, o) => s + (o.amount || 0), 0),
      wonValue:     wonOpps.reduce((s, o) => s + (o.amount || 0), 0),
      openCount:    openOpps.length,
      wonCount:     wonOpps.length,
      totalCount:   filtered.length,
      avgProb:      openOpps.length
        ? Math.round(openOpps.reduce((s, o) => s + (o.probability || 0), 0) / openOpps.length)
        : 0,
    }
  }, [filtered])

  // ── Stage breakdown (from filtered) ──────────────────────────────────────

  const stageBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>()
    filtered.filter(o => !o.is_closed).forEach(o => {
      const existing = map.get(o.stage_name) || { count: 0, total: 0 }
      map.set(o.stage_name, { count: existing.count + 1, total: existing.total + (o.amount || 0) })
    })
    return Array.from(map.entries())
      .map(([stage, v]) => ({ stage, ...v }))
      .sort((a, b) => b.total - a.total)
  }, [filtered])

  // ── Sort toggle ───────────────────────────────────────────────────────────

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronUp className="h-3 w-3 opacity-20" />
    return sortDir === 'asc'
      ? <ChevronUp className="h-3 w-3 opacity-80" />
      : <ChevronDown className="h-3 w-3 opacity-80" />
  }

  // ── Sync handler ──────────────────────────────────────────────────────────

  async function handleSync() {
    await sync()
    queryClient.invalidateQueries({ queryKey: ['sf-opportunities'] })
    queryClient.invalidateQueries({ queryKey: ['sf-accounts-map'] })
  }

  // ── No Salesforce connection ───────────────────────────────────────────────

  if (!sfLoading && !sfStatus.isConnected) {
    return (
      <div className="p-8">
        <div className="mb-6">
          <h1 className="text-[28px] font-bold tracking-tight font-heading">Pipeline CRM</h1>
          <p className="text-muted-foreground">Oportunidades activas de Salesforce</p>
        </div>
        <Card>
          <CardContent className="py-16 text-center">
            <Link2 className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">Conecta Salesforce</h3>
            <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto">
              Para ver las oportunidades activas del pipeline, conecta tu cuenta de Salesforce.
            </p>
            <Button onClick={connect} disabled={actionLoading}>
              {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Conectar Salesforce
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <PageTransition className="p-8">
      {/* ── Header ── */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight font-heading">Pipeline CRM</h1>
          <p className="text-muted-foreground">
            {oppsLoading
              ? 'Cargando oportunidades...'
              : selectedOwner
                ? `${stats.totalCount} oportunidad${stats.totalCount !== 1 ? 'es' : ''} · ${selectedOwner}`
                : `${stats.totalCount} oportunidad${stats.totalCount !== 1 ? 'es' : ''} activa${stats.totalCount !== 1 ? 's' : ''} · Salesforce`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {sfStatus.lastSyncAt && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              Sync: {new Date(sfStatus.lastSyncAt).toLocaleString('es-MX', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={actionLoading}
          >
            {actionLoading
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <RefreshCw className="mr-2 h-4 w-4" />}
            Sincronizar
          </Button>
        </div>
      </div>

      {/* ── Stats cards (computed from filtered) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground font-medium">Pipeline abierto</span>
            </div>
            <p className="text-xl font-bold">{fmt(stats.openPipeline)}</p>
            <p className="text-xs text-muted-foreground">{stats.openCount} oportunidades</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground font-medium">Cerrado ganado</span>
            </div>
            <p className="text-xl font-bold">{fmt(stats.wonValue)}</p>
            <p className="text-xs text-muted-foreground">{stats.wonCount} oportunidades</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-muted-foreground font-medium">Total pipeline</span>
            </div>
            <p className="text-xl font-bold">{fmt(stats.openPipeline + stats.wonValue)}</p>
            <p className="text-xs text-muted-foreground">{stats.totalCount} oportunidades</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <BarChart2 className="h-4 w-4 text-violet-500" />
              <span className="text-xs text-muted-foreground font-medium">Prob. promedio</span>
            </div>
            <p className="text-xl font-bold">{stats.avgProb}%</p>
            <p className="text-xs text-muted-foreground">en opps abiertas</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Stage breakdown ── */}
      {stageBreakdown.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {stageBreakdown.map(({ stage, count, total }) => (
            <button
              key={stage}
              onClick={() => setStageFilter(stageFilter === stage ? 'all' : stage)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/50 ${
                stageFilter === stage
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card'
              }`}
            >
              <span className={`inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-medium ${stageColor(stage)}`}>
                {stage}
              </span>
              <span className="tabular-nums text-muted-foreground">{count}</span>
              {total > 0 && <span className="tabular-nums font-semibold">{fmt(total)}</span>}
            </button>
          ))}
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-2 mb-4">
        {/* General search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar cuenta u oportunidad..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Stage filter (only show when breakdown not used to avoid duplication) */}
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Etapa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las etapas</SelectItem>
            {stages.map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Owner combobox */}
        <div ref={ownerRef} className="relative min-w-[200px]">
          <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
          <Input
            placeholder="Buscar owner..."
            value={ownerInput}
            onChange={e => {
              setOwnerInput(e.target.value)
              setSelectedOwner(null)
              setOwnerDropdownOpen(true)
            }}
            onFocus={() => setOwnerDropdownOpen(true)}
            className={`pl-9 ${selectedOwner ? 'pr-8 border-primary ring-1 ring-primary' : ownerInput ? 'pr-8' : ''}`}
          />
          {(ownerInput || selectedOwner) && (
            <button
              onMouseDown={e => { e.preventDefault(); setOwnerInput(''); setSelectedOwner(null); setOwnerDropdownOpen(false) }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground z-10"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {ownerDropdownOpen && ownerSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-popover border border-border rounded-md shadow-md max-h-52 overflow-y-auto">
              {ownerSuggestions.map(name => (
                <button
                  key={name}
                  onMouseDown={e => {
                    e.preventDefault()
                    setSelectedOwner(name)
                    setOwnerInput(name)
                    setOwnerDropdownOpen(false)
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors truncate ${
                    selectedOwner === name ? 'bg-primary/10 text-primary font-medium' : ''
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Solo New Merchants toggle */}
        <button
          onClick={() => setOnlyNewMerchants(v => !v)}
          className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
            onlyNewMerchants
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:bg-muted/50'
          }`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Solo New Merchants
        </button>
      </div>

      {/* ── Table ── */}
      <Card>
        <CardContent className="p-0">
          {oppsLoading ? (
            <div className="py-16 text-center">
              <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Cargando oportunidades...</p>
            </div>
          ) : sorted.length === 0 ? (
            <div className="py-16 text-center">
              <AlertCircle className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="font-medium mb-1">
                {enriched.length === 0 ? 'No hay oportunidades sincronizadas' : 'No hay resultados'}
              </p>
              <p className="text-sm text-muted-foreground">
                {enriched.length === 0
                  ? 'Sincroniza Salesforce para cargar el pipeline.'
                  : 'Ajusta los filtros de búsqueda.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* Header */}
              <div className="grid grid-cols-[1fr_1fr_130px_140px_110px_100px_70px] gap-3 px-4 py-2 border-b bg-muted/30 text-xs font-medium text-muted-foreground">
                <button
                  className="flex items-center gap-1 hover:text-foreground text-left"
                  onClick={() => toggleSort('account_name')}
                >
                  Cuenta <SortIcon field="account_name" />
                </button>
                <span>Oportunidad</span>
                <button
                  className="flex items-center gap-1 hover:text-foreground"
                  onClick={() => toggleSort('stage_name')}
                >
                  Etapa <SortIcon field="stage_name" />
                </button>
                <button
                  className="flex items-center gap-1 hover:text-foreground"
                  onClick={() => toggleSort('owner_name')}
                >
                  Owner <SortIcon field="owner_name" />
                </button>
                <button
                  className="flex items-center gap-1 hover:text-foreground"
                  onClick={() => toggleSort('amount')}
                >
                  Monto <SortIcon field="amount" />
                </button>
                <button
                  className="flex items-center gap-1 hover:text-foreground"
                  onClick={() => toggleSort('close_date')}
                >
                  Cierre <SortIcon field="close_date" />
                </button>
                <button
                  className="flex items-center gap-1 hover:text-foreground"
                  onClick={() => toggleSort('probability')}
                >
                  Prob. <SortIcon field="probability" />
                </button>
              </div>

              {/* Rows */}
              <div className="divide-y">
                {sorted.map(opp => (
                  <div
                    key={opp.id}
                    className="grid grid-cols-[1fr_1fr_130px_140px_110px_100px_70px] gap-3 px-4 py-3 items-center hover:bg-muted/30 transition-colors"
                  >
                    {/* Account */}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{opp.account_name}</p>
                      {opp.account_owner && (
                        <p className="text-xs text-muted-foreground truncate">{opp.account_owner}</p>
                      )}
                    </div>

                    {/* Opportunity name */}
                    <div className="min-w-0">
                      <p className="text-sm truncate">{opp.name}</p>
                    </div>

                    {/* Stage */}
                    <div>
                      <Badge
                        variant="secondary"
                        className={`text-xs font-normal truncate max-w-full ${stageColor(opp.stage_name)}`}
                      >
                        {opp.stage_name}
                      </Badge>
                    </div>

                    {/* Owner — clickable to filter */}
                    <div className="min-w-0">
                      <button
                        onClick={() => {
                          if (selectedOwner === opp.owner_name) {
                            setSelectedOwner(null)
                            setOwnerInput('')
                          } else {
                            setSelectedOwner(opp.owner_name || null)
                            setOwnerInput(opp.owner_name || '')
                          }
                          setOwnerDropdownOpen(false)
                        }}
                        className={`text-sm truncate text-left w-full transition-colors hover:text-primary ${
                          selectedOwner === opp.owner_name
                            ? 'text-primary font-medium'
                            : ''
                        }`}
                        title={`Filtrar por ${opp.owner_name || '—'}`}
                      >
                        {opp.owner_name || '—'}
                      </button>
                    </div>

                    {/* Amount */}
                    <div>
                      <p className="text-sm font-medium tabular-nums">
                        {fmt(opp.amount, opp.currency_code || 'USD')}
                      </p>
                    </div>

                    {/* Close date */}
                    <div>
                      <p className={`text-sm tabular-nums ${
                        !opp.is_closed && isOverdue(opp.close_date)
                          ? 'text-red-500 font-medium'
                          : ''
                      }`}>
                        {fmtDate(opp.close_date)}
                      </p>
                    </div>

                    {/* Probability */}
                    <div>
                      {opp.probability != null ? (
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 w-10 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${opp.probability}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums">{opp.probability}%</span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Salesforce error alert */}
      {sfStatus.lastError && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-900/10">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Ultimo error de sync: {sfStatus.lastError}
          </p>
        </div>
      )}
    </PageTransition>
  )
}
