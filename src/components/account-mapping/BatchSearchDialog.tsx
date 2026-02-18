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
import { Loader2, CheckCircle2, XCircle, Clock, Pause, Play, UserSearch } from 'lucide-react'
import type {
  AccountMapCompany,
  BuyerPersona,
} from '@/types/account-mapping'
import { BUYING_ROLE_CONFIG } from '@/types/account-mapping'
import { getCompanySizeTier, getAdaptiveKeywords, TIER_LABELS } from '@/lib/prospecting/adaptive-keywords'
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

  const updatePersonaStatus = useCallback((companyId: string, personaId: string, status: SearchStatus, resultsCount: number, error?: string) => {
    setSearchStates(prev => prev.map(s => {
      if (s.companyId !== companyId) return s
      return {
        ...s,
        personaStatuses: s.personaStatuses.map(ps =>
          ps.personaId === personaId ? { ...ps, status, resultsCount, error } : ps
        ),
        totalFound: status === 'done'
          ? s.personaStatuses.reduce((sum, ps) =>
              sum + (ps.personaId === personaId ? resultsCount : ps.resultsCount), 0)
          : s.totalFound,
      }
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
      const tier = getCompanySizeTier(company)

      for (const persona of sortedPersonas) {
        if (abortRef.current) break
        while (pauseRef.current && !abortRef.current) {
          await new Promise(r => setTimeout(r, 500))
        }
        if (abortRef.current) break

        const { titleKeywords, seniority } = getAdaptiveKeywords(persona, company)

        if (titleKeywords.length === 0) {
          updatePersonaStatus(company.id, persona.id, 'skipped', 0)
          continue
        }

        updatePersonaStatus(company.id, persona.id, 'searching', 0)

        try {
          const response = await onSearch({
            accountMapId,
            companyNames: [company.company_name],
            titleKeywords,
            seniority: seniority.length > 0 ? seniority : undefined,
            limit: persona.max_per_company,
          })

          const results = response.results || []

          if (results.length > 0) {
            await onSaveProspects(accountMapId, company.id, results, {
              personaId: persona.id,
              buyingRole: persona.role_in_buying_committee || undefined,
              searchMetadata: {
                tier,
                keywords_used: titleKeywords,
                seniority_used: seniority,
                persona_name: persona.name,
              },
            })
            totalFound += results.length
            setTotalProspectsFound(totalFound)
          }

          updatePersonaStatus(company.id, persona.id, 'done', results.length)

          // Rate limit: 3 second delay between API calls
          await new Promise(r => setTimeout(r, 3000))
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error'
          updatePersonaStatus(company.id, persona.id, 'error', 0, errorMsg)

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
    onRefresh() // Invalidate React Query to refresh prospect counts
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

            {/* Estimated time */}
            {selectedCompanies.length > 0 && personas.length > 0 && (
              <p className="text-xs text-muted-foreground">
                ~{Math.ceil(selectedCompanies.length * personas.length * 3 / 60)} min estimated
                ({selectedCompanies.length} companies × {personas.length} personas × 3s delay)
              </p>
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
            <div key={ps.personaId} className="flex items-center gap-2 text-xs text-muted-foreground">
              {statusIcon[ps.status]}
              <span>{ps.personaName}</span>
              {ps.status === 'done' && <span className="text-green-600">{ps.resultsCount} found</span>}
              {ps.status === 'error' && <span className="text-red-500">{ps.error || 'Failed'}</span>}
              {ps.status === 'skipped' && <span className="text-muted-foreground/50">No keywords</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
