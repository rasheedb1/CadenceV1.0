import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAccountMapping, type SalesNavResult, type DiscoveredCompany, type FitCategory, FIT_CATEGORY_CONFIG, type SuggestedPersona } from '@/contexts/AccountMappingContext'
import type { EnrichmentStatus, CompanyEnrichment, EnrichCompanyResponse, ReEvaluatedCompany } from '@/types/enrichment'
import { EXCLUSION_TYPES } from '@/types/registry'
import { normalizeCompanyName, buildNormalizedSet } from '@/lib/company-normalize'
import { EnrichmentBadge } from '@/components/account-mapping/EnrichmentBadge'
import { EvidencePanel } from '@/components/account-mapping/EvidencePanel'
import { AddPersonaDialog } from '@/components/account-mapping/AddPersonaDialog'
import { BatchSearchDialog } from '@/components/account-mapping/BatchSearchDialog'
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
  Globe,
  CheckCircle2,
  Target,
  FileText,
  Eye,
  BookTemplate,
  ThumbsUp,
  ThumbsDown,
  List,
  LayoutGrid,
  ChevronDown,
  ChevronUp,
  ShieldX,
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
  type FeedbackType,
  type BuyingCommitteeRole,
} from '@/types/account-mapping'
import { LLMModelSelector } from '@/components/LLMModelSelector'
import { ICPGuidedBuilder } from '@/components/icp/ICPGuidedBuilder'
import { ICPPromptPreview } from '@/components/icp/ICPPromptPreview'
import { ScoreBreakdown } from '@/components/icp/ScoreBreakdown'
import { ICPTemplateDialog } from '@/components/icp/ICPTemplateDialog'
import { SmartICPInsights } from '@/components/icp/SmartICPInsights'
import { buildICPPrompt, isICPBuilderPopulated } from '@/lib/icp-prompt-builder'
import { EMPTY_ICP_BUILDER_DATA, type ICPBuilderData } from '@/types/icp-builder'
import { CompanyCard } from '@/components/account-mapping/CompanyCard'
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
    deletePersona,
    saveProspects,
    deleteProspect,
    searchSalesNavigator,
    enrichProspect,
    bulkPromoteProspects,
    polishICPDescription,
    discoverICPCompanies,
    icpTemplates,
    saveTemplate,
    deleteTemplate,
    submitFeedback,
    deleteFeedback,
    getFeedbackForMap,
    getSmartICPInsights,
    suggestBuyerPersonas,
    suggestPersonaTitles,
    enrichCompany,
    reEvaluateCompanies,
    companyRegistry,
    refreshAccountMaps,
  } = useAccountMapping()
  const { cadences } = useCadence()

  const [activeTab, setActiveTab] = useState<TabId>('icp')

  // Dialog states
  const [showAddCompany, setShowAddCompany] = useState(false)
  const [showAddPersona, setShowAddPersona] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showEnrich, setShowEnrich] = useState<Prospect | null>(null)
  const [showPromote, setShowPromote] = useState(false)
  const [showDiscover, setShowDiscover] = useState(false)
  const [showBatchSearch, setShowBatchSearch] = useState(false)
  const [discoveredCompanies, setDiscoveredCompanies] = useState<DiscoveredCompany[]>([])
  const [discoveredExcluded, setDiscoveredExcluded] = useState<Array<{ company_name: string; reason: string }>>([])
  const [discoveredProspectedNames, setDiscoveredProspectedNames] = useState<Set<string>>(new Set())
  const [feedbackCount, setFeedbackCount] = useState(0)
  const [lastIcpPrompt, setLastIcpPrompt] = useState('')

  // Selection state
  const [selectedProspects, setSelectedProspects] = useState<Set<string>>(new Set())

  const map = accountMaps.find((m) => m.id === id)

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

  const companies = map.account_map_companies || []
  const personas = map.buyer_personas || []
  const prospects = map.prospects || []

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
        <ICPTab
          accountMapId={map.id}
          icpDescription={map.icp_description}
          minCompanies={map.discover_min_companies}
          maxCompanies={map.discover_max_companies}
          personas={personas}
          filtersJson={map.filters_json}
          onUpdateICP={(desc) => updateAccountMap(map.id, { icp_description: desc })}
          onUpdateSettings={(min, max) => updateAccountMap(map.id, { discover_min_companies: min, discover_max_companies: max })}
          onUpdateFilters={(filters) => updateAccountMap(map.id, { filters_json: filters })}
          onPolishICP={polishICPDescription}
          onDiscoverCompanies={async (desc, min, max) => {
            setLastIcpPrompt(desc)
            const result = await discoverICPCompanies(desc, min, max)

            // Client-side double-check: filter any excluded companies the server missed
            const exclusionEntries = companyRegistry.filter(e => (EXCLUSION_TYPES as string[]).includes(e.registry_type))
            const excludedSet = buildNormalizedSet(exclusionEntries.map(e => e.company_name))
            const clientExcluded: Array<{ company_name: string; reason: string }> = []
            const clientFiltered = result.companies.filter(c => {
              const norm = normalizeCompanyName(c.company_name)
              if (excludedSet.has(norm)) {
                const match = exclusionEntries.find(e => normalizeCompanyName(e.company_name_display) === norm)
                clientExcluded.push({
                  company_name: c.company_name,
                  reason: match ? `${match.registry_type}: ${match.exclusion_reason || match.company_name_display}` : 'Matched exclusion list',
                })
                return false
              }
              return true
            })

            // Identify previously prospected companies (for badge display)
            const prospectedEntries = companyRegistry.filter(e => e.registry_type === 'prospected')
            const prospectedSet = buildNormalizedSet(prospectedEntries.map(e => e.company_name))
            const prospectedNames = new Set<string>()
            for (const c of clientFiltered) {
              if (prospectedSet.has(normalizeCompanyName(c.company_name))) {
                prospectedNames.add(c.company_name)
              }
            }

            const mergedExcluded = [...(result.excludedCompanies || []), ...clientExcluded]
            setDiscoveredCompanies(clientFiltered)
            setDiscoveredExcluded(mergedExcluded)
            setDiscoveredProspectedNames(prospectedNames)
            setShowDiscover(true)
          }}
          onAddPersona={() => setShowAddPersona(true)}
          onDeletePersona={deletePersona}
          templates={icpTemplates}
          onSaveTemplate={saveTemplate}
          onDeleteTemplate={deleteTemplate}
          onAnalyzeInsights={getSmartICPInsights}
          feedbackCount={feedbackCount}
          onSuggestPersonas={suggestBuyerPersonas}
          onAddPersonaFromSuggestion={addPersona}
          accountMapOwnerId={map.owner_id}
        />
      )}

      {activeTab === 'companies' && (
        <CompaniesTab
          companies={companies}
          prospects={prospects}
          personas={personas}
          onAddCompany={() => setShowAddCompany(true)}
          onDeleteCompany={deleteCompany}
          onSearchProspects={() => {
            setShowSearch(true)
          }}
          onBatchSearch={() => setShowBatchSearch(true)}
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
            productCategory: map.filters_json?.icp_builder_data?.productCategory || '',
            companyDescription: map.icp_description || map.filters_json?.icp_builder_data?.companyDescription || '',
          }}
          selectedProspects={selectedProspects}
          onToggleProspect={toggleProspect}
          onToggleAll={toggleAllProspects}
          onSearch={() => setShowSearch(true)}
          onBatchSearch={() => setShowBatchSearch(true)}
          onEnrich={(p) => setShowEnrich(p)}
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
        onOpenChange={setShowAddPersona}
        accountMapId={map.id}
        ownerId={map.owner_id}
        onAdd={addPersona}
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
        onSearch={searchSalesNavigator}
        onSaveProspects={saveProspects}
        onRefresh={refreshAccountMaps}
      />

      {/* Discover Companies Dialog */}
      <DiscoverCompaniesDialog
        open={showDiscover}
        onOpenChange={setShowDiscover}
        companies={discoveredCompanies}
        excludedCompanies={discoveredExcluded}
        prospectedNames={discoveredProspectedNames}
        accountMapId={map.id}
        ownerId={map.owner_id}
        onSave={addCompany}
        onSubmitFeedback={submitFeedback}
        onDeleteFeedback={deleteFeedback}
        onGetFeedback={getFeedbackForMap}
        onFeedbackCountChange={setFeedbackCount}
        icpDescription={lastIcpPrompt}
        onEnrichCompany={enrichCompany}
        onReEvaluateCompanies={reEvaluateCompanies}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// TAB: ICP & Personas
// ═══════════════════════════════════════════════════════

type ICPSubTab = 'guided' | 'custom'

function ICPTab({
  accountMapId,
  icpDescription,
  minCompanies,
  maxCompanies,
  personas,
  filtersJson,
  onUpdateICP,
  onUpdateSettings,
  onUpdateFilters,
  onPolishICP,
  onDiscoverCompanies,
  onAddPersona,
  onDeletePersona,
  templates,
  onSaveTemplate,
  onDeleteTemplate,
  onAnalyzeInsights,
  feedbackCount,
  onSuggestPersonas,
  onAddPersonaFromSuggestion,
  accountMapOwnerId,
}: {
  accountMapId: string
  icpDescription: string | null
  minCompanies: number
  maxCompanies: number
  personas: BuyerPersona[]
  filtersJson: AccountMapFilters
  onUpdateICP: (description: string) => void
  onUpdateSettings: (min: number, max: number) => void
  onUpdateFilters: (filters: AccountMapFilters) => void
  onPolishICP: (description: string) => Promise<string>
  onDiscoverCompanies: (description: string, min: number, max: number) => Promise<void>
  onAddPersona: () => void
  onDeletePersona: (id: string) => void
  templates: import('@/types/account-mapping').ICPTemplate[]
  onSaveTemplate: (name: string, description: string | null, data: ICPBuilderData) => Promise<import('@/types/account-mapping').ICPTemplate | null>
  onDeleteTemplate: (id: string) => Promise<void>
  onAnalyzeInsights: (accountMapId: string) => Promise<import('@/types/account-mapping').ICPInsight[]>
  feedbackCount: number
  onSuggestPersonas: (accountMapId: string) => Promise<SuggestedPersona[]>
  onAddPersonaFromSuggestion: (persona: Omit<BuyerPersona, 'id' | 'created_at' | 'updated_at'>) => Promise<BuyerPersona | null>
  accountMapOwnerId: string
}) {
  const [subTab, setSubTab] = useState<ICPSubTab>('guided')
  const [description, setDescription] = useState(icpDescription || '')
  const [polishing, setPolishing] = useState(false)
  const [discovering, setDiscovering] = useState(false)
  const [saved, setSaved] = useState(true)
  const [localMin, setLocalMin] = useState(minCompanies)
  const [localMax, setLocalMax] = useState(maxCompanies)
  const [showPreview, setShowPreview] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [builderData, setBuilderData] = useState<ICPBuilderData>(
    filtersJson.icp_builder_data || EMPTY_ICP_BUILDER_DATA
  )
  const [suggesting, setSuggesting] = useState(false)
  const [suggestions, setSuggestions] = useState<SuggestedPersona[]>([])
  const [addedSuggestions, setAddedSuggestions] = useState<Set<number>>(new Set())

  const hasICPData = isICPBuilderPopulated(builderData)

  const handleBuilderChange = (data: ICPBuilderData) => {
    setBuilderData(data)
    setSaved(false)
  }

  const handleSave = () => {
    if (subTab === 'guided') {
      // Persist builder data in filters_json
      const prompt = buildICPPrompt(builderData)
      onUpdateFilters({ ...filtersJson, icp_builder_data: builderData })
      if (prompt) onUpdateICP(prompt)
    } else {
      onUpdateICP(description)
    }
    setSaved(true)
  }

  const handlePolish = async () => {
    if (!description.trim()) return
    setPolishing(true)
    try {
      const polished = await onPolishICP(description)
      setDescription(polished)
      onUpdateICP(polished)
      setSaved(true)
    } catch (err) {
      console.error('Polish failed:', err)
    } finally {
      setPolishing(false)
    }
  }

  const handleDiscover = async () => {
    let promptToUse = description
    if (subTab === 'guided') {
      promptToUse = buildICPPrompt(builderData)
      if (!promptToUse.trim()) return
      // Auto-save before discovering
      onUpdateFilters({ ...filtersJson, icp_builder_data: builderData })
      onUpdateICP(promptToUse)
      setSaved(true)
    } else {
      if (!description.trim()) return
      if (!saved) {
        onUpdateICP(description)
        setSaved(true)
      }
    }
    onUpdateSettings(localMin, localMax)
    setDiscovering(true)
    try {
      await onDiscoverCompanies(promptToUse, localMin, localMax)
    } catch (err) {
      console.error('Discover failed:', err)
      alert(err instanceof Error ? err.message : 'Failed to discover companies')
    } finally {
      setDiscovering(false)
    }
  }

  const handleLoadTemplate = (data: ICPBuilderData) => {
    setBuilderData(data)
    setSaved(false)
  }

  const handleApplyInsight = (field: keyof ICPBuilderData, operation: 'add' | 'remove', value: string) => {
    const current = builderData[field]
    if (Array.isArray(current)) {
      if (operation === 'add' && !current.includes(value)) {
        setBuilderData({ ...builderData, [field]: [...current, value] })
      } else if (operation === 'remove') {
        setBuilderData({ ...builderData, [field]: current.filter((v: string) => v !== value) })
      }
    } else if (typeof current === 'string') {
      if (operation === 'add') {
        setBuilderData({ ...builderData, [field]: value })
      } else {
        setBuilderData({ ...builderData, [field]: '' })
      }
    }
    setSaved(false)
  }

  const handleSuggestPersonas = async () => {
    setSuggesting(true)
    setAddedSuggestions(new Set())
    try {
      const result = await onSuggestPersonas(accountMapId)
      setSuggestions(result)
    } catch (err) {
      console.error('Failed to suggest personas:', err)
    } finally {
      setSuggesting(false)
    }
  }

  const handleAddSuggestion = async (s: SuggestedPersona, index: number) => {
    try {
      await onAddPersonaFromSuggestion({
        account_map_id: accountMapId,
        owner_id: accountMapOwnerId,
        name: s.name,
        title_keywords: s.title_keywords,
        seniority: s.seniority || null,
        department: s.department || null,
        max_per_company: 3,
        description: s.description || null,
        role_in_buying_committee: (s.role_in_buying_committee as BuyingCommitteeRole) || null,
        priority: 1,
        is_required: true,
        departments: s.departments || [],
        title_keywords_by_tier: s.title_keywords_by_tier || { enterprise: [], mid_market: [], startup_smb: [] },
        seniority_by_tier: s.seniority_by_tier || { enterprise: [], mid_market: [], startup_smb: [] },
      })
      setAddedSuggestions(prev => new Set(prev).add(index))
    } catch (err) {
      console.error('Failed to add suggested persona:', err)
    }
  }

  const guidedPrompt = buildICPPrompt(builderData)
  const canDiscover = subTab === 'guided' ? !!guidedPrompt.trim() : !!description.trim()

  const subTabs: { id: ICPSubTab; label: string; icon: React.ReactNode }[] = [
    { id: 'guided', label: 'Guided Builder', icon: <Target className="h-3.5 w-3.5" /> },
    { id: 'custom', label: 'Custom Prompt', icon: <FileText className="h-3.5 w-3.5" /> },
  ]

  return (
    <div className="space-y-6">
      {/* ICP Builder */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Ideal Customer Profile</CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                Define your target customer to discover matching companies with AI.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTemplates(true)}
                className="h-8"
              >
                <BookTemplate className="mr-1 h-3.5 w-3.5" />
                Templates
              </Button>
              <LLMModelSelector />
            </div>
          </div>
          {/* Sub-tabs */}
          <div className="flex gap-1 rounded-lg bg-muted p-1 mt-3">
            {subTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  subTab === tab.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Guided Builder Sub-Tab */}
          {subTab === 'guided' && (
            <>
              <ICPGuidedBuilder data={builderData} onChange={handleBuilderChange} />
              <ICPPromptPreview data={builderData} visible={showPreview} />
              <SmartICPInsights
                accountMapId={accountMapId}
                builderData={builderData}
                feedbackCount={feedbackCount}
                onApplyInsight={handleApplyInsight}
                onAnalyze={onAnalyzeInsights}
              />
            </>
          )}

          {/* Custom Prompt Sub-Tab */}
          {subTab === 'custom' && (
            <>
              <textarea
                className="flex min-h-[140px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                value={description}
                onChange={(e) => { setDescription(e.target.value); setSaved(false) }}
                placeholder="e.g., Empresas de e-commerce y fintech en Latinoamérica con más de 200 empleados que procesan pagos digitales..."
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePolish}
                  disabled={polishing || !description.trim()}
                >
                  {polishing ? (
                    <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Polishing...</>
                  ) : (
                    <><Sparkles className="mr-1 h-4 w-4" /> Polish with AI</>
                  )}
                </Button>
              </div>
            </>
          )}

          {/* Shared Footer: Save + Preview Toggle + Discover */}
          <div className="flex items-center gap-2 pt-2 border-t">
            {subTab === 'guided' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
                className="text-muted-foreground"
              >
                <Eye className="mr-1 h-3.5 w-3.5" />
                {showPreview ? 'Hide' : 'Preview'} Prompt
              </Button>
            )}
            <div className="flex-1" />
            {!saved && (
              <Button variant="outline" size="sm" onClick={handleSave}>
                Save
              </Button>
            )}
            {saved && canDiscover && (
              <span className="text-xs text-muted-foreground">Saved</span>
            )}
          </div>

          {/* Discover Companies Section */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Discover Companies</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Use AI to search the web and find companies matching your ICP.
            </p>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label className="text-xs whitespace-nowrap">Min</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={localMin}
                  onChange={(e) => setLocalMin(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20 h-8 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs whitespace-nowrap">Max</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={localMax}
                  onChange={(e) => setLocalMax(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20 h-8 text-sm"
                />
              </div>
              <Button
                size="sm"
                onClick={handleDiscover}
                disabled={discovering || !canDiscover}
              >
                {discovering ? (
                  <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Discovering...</>
                ) : (
                  <><Search className="mr-1 h-4 w-4" /> Discover Companies</>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Buyer Personas */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Buyer Personas</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Define the roles you're looking for with title keywords for Sales Navigator search.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSuggestPersonas}
              disabled={suggesting || !hasICPData}
              title={!hasICPData ? 'Fill in ICP builder data first' : undefined}
            >
              {suggesting ? (
                <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Suggesting...</>
              ) : (
                <><Sparkles className="mr-1 h-4 w-4" /> Suggest Personas</>
              )}
            </Button>
            <Button size="sm" onClick={onAddPersona}>
              <Plus className="mr-1 h-4 w-4" /> Add Persona
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {personas.length === 0 && suggestions.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No personas defined yet. Add personas or use AI to suggest them based on your ICP.
            </p>
          ) : (
            <>
              {personas.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Keywords by Tier</TableHead>
                      <TableHead className="w-24 text-center">Max</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...personas].sort((a, b) => {
                      if (a.is_required !== b.is_required) return a.is_required ? -1 : 1
                      return a.priority - b.priority
                    }).map((persona) => {
                      const roleConfig = persona.role_in_buying_committee
                        ? BUYING_ROLE_CONFIG[persona.role_in_buying_committee as BuyingCommitteeRole]
                        : null
                      const tierKw = persona.title_keywords_by_tier || { enterprise: [], mid_market: [], startup_smb: [] }
                      const eCount = tierKw.enterprise?.length || 0
                      const mCount = tierKw.mid_market?.length || 0
                      const sCount = tierKw.startup_smb?.length || 0
                      const hasTierData = eCount + mCount + sCount > 0
                      return (
                        <TableRow key={persona.id}>
                          <TableCell>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs text-muted-foreground font-mono">{persona.priority}.</span>
                              <span className="font-medium">{persona.name}</span>
                              {persona.is_required && (
                                <span className="text-amber-500 text-xs" title="Required">*</span>
                              )}
                              {roleConfig && (
                                <Badge variant="outline" className={`text-[10px] h-4 ${roleConfig.color}`}>
                                  {roleConfig.label}
                                </Badge>
                              )}
                            </div>
                            {persona.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{persona.description}</p>
                            )}
                          </TableCell>
                          <TableCell>
                            {hasTierData ? (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span title="Enterprise keywords">E:{eCount}</span>
                                <span title="Mid-market keywords">M:{mCount}</span>
                                <span title="Startup/SMB keywords">S:{sCount}</span>
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {persona.title_keywords.slice(0, 3).map((kw) => (
                                  <Badge key={kw} variant="outline" className="text-xs">{kw}</Badge>
                                ))}
                                {persona.title_keywords.length > 3 && (
                                  <Badge variant="outline" className="text-xs">+{persona.title_keywords.length - 3}</Badge>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-center">{persona.max_per_company}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => onDeletePersona(persona.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </>
          )}

          {/* AI Persona Suggestions */}
          {suggestions.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">AI Suggestions</p>
              {suggestions.map((s, i) => {
                const roleConfig = s.role_in_buying_committee
                  ? BUYING_ROLE_CONFIG[s.role_in_buying_committee as BuyingCommitteeRole]
                  : null
                const tierKw = s.title_keywords_by_tier
                const hasTiers = tierKw && (tierKw.enterprise?.length || tierKw.mid_market?.length || tierKw.startup_smb?.length)
                return (
                  <div key={i} className="rounded-md border border-dashed p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium">{s.name}</span>
                          {roleConfig && (
                            <Badge variant="outline" className={`text-[10px] h-4 ${roleConfig.color}`}>
                              {roleConfig.label}
                            </Badge>
                          )}
                          {s.seniority && <Badge variant="secondary" className="text-[10px]">{s.seniority}</Badge>}
                          {s.department && <Badge variant="outline" className="text-[10px]">{s.department}</Badge>}
                        </div>
                        {hasTiers ? (
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span>E:{tierKw!.enterprise?.length || 0}</span>
                            <span>M:{tierKw!.mid_market?.length || 0}</span>
                            <span>S:{tierKw!.startup_smb?.length || 0}</span>
                            <span className="text-muted-foreground/50">tier keywords</span>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {s.title_keywords.map(kw => (
                              <Badge key={kw} variant="outline" className="text-xs">{kw}</Badge>
                            ))}
                          </div>
                        )}
                        {s.description && (
                          <p className="text-xs text-muted-foreground mt-1">{s.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5 italic">{s.reasoning}</p>
                      </div>
                      <Button
                        variant={addedSuggestions.has(i) ? 'ghost' : 'outline'}
                        size="sm"
                        className="h-7 text-xs shrink-0"
                        onClick={() => handleAddSuggestion(s, i)}
                        disabled={addedSuggestions.has(i)}
                      >
                        {addedSuggestions.has(i) ? (
                          <><CheckCircle2 className="mr-1 h-3 w-3" /> Added</>
                        ) : (
                          <><Plus className="mr-1 h-3 w-3" /> Add</>
                        )}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Template Dialog */}
      <ICPTemplateDialog
        open={showTemplates}
        onOpenChange={setShowTemplates}
        templates={templates}
        currentData={builderData}
        onSave={onSaveTemplate}
        onDelete={onDeleteTemplate}
        onLoad={handleLoadTemplate}
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
  onAddCompany,
  onDeleteCompany,
  onSearchProspects,
  onBatchSearch,
}: {
  companies: AccountMapCompany[]
  prospects: Prospect[]
  personas: BuyerPersona[]
  onAddCompany: () => void
  onDeleteCompany: (id: string) => void
  onSearchProspects: (company?: AccountMapCompany) => void
  onBatchSearch: () => void
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
          {companies.length > 0 && personas.length > 0 && (
            <Button size="sm" onClick={onBatchSearch}>
              <UserSearch className="mr-1 h-4 w-4" /> Find All Prospects
            </Button>
          )}
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
  selectedProspects,
  onToggleProspect,
  onToggleAll,
  onSearch,
  onBatchSearch,
  onEnrich,
  onPromote,
  onDelete,
}: {
  prospects: Prospect[]
  companies: AccountMapCompany[]
  personas: BuyerPersona[]
  cadences: Array<{ id: string; name: string }>
  accountMapId: string
  icpContext: { productCategory: string; companyDescription: string }
  selectedProspects: Set<string>
  onToggleProspect: (id: string) => void
  onToggleAll: () => void
  onSearch: () => void
  onBatchSearch: () => void
  onEnrich: (p: Prospect) => void
  onPromote: () => void
  onDelete: (id: string) => void
}) {
  const { validateProspects, skipProspect, getOutreachStrategy, promoteProspectToLead } = useAccountMapping()
  const [viewMode, setViewMode] = useState<'company' | 'table'>('company')
  const [validatingCompanyId, setValidatingCompanyId] = useState<string | null>(null)
  const [strategyCompanyId, setStrategyCompanyId] = useState<string | null>(null)
  const [strategies, setStrategies] = useState<Record<string, { strategy_name: string; overall_reasoning: string; steps: Array<{ order: number; prospect_name: string; role: string; reasoning: string; suggested_angle: string }> }>>({})
  const [loadingStrategy, setLoadingStrategy] = useState<string | null>(null)
  const [showSkipDialog, setShowSkipDialog] = useState<Prospect | null>(null)
  const [skipReason, setSkipReason] = useState('')
  const [addToCadenceProspect, setAddToCadenceProspect] = useState<Prospect | null>(null)
  const [selectedCadence, setSelectedCadence] = useState('')

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
      await validateProspects(accountMapId, companyId, icpContext.companyDescription, icpContext.productCategory)
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

  const roleIcon = (role: string | null) => {
    const icons: Record<string, string> = { decision_maker: '🎯', champion: '🏗️', influencer: '💡', technical_evaluator: '🔧', budget_holder: '💰', end_user: '👤' }
    return role ? icons[role] || '' : ''
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Prospects ({prospects.filter(p => !p.skipped).length})</CardTitle>
          <div className="flex items-center gap-2">
            {selectedCount > 0 && (
              <>
                <Badge variant="secondary">{selectedCount} selected</Badge>
                {promotableCount > 0 && (
                  <Button size="sm" onClick={onPromote}>
                    <ArrowUpRight className="mr-1 h-4 w-4" /> Promote to Leads
                  </Button>
                )}
              </>
            )}
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
            <Button size="sm" onClick={onBatchSearch}>
              <UserSearch className="mr-1 h-4 w-4" /> Find All Prospects
            </Button>
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
                <Button size="sm" onClick={onBatchSearch}>
                  <UserSearch className="mr-1 h-4 w-4" /> Find All Prospects
                </Button>
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
                    <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold text-sm">{companyName}</span>
                        <span className="text-xs text-muted-foreground">{group.company?.industry || ''}{sizeLabel}</span>
                        <Badge variant="secondary" className="text-[10px]">{group.prospects.length} prospects</Badge>
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
                          <div key={prospect.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/20">
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
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {prospect.title || 'Unknown title'} · {prospect.company || companyName}
                                {persona && <span className="ml-1">· {persona.name}</span>}
                              </p>
                              {prospect.headline && (
                                <p className="text-xs text-muted-foreground truncate">{prospect.headline}</p>
                              )}
                              {prospect.outreach_angle && (
                                <p className="text-xs text-blue-600 mt-1">
                                  💡 {prospect.outreach_angle}
                                </p>
                              )}
                              {prospect.red_flags && (
                                <p className="text-xs text-amber-600 mt-0.5">
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
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onBatchSearch}>
                      <UserSearch className="mr-1 h-3 w-3" /> Retry Search
                    </Button>
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
  onAdd: (company: Omit<AccountMapCompany, 'id' | 'created_at' | 'updated_at'>) => Promise<AccountMapCompany | null>
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
              <Label>Company Size</Label>
              <Select value={size} onValueChange={setSize}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {COMPANY_SIZE_OPTIONS.map((o) => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
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
  onEnrich: (prospectId: string, companyWebsite: string) => Promise<any>
}) {
  // Try to pre-fill website from company
  const linkedCompany = companies.find((c) => c.id === prospect.company_id)
  const [website, setWebsite] = useState(linkedCompany?.website || '')
  const [enriching, setEnriching] = useState(false)
  const [result, setResult] = useState<{ emails: string[]; phones: string[]; bestEmail: string | null; bestPhone: string | null } | null>(null)

  const handleEnrich = async () => {
    if (!website.trim()) return
    setEnriching(true)
    setResult(null)
    try {
      const res = await onEnrich(prospect.id, website)
      setResult({
        emails: res.enrichment.emails_found,
        phones: res.enrichment.phones_found,
        bestEmail: res.bestEmailMatch,
        bestPhone: res.bestPhoneMatch,
      })
    } catch (err) {
      console.error('Enrichment failed:', err)
      alert(err instanceof Error ? err.message : 'Enrichment failed')
    } finally {
      setEnriching(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enrich Prospect</DialogTitle>
          <DialogDescription>
            Scrape {prospect.first_name} {prospect.last_name}'s company website to find contact info
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="rounded-md bg-muted p-3 text-sm">
            <p className="font-medium">{prospect.first_name} {prospect.last_name}</p>
            <p className="text-muted-foreground">{prospect.title} at {prospect.company}</p>
          </div>
          <div className="space-y-2">
            <Label>Company Website *</Label>
            <Input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="e.g., company.com"
            />
          </div>
          <Button onClick={handleEnrich} disabled={enriching || !website.trim()} className="w-full">
            {enriching ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enriching...</>
            ) : (
              <><Sparkles className="mr-2 h-4 w-4" /> Enrich</>
            )}
          </Button>

          {result && (
            <div className="space-y-3 rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Best Email Match</p>
                <p className="text-sm text-primary">{result.bestEmail || 'No match found'}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Best Phone Match</p>
                <p className="text-sm text-primary">{result.bestPhone || 'No match found'}</p>
              </div>
              {result.emails.length > 0 && (
                <div>
                  <p className="text-sm font-medium">All Emails Found ({result.emails.length})</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {result.emails.map((e) => (
                      <Badge key={e} variant="outline" className="text-xs">{e}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {result.phones.length > 0 && (
                <div>
                  <p className="text-sm font-medium">All Phones Found ({result.phones.length})</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {result.phones.map((p) => (
                      <Badge key={p} variant="outline" className="text-xs">{p}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {result ? 'Done' : 'Cancel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handlePromote} disabled={promoting || prospects.length === 0}>
            {promoting ? 'Promoting...' : `Promote ${prospects.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ═══════════════════════════════════════════════════════
// DIALOG: Discover Companies Results
// ═══════════════════════════════════════════════════════

function DiscoverCompaniesDialog({
  open,
  onOpenChange,
  companies,
  excludedCompanies = [],
  prospectedNames = new Set(),
  accountMapId,
  ownerId,
  onSave,
  onSubmitFeedback,
  onDeleteFeedback,
  onGetFeedback,
  onFeedbackCountChange,
  icpDescription,
  onEnrichCompany,
  onReEvaluateCompanies,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  companies: DiscoveredCompany[]
  excludedCompanies?: Array<{ company_name: string; reason: string }>
  prospectedNames?: Set<string>
  accountMapId: string
  ownerId: string
  onSave: (company: Omit<AccountMapCompany, 'id' | 'created_at' | 'updated_at'>) => Promise<AccountMapCompany | null>
  onSubmitFeedback: (accountMapId: string, companyName: string, feedback: FeedbackType, discoveryData?: Record<string, unknown>) => Promise<void>
  onDeleteFeedback: (accountMapId: string, companyName: string) => Promise<void>
  onGetFeedback: (accountMapId: string) => Promise<Record<string, FeedbackType>>
  onFeedbackCountChange: (count: number) => void
  icpDescription: string
  onEnrichCompany: (companyName: string, website?: string | null) => Promise<EnrichCompanyResponse>
  onReEvaluateCompanies: (icpDescription: string, companies: Array<DiscoveredCompany & { enrichment?: CompanyEnrichment }>) => Promise<import('@/types/enrichment').ReEvaluateResponse>
}) {
  // Auto-select only high-fit companies
  const getHighFitIndices = (list: DiscoveredCompany[]) =>
    new Set(list.map((c, i) => (c.fit_category === 'high' ? i : -1)).filter(i => i >= 0))

  const [selected, setSelected] = useState<Set<number>>(getHighFitIndices(companies))
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [filterTab, setFilterTab] = useState<'all' | FitCategory>('all')
  const [expandedBreakdowns, setExpandedBreakdowns] = useState<Set<number>>(new Set())
  const [feedbackMap, setFeedbackMap] = useState<Record<string, FeedbackType>>({})

  // Excluded companies state
  const [showExcluded, setShowExcluded] = useState(false)

  // Enrichment state
  const [enrichmentMap, setEnrichmentMap] = useState<Record<string, { status: EnrichmentStatus; enrichment?: CompanyEnrichment; error?: string }>>({})
  const [isEnriching, setIsEnriching] = useState(false)
  const [isReEvaluating, setIsReEvaluating] = useState(false)
  const [expandedEvidence, setExpandedEvidence] = useState<Set<number>>(new Set())
  const [reEvaluatedData, setReEvaluatedData] = useState<Record<string, ReEvaluatedCompany>>({})
  const enrichingRef = useRef(false)

  // Get effective company data (use re-evaluated if available)
  const getEffectiveCompany = useCallback((company: DiscoveredCompany) => {
    const reEval = reEvaluatedData[company.company_name]
    if (reEval) {
      return {
        ...company,
        relevance_score: reEval.relevance_score,
        fit_category: reEval.fit_category,
        relevance_reason: reEval.relevance_reason,
        score_breakdown: reEval.score_breakdown,
      }
    }
    return company
  }, [reEvaluatedData])

  // Sort companies by relevance_score descending (using effective data)
  const sortedCompanies = useMemo(() =>
    [...companies]
      .map(getEffectiveCompany)
      .sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0)),
    [companies, getEffectiveCompany]
  )

  // Filter by active tab
  const filteredCompanies = filterTab === 'all'
    ? sortedCompanies
    : sortedCompanies.filter(c => c.fit_category === filterTab)

  // Counts per category (using effective data)
  const counts = useMemo(() => ({
    all: sortedCompanies.length,
    high: sortedCompanies.filter(c => c.fit_category === 'high').length,
    medium: sortedCompanies.filter(c => c.fit_category === 'medium').length,
    low: sortedCompanies.filter(c => c.fit_category === 'low').length,
  }), [sortedCompanies])

  // Enrichment progress
  const enrichedCount = Object.values(enrichmentMap).filter(e => e.status === 'enriched').length
  const errorCount = Object.values(enrichmentMap).filter(e => e.status === 'error').length
  const totalToEnrich = companies.length

  // Enrich companies in batches
  const enrichInBatches = useCallback(async (companiesList: DiscoveredCompany[]) => {
    if (enrichingRef.current) return
    enrichingRef.current = true
    setIsEnriching(true)

    const BATCH_SIZE = 3
    for (let i = 0; i < companiesList.length; i += BATCH_SIZE) {
      if (!enrichingRef.current) break
      const batch = companiesList.slice(i, i + BATCH_SIZE)
      await Promise.all(
        batch.map(async (c) => {
          setEnrichmentMap(prev => ({
            ...prev,
            [c.company_name]: { status: 'enriching' },
          }))
          try {
            const result = await onEnrichCompany(c.company_name, c.website)
            setEnrichmentMap(prev => ({
              ...prev,
              [c.company_name]: {
                status: 'enriched',
                enrichment: result.enrichment,
              },
            }))
          } catch (err) {
            setEnrichmentMap(prev => ({
              ...prev,
              [c.company_name]: {
                status: 'error',
                error: err instanceof Error ? err.message : 'Enrichment failed',
              },
            }))
          }
        })
      )
    }

    enrichingRef.current = false
    setIsEnriching(false)
  }, [onEnrichCompany])

  // Run re-evaluation after all enrichments complete
  const runReEvaluation = useCallback(async (enrichMap: typeof enrichmentMap) => {
    if (!icpDescription || companies.length === 0) return
    setIsReEvaluating(true)
    try {
      const companiesWithEnrichment = companies.map(c => ({
        ...c,
        enrichment: enrichMap[c.company_name]?.enrichment,
      }))
      const result = await onReEvaluateCompanies(icpDescription, companiesWithEnrichment)
      if (result.success && result.companies) {
        const dataMap: Record<string, ReEvaluatedCompany> = {}
        result.companies.forEach(c => { dataMap[c.company_name] = c })
        setReEvaluatedData(dataMap)
        // Re-select high-fit after re-evaluation
        const newHighIndices = new Set(
          companies
            .map((c, i) => (dataMap[c.company_name]?.fit_category === 'high' ? i : -1))
            .filter(i => i >= 0)
        )
        setSelected(newHighIndices)
      }
    } catch (err) {
      console.error('Re-evaluation failed:', err)
    } finally {
      setIsReEvaluating(false)
    }
  }, [companies, icpDescription, onReEvaluateCompanies])

  // Reset all state when companies change
  useEffect(() => {
    setSelected(getHighFitIndices(companies))
    setSavedCount(0)
    setFilterTab('all')
    setExpandedBreakdowns(new Set())
    setExpandedEvidence(new Set())
    setEnrichmentMap({})
    setReEvaluatedData({})
    enrichingRef.current = false
  }, [companies])

  // Auto-start enrichment when dialog opens with companies
  useEffect(() => {
    if (open && companies.length > 0 && Object.keys(enrichmentMap).length === 0) {
      // Initialize all companies as pending
      const initial: typeof enrichmentMap = {}
      companies.forEach(c => { initial[c.company_name] = { status: 'pending' } })
      setEnrichmentMap(initial)
      enrichInBatches(companies)
    }
  }, [open, companies]) // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger re-evaluation when all enrichments are done
  useEffect(() => {
    const statuses = Object.values(enrichmentMap)
    if (statuses.length === 0) return
    const allDone = statuses.every(s => s.status === 'enriched' || s.status === 'error')
    const someEnriched = statuses.some(s => s.status === 'enriched')
    if (allDone && someEnriched && !isReEvaluating && Object.keys(reEvaluatedData).length === 0) {
      runReEvaluation(enrichmentMap)
    }
  }, [enrichmentMap]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load existing feedback when dialog opens
  useEffect(() => {
    if (open && accountMapId) {
      onGetFeedback(accountMapId).then(map => {
        setFeedbackMap(map)
        onFeedbackCountChange(Object.keys(map).length)
      }).catch(console.error)
    }
  }, [open, accountMapId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFeedbackToggle = async (companyName: string, type: FeedbackType, companyData: DiscoveredCompany) => {
    const current = feedbackMap[companyName]
    try {
      if (current === type) {
        await onDeleteFeedback(accountMapId, companyName)
        setFeedbackMap(prev => {
          const next = { ...prev }
          delete next[companyName]
          onFeedbackCountChange(Object.keys(next).length)
          return next
        })
      } else {
        await onSubmitFeedback(accountMapId, companyName, type, companyData as unknown as Record<string, unknown>)
        setFeedbackMap(prev => {
          const next = { ...prev, [companyName]: type }
          onFeedbackCountChange(Object.keys(next).length)
          return next
        })
      }
    } catch (err) {
      console.error('Failed to save feedback:', err)
    }
  }

  const toggleCompany = (originalIndex: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(originalIndex)) next.delete(originalIndex)
      else next.add(originalIndex)
      return next
    })
  }

  const toggleAllFiltered = () => {
    const filteredIndices = filteredCompanies.map(c => companies.indexOf(c))
    const allSelected = filteredIndices.every(i => selected.has(i))
    setSelected(prev => {
      const next = new Set(prev)
      filteredIndices.forEach(i => allSelected ? next.delete(i) : next.add(i))
      return next
    })
  }

  const handleSave = async () => {
    const toSave = companies.filter((_, i) => selected.has(i))
    if (toSave.length === 0) return
    setSaving(true)
    let count = 0
    try {
      for (const c of toSave) {
        await onSave({
          account_map_id: accountMapId,
          owner_id: ownerId,
          company_name: c.company_name,
          industry: c.industry,
          company_size: c.company_size,
          website: c.website,
          linkedin_url: null,
          location: c.location,
          description: c.description,
        })
        count++
      }
      setSavedCount(count)
    } catch (err) {
      console.error('Failed to save companies:', err)
      alert(`Saved ${count} companies. Error: ${err instanceof Error ? err.message : 'Unknown'}`)
    } finally {
      setSaving(false)
    }
  }

  const filterTabs: Array<{ key: 'all' | FitCategory; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'high', label: 'High Fit' },
    { key: 'medium', label: 'Medium Fit' },
    { key: 'low', label: 'Low Fit' },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Discovered Companies</DialogTitle>
          <DialogDescription>
            {companies.length} companies found matching your ICP.
            {excludedCompanies.length > 0 && (
              <span className="text-orange-600 dark:text-orange-400"> ({excludedCompanies.length} excluded)</span>
            )}
            {' '}Select which to add to your account map.
          </DialogDescription>
        </DialogHeader>

        {companies.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No companies found. Try refining your ICP description with more details.
          </p>
        ) : savedCount > 0 ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
            <p className="text-lg font-medium">{savedCount} companies added!</p>
            <p className="text-sm text-muted-foreground">Check the Companies tab to see them.</p>
          </div>
        ) : (
          <>
            {/* Enrichment progress banner */}
            {(isEnriching || isReEvaluating) && (
              <div className={cn(
                'rounded-md border p-3 flex items-center gap-2',
                isReEvaluating
                  ? 'bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800'
                  : 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800'
              )}>
                <Loader2 className={cn(
                  'h-4 w-4 animate-spin',
                  isReEvaluating ? 'text-purple-600' : 'text-blue-600'
                )} />
                <span className={cn(
                  'text-sm',
                  isReEvaluating ? 'text-purple-900 dark:text-purple-200' : 'text-blue-900 dark:text-blue-200'
                )}>
                  {isReEvaluating
                    ? 'Re-evaluating companies with enrichment data...'
                    : `Enriching companies with real data... (${enrichedCount}/${totalToEnrich} complete${errorCount > 0 ? `, ${errorCount} failed` : ''})`
                  }
                </span>
              </div>
            )}

            {/* Re-evaluation complete banner */}
            {!isEnriching && !isReEvaluating && Object.keys(reEvaluatedData).length > 0 && (
              <div className="rounded-md border bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800 p-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-900 dark:text-green-200">
                  Scores re-evaluated with verified data. {Object.values(reEvaluatedData).filter(c => c.confidence === 'high').length} companies verified.
                </span>
              </div>
            )}

            {/* Filter tabs */}
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              {filterTabs.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilterTab(key)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    filterTab === key
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {label}
                  <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                    {counts[key]}
                  </Badge>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={filteredCompanies.length > 0 && filteredCompanies.every(c => selected.has(companies.indexOf(c)))}
                  onCheckedChange={toggleAllFiltered}
                />
                <span className="text-sm text-muted-foreground">
                  {selected.size} of {companies.length} selected
                </span>
              </div>
            </div>

            <div className="max-h-[350px] overflow-y-auto rounded-md border divide-y">
              {filteredCompanies.map((company) => {
                const originalIndex = companies.findIndex(c => c.company_name === company.company_name)
                const fitConfig = FIT_CATEGORY_CONFIG[company.fit_category ?? 'medium']
                const enrichState = enrichmentMap[company.company_name]
                const reEval = reEvaluatedData[company.company_name]
                return (
                  <div
                    key={company.company_name}
                    className={`flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors ${
                      selected.has(originalIndex) ? 'bg-primary/5' : ''
                    }`}
                    onClick={() => toggleCompany(originalIndex)}
                  >
                    <Checkbox
                      checked={selected.has(originalIndex)}
                      onCheckedChange={() => toggleCompany(originalIndex)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{company.company_name}</span>
                        <Badge variant={fitConfig.variant} className="text-[10px] px-1.5 py-0">
                          {fitConfig.label} ({company.relevance_score ?? '?'}/10)
                        </Badge>
                        {/* Confidence badge after re-evaluation */}
                        {reEval && (
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] px-1.5 py-0',
                              reEval.confidence === 'high'
                                ? 'text-green-600 border-green-300'
                                : 'text-muted-foreground'
                            )}
                          >
                            {reEval.confidence === 'high' ? 'Verified' : 'Estimated'}
                          </Badge>
                        )}
                        {/* Previously prospected badge */}
                        {prospectedNames.has(company.company_name) && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-green-600 border-green-300 dark:text-green-400 dark:border-green-700">
                            Prospectado
                          </Badge>
                        )}
                        {company.website && (
                          <a
                            href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary/80"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                      {company.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{company.description}</p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-1">
                        {company.industry && (
                          <Badge variant="outline" className="text-xs">{company.industry}</Badge>
                        )}
                        {company.company_size && (
                          <Badge variant="outline" className="text-xs">{company.company_size}</Badge>
                        )}
                        {company.location && (
                          <Badge variant="outline" className="text-xs">{company.location}</Badge>
                        )}
                      </div>
                      {company.relevance_reason && (
                        <p className="text-xs text-primary/80 mt-1 italic">{company.relevance_reason}</p>
                      )}

                      {/* Enrichment badge */}
                      {enrichState && (
                        <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                          <EnrichmentBadge
                            status={enrichState.status}
                            hasWebsite={enrichState.enrichment?.websiteData?.success}
                            hasNews={enrichState.enrichment?.newsData?.success && (enrichState.enrichment?.newsData?.articles?.length ?? 0) > 0}
                          />
                        </div>
                      )}

                      {/* Evidence panel */}
                      {enrichState?.status === 'enriched' && enrichState.enrichment && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <EvidencePanel
                            enrichment={enrichState.enrichment}
                            expanded={expandedEvidence.has(originalIndex)}
                            onToggle={() => {
                              setExpandedEvidence(prev => {
                                const next = new Set(prev)
                                if (next.has(originalIndex)) next.delete(originalIndex)
                                else next.add(originalIndex)
                                return next
                              })
                            }}
                          />
                        </div>
                      )}

                      {/* Feedback buttons */}
                      <div className="flex items-center gap-1 mt-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleFeedbackToggle(company.company_name, 'helpful', company)}
                          className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                            feedbackMap[company.company_name] === 'helpful'
                              ? 'bg-green-100 text-green-700'
                              : 'text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          <ThumbsUp className="h-3 w-3" />
                          Helpful
                        </button>
                        <button
                          type="button"
                          onClick={() => handleFeedbackToggle(company.company_name, 'not_helpful', company)}
                          className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                            feedbackMap[company.company_name] === 'not_helpful'
                              ? 'bg-red-100 text-red-700'
                              : 'text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          <ThumbsDown className="h-3 w-3" />
                          Not Helpful
                        </button>
                      </div>
                      {company.score_breakdown && (
                        <div className="mt-1.5">
                          <ScoreBreakdown
                            breakdown={company.score_breakdown}
                            expanded={expandedBreakdowns.has(originalIndex)}
                            onToggle={() => {
                              setExpandedBreakdowns(prev => {
                                const next = new Set(prev)
                                if (next.has(originalIndex)) next.delete(originalIndex)
                                else next.add(originalIndex)
                                return next
                              })
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Excluded Companies Section */}
            {excludedCompanies.length > 0 && (
              <div className="border-t pt-3 mt-2">
                <button
                  type="button"
                  onClick={() => setShowExcluded(!showExcluded)}
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ShieldX className="h-4 w-4 text-orange-500" />
                  {excludedCompanies.length} {excludedCompanies.length === 1 ? 'company' : 'companies'} excluded
                  {showExcluded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {showExcluded && (
                  <div className="mt-2 max-h-[150px] overflow-y-auto rounded-md border border-dashed border-orange-300 dark:border-orange-800 divide-y">
                    {excludedCompanies.map((ec, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 text-sm bg-orange-50/50 dark:bg-orange-950/20">
                        <span className="font-medium text-foreground">{ec.company_name}</span>
                        <span className="text-xs text-muted-foreground ml-2 truncate max-w-[200px]">{ec.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {savedCount > 0 ? 'Done' : 'Cancel'}
          </Button>
          {savedCount === 0 && companies.length > 0 && (
            <Button onClick={handleSave} disabled={saving || selected.size === 0}>
              {saving ? (
                <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Saving...</>
              ) : (
                `Add ${selected.size} Companies`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
