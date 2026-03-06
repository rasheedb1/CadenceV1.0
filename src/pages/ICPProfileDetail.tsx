import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useICPProfile, useICPProfileMutations, useICPProfileUsage } from '@/hooks/useICPProfiles'
import { useAccountMapping, type SuggestedPersona } from '@/contexts/AccountMappingContext'
import { useAuth } from '@/contexts/AuthContext'
import { AddPersonaDialog } from '@/components/account-mapping/AddPersonaDialog'
import { ICPGuidedBuilder } from '@/components/icp/ICPGuidedBuilder'
import { ICPPromptPreview } from '@/components/icp/ICPPromptPreview'
import { SmartICPInsights } from '@/components/icp/SmartICPInsights'
import { ICPTemplateDialog } from '@/components/icp/ICPTemplateDialog'
import { LLMModelSelector } from '@/components/LLMModelSelector'
import { FeatureGate } from '@/components/FeatureGate'
import { buildICPPrompt, isICPBuilderPopulated } from '@/lib/icp-prompt-builder'
import { EMPTY_ICP_BUILDER_DATA, type ICPBuilderData } from '@/types/icp-builder'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ArrowLeft,
  Plus,
  Trash2,
  Sparkles,
  Loader2,
  Target,
  FileText,
  Eye,
  BookTemplate,
  CheckCircle2,
  Pencil,
  Globe,
  Map,
} from 'lucide-react'
import {
  BUYING_ROLE_CONFIG,
  type BuyerPersona,
  type BuyingCommitteeRole,
} from '@/types/account-mapping'
import { toast } from 'sonner'

type ICPSubTab = 'guided' | 'custom'

export function ICPProfileDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: profile, isLoading } = useICPProfile(id)
  const { data: usageMap } = useICPProfileUsage()
  const {
    updateProfile,
    deleteProfile,
    addPersona: addPersonaMutation,
    updatePersona: updatePersonaMutation,
    deletePersona: deletePersonaMutation,
  } = useICPProfileMutations()

  const {
    icpTemplates,
    saveTemplate,
    deleteTemplate,
    polishICPDescription,
    suggestBuyerPersonas,
    suggestPersonaTitles,
    getSmartICPInsights,
  } = useAccountMapping()

  // ICP state
  const [subTab, setSubTab] = useState<ICPSubTab>('guided')
  const [description, setDescription] = useState<string | null>(null)
  const [builderData, setBuilderData] = useState<ICPBuilderData | null>(null)
  const [saved, setSaved] = useState(true)
  const [polishing, setPolishing] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [localMin, setLocalMin] = useState(5)
  const [localMax, setLocalMax] = useState(15)

  // Persona state
  const [showAddPersona, setShowAddPersona] = useState(false)
  const [editingPersona, setEditingPersona] = useState<BuyerPersona | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestions, setSuggestions] = useState<SuggestedPersona[]>([])
  const [addedSuggestions, setAddedSuggestions] = useState<Set<number>>(new Set())

  // Initialize local state from profile data
  const effectiveDescription = description ?? profile?.description ?? ''
  const effectiveBuilderData = builderData ?? { ...EMPTY_ICP_BUILDER_DATA, ...(profile?.builder_data as Partial<ICPBuilderData> ?? {}) }
  const effectiveMin = profile ? (localMin !== 5 || !saved ? localMin : profile.discover_min_companies) : localMin
  const effectiveMax = profile ? (localMax !== 15 || !saved ? localMax : profile.discover_max_companies) : localMax

  const personas = profile?.buyer_personas || []
  const hasICPData = isICPBuilderPopulated(effectiveBuilderData)
  const usageCount = usageMap?.get(id || '') || 0

  const handleBuilderChange = (data: ICPBuilderData) => {
    setBuilderData(data)
    setSaved(false)
  }

  const handleSave = async () => {
    if (!profile) return
    const updates: Record<string, unknown> = {}

    if (subTab === 'guided') {
      const prompt = buildICPPrompt(effectiveBuilderData)
      updates.builder_data = effectiveBuilderData
      if (prompt) updates.description = prompt
    } else {
      updates.description = effectiveDescription
    }
    updates.discover_min_companies = effectiveMin
    updates.discover_max_companies = effectiveMax

    await updateProfile.mutateAsync({ id: profile.id, ...updates } as Parameters<typeof updateProfile.mutateAsync>[0])
    setSaved(true)
    toast.success('ICP Profile saved')
  }

  const handlePolish = async () => {
    if (!effectiveDescription.trim()) return
    setPolishing(true)
    try {
      const polished = await polishICPDescription(effectiveDescription)
      setDescription(polished)
      if (profile) {
        await updateProfile.mutateAsync({ id: profile.id, description: polished })
      }
      setSaved(true)
    } catch (err) {
      console.error('Polish failed:', err)
    } finally {
      setPolishing(false)
    }
  }

  const handleLoadTemplate = (data: ICPBuilderData) => {
    setBuilderData(data)
    setSaved(false)
  }

  const handleApplyInsight = (field: keyof ICPBuilderData, operation: 'add' | 'remove', value: string) => {
    const bd = effectiveBuilderData
    const current = bd[field]
    if (Array.isArray(current)) {
      if (operation === 'add' && !current.includes(value)) {
        setBuilderData({ ...bd, [field]: [...current, value] })
      } else if (operation === 'remove') {
        setBuilderData({ ...bd, [field]: current.filter((v: string) => v !== value) })
      }
    } else if (typeof current === 'string') {
      setBuilderData({ ...bd, [field]: operation === 'add' ? value : '' })
    }
    setSaved(false)
  }

  // Persona handlers
  const handleAddPersona = async (persona: Omit<BuyerPersona, 'id' | 'created_at' | 'updated_at' | 'org_id'>) => {
    if (!profile) return null
    const result = await addPersonaMutation.mutateAsync({
      ...persona,
      icp_profile_id: profile.id,
      account_map_id: null,
    } as Parameters<typeof addPersonaMutation.mutateAsync>[0])
    return result
  }

  const handleUpdatePersona = async (personaId: string, data: Partial<BuyerPersona>) => {
    await updatePersonaMutation.mutateAsync({ id: personaId, ...data })
  }

  const handleDeletePersona = async (personaId: string) => {
    await deletePersonaMutation.mutateAsync(personaId)
  }

  const handleSuggestPersonas = async () => {
    if (!profile) return
    setSuggesting(true)
    setAddedSuggestions(new Set())
    try {
      // suggestBuyerPersonas needs an accountMapId — but we can pass profile data directly
      // For now, we'll show a message if there's no linked account map
      toast.info('Persona suggestions use ICP data from the profile')
      // We need to work with the existing suggestBuyerPersonas or create a new flow
      // For the MVP, if any account map uses this profile, use the first one
      const result = await suggestBuyerPersonas(profile.id)
      setSuggestions(result)
    } catch (err) {
      console.error('Failed to suggest personas:', err)
      toast.error('Failed to suggest personas')
    } finally {
      setSuggesting(false)
    }
  }

  const handleAddSuggestion = async (s: SuggestedPersona, index: number) => {
    if (!profile || !user) return
    try {
      await addPersonaMutation.mutateAsync({
        icp_profile_id: profile.id,
        account_map_id: null,
        owner_id: user.id,
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
      } as Parameters<typeof addPersonaMutation.mutateAsync>[0])
      setAddedSuggestions(prev => new Set(prev).add(index))
    } catch (err) {
      console.error('Failed to add suggested persona:', err)
    }
  }

  const handleDelete = async () => {
    if (!profile) return
    if (usageCount > 0) {
      toast.error(`This profile is used by ${usageCount} account map(s). Unlink them first.`)
      return
    }
    if (!confirm('Delete this ICP Profile and all its personas?')) return
    await deleteProfile.mutateAsync(profile.id)
    navigate('/account-mapping')
  }

  const guidedPrompt = buildICPPrompt(effectiveBuilderData)
  const canDiscover = subTab === 'guided' ? !!guidedPrompt.trim() : !!effectiveDescription.trim()

  const subTabs: { id: ICPSubTab; label: string; icon: React.ReactNode }[] = [
    { id: 'guided', label: 'Guided Builder', icon: <Target className="h-3.5 w-3.5" /> },
    { id: 'custom', label: 'Custom Prompt', icon: <FileText className="h-3.5 w-3.5" /> },
  ]

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
        Loading ICP Profile...
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        ICP Profile not found.{' '}
        <Link to="/account-mapping" className="text-primary underline">Go back</Link>
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" className="mb-2" onClick={() => navigate('/account-mapping')}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to Account Mapping
        </Button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[28px] font-bold tracking-tight font-heading">{profile.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="text-xs">
                {personas.length} persona{personas.length !== 1 ? 's' : ''}
              </Badge>
              {usageCount > 0 && (
                <Badge variant="outline" className="text-xs">
                  <Map className="mr-1 h-3 w-3" />
                  Used in {usageCount} map{usageCount !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          </div>
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            <Trash2 className="mr-1 h-4 w-4" /> Delete
          </Button>
        </div>
      </div>

      <div className="max-w-4xl space-y-6">
        {/* ICP Builder Card */}
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
            {/* Guided Builder */}
            {subTab === 'guided' && (
              <>
                <ICPGuidedBuilder data={effectiveBuilderData} onChange={handleBuilderChange} />
                <ICPPromptPreview data={effectiveBuilderData} visible={showPreview} />
                {profile && (
                  <SmartICPInsights
                    accountMapId={profile.id}
                    builderData={effectiveBuilderData}
                    feedbackCount={0}
                    onApplyInsight={handleApplyInsight}
                    onAnalyze={getSmartICPInsights}
                  />
                )}
              </>
            )}

            {/* Custom Prompt */}
            {subTab === 'custom' && (
              <>
                <textarea
                  className="flex min-h-[140px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                  value={effectiveDescription}
                  onChange={(e) => { setDescription(e.target.value); setSaved(false) }}
                  placeholder="e.g., E-commerce and fintech companies in Latin America with 200+ employees that process digital payments..."
                />
                <FeatureGate flag="acctmap_ai_polish">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePolish}
                      disabled={polishing || !effectiveDescription.trim()}
                    >
                      {polishing ? (
                        <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Polishing...</>
                      ) : (
                        <><Sparkles className="mr-1 h-4 w-4" /> Polish with AI</>
                      )}
                    </Button>
                    <LLMModelSelector />
                  </div>
                </FeatureGate>
              </>
            )}

            {/* Footer: Save + Preview */}
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
                <Button size="sm" onClick={handleSave}>
                  Save
                </Button>
              )}
              {saved && canDiscover && (
                <span className="text-xs text-muted-foreground">Saved</span>
              )}
            </div>

            {/* Discover Companies Settings */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Company Discovery Settings</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Configure how many companies AI should discover when using this ICP.
              </p>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap">Min</Label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={effectiveMin}
                    onChange={(e) => { setLocalMin(Math.max(1, parseInt(e.target.value) || 1)); setSaved(false) }}
                    className="w-20 h-8 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap">Max</Label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={effectiveMax}
                    onChange={(e) => { setLocalMax(Math.max(1, parseInt(e.target.value) || 1)); setSaved(false) }}
                    className="w-20 h-8 text-sm"
                  />
                </div>
                {!saved && (
                  <Button size="sm" variant="outline" onClick={handleSave}>Save</Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Buyer Personas Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Buyer Personas</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Define the roles you're looking for with title keywords for Sales Navigator search.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <FeatureGate flag="acctmap_persona_suggest">
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
              </FeatureGate>
              <LLMModelSelector />
              <Button size="sm" onClick={() => { setEditingPersona(null); setShowAddPersona(true) }}>
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
                        <TableHead className="w-20" />
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
                                  {(persona.title_keywords || []).slice(0, 3).map((kw) => (
                                    <Badge key={kw} variant="outline" className="text-xs">{kw}</Badge>
                                  ))}
                                  {(persona.title_keywords || []).length > 3 && (
                                    <Badge variant="outline" className="text-xs">+{(persona.title_keywords || []).length - 3}</Badge>
                                  )}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-center">{persona.max_per_company}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                  onClick={() => { setEditingPersona(persona); setShowAddPersona(true) }}
                                  title="Edit persona"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => handleDeletePersona(persona.id)}
                                  title="Delete persona"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
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
      </div>

      {/* Add/Edit Persona Dialog */}
      <AddPersonaDialog
        open={showAddPersona}
        onOpenChange={setShowAddPersona}
        accountMapId=""
        icpProfileId={profile.id}
        ownerId={user?.id || ''}
        onAdd={handleAddPersona}
        onUpdate={editingPersona ? handleUpdatePersona : undefined}
        persona={editingPersona}
        onSuggestTitles={suggestPersonaTitles}
        icpContext={{
          productCategory: effectiveBuilderData.productCategory,
          companyDescription: effectiveBuilderData.companyDescription,
        }}
      />

      {/* Template Dialog */}
      <ICPTemplateDialog
        open={showTemplates}
        onOpenChange={setShowTemplates}
        templates={icpTemplates}
        currentData={effectiveBuilderData}
        onSave={saveTemplate}
        onDelete={deleteTemplate}
        onLoad={handleLoadTemplate}
      />
    </div>
  )
}
