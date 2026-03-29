import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useICPProfile, useICPProfileMutations, useICPProfileUsage } from '@/hooks/useICPProfiles'
import { useAccountMapping } from '@/contexts/AccountMappingContext'

import { ICPGuidedBuilder } from '@/components/icp/ICPGuidedBuilder'
import { ICPPromptPreview } from '@/components/icp/ICPPromptPreview'
import { SmartICPInsights } from '@/components/icp/SmartICPInsights'
import { ICPTemplateDialog } from '@/components/icp/ICPTemplateDialog'
import { LLMModelSelector } from '@/components/LLMModelSelector'
import { FeatureGate } from '@/components/FeatureGate'
import { buildICPPrompt } from '@/lib/icp-prompt-builder'
import { EMPTY_ICP_BUILDER_DATA, type ICPBuilderData } from '@/types/icp-builder'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  ArrowLeft,
  Trash2,
  Sparkles,
  Loader2,
  Target,
  FileText,
  Eye,
  BookTemplate,
  Globe,
  Map,
} from 'lucide-react'
import { toast } from 'sonner'

type ICPSubTab = 'guided' | 'custom'

export function ICPProfileDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: profile, isLoading } = useICPProfile(id)
  const { data: usageMap } = useICPProfileUsage()
  const {
    updateProfile,
    deleteProfile,
  } = useICPProfileMutations()

  const {
    icpTemplates,
    saveTemplate,
    deleteTemplate,
    polishICPDescription,
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

  // Initialize local state from profile data
  const effectiveDescription = description ?? profile?.description ?? ''
  const effectiveBuilderData = builderData ?? { ...EMPTY_ICP_BUILDER_DATA, ...(profile?.builder_data as Partial<ICPBuilderData> ?? {}) }
  const effectiveMin = profile ? (localMin !== 5 || !saved ? localMin : profile.discover_min_companies) : localMin
  const effectiveMax = profile ? (localMax !== 15 || !saved ? localMax : profile.discover_max_companies) : localMax

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
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to Search Companies & Leads
        </Button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[28px] font-bold tracking-tight font-heading">{profile.name}</h1>
            <div className="flex items-center gap-2 mt-1">
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
                  <Button size="sm" variant="outline" onClick={handleSave}>Guardar</Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

      </div>

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
