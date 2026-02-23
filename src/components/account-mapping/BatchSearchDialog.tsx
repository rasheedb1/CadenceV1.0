import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, CheckCircle2, XCircle, Clock, Pause, Play, UserSearch, AlertTriangle, Sparkles, Mail } from 'lucide-react'
import type {
  AccountMapCompany,
  BuyerPersona,
} from '@/types/account-mapping'
import { BUYING_ROLE_CONFIG } from '@/types/account-mapping'
import { getCompanySizeTier, TIER_LABELS } from '@/lib/prospecting/adaptive-keywords'
import type { CascadeSearchCompanyResponse } from '@/contexts/AccountMappingContext'
import { LLMModelSelector } from '@/components/LLMModelSelector'

// ── Search level labels (kept for persona result display) ──
const SEARCH_LEVEL_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'exact', color: 'text-green-600' },
  2: { label: 'broadened', color: 'text-amber-600' },
  3: { label: 'broad match', color: 'text-orange-600' },
}

interface BatchSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountMapId: string
  companies: AccountMapCompany[]
  personas: BuyerPersona[]
  /** Single backend call that searches all personas for one company */
  onSearchCompany: (companyId: string, maxPerRole: number) => Promise<CascadeSearchCompanyResponse>
  onRefresh: () => void
  onValidate?: (companyId: string) => Promise<{ validated: number; total: number }>
  onEnrich?: (companyId: string) => Promise<void>
}

type SearchStatus = 'queued' | 'searching' | 'validating' | 'enriching' | 'done' | 'error' | 'skipped'

interface PersonaStatus {
  personaId: string
  personaName: string
  status: SearchStatus
  resultsCount: number
  error?: string
  searchLevel?: number
  queryUsed?: string
}

interface CompanySearchState {
  companyId: string
  companyName: string
  tier: string
  status: SearchStatus
  personaStatuses: PersonaStatus[]
  totalFound: number
  error?: string
}

export function BatchSearchDialog({
  open,
  onOpenChange,
  accountMapId: _accountMapId,
  companies,
  personas,
  onSearchCompany,
  onRefresh,
  onValidate,
  onEnrich,
}: BatchSearchDialogProps) {
  void _accountMapId // reserved for future use
  // Selection state (pre-search)
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<Set<string>>(
    new Set(companies.map(c => c.id))
  )
  const [maxPerRole, setMaxPerRole] = useState<number>(
    Math.max(...personas.map(p => p.max_per_company), 3)
  )

  // Search state
  const [phase, setPhase] = useState<'select' | 'running' | 'done'>('select')
  const [searchStates, setSearchStates] = useState<CompanySearchState[]>([])
  const [totalProspectsFound, setTotalProspectsFound] = useState(0)
  const [completedCompanies, setCompletedCompanies] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [rateLimitWarning, setRateLimitWarning] = useState<string | null>(null)
  const abortRef = useRef(false)
  const pauseRef = useRef(false)
  const consecutiveEmptyRef = useRef(0)

  const selectedCompanies = companies.filter(c => selectedCompanyIds.has(c.id))
  const sortedPersonas = [...personas].sort((a, b) => {
    if (a.is_required !== b.is_required) return a.is_required ? -1 : 1
    return a.priority - b.priority
  })

  // Rate limiting constants (between companies — per-persona delays are server-side now)
  const DELAY_BETWEEN_COMPANIES = 3000
  const COOLDOWN_EVERY_N = 10
  const COOLDOWN_DURATION = 20000
  const RATE_LIMIT_THRESHOLD = 2         // 2 consecutive empty companies
  const RATE_LIMIT_PAUSE = 45000

  const toggleCompany = (id: string) => {
    setSelectedCompanyIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedCompanyIds.size === companies.length) {
      setSelectedCompanyIds(new Set())
    } else {
      setSelectedCompanyIds(new Set(companies.map(c => c.id)))
    }
  }

  const updateCompanyState = useCallback((companyId: string, update: Partial<CompanySearchState>) => {
    setSearchStates(prev => prev.map(s =>
      s.companyId === companyId ? { ...s, ...update } : s
    ))
  }, [])

  const startSearch = async () => {
    abortRef.current = false
    pauseRef.current = false
    setIsPaused(false)
    setTotalProspectsFound(0)
    setCompletedCompanies(0)
    setRateLimitWarning(null)
    consecutiveEmptyRef.current = 0

    // Initialize search states
    const initialStates: CompanySearchState[] = selectedCompanies.map(company => ({
      companyId: company.id,
      companyName: company.company_name,
      tier: TIER_LABELS[getCompanySizeTier(company)].label,
      status: 'queued',
      personaStatuses: sortedPersonas.map(p => ({
        personaId: p.id,
        personaName: p.name,
        status: 'queued',
        resultsCount: 0,
      })),
      totalFound: 0,
    }))
    setSearchStates(initialStates)
    setPhase('running')

    let totalFound = 0
    let completed = 0
    const companiesWithProspects: string[] = []

    // ── Search companies sequentially, one backend call per company ──
    for (let i = 0; i < selectedCompanies.length; i++) {
      if (abortRef.current) break
      while (pauseRef.current && !abortRef.current) {
        await new Promise(r => setTimeout(r, 500))
      }
      if (abortRef.current) break

      const company = selectedCompanies[i]
      updateCompanyState(company.id, { status: 'searching' })

      try {
        // Single backend call — handles all personas + cascade levels + saves prospects
        const result = await onSearchCompany(company.id, maxPerRole)

        // Parse persona results from the response
        const personaStatuses: PersonaStatus[] = sortedPersonas.map(p => {
          const pr = result.personaResults?.find(r => r.personaId === p.id)
          if (!pr) return { personaId: p.id, personaName: p.name, status: 'skipped' as SearchStatus, resultsCount: 0 }
          return {
            personaId: pr.personaId,
            personaName: pr.personaName,
            status: pr.error ? 'error' as SearchStatus : 'done' as SearchStatus,
            resultsCount: pr.resultsCount,
            searchLevel: pr.searchLevel,
            queryUsed: pr.queryUsed,
            error: pr.error,
          }
        })

        const companyTotal = result.totalFound || 0
        totalFound += companyTotal

        if (companyTotal > 0) {
          consecutiveEmptyRef.current = 0
          setRateLimitWarning(null)
          companiesWithProspects.push(company.id)
        } else {
          consecutiveEmptyRef.current++
          if (consecutiveEmptyRef.current >= RATE_LIMIT_THRESHOLD) {
            console.warn(`${consecutiveEmptyRef.current} consecutive empty companies — possible rate limit, pausing...`)
            setRateLimitWarning(`Rate limit detectado — pausando ${RATE_LIMIT_PAUSE / 1000}s`)
            await new Promise(r => setTimeout(r, RATE_LIMIT_PAUSE))
            consecutiveEmptyRef.current = 0
            setRateLimitWarning(null)
          }
        }

        updateCompanyState(company.id, {
          status: 'done',
          personaStatuses,
          totalFound: companyTotal,
        })
        setTotalProspectsFound(totalFound)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        console.error(`Search failed for ${company.company_name}:`, errorMsg)

        updateCompanyState(company.id, { status: 'error', error: errorMsg })

        // Rate limit handling
        if (errorMsg.includes('429') || errorMsg.includes('rate') || errorMsg.includes('Rate') || errorMsg.includes('too many') || errorMsg.includes('tomo demasiado tiempo')) {
          console.warn(`Rate limit / timeout for ${company.company_name}, cooling down 60s...`)
          setRateLimitWarning(`Rate limit — pausando 60s`)
          await new Promise(r => setTimeout(r, 60000))
          setRateLimitWarning(null)
        }
      }

      completed++
      setCompletedCompanies(completed)

      // Cooldown every N companies
      if ((i + 1) % COOLDOWN_EVERY_N === 0 && i + 1 < selectedCompanies.length) {
        setRateLimitWarning(`Cooldown preventivo después de ${i + 1} empresas — ${Math.round(COOLDOWN_DURATION / 1000)}s`)
        await new Promise(r => setTimeout(r, COOLDOWN_DURATION))
        setRateLimitWarning(null)
      } else if (i + 1 < selectedCompanies.length) {
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_COMPANIES))
      }
    }

    // ── Phase 2: Deferred validation + enrichment ──
    if (!abortRef.current && companiesWithProspects.length > 0) {
      for (const companyId of companiesWithProspects) {
        if (abortRef.current) break

        if (onValidate) {
          updateCompanyState(companyId, { status: 'validating' })
          try {
            await onValidate(companyId)
          } catch (e) {
            console.warn('Auto-validation failed for', companyId, e)
          }
        }

        if (onEnrich) {
          updateCompanyState(companyId, { status: 'enriching' })
          try {
            await onEnrich(companyId)
          } catch (e) {
            console.warn('Auto-enrichment failed for', companyId, e)
          }
        }

        updateCompanyState(companyId, { status: 'done' })
      }
    }

    setPhase('done')
    onRefresh()
  }

  const handlePauseResume = () => {
    if (isPaused) {
      pauseRef.current = false
      setIsPaused(false)
    } else {
      pauseRef.current = true
      setIsPaused(true)
    }
  }

  const handleCancel = () => {
    abortRef.current = true
    pauseRef.current = false
    setIsPaused(false)
  }

  const handleClose = () => {
    if (phase === 'running') {
      handleCancel()
    }
    setPhase('select')
    setSearchStates([])
    setTotalProspectsFound(0)
    setCompletedCompanies(0)
    onOpenChange(false)
  }

  const progressPercent = selectedCompanies.length > 0
    ? (completedCompanies / selectedCompanies.length) * 100
    : 0

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserSearch className="h-5 w-5" />
            {phase === 'select' ? 'Find Prospects' : phase === 'running' ? 'Finding Prospects...' : 'Search Complete'}
          </DialogTitle>
          <DialogDescription>
            {phase === 'select'
              ? `Search Sales Navigator for prospects across ${selectedCompanies.length} companies using ${personas.length} buyer personas.`
              : phase === 'running'
                ? `${completedCompanies}/${selectedCompanies.length} companies — ${totalProspectsFound} prospects found`
                : `Found ${totalProspectsFound} prospects across ${completedCompanies} companies.`}
          </DialogDescription>
        </DialogHeader>

        {/* Pre-search: Company Selection */}
        {phase === 'select' && (
          <div className="space-y-4 py-4">
            {/* Personas summary */}
            {personas.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Buyer Personas</Label>
                <div className="flex flex-wrap gap-2">
                  {sortedPersonas.map((p, i) => {
                    const roleConfig = p.role_in_buying_committee ? BUYING_ROLE_CONFIG[p.role_in_buying_committee] : null
                    return (
                      <div key={p.id} className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
                        <span className="font-medium">{i + 1}.</span>
                        <span>{p.name}</span>
                        {roleConfig && (
                          <Badge variant="outline" className={`text-[10px] h-4 ${roleConfig.color}`}>
                            {roleConfig.label}
                          </Badge>
                        )}
                        {p.is_required && <span className="text-amber-500">*</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {personas.length === 0 && (
              <div className="text-center py-4 text-sm text-muted-foreground">
                No buyer personas defined. Add personas in the ICP & Personas tab first.
              </div>
            )}

            {/* Max per role config */}
            {personas.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">Max prospects per role</Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={1}
                    max={25}
                    value={maxPerRole}
                    onChange={(e) => setMaxPerRole(Math.max(1, Math.min(25, parseInt(e.target.value) || 1)))}
                    className="w-20 h-8 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">
                    per empresa, por cada persona
                  </span>
                </div>
              </div>
            )}

            {/* Company selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-muted-foreground">
                  Companies ({selectedCompanyIds.size}/{companies.length} selected)
                </Label>
                <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={toggleAll}>
                  {selectedCompanyIds.size === companies.length ? 'Deselect all' : 'Select all'}
                </Button>
              </div>
              <div className="max-h-[300px] overflow-y-auto rounded-md border divide-y">
                {companies.map(company => {
                  const tier = getCompanySizeTier(company)
                  const tierConfig = TIER_LABELS[tier]
                  return (
                    <label
                      key={company.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedCompanyIds.has(company.id)}
                        onCheckedChange={() => toggleCompany(company.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{company.company_name}</span>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {tierConfig.icon} {tierConfig.label}
                      </Badge>
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Info about cascade search */}
            {selectedCompanies.length > 0 && personas.length > 0 && (
              <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-700 dark:text-blue-300 space-y-1">
                <p className="font-medium">Smart Cascade Search</p>
                <p>Each persona is searched in up to 3 levels: exact title match, broadened terms, then broad seniority. Stops at the first level that finds results.</p>
              </div>
            )}
          </div>
        )}

        {/* Running / Done: Progress Display */}
        {(phase === 'running' || phase === 'done') && (
          <div className="space-y-4 py-4">
            {/* Progress bar */}
            <div className="space-y-2">
              <Progress value={progressPercent} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{completedCompanies}/{selectedCompanies.length} companies</span>
                <span>{totalProspectsFound} prospects found</span>
              </div>
            </div>

            {/* Rate limit warning */}
            {rateLimitWarning && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>{rateLimitWarning}</span>
              </div>
            )}

            {/* Company list */}
            <div className="max-h-[400px] overflow-y-auto rounded-md border divide-y">
              {searchStates.map(state => (
                <CompanySearchRow key={state.companyId} state={state} />
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between sm:justify-between gap-2">
          {phase === 'select' && (
            <>
              <LLMModelSelector />
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose}>Cancel</Button>
                <Button
                  onClick={startSearch}
                  disabled={selectedCompanies.length === 0 || personas.length === 0}
                >
                  <UserSearch className="mr-2 h-4 w-4" />
                  Start Search ({selectedCompanies.length} companies)
                </Button>
              </div>
            </>
          )}
          {phase === 'running' && (
            <>
              <LLMModelSelector />
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCancel}>Cancel</Button>
                <Button variant="outline" onClick={handlePauseResume}>
                  {isPaused ? (
                    <><Play className="mr-1 h-4 w-4" /> Resume</>
                  ) : (
                    <><Pause className="mr-1 h-4 w-4" /> Pause</>
                  )}
                </Button>
              </div>
            </>
          )}
          {phase === 'done' && (
            <Button onClick={handleClose}>
              Close ({totalProspectsFound} prospects saved)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Inline label component
function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={className}>{children}</p>
}

function CompanySearchRow({ state }: { state: CompanySearchState }) {
  const [expanded, setExpanded] = useState(false)

  const statusIcon: Record<SearchStatus, React.ReactNode> = {
    queued: <Clock className="h-4 w-4 text-muted-foreground" />,
    searching: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
    validating: <Sparkles className="h-4 w-4 animate-pulse text-purple-500" />,
    enriching: <Mail className="h-4 w-4 animate-pulse text-amber-500" />,
    done: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    error: <XCircle className="h-4 w-4 text-red-500" />,
    skipped: <Clock className="h-4 w-4 text-muted-foreground/50" />,
  }

  return (
    <div>
      <button
        className="flex items-center gap-3 w-full px-3 py-2 text-left hover:bg-muted/30"
        onClick={() => setExpanded(!expanded)}
      >
        {statusIcon[state.status]}
        <span className="text-sm font-medium flex-1">{state.companyName}</span>
        <Badge variant="outline" className="text-[10px]">{state.tier}</Badge>
        {state.status === 'validating' && (
          <Badge variant="outline" className="text-[10px] text-purple-600 border-purple-300">
            Validating...
          </Badge>
        )}
        {state.status === 'enriching' && (
          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
            Enriching...
          </Badge>
        )}
        {state.status === 'error' && state.error && (
          <Badge variant="outline" className="text-[10px] text-red-600 border-red-300">
            Error
          </Badge>
        )}
        {state.totalFound > 0 && (
          <Badge variant="secondary" className="text-[10px]">
            {state.totalFound} found
          </Badge>
        )}
      </button>
      {expanded && state.personaStatuses.length > 0 && (
        <div className="pl-10 pr-3 pb-2 space-y-1">
          {state.personaStatuses.map(ps => (
            <PersonaStatusRow key={ps.personaId} ps={ps} />
          ))}
        </div>
      )}
    </div>
  )
}

function PersonaStatusRow({ ps }: { ps: PersonaStatus }) {
  const statusIcon: Record<SearchStatus, React.ReactNode> = {
    queued: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
    searching: <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />,
    validating: <Sparkles className="h-3.5 w-3.5 animate-pulse text-purple-500" />,
    enriching: <Mail className="h-3.5 w-3.5 animate-pulse text-amber-500" />,
    done: ps.resultsCount > 0
      ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
      : <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />,
    error: <XCircle className="h-3.5 w-3.5 text-red-500" />,
    skipped: <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />,
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {statusIcon[ps.status]}
      <span className="min-w-0 truncate">{ps.personaName}</span>

      {/* Done with results */}
      {ps.status === 'done' && ps.resultsCount > 0 && (
        <>
          <span className="text-green-600 shrink-0">{ps.resultsCount} found</span>
          {ps.searchLevel && ps.searchLevel > 1 && SEARCH_LEVEL_LABELS[ps.searchLevel] && (
            <Badge variant="outline" className={`text-[9px] h-4 shrink-0 ${SEARCH_LEVEL_LABELS[ps.searchLevel].color}`}>
              {SEARCH_LEVEL_LABELS[ps.searchLevel].label}
            </Badge>
          )}
        </>
      )}

      {/* Done with 0 results */}
      {ps.status === 'done' && ps.resultsCount === 0 && (
        <span className="text-amber-500 shrink-0">0 found (3 levels tried)</span>
      )}

      {/* Error */}
      {ps.status === 'error' && (
        <span className="text-red-500 truncate shrink-0">{ps.error || 'Failed'}</span>
      )}

      {/* Skipped */}
      {ps.status === 'skipped' && (
        <span className="text-muted-foreground/50 shrink-0">No keywords</span>
      )}
    </div>
  )
}
