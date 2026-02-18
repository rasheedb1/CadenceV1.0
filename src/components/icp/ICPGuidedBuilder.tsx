import { useState } from 'react'
import { Building2, Target, Globe, Wifi, TrendingUp, Ban, Upload, Plus, ShieldCheck } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CollapsibleSection } from '@/components/ui/collapsible-section'
import { MultiSelectChips } from '@/components/ui/multi-select-chips'
import { TagInput } from '@/components/ui/tag-input'
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { ImportExclusionDialog } from '@/components/registry/ImportExclusionDialog'
import { AddExclusionDialog } from '@/components/registry/AddExclusionDialog'
import { useAccountMapping } from '@/contexts/AccountMappingContext'
import type { ICPBuilderData } from '@/types/icp-builder'
import {
  PRODUCT_CATEGORIES,
  BUSINESS_MODELS,
  INDUSTRIES,
  COMPANY_SIZES,
  REVENUE_RANGES,
  COMPANY_STAGES,
  REGIONS,
  DIGITAL_PRESENCE_SIGNALS,
  TECH_SIGNALS,
  BUYING_SIGNALS,
  EXCLUSION_CRITERIA,
} from '@/lib/icp-constants'
import { useMemo } from 'react'
import { EXCLUSION_TYPES } from '@/types/registry'

interface ICPGuidedBuilderProps {
  data: ICPBuilderData
  onChange: (data: ICPBuilderData) => void
}

// Flatten grouped options into SearchableMultiSelect format
function flattenGrouped(groups: Array<{ group: string; options: string[] }>) {
  return groups.flatMap(g =>
    g.options.map(opt => ({ value: opt, label: opt, group: g.group }))
  )
}

export function ICPGuidedBuilder({ data, onChange }: ICPGuidedBuilderProps) {
  const update = <K extends keyof ICPBuilderData>(key: K, value: ICPBuilderData[K]) => {
    onChange({ ...data, [key]: value })
  }

  const { companyRegistry, getExclusionStats } = useAccountMapping()
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)

  const exclusionStats = getExclusionStats()
  const registryExclusionCount = companyRegistry.filter(
    e => (EXCLUSION_TYPES as string[]).includes(e.registry_type)
  ).length

  const industryOptions = useMemo(() => flattenGrouped(INDUSTRIES), [])
  const techOptions = useMemo(() => flattenGrouped(TECH_SIGNALS), [])

  // Flatten regions for SearchableMultiSelect
  const regionOptions = useMemo(
    () =>
      REGIONS.flatMap(r => [
        { value: r.region, label: r.region, group: 'Regions' },
        ...r.countries.map(c => ({ value: c, label: c, group: r.region })),
      ]),
    []
  )

  // Count selected items per section for badges
  const s1Count =
    (data.companyDescription ? 1 : 0) +
    (data.productCategory ? 1 : 0) +
    data.existingCustomers.length
  const s2Count =
    data.businessModels.length +
    data.industries.length +
    data.companySizes.length +
    (data.revenueRangeMin || data.revenueRangeMax ? 1 : 0) +
    data.companyStages.length
  const s3Count = data.targetRegions.length + data.mustOperateIn.length
  const s4Count = data.digitalPresence.length + data.techSignals.length
  const s5Count = data.buyingSignals.length + (data.customSignals ? 1 : 0)
  const s6Count =
    data.exclusionCriteria.length +
    data.excludedCompanies.length +
    data.excludedIndustries.length

  return (
    <div className="space-y-3">
      {/* Section 1: About Your Company */}
      <CollapsibleSection
        title="About Your Company"
        icon={<Building2 className="h-4 w-4" />}
        badge={s1Count || undefined}
        defaultOpen
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">What does your company do?</Label>
            <Textarea
              value={data.companyDescription}
              onChange={e => update('companyDescription', e.target.value)}
              placeholder="e.g., We provide a digital payment orchestration platform that helps businesses manage multiple payment providers through a single API"
              rows={2}
              className="text-sm resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Product category</Label>
            <Select
              value={data.productCategory}
              onValueChange={v => update('productCategory', v)}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select a category..." />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_CATEGORIES.map(group => (
                  <SelectGroup key={group.group}>
                    <SelectLabel>{group.group}</SelectLabel>
                    {group.options.map(opt => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Your existing customers (optional)</Label>
            <TagInput
              tags={data.existingCustomers}
              onChange={tags => update('existingCustomers', tags)}
              placeholder="e.g., Rappi, inDrive, Amazon..."
              maxTags={5}
            />
            <p className="text-[11px] text-muted-foreground">
              Add 3-5 customer names to help find similar companies
            </p>
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 2: Target Company Profile */}
      <CollapsibleSection
        title="Target Company Profile"
        icon={<Target className="h-4 w-4" />}
        badge={s2Count || undefined}
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Business model</Label>
            <MultiSelectChips
              options={BUSINESS_MODELS.map(m => ({ value: m, label: m }))}
              selected={data.businessModels}
              onChange={v => update('businessModels', v)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Industries</Label>
            <SearchableMultiSelect
              options={industryOptions}
              selected={data.industries}
              onChange={v => update('industries', v)}
              placeholder="Select industries..."
              searchPlaceholder="Search industries..."
              allowCustom
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Company size</Label>
            <MultiSelectChips
              options={COMPANY_SIZES.map(s => ({
                value: s.value,
                label: s.label,
                description: s.range,
              }))}
              selected={data.companySizes}
              onChange={v => update('companySizes', v)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Annual revenue range (optional)</Label>
            <div className="flex items-center gap-2">
              <Select
                value={data.revenueRangeMin}
                onValueChange={v => update('revenueRangeMin', v)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Min revenue" />
                </SelectTrigger>
                <SelectContent>
                  {REVENUE_RANGES.map(r => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">to</span>
              <Select
                value={data.revenueRangeMax}
                onValueChange={v => update('revenueRangeMax', v)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Max revenue" />
                </SelectTrigger>
                <SelectContent>
                  {REVENUE_RANGES.map(r => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Company stage (optional)</Label>
            <MultiSelectChips
              options={COMPANY_STAGES.map(s => ({ value: s, label: s }))}
              selected={data.companyStages}
              onChange={v => update('companyStages', v)}
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 3: Geography */}
      <CollapsibleSection
        title="Geography"
        icon={<Globe className="h-4 w-4" />}
        badge={s3Count || undefined}
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Target regions & countries</Label>
            <SearchableMultiSelect
              options={regionOptions}
              selected={data.targetRegions}
              onChange={v => update('targetRegions', v)}
              placeholder="Select regions or countries..."
              searchPlaceholder="Search regions..."
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Must operate in (optional)</Label>
            <TagInput
              tags={data.mustOperateIn}
              onChange={tags => update('mustOperateIn', tags)}
              placeholder="Specific required countries..."
            />
            <p className="text-[11px] text-muted-foreground">
              Companies must specifically operate in these markets
            </p>
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 4: Digital Characteristics */}
      <CollapsibleSection
        title="Digital Characteristics"
        icon={<Wifi className="h-4 w-4" />}
        badge={s4Count || undefined}
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Digital presence requirements</Label>
            <div className="space-y-2">
              {DIGITAL_PRESENCE_SIGNALS.map(signal => (
                <label
                  key={signal.value}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Checkbox
                    checked={data.digitalPresence.includes(signal.value)}
                    onCheckedChange={() => {
                      const next = data.digitalPresence.includes(signal.value)
                        ? data.digitalPresence.filter(v => v !== signal.value)
                        : [...data.digitalPresence, signal.value]
                      update('digitalPresence', next)
                    }}
                  />
                  <span className="text-sm">{signal.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Technology signals (optional)</Label>
            <SearchableMultiSelect
              options={techOptions}
              selected={data.techSignals}
              onChange={v => update('techSignals', v)}
              placeholder="Select technologies..."
              searchPlaceholder="Search technologies..."
              allowCustom
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 5: Buying Signals */}
      <CollapsibleSection
        title="Buying Signals"
        icon={<TrendingUp className="h-4 w-4" />}
        badge={s5Count || undefined}
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Prioritize companies showing these signals</Label>
            <div className="space-y-2">
              {BUYING_SIGNALS.map(signal => (
                <label
                  key={signal.value}
                  className="flex items-start gap-2 cursor-pointer"
                >
                  <Checkbox
                    checked={data.buyingSignals.includes(signal.value)}
                    onCheckedChange={() => {
                      const next = data.buyingSignals.includes(signal.value)
                        ? data.buyingSignals.filter(v => v !== signal.value)
                        : [...data.buyingSignals, signal.value]
                      update('buyingSignals', next)
                    }}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="text-sm font-medium">{signal.label}</span>
                    <p className="text-xs text-muted-foreground">{signal.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Custom signals (optional)</Label>
            <Textarea
              value={data.customSignals}
              onChange={e => update('customSignals', e.target.value)}
              placeholder="e.g., Companies that recently announced they're adding new payment methods to their platform"
              rows={2}
              className="text-sm resize-none"
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 6: Exclusions */}
      <CollapsibleSection
        title="Exclusions"
        icon={<Ban className="h-4 w-4" />}
        badge={s6Count || undefined}
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Exclude companies that...</Label>
            <div className="space-y-2">
              {EXCLUSION_CRITERIA.map(criterion => (
                <label
                  key={criterion.value}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Checkbox
                    checked={data.exclusionCriteria.includes(criterion.value)}
                    onCheckedChange={() => {
                      const next = data.exclusionCriteria.includes(criterion.value)
                        ? data.exclusionCriteria.filter(v => v !== criterion.value)
                        : [...data.exclusionCriteria, criterion.value]
                      update('exclusionCriteria', next)
                    }}
                  />
                  <span className="text-sm">{criterion.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Specific companies to exclude</Label>
            <TagInput
              tags={data.excludedCompanies}
              onChange={tags => update('excludedCompanies', tags)}
              placeholder="Company names to exclude..."
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Industries to exclude</Label>
            <SearchableMultiSelect
              options={industryOptions}
              selected={data.excludedIndustries}
              onChange={v => update('excludedIndustries', v)}
              placeholder="Select industries to exclude..."
              searchPlaceholder="Search industries..."
            />
          </div>

          {/* Registry exclusion summary + actions */}
          <div className="border-t pt-3 mt-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-orange-500" />
                <Label className="text-xs font-medium">Lista de exclusion del registry</Label>
              </div>
              {registryExclusionCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  {registryExclusionCount} empresa{registryExclusionCount !== 1 ? 's' : ''}
                  {exclusionStats.byType.customer ? ` (${exclusionStats.byType.customer} clientes)` : ''}
                </span>
              )}
            </div>
            {registryExclusionCount === 0 && (
              <p className="text-xs text-muted-foreground">
                No hay empresas en la lista de exclusion. Importa un CSV o agrega manualmente.
              </p>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={() => setShowImportDialog(true)}
              >
                <Upload className="h-3 w-3 mr-1" />
                Importar CSV
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={() => setShowAddDialog(true)}
              >
                <Plus className="h-3 w-3 mr-1" />
                Agregar empresa
              </Button>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Exclusion dialogs */}
      <ImportExclusionDialog open={showImportDialog} onOpenChange={setShowImportDialog} />
      <AddExclusionDialog open={showAddDialog} onOpenChange={setShowAddDialog} />
    </div>
  )
}
