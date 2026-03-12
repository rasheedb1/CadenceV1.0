import { useState, useEffect } from 'react'
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
import { X, Sparkles, Loader2 } from 'lucide-react'
import {
  SENIORITY_OPTIONS,
  BUYING_COMMITTEE_ROLES,
  type BuyerPersona,
  type TierKeywords,
  type TierSeniority,
  type BuyingCommitteeRole,
} from '@/types/account-mapping'

interface AddPersonaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountMapId: string
  icpProfileId?: string
  personaGroupId?: string
  ownerId: string
  onAdd: (persona: Omit<BuyerPersona, 'id' | 'created_at' | 'updated_at' | 'org_id'>) => Promise<BuyerPersona | null>
  onUpdate?: (id: string, data: Partial<BuyerPersona>) => Promise<void>
  persona?: BuyerPersona | null
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
  icpProfileId,
  personaGroupId,
  ownerId,
  onAdd,
  onUpdate,
  persona,
  onSuggestTitles,
  icpContext,
}: AddPersonaDialogProps) {
  const isEditing = !!persona
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [role, setRole] = useState<BuyingCommitteeRole | ''>('')
  const [priority, setPriority] = useState(1)
  const [isRequired, setIsRequired] = useState(true)
  const [maxPerCompany, setMaxPerCompany] = useState(3)

  // General keywords (apply to all company sizes)
  const [keywords, setKeywords] = useState<string[]>([])
  const [selectedSeniority, setSelectedSeniority] = useState<string[]>([])
  const [keywordInput, setKeywordInput] = useState('')

  // Departments
  const [departments, setDepartments] = useState<string[]>([])
  const [deptInput, setDeptInput] = useState('')

  // UI state
  const [saving, setSaving] = useState(false)
  const [suggesting, setSuggesting] = useState(false)

  const reset = () => {
    setName(''); setDescription(''); setRole(''); setPriority(1)
    setIsRequired(true); setMaxPerCompany(3)
    setKeywords([])
    setSelectedSeniority([])
    setKeywordInput('')
    setDepartments([]); setDeptInput('')
  }

  // When opening in edit mode, populate fields from existing persona
  useEffect(() => {
    if (open && persona) {
      setName(persona.name)
      setDescription(persona.description || '')
      setRole(persona.role_in_buying_committee || '')
      setPriority(persona.priority)
      setIsRequired(persona.is_required)
      setMaxPerCompany(persona.max_per_company)
      setDepartments(persona.departments || [])

      // Merge all tier keywords into one deduplicated list
      const allKeywords = [
        ...(persona.title_keywords_by_tier?.enterprise || []),
        ...(persona.title_keywords_by_tier?.mid_market || []),
        ...(persona.title_keywords_by_tier?.startup_smb || []),
        ...(persona.title_keywords || []),
      ]
      setKeywords([...new Set(allKeywords)])

      // Merge all tier seniority into one deduplicated list
      const allSeniority = [
        ...(persona.seniority_by_tier?.enterprise || []),
        ...(persona.seniority_by_tier?.mid_market || []),
        ...(persona.seniority_by_tier?.startup_smb || []),
        ...(persona.seniority ? [persona.seniority] : []),
      ]
      setSelectedSeniority([...new Set(allSeniority)])
    } else if (!open) {
      reset()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, persona?.id])

  const addKeyword = () => {
    const input = keywordInput.trim()
    if (!input) return
    const newKeywords = input.split(',').map(k => k.trim()).filter(Boolean)
    setKeywords(prev => [...prev, ...newKeywords.filter(k => !prev.includes(k))])
    setKeywordInput('')
  }

  const removeKeyword = (keyword: string) => {
    setKeywords(prev => prev.filter(k => k !== keyword))
  }

  const toggleSeniority = (seniority: string) => {
    setSelectedSeniority(prev =>
      prev.includes(seniority) ? prev.filter(s => s !== seniority) : [...prev, seniority]
    )
  }

  const addDepartment = () => {
    const dept = deptInput.trim()
    if (!dept || departments.includes(dept)) return
    setDepartments(prev => [...prev, dept])
    setDeptInput('')
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
      // Merge all tier suggestions into one deduplicated list
      const allKeywords = [
        ...(result.tiers.enterprise || []),
        ...(result.tiers.mid_market || []),
        ...(result.tiers.startup_smb || []),
      ]
      const allSeniority = [
        ...(result.seniority.enterprise || []),
        ...(result.seniority.mid_market || []),
        ...(result.seniority.startup_smb || []),
      ]
      setKeywords([...new Set(allKeywords)])
      setSelectedSeniority([...new Set(allSeniority)])
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
      // Populate all tiers with the same keywords so backend search logic works unchanged
      const tierKeywords: TierKeywords = {
        enterprise: keywords,
        mid_market: keywords,
        startup_smb: keywords,
      }
      const tierSeniority: TierSeniority = {
        enterprise: selectedSeniority,
        mid_market: selectedSeniority,
        startup_smb: selectedSeniority,
      }

      if (isEditing && persona && onUpdate) {
        await onUpdate(persona.id, {
          name: name.trim(),
          title_keywords: keywords,
          seniority: selectedSeniority[0] || null,
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
      } else {
        await onAdd({
          account_map_id: (icpProfileId || personaGroupId) ? null : accountMapId,
          icp_profile_id: icpProfileId || null,
          persona_group_id: personaGroupId || null,
          owner_id: ownerId,
          name: name.trim(),
          title_keywords: keywords,
          seniority: selectedSeniority[0] || null,
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
      }
      onOpenChange(false)
    } catch (err) {
      console.error('Failed to save persona:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o) }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Buyer Persona' : 'Add Buyer Persona'}</DialogTitle>
          <DialogDescription>
            Define a role to search for in target companies using title keywords and seniority filters.
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

          {/* Title Keywords */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Title Keywords</Label>
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

            <div className="space-y-1.5">
              <div className="flex gap-2">
                <Input
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword() } }}
                  placeholder="e.g., VP Payments, Head of Payments, Director of Finance"
                  className="text-sm"
                />
                <Button variant="outline" size="sm" onClick={addKeyword} disabled={!keywordInput.trim()}>
                  Add
                </Button>
              </div>
              {keywords.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {keywords.map((kw) => (
                    <Badge key={kw} variant="secondary" className="gap-1 text-xs">
                      {kw}
                      <button onClick={() => removeKeyword(kw)}>
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
                    variant={selectedSeniority.includes(s) ? 'default' : 'outline'}
                    className="cursor-pointer text-xs"
                    onClick={() => toggleSeniority(s)}
                  >
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mr-auto">
            {keywords.length > 0 && <span>{keywords.length} keyword{keywords.length !== 1 ? 's' : ''}</span>}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Persona'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
