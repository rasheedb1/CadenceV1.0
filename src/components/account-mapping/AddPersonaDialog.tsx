import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { LLMModelSelector } from '@/components/LLMModelSelector'
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
import { X, Sparkles, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import {
  SENIORITY_OPTIONS,
  BUYING_COMMITTEE_ROLES,
  EMPTY_TIER_KEYWORDS,
  EMPTY_TIER_SENIORITY,
  type BuyerPersona,
  type CompanySizeTier,
  type TierKeywords,
  type TierSeniority,
  type BuyingCommitteeRole,
} from '@/types/account-mapping'
import { TIER_LABELS } from '@/lib/prospecting/adaptive-keywords'

interface AddPersonaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountMapId: string
  ownerId: string
  onAdd: (persona: Omit<BuyerPersona, 'id' | 'created_at' | 'updated_at' | 'org_id'>) => Promise<BuyerPersona | null>
  onSuggestTitles?: (params: {
    productCategory: string
    companyDescription: string
    buyingRole: string
    personaDescription: string
  }) => Promise<{ tiers: TierKeywords; seniority: TierSeniority }>
  icpContext?: { productCategory?: string; companyDescription?: string }
}

export function AddPersonaDialog({
  open,
  onOpenChange,
  accountMapId,
  ownerId,
  onAdd,
  onSuggestTitles,
  icpContext,
}: AddPersonaDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [role, setRole] = useState<BuyingCommitteeRole | ''>('')
  const [priority, setPriority] = useState(1)
  const [isRequired, setIsRequired] = useState(true)
  const [maxPerCompany, setMaxPerCompany] = useState(3)

  // Tier-specific keywords
  const [tierKeywords, setTierKeywords] = useState<TierKeywords>({ ...EMPTY_TIER_KEYWORDS })
  const [tierSeniority, setTierSeniority] = useState<TierSeniority>({ ...EMPTY_TIER_SENIORITY })
  const [tierInputs, setTierInputs] = useState({ enterprise: '', mid_market: '', startup_smb: '' })

  // Departments
  const [departments, setDepartments] = useState<string[]>([])
  const [deptInput, setDeptInput] = useState('')

  // UI state
  const [expandedTiers, setExpandedTiers] = useState<Set<CompanySizeTier>>(new Set(['enterprise', 'mid_market', 'startup_smb']))
  const [saving, setSaving] = useState(false)
  const [suggesting, setSuggesting] = useState(false)

  const reset = () => {
    setName(''); setDescription(''); setRole(''); setPriority(1)
    setIsRequired(true); setMaxPerCompany(3)
    setTierKeywords({ ...EMPTY_TIER_KEYWORDS })
    setTierSeniority({ ...EMPTY_TIER_SENIORITY })
    setTierInputs({ enterprise: '', mid_market: '', startup_smb: '' })
    setDepartments([]); setDeptInput('')
    setExpandedTiers(new Set(['enterprise', 'mid_market', 'startup_smb']))
  }

  const addKeywordToTier = (tier: CompanySizeTier) => {
    const input = tierInputs[tier].trim()
    if (!input) return
    // Support comma-separated input
    const newKeywords = input.split(',').map(k => k.trim()).filter(Boolean)
    setTierKeywords(prev => ({
      ...prev,
      [tier]: [...prev[tier], ...newKeywords.filter(k => !prev[tier].includes(k))],
    }))
    setTierInputs(prev => ({ ...prev, [tier]: '' }))
  }

  const removeKeywordFromTier = (tier: CompanySizeTier, keyword: string) => {
    setTierKeywords(prev => ({
      ...prev,
      [tier]: prev[tier].filter(k => k !== keyword),
    }))
  }

  const toggleSeniorityForTier = (tier: CompanySizeTier, seniority: string) => {
    setTierSeniority(prev => ({
      ...prev,
      [tier]: prev[tier].includes(seniority)
        ? prev[tier].filter(s => s !== seniority)
        : [...prev[tier], seniority],
    }))
  }

  const addDepartment = () => {
    const dept = deptInput.trim()
    if (!dept || departments.includes(dept)) return
    setDepartments(prev => [...prev, dept])
    setDeptInput('')
  }

  const toggleTierExpanded = (tier: CompanySizeTier) => {
    setExpandedTiers(prev => {
      const next = new Set(prev)
      if (next.has(tier)) next.delete(tier)
      else next.add(tier)
      return next
    })
  }

  const handleAutoSuggest = async () => {
    if (!onSuggestTitles || !role) return
    setSuggesting(true)
    try {
      const result = await onSuggestTitles({
        productCategory: icpContext?.productCategory || '',
        companyDescription: icpContext?.companyDescription || '',
        buyingRole: role,
        personaDescription: description,
      })
      setTierKeywords({
        enterprise: result.tiers.enterprise || [],
        mid_market: result.tiers.mid_market || [],
        startup_smb: result.tiers.startup_smb || [],
      })
      setTierSeniority({
        enterprise: result.seniority.enterprise || [],
        mid_market: result.seniority.mid_market || [],
        startup_smb: result.seniority.startup_smb || [],
      })
    } catch (err) {
      console.error('Auto-suggest failed:', err)
    } finally {
      setSuggesting(false)
    }
  }

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      // Build flat title_keywords from mid_market tier as default
      const flatKeywords = tierKeywords.mid_market.length > 0
        ? tierKeywords.mid_market
        : tierKeywords.enterprise.length > 0
          ? tierKeywords.enterprise
          : tierKeywords.startup_smb

      const flatSeniority = tierSeniority.mid_market.length > 0
        ? tierSeniority.mid_market[0]
        : tierSeniority.enterprise.length > 0
          ? tierSeniority.enterprise[0]
          : tierSeniority.startup_smb.length > 0
            ? tierSeniority.startup_smb[0]
            : null

      await onAdd({
        account_map_id: accountMapId,
        owner_id: ownerId,
        name: name.trim(),
        title_keywords: flatKeywords,
        seniority: flatSeniority,
        department: departments[0] || null,
        max_per_company: maxPerCompany,
        description: description.trim() || null,
        role_in_buying_committee: role || null,
        priority,
        is_required: isRequired,
        departments,
        title_keywords_by_tier: tierKeywords,
        seniority_by_tier: tierSeniority,
      })
      reset()
      onOpenChange(false)
    } catch (err) {
      console.error('Failed to add persona:', err)
    } finally {
      setSaving(false)
    }
  }

  const totalKeywords = tierKeywords.enterprise.length + tierKeywords.mid_market.length + tierKeywords.startup_smb.length

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Buyer Persona</DialogTitle>
          <DialogDescription>
            Define a role to search for in target companies with adaptive title keywords by company size.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* Row 1: Name + Role */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Persona Name *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Payment Decision Maker"
              />
            </div>
            <div className="space-y-2">
              <Label>Role in Buying Committee</Label>
              <Select value={role} onValueChange={(v) => setRole(v as BuyingCommitteeRole)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role..." />
                </SelectTrigger>
                <SelectContent>
                  {BUYING_COMMITTEE_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      <span className="font-medium">{r.label}</span>
                      <span className="text-xs text-muted-foreground ml-1">— {r.description}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Description</Label>
            <textarea
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[60px] resize-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe who this person is and why they matter for the sale..."
            />
          </div>

          {/* Row: Priority + Required + Max per company */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={String(priority)} onValueChange={(v) => setPriority(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} {n === 1 ? '(Contact first)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Max Per Company</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={maxPerCompany}
                onChange={(e) => setMaxPerCompany(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={isRequired}
                  onCheckedChange={(v) => setIsRequired(v === true)}
                />
                <span className="text-sm">Required persona</span>
              </label>
            </div>
          </div>

          {/* Departments */}
          <div className="space-y-2">
            <Label>Departments</Label>
            <div className="flex gap-2">
              <Input
                value={deptInput}
                onChange={(e) => setDeptInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDepartment() } }}
                placeholder="e.g., Finance, Engineering"
              />
              <Button variant="outline" onClick={addDepartment} disabled={!deptInput.trim()}>Add</Button>
            </div>
            {departments.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {departments.map((d) => (
                  <Badge key={d} variant="secondary" className="gap-1">
                    {d}
                    <button onClick={() => setDepartments(departments.filter(x => x !== d))}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Title Keywords by Tier */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Title Keywords by Company Size</Label>
              {onSuggestTitles && (
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAutoSuggest}
                    disabled={suggesting || !role}
                    className="gap-1"
                  >
                    {suggesting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    Auto-suggest with AI
                  </Button>
                  <LLMModelSelector />
                </div>
              )}
            </div>

            {(['enterprise', 'mid_market', 'startup_smb'] as CompanySizeTier[]).map((tier) => {
              const config = TIER_LABELS[tier]
              const isExpanded = expandedTiers.has(tier)
              const keywords = tierKeywords[tier]
              const seniorities = tierSeniority[tier]

              return (
                <div key={tier} className="rounded-lg border">
                  <button
                    className="flex items-center justify-between w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                    onClick={() => toggleTierExpanded(tier)}
                  >
                    <div className="flex items-center gap-2">
                      <span>{config.icon}</span>
                      <span className="text-sm font-medium">{config.label}</span>
                      <span className="text-xs text-muted-foreground">({config.description})</span>
                      {keywords.length > 0 && (
                        <Badge variant="secondary" className="text-[10px] h-5">
                          {keywords.length} keywords
                        </Badge>
                      )}
                    </div>
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-3 border-t">
                      {/* Keywords input */}
                      <div className="space-y-1.5 pt-2">
                        <p className="text-xs text-muted-foreground">Title keywords (comma-separated)</p>
                        <div className="flex gap-2">
                          <Input
                            value={tierInputs[tier]}
                            onChange={(e) => setTierInputs(prev => ({ ...prev, [tier]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeywordToTier(tier) } }}
                            placeholder={tier === 'enterprise' ? 'VP Payments, Head of Payments' : tier === 'startup_smb' ? 'CEO, CTO, Co-Founder' : 'VP Finance, Director of Engineering'}
                            className="text-sm"
                          />
                          <Button variant="outline" size="sm" onClick={() => addKeywordToTier(tier)} disabled={!tierInputs[tier].trim()}>
                            Add
                          </Button>
                        </div>
                        {keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {keywords.map((kw) => (
                              <Badge key={kw} variant="secondary" className="gap-1 text-xs">
                                {kw}
                                <button onClick={() => removeKeywordFromTier(tier, kw)}>
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Seniority */}
                      <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground">Seniority levels</p>
                        <div className="flex flex-wrap gap-1">
                          {SENIORITY_OPTIONS.map((s) => (
                            <Badge
                              key={s}
                              variant={seniorities.includes(s) ? 'default' : 'outline'}
                              className="cursor-pointer text-xs"
                              onClick={() => toggleSeniorityForTier(tier, s)}
                            >
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <DialogFooter>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mr-auto">
            {totalKeywords > 0 && <span>{totalKeywords} total keywords across tiers</span>}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Saving...' : 'Add Persona'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
