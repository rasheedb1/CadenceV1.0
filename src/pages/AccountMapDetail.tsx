import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAccountMapping, type SalesNavResult } from '@/contexts/AccountMappingContext'
import { EXCLUSION_TYPES } from '@/types/registry'
import { AddPersonaDialog } from '@/components/account-mapping/AddPersonaDialog'
import { BatchSearchDialog } from '@/components/account-mapping/BatchSearchDialog'
import { ICPProfileSelector } from '@/components/account-mapping/ICPProfileSelector'
import { useICPProfileMutations } from '@/hooks/useICPProfiles'
import { CompanyDiscoveryChat } from '@/components/account-mapping/CompanyDiscoveryChat'
import { useCadence } from '@/contexts/CadenceContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import {
  ArrowLeft,
  Plus,
  Trash2,
  Search,
  Sparkles,
  ArrowUpRight,
  Building2,
  UserSearch,
  Users,
  MoreVertical,
  Loader2,
  ExternalLink,
  CheckCircle2,
  Target,
  FileText,
  List,
  LayoutGrid,
  ChevronDown,
  ChevronUp,
  ShieldX,
  Mail,
  Copy,
  Phone,
  ListFilter,
  AlertTriangle,
  XCircle,
} from 'lucide-react'
import {
  PROSPECT_STATUS_CONFIG,
  SENIORITY_OPTIONS,
  COMPANY_SIZE_OPTIONS,
  BUYING_ROLE_CONFIG,
  type AccountMapFilters,
  type AccountMapCompany,
  type BuyerPersona,
  type Prospect,
  type BuyingCommitteeRole,
} from '@/types/account-mapping'
import { FeatureGate } from '@/components/FeatureGate'
import { CompanyCard } from '@/components/account-mapping/CompanyCard'
import { useSalesforceCheck, type SalesforceMatch } from '@/hooks/useSalesforceCheck'
import { SalesforceBadge } from '@/components/salesforce/SalesforceBadge'
import { cn } from '@/lib/utils'

type TabId = 'icp' | 'companies' | 'prospects'

export function AccountMapDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const {
    accountMaps,
    isLoading,
    updateAccountMap,
    addCompany,
    deleteCompany,
    addPersona,
    updatePersona,
    saveProspects,
    deleteProspect,
    searchSalesNavigator,
    cascadeSearchCompany,
    enrichProspect,
    bulkEnrichProspects,
    enrichCompanyProspects,
    bulkPromoteProspects,
    suggestPersonaTitles,
    companyRegistry,
    refreshAccountMaps,
    validateProspects,
    applyScoreThreshold,
  } = useAccountMapping()
  const { cadences } = useCadence()
  const { convertInlineICP: convertInlineICPMutation } = useICPProfileMutations()

  const [activeTab, setActiveTab] = useState<TabId>('icp')

  // Dialog states
  const [showAddCompany, setShowAddCompany] = useState(false)
  const [showAddPersona, setShowAddPersona] = useState(false)
  const [editingPersona, setEditingPersona] = useState<BuyerPersona | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [showEnrich, setShowEnrich] = useState<Prospect | null>(null)
  const [showPromote, setShowPromote] = useState(false)
  const [showBatchSearch, setShowBatchSearch] = useState(false)
  const [showDiscoveryChat, setShowDiscoveryChat] = useState(false)

  // Selection state
  const [selectedProspects, setSelectedProspects] = useState<Set<string>>(new Set())

  const map = accountMaps.find((m) => m.id === id)

  const companies = map?.account_map_companies || []
  // Personas come from the linked ICP profile if available, otherwise from inline (legacy)
  const personas = map?.icp_profile?.buyer_personas || map?.buyer_personas || []
  const prospects = map?.prospects || []

  const handleConvertInline = async () => {
    if (!map) return
    try {
      await convertInlineICPMutation.mutateAsync(map.id)
    } catch {
      // Error handled in mutation
    }
  }

  // Salesforce pipeline check for discovered companies (hooks must be before conditional returns)
  const companyNames = useMemo(() => companies.map(c => c.company_name), [companies])
  const { isInPipeline: sfIsInPipeline } = useSalesforceCheck(undefined, companyNames, companies.length > 0)

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!map) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Account map not found</p>
        <Button variant="outline" onClick={() => navigate('/account-mapping')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
      </div>
    )
  }

  const tabs: { id: TabId; label: string; icon: React.ReactNode; count: number }[] = [
    { id: 'icp', label: 'ICP & Personas', icon: <Users className="h-4 w-4" />, count: personas.length },
    { id: 'companies', label: 'Companies', icon: <Building2 className="h-4 w-4" />, count: companies.length },
    { id: 'prospects', label: 'Prospects', icon: <UserSearch className="h-4 w-4" />, count: prospects.length },
  ]

  const toggleProspect = (id: string) => {
    setSelectedProspects((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllProspects = () => {
    if (selectedProspects.size === prospects.length) {
      setSelectedProspects(new Set())
    } else {
      setSelectedProspects(new Set(prospects.map((p) => p.id)))
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/account-mapping')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-[28px] font-bold tracking-tight font-heading">{map.name}</h1>
          {map.description && <p className="text-muted-foreground">{map.description}</p>}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-muted p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon}
            {tab.label}
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
              {tab.count}
            </Badge>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'icp' && (
        <div className="space-y-6">
          <ICPProfileSelector
            accountMapId={map.id}
            currentProfileId={map.icp_profile_id || null}
            currentProfile={map.icp_profile}
            hasInlineICP={!!(map.icp_description || map.filters_json?.icp_builder_data)}
            onLink={(profileId) => updateAccountMap(map.id, { icp_profile_id: profileId })}
            onConvertInline={handleConvertInline}
          />
        </div>
      )}

      {activeTab === 'companies' && (
        <CompaniesTab
          companies={companies}
          prospects={prospects}
          personas={personas}
          sfIsInPipeline={sfIsInPipeline}
          onAddCompany={() => setShowAddCompany(true)}
          onDeleteCompany={deleteCompany}
          onSearchProspects={() => {
            setShowSearch(true)
          }}
          onBatchSearch={() => setShowBatchSearch(true)}
          onDiscoveryChat={() => setShowDiscoveryChat(true)}
        />
      )}

      {activeTab === 'prospects' && (
        <ProspectsTab
          prospects={prospects}
          companies={companies}
          personas={personas}
          cadences={cadences}
          accountMapId={map.id}
          icpContext={{
            productCategory: map.icp_profile?.builder_data?.productCategory || map.filters_json?.icp_builder_data?.productCategory || '',
            companyDescription: map.icp_profile?.description || map.icp_description || map.filters_json?.icp_builder_data?.companyDescription || '',
          }}
          sfIsInPipeline={sfIsInPipeline}
          selectedProspects={selectedProspects}
          onToggleProspect={toggleProspect}
          onToggleAll={toggleAllProspects}
          onSearch={() => setShowSearch(true)}
          onBatchSearch={() => setShowBatchSearch(true)}
          onEnrich={(p) => setShowEnrich(p)}
          onBulkEnrich={bulkEnrichProspects}
          onPromote={() => setShowPromote(true)}
          onDelete={deleteProspect}
        />
      )}

      {/* ── Dialogs ── */}

      {/* Add Company Dialog */}
      <AddCompanyDialog
        open={showAddCompany}
        onOpenChange={setShowAddCompany}
        accountMapId={map.id}
        ownerId={map.owner_id}
        onAdd={addCompany}
      />

      {/* Add Persona Dialog */}
      <AddPersonaDialog
        open={showAddPersona}
        onOpenChange={(o) => {
          setShowAddPersona(o)
          if (!o) setEditingPersona(null)
        }}
        accountMapId={map.id}
        ownerId={map.owner_id}
        onAdd={addPersona}
        onUpdate={updatePersona}
        persona={editingPersona}
        onSuggestTitles={suggestPersonaTitles}
        icpContext={{
          productCategory: map.filters_json?.icp_builder_data?.productCategory || '',
          companyDescription: map.icp_description || '',
        }}
      />

      {/* Search Sales Navigator Dialog */}
      <SearchProspectsDialog
        open={showSearch}
        onOpenChange={setShowSearch}
        accountMapId={map.id}
        companies={companies}
        personas={personas}
        filters={map.filters_json}
        onSearch={searchSalesNavigator}
        onSave={saveProspects}
      />

      {/* Enrich Dialog */}
      {showEnrich && (
        <EnrichDialog
          open={!!showEnrich}
          onOpenChange={(open) => { if (!open) setShowEnrich(null) }}
          prospect={showEnrich}
          companies={companies}
          onEnrich={enrichProspect}
        />
      )}

      {/* Promote Dialog */}
      <PromoteDialog
        open={showPromote}
        onOpenChange={setShowPromote}
        prospects={prospects.filter((p) => selectedProspects.has(p.id) && p.status !== 'promoted')}
        cadences={cadences}
        onPromote={bulkPromoteProspects}
      />

      {/* Batch Search Dialog */}
      <BatchSearchDialog
        open={showBatchSearch}
        onOpenChange={setShowBatchSearch}
        accountMapId={map.id}
        companies={companies}
        personas={personas}
        onSearchCompany={(companyId, maxPerRole) => cascadeSearchCompany(map.id, companyId, maxPerRole)}
        onRefresh={refreshAccountMaps}
        onValidate={(companyId) => validateProspects(
          map.id, companyId,
          map.icp_profile?.description || map.icp_description || map.filters_json?.icp_builder_data?.companyDescription || '',
          map.icp_profile?.builder_data?.productCategory || map.filters_json?.icp_builder_data?.productCategory || '',
          map.icp_profile?.description || map.icp_description || ''
        )}
        onApplyScoreThreshold={(companyId, threshold) => applyScoreThreshold(map.id, companyId, threshold)}
        onEnrich={(companyId) => enrichCompanyProspects(map.id, companyId)}
      />

      {/* Company Discovery Chat */}
      <CompanyDiscoveryChat
        open={showDiscoveryChat}
        onOpenChange={setShowDiscoveryChat}
        accountMapId={map.id}
        ownerId={map.owner_id}
        icpDescription={map.icp_description}
        icpBuilderData={map.filters_json?.icp_builder_data || null}
        existingCompanies={companies}
        excludedCompanyNames={companyRegistry
          .filter(e => (EXCLUSION_TYPES as string[]).includes(e.registry_type))
          .map(e => e.company_name_display)}
        onAddCompany={addCompany}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// TAB: Companies
// ═══════════════════════════════════════════════════════

type CompanyViewMode = 'list' | 'grid'
type CompanyGroupBy = 'industry' | 'company_size' | 'location'

const GROUP_BY_LABELS: Record<CompanyGroupBy, string> = {
  industry: 'By Industry',
  company_size: 'By Size',
  location: 'By Location',
}

function CompaniesTab({
  companies,
  prospects,
  personas,
  sfIsInPipeline,
  onAddCompany,
  onDeleteCompany,
  onSearchProspects,
  onBatchSearch,
  onDiscoveryChat,
}: {
  companies: AccountMapCompany[]
  prospects: Prospect[]
  personas: BuyerPersona[]
  sfIsInPipeline: (domainOrName: string) => SalesforceMatch | null
  onAddCompany: () => void
  onDeleteCompany: (id: string) => void
  onSearchProspects: (company?: AccountMapCompany) => void
  onBatchSearch: () => void
  onDiscoveryChat: () => void
}) {
  // Count prospects per company
  const prospectCountByCompany = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of prospects) {
      if (p.company_id) {
        counts[p.company_id] = (counts[p.company_id] || 0) + 1
      }
    }
    return counts
  }, [prospects])
  const [viewMode, setViewMode] = useState<CompanyViewMode>('list')
  const [groupBy, setGroupBy] = useState<CompanyGroupBy>('industry')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const groupedCompanies = useMemo(() => {
    const groups: Record<string, AccountMapCompany[]> = {}
    for (const c of companies) {
      const key = c[groupBy] || 'Uncategorized'
      if (!groups[key]) groups[key] = []
      groups[key].push(c)
    }
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length)
  }, [companies, groupBy])

  const toggleGroup = (name: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Target Companies ({companies.length})</CardTitle>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex rounded-md border">
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2 rounded-r-none border-0"
              onClick={() => setViewMode('list')}
            >
              <List className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2 rounded-l-none border-0"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
          </div>
          {/* Group by dropdown (only in grid mode) */}
          {viewMode === 'grid' && (
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as CompanyGroupBy)}>
              <SelectTrigger className="h-7 w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(GROUP_BY_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <FeatureGate flag="acctmap_batch_search">
            {companies.length > 0 && personas.length > 0 && (
              <Button size="sm" onClick={onBatchSearch}>
                <UserSearch className="mr-1 h-4 w-4" /> Find All Prospects
              </Button>
            )}
          </FeatureGate>
          <FeatureGate flag="acctmap_chat_discovery">
            <Button size="sm" variant="outline" onClick={onDiscoveryChat}>
              <Sparkles className="mr-1 h-4 w-4" /> Discover via Chat
            </Button>
          </FeatureGate>
          <Button size="sm" onClick={onAddCompany}>
            <Plus className="mr-1 h-4 w-4" /> Add Company
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {companies.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No companies added yet. Add target companies to search for prospects.
          </p>
        ) : viewMode === 'list' ? (
          /* List view: stacked cards */
          <div className="space-y-3">
            {companies.map(company => (
              <CompanyCard
                key={company.id}
                company={company}
                prospectCount={prospectCountByCompany[company.id] || 0}
                sfMatch={sfIsInPipeline(company.company_name)}
                onSearchProspects={onSearchProspects}
                onDeleteCompany={onDeleteCompany}
              />
            ))}
          </div>
        ) : (
          /* Grid view: grouped sections */
          <div className="space-y-4">
            {groupedCompanies.map(([groupName, groupCompanies]) => {
              const isCollapsed = collapsedGroups.has(groupName)
              return (
                <div key={groupName} className="rounded-lg border">
                  <button
                    type="button"
                    onClick={() => toggleGroup(groupName)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{groupName}</span>
                      <Badge variant="secondary" className="text-[10px]">{groupCompanies.length}</Badge>
                    </div>
                    <ChevronDown className={cn('h-4 w-4 transition-transform', isCollapsed && '-rotate-90')} />
                  </button>
                  {!isCollapsed && (
                    <div className="px-4 pb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {groupCompanies.map(company => (
                        <CompanyCard
                          key={company.id}
                          company={company}
                          prospectCount={prospectCountByCompany[company.id] || 0}
                          onSearchProspects={onSearchProspects}
                          onDeleteCompany={onDeleteCompany}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════
// TAB: Prospects
// ═══════════════════════════════════════════════════════

function ProspectsTab({
  prospects,
  companies,
  personas,
  cadences,
  accountMapId,
  icpContext,
  sfIsInPipeline,
  selectedProspects,
  onToggleProspect,
  onToggleAll,
  onSearch,
  onBatchSearch,
  onEnrich,
  onBulkEnrich,
  onPromote,
  onDelete,
}: {
  prospects: Prospect[]
  companies: AccountMapCompany[]
  personas: BuyerPersona[]
  cadences: Array<{ id: string; name: string }>
  accountMapId: string
  icpContext: { productCategory: string; companyDescription: string }
  sfIsInPipeline: (domainOrName: string) => SalesforceMatch | null
  selectedProspects: Set<string>
  onToggleProspect: (id: string) => void
  onToggleAll: () => void
  onSearch: () => void
  onBatchSearch: () => void
  onEnrich: (p: Prospect) => void
  onBulkEnrich: (prospectIds: string[], companyWebsite?: string, onProgress?: (done: number, total: number) => void) => Promise<any>
  onPromote: () => void
  onDelete: (id: string) => void
}) {
  const { validateProspects, skipProspect, getOutreachStrategy, promoteProspectToLead, findDuplicateProspects, bulkDeleteProspects } = useAccountMapping()
  const [viewMode, setViewMode] = useState<'company' | 'table'>('company')
  const [validatingCompanyId, setValidatingCompanyId] = useState<string | null>(null)
  const [strategyCompanyId, setStrategyCompanyId] = useState<string | null>(null)
  const [strategies, setStrategies] = useState<Record<string, { strategy_name: string; overall_reasoning: string; steps: Array<{ order: number; prospect_name: string; role: string; reasoning: string; suggested_angle: string }> }>>({})
  const [loadingStrategy, setLoadingStrategy] = useState<string | null>(null)
  const [showSkipDialog, setShowSkipDialog] = useState<Prospect | null>(null)
  const [skipReason, setSkipReason] = useState('')
  const [addToCadenceProspect, setAddToCadenceProspect] = useState<Prospect | null>(null)
  const [selectedCadence, setSelectedCadence] = useState('')
  const [bulkEnriching, setBulkEnriching] = useState(false)
  const [bulkEnrichResult, setBulkEnrichResult] = useState<{
    enriched: number
    failed: number
    withPhone: number
    failReasonCounts: Record<string, number>
    emailCreditWarning: boolean
    phoneCreditWarning: boolean
  } | null>(null)
  const [enrichProgress, setEnrichProgress] = useState<{ done: number; total: number } | null>(null)
  const [findingDuplicates, setFindingDuplicates] = useState(false)
  const [dupResult, setDupResult] = useState<{ duplicatesOfLeads: number; duplicatesAmongProspects: number } | null>(null)

  const selectedCount = selectedProspects.size
  const promotableCount = prospects.filter((p) => selectedProspects.has(p.id) && p.status !== 'promoted').length

  // Build persona lookup
  const personaMap = useMemo(() => {
    const map: Record<string, BuyerPersona> = {}
    for (const p of personas) map[p.id] = p
    return map
  }, [personas])

  // Build company lookup
  const companyMap = useMemo(() => {
    const map: Record<string, AccountMapCompany> = {}
    for (const c of companies) map[c.id] = c
    return map
  }, [companies])

  // Group prospects by company
  const groupedByCompany = useMemo(() => {
    const groups: Record<string, { company: AccountMapCompany | null; prospects: Prospect[] }> = {}
    const activeProspects = prospects.filter(p => !p.skipped)
    const skippedProspects = prospects.filter(p => p.skipped)

    for (const p of activeProspects) {
      const key = p.company_id || 'unknown'
      if (!groups[key]) {
        groups[key] = { company: p.company_id ? companyMap[p.company_id] || null : null, prospects: [] }
      }
      groups[key].prospects.push(p)
    }

    // Sort prospects within each group by relevance_score descending
    for (const group of Object.values(groups)) {
      group.prospects.sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0))
    }

    // Sort companies by number of prospects descending
    const sorted = Object.entries(groups).sort(([, a], [, b]) => b.prospects.length - a.prospects.length)

    return { sorted, skippedCount: skippedProspects.length }
  }, [prospects, companyMap])

  // Companies with no prospects (for retry)
  const companiesWithNoProspects = useMemo(() => {
    const companyIdsWithProspects = new Set(prospects.filter(p => p.company_id).map(p => p.company_id))
    return companies.filter(c => !companyIdsWithProspects.has(c.id))
  }, [companies, prospects])

  const handleValidateCompany = async (companyId: string) => {
    setValidatingCompanyId(companyId)
    try {
      await validateProspects(accountMapId, companyId, icpContext.companyDescription, icpContext.productCategory, icpContext.companyDescription)
    } catch (err) {
      console.error('Validation failed:', err)
    } finally {
      setValidatingCompanyId(null)
    }
  }

  const handleGetStrategy = async (companyId: string) => {
    setLoadingStrategy(companyId)
    try {
      const strategy = await getOutreachStrategy(accountMapId, companyId, icpContext.companyDescription, icpContext.productCategory)
      if (strategy) {
        setStrategies(prev => ({ ...prev, [companyId]: strategy as unknown as typeof prev[string] }))
        setStrategyCompanyId(companyId)
      }
    } catch (err) {
      console.error('Strategy failed:', err)
    } finally {
      setLoadingStrategy(null)
    }
  }

  const handleSkip = async () => {
    if (!showSkipDialog) return
    try {
      await skipProspect(showSkipDialog.id, skipReason || undefined)
    } catch (err) {
      console.error('Skip failed:', err)
    } finally {
      setShowSkipDialog(null)
      setSkipReason('')
    }
  }

  const handleAddToCadence = async () => {
    if (!addToCadenceProspect || !selectedCadence) return
    try {
      await promoteProspectToLead(addToCadenceProspect.id, selectedCadence)
    } catch (err) {
      console.error('Add to cadence failed:', err)
    } finally {
      setAddToCadenceProspect(null)
      setSelectedCadence('')
    }
  }

  const handleExportCSV = () => {
    const activeProspects = prospects.filter(p => !p.skipped)
    const headers = ['First Name', 'Last Name', 'Title', 'Company', 'LinkedIn URL', 'Email', 'Phone', 'Buying Role', 'Relevance Score', 'Outreach Angle', 'Status']
    const rows = activeProspects.map(p => [
      p.first_name, p.last_name, p.title || '', p.company || '',
      p.linkedin_url || '', p.email || '', p.phone || '',
      p.buying_role || '', p.relevance_score?.toString() || '',
      p.outreach_angle || '', p.status,
    ])
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${(v || '').replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'prospects.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleBulkEnrich = async () => {
    const ids = Array.from(selectedProspects)
    if (ids.length === 0) return
    setBulkEnriching(true)
    setBulkEnrichResult(null)
    setEnrichProgress({ done: 0, total: ids.length })
    try {
      const res = await onBulkEnrich(ids, undefined, (done, total) => setEnrichProgress({ done, total }))
      setBulkEnrichResult({
        enriched: res.summary?.enriched || 0,
        failed: (res.summary?.total || 0) - (res.summary?.enriched || 0),
        withPhone: res.summary?.withPhone || 0,
        failReasonCounts: res.summary?.failReasonCounts || {},
        emailCreditWarning: res.summary?.emailCreditWarning || false,
        phoneCreditWarning: res.summary?.phoneCreditWarning || false,
      })
    } catch (err) {
      console.error('Bulk enrichment failed:', err)
      alert(err instanceof Error ? err.message : 'Enrichment failed')
    } finally {
      setBulkEnriching(false)
      setEnrichProgress(null)
    }
  }

  const handleFindDuplicates = async () => {
    setFindingDuplicates(true)
    setDupResult(null)
    try {
      const activeProspects = prospects.filter(p => !p.skipped)
      const result = await findDuplicateProspects(activeProspects)
      setDupResult({
        duplicatesOfLeads: result.duplicatesOfLeads,
        duplicatesAmongProspects: result.duplicatesAmongProspects,
      })
      // Pre-select duplicates for easy deletion
      if (result.duplicateIds.size > 0) {
        for (const id of result.duplicateIds) {
          if (!selectedProspects.has(id)) onToggleProspect(id)
        }
      }
    } catch (err) {
      console.error('Find duplicates failed:', err)
      alert(err instanceof Error ? err.message : 'Failed to find duplicates')
    } finally {
      setFindingDuplicates(false)
    }
  }

  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedProspects)
    if (ids.length === 0) return
    if (!confirm(`Delete ${ids.length} selected prospect${ids.length !== 1 ? 's' : ''}? This cannot be undone.`)) return
    try {
      await bulkDeleteProspects(ids)
    } catch (e) {
      console.error('Bulk delete failed:', e)
    }
    setDupResult(null)
  }

  const handleSelectByPersona = (personaId: string) => {
    const activeProspects = prospects.filter(p => !p.skipped)
    for (const p of activeProspects) {
      const shouldBeSelected = p.persona_id === personaId
      const isSelected = selectedProspects.has(p.id)
      if (shouldBeSelected && !isSelected) onToggleProspect(p.id)
      if (!shouldBeSelected && isSelected) onToggleProspect(p.id)
    }
  }

  const handleSelectByContact = (mode: 'no_email' | 'no_phone' | 'no_both' | 'has_email' | 'has_phone' | 'has_both') => {
    const activeProspects = prospects.filter(p => !p.skipped)
    const matching = activeProspects.filter(p => {
      if (mode === 'no_email') return !p.email
      if (mode === 'no_phone') return !p.phone
      if (mode === 'no_both') return !p.email && !p.phone
      if (mode === 'has_email') return !!p.email
      if (mode === 'has_phone') return !!p.phone
      if (mode === 'has_both') return !!p.email && !!p.phone
      return false
    })
    // Toggle on all matching, toggle off those that don't match
    for (const p of activeProspects) {
      const shouldBeSelected = matching.some(m => m.id === p.id)
      const isSelected = selectedProspects.has(p.id)
      if (shouldBeSelected && !isSelected) onToggleProspect(p.id)
      if (!shouldBeSelected && isSelected) onToggleProspect(p.id)
    }
  }

  const roleIcon = (role: string | null) => {
    const icons: Record<string, string> = { decision_maker: '🎯', champion: '🏗️', influencer: '💡', technical_evaluator: '🔧', budget_holder: '💰', end_user: '👤' }
    return role ? icons[role] || '' : ''
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-base">Prospects ({prospects.filter(p => !p.skipped).length})</CardTitle>
            {prospects.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={onToggleAll}
              >
                {selectedCount === prospects.length ? 'Deselect All' : 'Select All'}
              </Button>
            )}
            {prospects.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-7 text-xs">
                    <ListFilter className="mr-1 h-3.5 w-3.5" /> Select by Contact
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuLabel className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide py-1">Sin contacto</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => handleSelectByContact('no_email')}>
                    <Mail className="mr-2 h-4 w-4 text-muted-foreground" /> Without Email
                    <Badge variant="secondary" className="ml-auto text-xs">{prospects.filter(p => !p.skipped && !p.email).length}</Badge>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleSelectByContact('no_phone')}>
                    <Phone className="mr-2 h-4 w-4 text-muted-foreground" /> Without Phone
                    <Badge variant="secondary" className="ml-auto text-xs">{prospects.filter(p => !p.skipped && !p.phone).length}</Badge>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleSelectByContact('no_both')}>
                    <ListFilter className="mr-2 h-4 w-4 text-muted-foreground" /> Without Email & Phone
                    <Badge variant="secondary" className="ml-auto text-xs">{prospects.filter(p => !p.skipped && !p.email && !p.phone).length}</Badge>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide py-1">Con contacto</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => handleSelectByContact('has_email')}>
                    <Mail className="mr-2 h-4 w-4 text-green-500" /> With Email
                    <Badge variant="secondary" className="ml-auto text-xs">{prospects.filter(p => !p.skipped && !!p.email).length}</Badge>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleSelectByContact('has_phone')}>
                    <Phone className="mr-2 h-4 w-4 text-green-500" /> With Phone
                    <Badge variant="secondary" className="ml-auto text-xs">{prospects.filter(p => !p.skipped && !!p.phone).length}</Badge>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleSelectByContact('has_both')}>
                    <ListFilter className="mr-2 h-4 w-4 text-green-500" /> With Email & Phone
                    <Badge variant="secondary" className="ml-auto text-xs">{prospects.filter(p => !p.skipped && !!p.email && !!p.phone).length}</Badge>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {prospects.length > 0 && personas.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-7 text-xs">
                    <Users className="mr-1 h-3.5 w-3.5" /> Select by Persona
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {personas.map(persona => {
                    const count = prospects.filter(p => !p.skipped && p.persona_id === persona.id).length
                    return (
                      <DropdownMenuItem key={persona.id} onClick={() => handleSelectByPersona(persona.id)}>
                        <span className="mr-2">{roleIcon(persona.role_in_buying_committee)}</span>
                        {persona.name}
                        <Badge variant="secondary" className="ml-auto text-xs">{count}</Badge>
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {selectedCount > 0 && (
              <>
                <Badge variant="secondary">{selectedCount} selected</Badge>
                <Button size="sm" variant="outline" onClick={handleBulkEnrich} disabled={bulkEnriching}>
                  {bulkEnriching && enrichProgress ? (
                    <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Enriching {enrichProgress.done}/{enrichProgress.total}...</>
                  ) : bulkEnriching ? (
                    <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Starting...</>
                  ) : (
                    <>Enrich Selected</>
                  )}
                </Button>
                {promotableCount > 0 && (
                  <Button size="sm" onClick={onPromote}>
                    <ArrowUpRight className="mr-1 h-4 w-4" /> Promote to Leads
                  </Button>
                )}
                <Button size="sm" variant="destructive" onClick={handleDeleteSelected}>
                  <Trash2 className="mr-1 h-4 w-4" /> Delete Selected
                </Button>
              </>
            )}
            {bulkEnrichResult && (
              <EnrichSummaryBadge result={bulkEnrichResult} onDismiss={() => setBulkEnrichResult(null)} />
            )}
            {dupResult && dupResult.duplicatesAmongProspects > 0 && (
              <Badge variant="destructive">
                {dupResult.duplicatesAmongProspects} duplicates found
              </Badge>
            )}
            {dupResult && dupResult.duplicatesAmongProspects === 0 && (
              <Badge variant="secondary">No duplicates</Badge>
            )}
            <Button size="sm" variant="outline" onClick={handleFindDuplicates} disabled={findingDuplicates || prospects.length === 0}>
              {findingDuplicates ? (
                <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Scanning...</>
              ) : (
                <><Copy className="mr-1 h-4 w-4" /> Find Duplicates</>
              )}
            </Button>
            <Button size="sm" variant="outline" onClick={handleExportCSV} disabled={prospects.length === 0}>
              <FileText className="mr-1 h-4 w-4" /> Export CSV
            </Button>
            <div className="flex rounded-md border">
              <button
                className={cn('px-2 py-1 text-xs', viewMode === 'company' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
                onClick={() => setViewMode('company')}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                className={cn('px-2 py-1 text-xs', viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
                onClick={() => setViewMode('table')}
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
            <Button size="sm" variant="outline" onClick={onSearch}>
              <Search className="mr-1 h-4 w-4" /> Manual Search
            </Button>
            <FeatureGate flag="acctmap_batch_search">
              <Button size="sm" onClick={onBatchSearch}>
                <UserSearch className="mr-1 h-4 w-4" /> Find All Prospects
              </Button>
            </FeatureGate>
          </div>
        </CardHeader>
        <CardContent>
          {prospects.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                No prospects yet. Use batch search to find prospects across all companies.
              </p>
              <div className="flex items-center justify-center gap-2">
                <Button size="sm" variant="outline" onClick={onSearch}>
                  <Search className="mr-1 h-4 w-4" /> Manual Search
                </Button>
                <FeatureGate flag="acctmap_batch_search">
                  <Button size="sm" onClick={onBatchSearch}>
                    <UserSearch className="mr-1 h-4 w-4" /> Find All Prospects
                  </Button>
                </FeatureGate>
              </div>
            </div>
          ) : viewMode === 'company' ? (
            <div className="space-y-6">
              {groupedByCompany.sorted.map(([companyId, group]) => {
                const companyName = group.company?.company_name || 'Unknown Company'
                const companySize = group.company?.company_size || ''
                const sizeLabel = companySize ? ` · ${companySize}` : ''
                const isValidating = validatingCompanyId === companyId
                const hasValidated = group.prospects.some(p => p.ai_validated)
                const strategy = strategies[companyId]
                const isLoadingStrat = loadingStrategy === companyId

                return (
                  <div key={companyId} className="rounded-lg border">
                    {/* Company Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b flex-wrap gap-y-2">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-semibold text-sm truncate max-w-[200px]">{companyName}</span>
                        <SalesforceBadge match={sfIsInPipeline(companyName)} compact />
                        <span className="text-xs text-muted-foreground truncate">{group.company?.industry || ''}{sizeLabel}</span>
                        <Badge variant="secondary" className="text-[10px] shrink-0">{group.prospects.length} prospects</Badge>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {!hasValidated && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            onClick={() => handleValidateCompany(companyId)}
                            disabled={isValidating}
                          >
                            {isValidating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                            Validate with AI
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() => handleGetStrategy(companyId)}
                          disabled={isLoadingStrat}
                        >
                          {isLoadingStrat ? <Loader2 className="h-3 w-3 animate-spin" /> : <Target className="h-3 w-3" />}
                          Outreach Strategy
                        </Button>
                      </div>
                    </div>

                    {/* Outreach Strategy Panel */}
                    {strategyCompanyId === companyId && strategy && (
                      <div className="px-4 py-3 bg-blue-50/50 border-b">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-xs font-semibold text-blue-700">
                            Suggested Strategy: {strategy.strategy_name}
                          </h4>
                          <button className="text-xs text-muted-foreground hover:underline" onClick={() => setStrategyCompanyId(null)}>
                            Hide
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground mb-3">{strategy.overall_reasoning}</p>
                        <div className="space-y-2">
                          {(strategy.steps || []).map((step, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <Badge variant="outline" className="text-[10px] h-5 shrink-0">Step {step.order}</Badge>
                              <div className="text-xs">
                                <span className="font-medium">{roleIcon(step.role)} {step.prospect_name}</span>
                                <span className="text-muted-foreground"> ({step.role})</span>
                                <p className="text-muted-foreground mt-0.5">{step.reasoning}</p>
                                <p className="text-blue-600 mt-0.5">→ {step.suggested_angle}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Prospect Cards */}
                    <div className="divide-y">
                      {group.prospects.map((prospect) => {
                        const persona = prospect.persona_id ? personaMap[prospect.persona_id] : null
                        const roleConfig = prospect.buying_role
                          ? BUYING_ROLE_CONFIG[prospect.buying_role as BuyingCommitteeRole]
                          : null
                        const statusConfig = PROSPECT_STATUS_CONFIG[prospect.status]

                        return (
                          <div
                            key={prospect.id}
                            className="flex items-start gap-3 px-4 py-3 hover:bg-muted/20 cursor-pointer"
                            onClick={(e) => {
                              // Don't toggle if clicking on buttons, links, or dropdown
                              const target = e.target as HTMLElement
                              if (target.closest('button') || target.closest('a') || target.closest('[role="menuitem"]')) return
                              onToggleProspect(prospect.id)
                            }}
                          >
                            <Checkbox
                              className="mt-1"
                              checked={selectedProspects.has(prospect.id)}
                              onCheckedChange={() => onToggleProspect(prospect.id)}
                            />
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-lg leading-none">{roleIcon(prospect.buying_role)}</span>
                                <span className="text-sm font-medium">
                                  {prospect.first_name} {prospect.last_name}
                                </span>
                                {prospect.relevance_score != null && (
                                  <Badge
                                    variant={prospect.relevance_score >= 7 ? 'default' : prospect.relevance_score >= 4 ? 'secondary' : 'outline'}
                                    className="text-[10px] h-4"
                                  >
                                    {prospect.relevance_score}/10
                                  </Badge>
                                )}
                                {roleConfig && (
                                  <Badge variant="outline" className={`text-[10px] h-4 ${roleConfig.color}`}>
                                    {roleConfig.label}
                                  </Badge>
                                )}
                                <Badge variant={statusConfig.variant} className="text-[10px] h-4">
                                  {statusConfig.label}
                                </Badge>
                                <Mail className={`h-3 w-3 ${prospect.email ? 'text-green-500' : 'text-muted-foreground/30'}`} />
                                <Phone className={`h-3 w-3 ${prospect.phone ? 'text-green-500' : 'text-muted-foreground/30'}`} />
                              </div>
                              <p className="text-xs text-muted-foreground break-words">
                                {prospect.title || 'Unknown title'} · {prospect.company || companyName}
                                {persona && <span className="ml-1">· {persona.name}</span>}
                              </p>
                              {prospect.headline && (
                                <p className="text-xs text-muted-foreground truncate">{prospect.headline}</p>
                              )}
                              {prospect.outreach_angle && (
                                <p className="text-xs text-blue-600 mt-1 break-words">
                                  💡 {prospect.outreach_angle}
                                </p>
                              )}
                              {prospect.red_flags && (
                                <p className="text-xs text-amber-600 mt-0.5 break-words">
                                  ⚠️ {prospect.red_flags}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {prospect.linkedin_url && (
                                <a
                                  href={prospect.linkedin_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              )}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {prospect.status !== 'promoted' && (
                                    <DropdownMenuItem onClick={() => setAddToCadenceProspect(prospect)}>
                                      <ArrowUpRight className="mr-2 h-4 w-4" /> Add to Cadence
                                    </DropdownMenuItem>
                                  )}
                                  {prospect.status === 'new' && (
                                    <DropdownMenuItem onClick={() => onEnrich(prospect)}>
                                      <Sparkles className="mr-2 h-4 w-4" /> Enrich
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={() => setShowSkipDialog(prospect)}>
                                    <ShieldX className="mr-2 h-4 w-4" /> Skip
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => onDelete(prospect.id)}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              {/* Companies with no prospects */}
              {companiesWithNoProspects.length > 0 && (
                <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/50 px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-amber-700">
                      ⚠️ {companiesWithNoProspects.length} companies with no prospects found
                    </p>
                    <FeatureGate flag="acctmap_batch_search">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onBatchSearch}>
                        <UserSearch className="mr-1 h-3 w-3" /> Retry Search
                      </Button>
                    </FeatureGate>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {companiesWithNoProspects.map(c => (
                      <Badge key={c.id} variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                        {c.company_name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Skipped count */}
              {groupedByCompany.skippedCount > 0 && (
                <p className="text-xs text-muted-foreground text-center">
                  {groupedByCompany.skippedCount} skipped prospect{groupedByCompany.skippedCount > 1 ? 's' : ''} hidden
                </p>
              )}
            </div>
          ) : (
            /* Table view (legacy) */
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selectedProspects.size === prospects.length && prospects.length > 0}
                      onCheckedChange={onToggleAll}
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {prospects.filter(p => !p.skipped).map((prospect) => {
                  const statusConfig = PROSPECT_STATUS_CONFIG[prospect.status]
                  const roleConfig = prospect.buying_role
                    ? BUYING_ROLE_CONFIG[prospect.buying_role as BuyingCommitteeRole]
                    : null
                  return (
                    <TableRow key={prospect.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedProspects.has(prospect.id)}
                          onCheckedChange={() => onToggleProspect(prospect.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>{roleIcon(prospect.buying_role)}</span>
                          {prospect.first_name} {prospect.last_name}
                          {prospect.linkedin_url && (
                            <a href={prospect.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                        {prospect.outreach_angle && (
                          <p className="text-xs text-blue-600 truncate max-w-[250px]">💡 {prospect.outreach_angle}</p>
                        )}
                      </TableCell>
                      <TableCell>{prospect.title || '-'}</TableCell>
                      <TableCell>{prospect.company || '-'}</TableCell>
                      <TableCell>
                        {roleConfig && (
                          <Badge variant="outline" className={`text-[10px] h-4 ${roleConfig.color}`}>
                            {roleConfig.label}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {prospect.relevance_score != null ? (
                          <Badge
                            variant={prospect.relevance_score >= 7 ? 'default' : prospect.relevance_score >= 4 ? 'secondary' : 'outline'}
                            className="text-[10px]"
                          >
                            {prospect.relevance_score}/10
                          </Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Mail className={`h-3.5 w-3.5 ${prospect.email ? 'text-green-500' : 'text-muted-foreground/30'}`} />
                          <Phone className={`h-3.5 w-3.5 ${prospect.phone ? 'text-green-500' : 'text-muted-foreground/30'}`} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {prospect.status !== 'promoted' && (
                              <DropdownMenuItem onClick={() => setAddToCadenceProspect(prospect)}>
                                <ArrowUpRight className="mr-2 h-4 w-4" /> Add to Cadence
                              </DropdownMenuItem>
                            )}
                            {prospect.status === 'new' && (
                              <DropdownMenuItem onClick={() => onEnrich(prospect)}>
                                <Sparkles className="mr-2 h-4 w-4" /> Enrich
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => setShowSkipDialog(prospect)}>
                              <ShieldX className="mr-2 h-4 w-4" /> Skip
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => onDelete(prospect.id)}>
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Skip Dialog */}
      <Dialog open={!!showSkipDialog} onOpenChange={(o) => { if (!o) { setShowSkipDialog(null); setSkipReason('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Skip Prospect</DialogTitle>
            <DialogDescription>
              Skip {showSkipDialog?.first_name} {showSkipDialog?.last_name}? You can undo this later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-sm">Reason (optional)</Label>
            <Select value={skipReason} onValueChange={setSkipReason}>
              <SelectTrigger><SelectValue placeholder="Select reason..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="wrong_person">Wrong person</SelectItem>
                <SelectItem value="already_contacted">Already contacted</SelectItem>
                <SelectItem value="left_company">Left company</SelectItem>
                <SelectItem value="not_relevant">Not relevant</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowSkipDialog(null); setSkipReason('') }}>Cancel</Button>
            <Button onClick={handleSkip}>Skip Prospect</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add to Cadence Dialog */}
      <Dialog open={!!addToCadenceProspect} onOpenChange={(o) => { if (!o) { setAddToCadenceProspect(null); setSelectedCadence('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add to Cadence</DialogTitle>
            <DialogDescription>
              Promote {addToCadenceProspect?.first_name} {addToCadenceProspect?.last_name} to a lead and assign to a cadence.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-sm">Select Cadence</Label>
            <Select value={selectedCadence} onValueChange={setSelectedCadence}>
              <SelectTrigger><SelectValue placeholder="Choose cadence..." /></SelectTrigger>
              <SelectContent>
                {cadences.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddToCadenceProspect(null); setSelectedCadence('') }}>Cancel</Button>
            <Button onClick={handleAddToCadence} disabled={!selectedCadence}>
              <ArrowUpRight className="mr-1 h-4 w-4" /> Add to Cadence
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// DIALOG: Add Company
// ═══════════════════════════════════════════════════════

function AddCompanyDialog({
  open,
  onOpenChange,
  accountMapId,
  ownerId,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountMapId: string
  ownerId: string
  onAdd: (company: Omit<AccountMapCompany, 'id' | 'created_at' | 'updated_at' | 'org_id'>) => Promise<AccountMapCompany | null>
}) {
  const [name, setName] = useState('')
  const [industry, setIndustry] = useState('')
  const [size, setSize] = useState('')
  const [website, setWebsite] = useState('')
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [location, setLocation] = useState('')
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setName(''); setIndustry(''); setSize(''); setWebsite(''); setLinkedinUrl(''); setLocation('')
  }

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onAdd({
        account_map_id: accountMapId,
        owner_id: ownerId,
        company_name: name.trim(),
        industry: industry || null,
        company_size: size || null,
        website: website || null,
        linkedin_url: linkedinUrl || null,
        location: location || null,
        description: null,
      })
      reset()
      onOpenChange(false)
    } catch (err) {
      console.error('Failed to add company:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Company</DialogTitle>
          <DialogDescription>Add a target company to this account map</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Company Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Amazon" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Industry</Label>
              <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g., E-commerce" />
            </div>
            <div className="space-y-2">
              <Label>Company Size *</Label>
              <Select value={size} onValueChange={setSize}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {COMPANY_SIZE_OPTIONS.map((o) => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {size && (
                <p className="text-xs text-muted-foreground mt-1">
                  Tier: <strong>
                    {['1001-5000', '5001-10000', '10001+'].includes(size) ? 'Enterprise' :
                     ['1-10', '11-50'].includes(size) ? 'Startup/SMB' : 'Mid-Market'}
                  </strong> — se usarán las keywords de esa tier al buscar prospects.
                </p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Website</Label>
            <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="e.g., amazon.com" />
          </div>
          <div className="space-y-2">
            <Label>LinkedIn URL</Label>
            <Input value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="e.g., linkedin.com/company/amazon" />
          </div>
          <div className="space-y-2">
            <Label>Location</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g., Seattle, WA" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim() || !size}>
            {saving ? 'Saving...' : 'Add Company'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ═══════════════════════════════════════════════════════
// DIALOG: Search Sales Navigator
// ═══════════════════════════════════════════════════════

function SearchProspectsDialog({
  open,
  onOpenChange,
  accountMapId,
  companies,
  personas,
  filters,
  onSearch,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountMapId: string
  companies: AccountMapCompany[]
  personas: BuyerPersona[]
  filters: AccountMapFilters
  onSearch: (params: any) => Promise<any>
  onSave: (accountMapId: string, companyId: string | null, prospects: SalesNavResult[]) => Promise<number>
}) {
  const [keywords, setKeywords] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [titleKeywords, setTitleKeywords] = useState('')
  const [location, setLocation] = useState((filters.location || [])[0] || '')
  const [seniority, setSeniority] = useState<string[]>(filters.seniority || [])
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<SalesNavResult[]>([])
  const [selectedResults, setSelectedResults] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  const reset = () => {
    setKeywords(''); setCompanyName(''); setTitleKeywords(''); setResults([])
    setSelectedResults(new Set()); setHasSearched(false)
  }

  // Pre-fill title keywords from personas
  const prefillFromPersonas = () => {
    const allKeywords = personas.flatMap((p) => p.title_keywords)
    setTitleKeywords(allKeywords.join(', '))
  }

  const handleSearch = async () => {
    setSearching(true)
    setResults([])
    setSelectedResults(new Set())
    try {
      const response = await onSearch({
        accountMapId,
        keywords: keywords || undefined,
        companyNames: companyName ? [companyName] : companies.map((c) => c.company_name),
        titleKeywords: titleKeywords ? titleKeywords.split(',').map((k) => k.trim()).filter(Boolean) : undefined,
        location: location || undefined,
        seniority: seniority.length > 0 ? seniority : undefined,
        limit: 25,
      })
      setResults(response.results || [])
      // Select all by default
      setSelectedResults(new Set(response.results?.map((_: unknown, i: number) => i) || []))
      setHasSearched(true)
    } catch (err) {
      console.error('Search failed:', err)
      alert(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  const handleSave = async () => {
    const selected = results.filter((_, i) => selectedResults.has(i))
    if (selected.length === 0) return
    setSaving(true)
    try {
      const count = await onSave(accountMapId, null, selected)
      alert(`${count} prospects saved!`)
      reset()
      onOpenChange(false)
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Search Sales Navigator</DialogTitle>
          <DialogDescription>Find prospects matching your ICP criteria</DialogDescription>
        </DialogHeader>

        {/* Search form */}
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Keywords</Label>
              <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="e.g., payments fintech" />
            </div>
            <div className="space-y-2">
              <Label>Company Name</Label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Leave empty to search all companies" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Title Keywords (comma-separated)</Label>
              {personas.length > 0 && (
                <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={prefillFromPersonas}>
                  Pre-fill from personas
                </Button>
              )}
            </div>
            <Input
              value={titleKeywords}
              onChange={(e) => setTitleKeywords(e.target.value)}
              placeholder="e.g., CTO, VP Engineering, Head of Payments"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Location</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g., United States" />
            </div>
            <div className="space-y-2">
              <Label>Seniority</Label>
              <div className="flex flex-wrap gap-1">
                {SENIORITY_OPTIONS.map((s) => (
                  <Badge
                    key={s}
                    variant={seniority.includes(s) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => {
                      setSeniority(
                        seniority.includes(s)
                          ? seniority.filter((v) => v !== s)
                          : [...seniority, s]
                      )
                    }}
                  >
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <Button onClick={handleSearch} disabled={searching} className="w-full">
            {searching ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Searching...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" /> Search
              </>
            )}
          </Button>
        </div>

        {/* Results */}
        {hasSearched && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{results.length} results found</p>
              {results.length > 0 && (
                <p className="text-sm text-muted-foreground">{selectedResults.size} selected</p>
              )}
            </div>
            {results.length > 0 ? (
              <div className="max-h-[300px] overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={selectedResults.size === results.length}
                          onCheckedChange={() => {
                            if (selectedResults.size === results.length) {
                              setSelectedResults(new Set())
                            } else {
                              setSelectedResults(new Set(results.map((_, i) => i)))
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Location</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Checkbox
                            checked={selectedResults.has(i)}
                            onCheckedChange={() => {
                              setSelectedResults((prev) => {
                                const next = new Set(prev)
                                if (next.has(i)) next.delete(i)
                                else next.add(i)
                                return next
                              })
                            }}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{r.firstName} {r.lastName}</TableCell>
                        <TableCell>{r.title || '-'}</TableCell>
                        <TableCell>{r.company || '-'}</TableCell>
                        <TableCell>{r.location || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">No results found. Try adjusting your search criteria.</p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {results.length > 0 && (
            <Button onClick={handleSave} disabled={saving || selectedResults.size === 0}>
              {saving ? 'Saving...' : `Save ${selectedResults.size} Prospects`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ═══════════════════════════════════════════════════════
// DIALOG: Enrich Prospect
// ═══════════════════════════════════════════════════════

function EnrichDialog({
  open,
  onOpenChange,
  prospect,
  companies,
  onEnrich,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  prospect: Prospect
  companies: AccountMapCompany[]
  onEnrich: (prospectId: string, companyWebsite?: string) => Promise<any>
}) {
  const linkedCompany = companies.find((c) => c.id === prospect.company_id)
  const [website, setWebsite] = useState(linkedCompany?.website || '')
  const [enriching, setEnriching] = useState(false)
  const [result, setResult] = useState<{
    email: string | null
    phone: string | null
    source: string
    emailCreditWarning: boolean
    phoneCreditWarning: boolean
  } | null>(null)

  const handleEnrich = async () => {
    setEnriching(true)
    setResult(null)
    try {
      const res = await onEnrich(prospect.id, website || undefined)
      const first = res.results?.[0]
      if (first) {
        setResult({
          email: first.email || null,
          phone: first.phone || null,
          source: first.source || 'unknown',
          emailCreditWarning: first.emailCreditWarning || res.summary?.emailCreditWarning || false,
          phoneCreditWarning: first.phoneCreditWarning || res.summary?.phoneCreditWarning || false,
        })
      }
    } catch (err) {
      console.error('Enrichment failed:', err)
      alert(err instanceof Error ? err.message : 'Enrichment failed')
    } finally {
      setEnriching(false)
    }
  }

  const hasLinkedIn = !!prospect.linkedin_url

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enriquecer Prospect</DialogTitle>
          <DialogDescription>
            Buscar email y telefono de {prospect.first_name} {prospect.last_name} via Apollo.io
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="rounded-md bg-muted p-3 text-sm">
            <p className="font-medium">{prospect.first_name} {prospect.last_name}</p>
            <p className="text-muted-foreground">{prospect.title} at {prospect.company}</p>
            {prospect.linkedin_url && (
              <p className="text-xs text-blue-600 mt-1 truncate">{prospect.linkedin_url}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Website de la empresa (opcional, mejora la busqueda)</Label>
            <Input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="ej: empresa.com"
            />
          </div>
          <Button onClick={handleEnrich} disabled={enriching || (!hasLinkedIn && !website.trim())} className="w-full">
            {enriching ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Buscando...</>
            ) : (
              <><Sparkles className="mr-2 h-4 w-4" /> Enriquecer</>
            )}
          </Button>
          {!hasLinkedIn && !website.trim() && (
            <p className="text-xs text-muted-foreground text-center">
              Se necesita al menos LinkedIn URL o website para buscar
            </p>
          )}

          {result && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs capitalize">{result.source}</Badge>
              </div>
              <div>
                <p className="text-sm font-medium">Email</p>
                <p className={`text-sm ${result.email ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                  {result.email || 'No encontrado'}
                </p>
                {!result.email && result.emailCreditWarning && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    <span>⚠️</span> Apollo encontró el perfil pero no devolvió email — posiblemente se agotaron los créditos de email reveal. Revisa tu plan en Apollo.io.
                  </p>
                )}
              </div>
              <div>
                <p className="text-sm font-medium">Telefono</p>
                <p className={`text-sm ${result.phone ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                  {result.phone || 'No encontrado'}
                </p>
                {!result.phone && result.phoneCreditWarning && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    <span>⚠️</span> Apollo encontró el perfil pero no devolvió teléfono — posiblemente se agotaron los créditos de mobile phone reveal. Revisa tu plan en Apollo.io.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {result ? 'Listo' : 'Cancelar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ═══════════════════════════════════════════════════════
// COMPONENT: Enrich Result Summary Badge
// ═══════════════════════════════════════════════════════

const FAIL_REASON_LABELS: Record<string, { label: string; color: string; detail: string }> = {
  not_in_apollo:          { label: 'No encontrado en Apollo',  color: 'text-muted-foreground', detail: 'Apollo no tiene datos de esta persona. Prueba agregar la URL de LinkedIn o el website de la empresa.' },
  no_contact_data:        { label: 'Sin datos de contacto',    color: 'text-amber-600',        detail: 'Apollo encontró el perfil pero no tiene email ni teléfono en su base de datos.' },
  no_identifier:          { label: 'Sin identificador',        color: 'text-orange-600',       detail: 'Falta LinkedIn URL y dominio. Agrega al menos uno para poder buscar en Apollo.' },
  apollo_credit_exhausted:{ label: 'Créditos agotados',        color: 'text-red-600',          detail: 'Se agotaron los créditos de Apollo. Revisa tu plan en apollo.io.' },
  apollo_rate_limit:      { label: 'Rate limit Apollo',        color: 'text-red-500',          detail: 'Apollo respondió con rate limit. Reintenta en unos minutos.' },
  apollo_error:           { label: 'Error de Apollo',          color: 'text-red-500',          detail: 'Apollo retornó un error inesperado.' },
  no_api_key:             { label: 'Sin API key',              color: 'text-red-600',          detail: 'No hay API key de Apollo configurada en las variables de entorno.' },
  request_error:          { label: 'Error de red',             color: 'text-red-500',          detail: 'Error al llamar al servidor. Reintenta.' },
}

function EnrichSummaryBadge({
  result,
  onDismiss,
}: {
  result: {
    enriched: number
    failed: number
    withPhone: number
    failReasonCounts: Record<string, number>
    emailCreditWarning: boolean
    phoneCreditWarning: boolean
  }
  onDismiss: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const hasFailures = result.failed > 0
  const failEntries = Object.entries(result.failReasonCounts).sort((a, b) => b[1] - a[1])

  return (
    <div className="rounded-md border bg-background shadow-sm text-xs max-w-sm">
      <div className="flex items-center gap-2 px-3 py-2">
        {result.enriched > 0 ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
        )}
        <span className="font-medium">
          {result.enriched} con email
          {result.withPhone > 0 && `, ${result.withPhone} con teléfono`}
          {hasFailures && ` · ${result.failed} sin datos`}
        </span>
        {hasFailures && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="ml-auto text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        )}
        <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground ml-1">
          <XCircle className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded && failEntries.length > 0 && (
        <div className="border-t px-3 py-2 space-y-1.5">
          <p className="text-muted-foreground font-medium mb-1">Por qué no se encontró contacto:</p>
          {failEntries.map(([reason, count]) => {
            const cfg = FAIL_REASON_LABELS[reason] || { label: reason, color: 'text-muted-foreground', detail: '' }
            return (
              <div key={reason} className="space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className={`font-medium ${cfg.color}`}>{cfg.label}</span>
                  <Badge variant="secondary" className="text-[10px] shrink-0">{count}</Badge>
                </div>
                {cfg.detail && <p className="text-muted-foreground leading-snug">{cfg.detail}</p>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// DIALOG: Promote Prospects to Leads
// ═══════════════════════════════════════════════════════

function PromoteDialog({
  open,
  onOpenChange,
  prospects,
  cadences,
  onPromote,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  prospects: Prospect[]
  cadences: Array<{ id: string; name: string }>
  onPromote: (ids: string[], cadenceId?: string) => Promise<{ promoted: number; duplicates: number }>
}) {
  const [cadenceId, setCadenceId] = useState<string>('')
  const [promoting, setPromoting] = useState(false)

  const handlePromote = async () => {
    setPromoting(true)
    try {
      const result = await onPromote(
        prospects.map((p) => p.id),
        cadenceId || undefined
      )
      const msg = `${result.promoted} prospect${result.promoted !== 1 ? 's' : ''} promoted to leads.${
        result.duplicates > 0 ? ` (${result.duplicates} duplicates detected)` : ''
      }`
      alert(msg)
      onOpenChange(false)
    } catch (err) {
      console.error('Promote failed:', err)
    } finally {
      setPromoting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Promote to Leads</DialogTitle>
          <DialogDescription>
            Move {prospects.length} prospect{prospects.length !== 1 ? 's' : ''} to your leads pipeline
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="rounded-md bg-muted p-3 text-sm space-y-1">
            {prospects.slice(0, 5).map((p) => (
              <p key={p.id}>{p.first_name} {p.last_name} — {p.company || 'Unknown company'}</p>
            ))}
            {prospects.length > 5 && (
              <p className="text-muted-foreground">...and {prospects.length - 5} more</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Assign to Cadence (optional)</Label>
            <Select value={cadenceId} onValueChange={setCadenceId}>
              <SelectTrigger><SelectValue placeholder="No cadence" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No cadence</SelectItem>
                {cadences.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {promoting && (
          <p className="text-xs text-muted-foreground text-center">
            This may take 15 seconds to a minute depending on the number of prospects.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={promoting}>Cancel</Button>
          <Button onClick={handlePromote} disabled={promoting || prospects.length === 0}>
            {promoting ? 'Promoting...' : `Promote ${prospects.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

