import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, CheckCircle2, XCircle, Clock, Pause, Play, UserSearch, AlertTriangle } from 'lucide-react'
import type {
  AccountMapCompany,
  BuyerPersona,
} from '@/types/account-mapping'
import { BUYING_ROLE_CONFIG } from '@/types/account-mapping'
import { getCompanySizeTier, TIER_LABELS } from '@/lib/prospecting/adaptive-keywords'
import { cascadeSearch, SEARCH_LEVEL_LABELS } from '@/lib/prospecting/cascade-search'
import type { SearchLevel } from '@/lib/prospecting/cascade-search'
import type { SearchSalesNavigatorParams, SearchSalesNavigatorResponse, SalesNavResult } from '@/contexts/AccountMappingContext'

interface BatchSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountMapId: string
  companies: AccountMapCompany[]
  personas: BuyerPersona[]
  onSearch: (params: SearchSalesNavigatorParams) => Promise<SearchSalesNavigatorResponse>
  onSaveProspects: (
    accountMapId: string,
    companyId: string | null,
    prospects: SalesNavResult[],
    options?: { personaId?: string; buyingRole?: string; searchMetadata?: Record<string, unknown> }
  ) => Promise<number>
  onRefresh: () => void
}

type SearchStatus = 'queued' | 'searching' | 'done' | 'error' | 'skipped'

interface PersonaStatus {
  personaId: string
  personaName: string
  status: SearchStatus
  resultsCount: number
  error?: string
  searchLevel?: SearchLevel
  searchingLevel?: SearchLevel
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
  accountMapId,
  companies,
  personas,
  onSearch,
  onSaveProspects,
  onRefresh,
}: BatchSearchDialogProps) {
  // Selection state (pre-search)
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<Set<string>>(
    new Set(companies.map(c => c.id))
  )

  // Search state
  const [phase, setPhase] = useState<'select' | 'running' | 'done'>('select')
  const [searchStates, setSearchStates] = useState<CompanySearchState[]>([])
  const [totalProspectsFound, setTotalProspectsFound] = useState(0)
  const [completedCompanies, setCompletedCompanies] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const abortRef = useRef(false)
  const pauseRef = useRef(false)

  const selectedCompanies = companies.filter(c => selectedCompanyIds.has(c.id))
  const sortedPersonas = [...personas].sort((a, b) => {
    if (a.is_required !== b.is_required) return a.is_required ? -1 : 1
    return a.priority - b.priority
  })

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

  const updateCompanyStatus = useCallback((companyId: string, status: SearchStatus, error?: string) => {
    setSearchStates(prev => prev.map(s =>
      s.companyId === companyId ? { ...s, status, error } : s
    ))
  }, [])

  const updatePersonaStatus = useCallback((
    companyId: string,
    personaId: string,
    update: Partial<PersonaStatus>
  ) => {
    setSearchStates(prev => prev.map(s => {
      if (s.companyId !== companyId) return s
      const updated = {
        ...s,
        personaStatuses: s.personaStatuses.map(ps =>
          ps.personaId === personaId ? { ...ps, ...update } : ps
        ),
      }
      // Recalculate total found
      updated.totalFound = updated.personaStatuses.reduce((sum, ps) => sum + ps.resultsCount, 0)
      return updated
    }))
  }, [])

  const startSearch = async () => {
    abortRef.current = false
    pauseRef.current = false
    setIsPaused(false)
    setTotalProspectsFound(0)
    setCompletedCompanies(0)

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

    for (const company of selectedCompanies) {
      if (abortRef.current) break

      // Wait while paused
      while (pauseRef.current && !abortRef.current) {
        await new Promise(r => setTimeout(r, 500))
      }
      if (abortRef.current) break

      updateCompanyStatus(company.id, 'searching')

      // Track found provider IDs per company to avoid duplicates across personas
      const foundProviderIds = new Set<string>()

      for (const persona of sortedPersonas) {
        if (abortRef.current) break
        while (pauseRef.current && !abortRef.current) {
          await new Promise(r => setTimeout(r, 500))
        }
        if (abortRef.current) break

        if (persona.title_keywords.length === 0) {
          updatePersonaStatus(company.id, persona.id, { status: 'skipped' })
          continue
        }

        updatePersonaStatus(company.id, persona.id, { status: 'searching', searchingLevel: 1 })

        try {
          const cascadeResult = await cascadeSearch({
            company,
            persona,
            accountMapId,
            onSearch,
            maxResults: persona.max_per_company,
            excludeProviderIds: foundProviderIds,
            onLevelStart: (level) => {
              updatePersonaStatus(company.id, persona.id, { searchingLevel: level })
            },
            delayBetweenLevels: 2000,
          })

          if (cascadeResult.prospects.length > 0) {
            // Track found IDs to avoid duplicates for next persona
            for (const p of cascadeResult.prospects) {
              if (p.linkedinProviderId) foundProviderIds.add(p.linkedinProviderId)
            }

            await onSaveProspects(accountMapId, company.id, cascadeResult.prospects, {
              personaId: persona.id,
              buyingRole: persona.role_in_buying_committee || undefined,
              searchMetadata: {
                tier: getCompanySizeTier(company),
                search_level: cascadeResult.level,
                query_used: cascadeResult.queryUsed,
                level_details: cascadeResult.levelDetails,
                persona_name: persona.name,
              },
            })
            totalFound += cascadeResult.prospects.length
            setTotalProspectsFound(totalFound)
          }

          updatePersonaStatus(company.id, persona.id, {
            status: 'done',
            resultsCount: cascadeResult.prospects.length,
            searchLevel: cascadeResult.level,
            queryUsed: cascadeResult.queryUsed,
            searchingLevel: undefined,
          })

          // Small delay between personas (cascade already has internal delays between levels)
          await new Promise(r => setTimeout(r, 1000))
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error'
          updatePersonaStatus(company.id, persona.id, {
            status: 'error',
            error: errorMsg,
            searchingLevel: undefined,
          })

          // On 429 (rate limit), wait longer
          if (errorMsg.includes('429') || errorMsg.includes('rate')) {
            await new Promise(r => setTimeout(r, 10000))
          }
        }
      }

      completed++
      setCompletedCompanies(completed)
      updateCompanyStatus(company.id, abortRef.current ? 'queued' : 'done')
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

            {/* Company list */}
            <div className="max-h-[400px] overflow-y-auto rounded-md border divide-y">
              {searchStates.map(state => (
                <CompanySearchRow key={state.companyId} state={state} />
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          {phase === 'select' && (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button
                onClick={startSearch}
                disabled={selectedCompanies.length === 0 || personas.length === 0}
              >
                <UserSearch className="mr-2 h-4 w-4" />
                Start Search ({selectedCompanies.length} companies)
              </Button>
            </>
          )}
          {phase === 'running' && (
            <>
              <Button variant="outline" onClick={handleCancel}>Cancel</Button>
              <Button variant="outline" onClick={handlePauseResume}>
                {isPaused ? (
                  <><Play className="mr-1 h-4 w-4" /> Resume</>
                ) : (
                  <><Pause className="mr-1 h-4 w-4" /> Pause</>
                )}
              </Button>
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

  const statusIcon = {
    queued: <Clock className="h-4 w-4 text-muted-foreground" />,
    searching: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
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
  const statusIcon = {
    queued: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
    searching: <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />,
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

      {/* Searching state: show current cascade level */}
      {ps.status === 'searching' && ps.searchingLevel && (
        <span className="text-blue-500 shrink-0">Level {ps.searchingLevel}/3</span>
      )}

      {/* Done with results */}
      {ps.status === 'done' && ps.resultsCount > 0 && (
        <>
          <span className="text-green-600 shrink-0">{ps.resultsCount} found</span>
          {ps.searchLevel && ps.searchLevel > 1 && (
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
