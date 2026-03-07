import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ArrowLeft,
  Loader2,
  Sparkles,
  Download,
  CheckCircle,
  ChevronDown,
  User,
  Upload,
} from 'lucide-react'
import { useBusinessCases } from '@/contexts/BusinessCasesContext'
import { useOrg } from '@/contexts/OrgContext'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { downloadBusinessCasePptx } from '@/lib/pptx-generator'
import { substitutePptx } from '@/lib/pptx-substitutor'
import type { BusinessCase, BusinessCaseTemplate } from '@/types/business-cases'

// ── Lead picker (unchanged from before) ──────────────────────────────────────

interface LeadSummary {
  id: string
  first_name: string
  last_name: string
  company: string | null
  title: string | null
  email: string | null
}

function LeadPicker({
  onChange,
  orgId,
}: {
  onChange: (id: string, lead: LeadSummary) => void
  orgId: string | null
}) {
  const [search, setSearch] = useState('')
  const [leads, setLeads] = useState<LeadSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<LeadSummary | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (!orgId || !open) return
    const q = search.trim()
    let cancelled = false
    setLoading(true)
    const run = async () => {
      let query = supabase
        .from('leads')
        .select('id, first_name, last_name, company, title, email')
        .eq('org_id', orgId)
        .order('first_name')
        .limit(30)
      if (q) {
        query = query.or(
          `first_name.ilike.%${q}%,last_name.ilike.%${q}%,company.ilike.%${q}%,email.ilike.%${q}%`
        )
      }
      const { data } = await query
      if (!cancelled) { setLeads((data as LeadSummary[]) ?? []); setLoading(false) }
    }
    run()
    return () => { cancelled = true }
  }, [search, open, orgId])

  const handleSelect = (lead: LeadSummary) => {
    setSelected(lead)
    setOpen(false)
    setSearch('')
    onChange(lead.id, lead)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {selected ? (
          <span className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <span>
              {selected.first_name} {selected.last_name}
              {selected.company && <span className="text-muted-foreground ml-1">— {selected.company}</span>}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">Search for a lead…</span>
        )}
        <ChevronDown className="h-4 w-4 text-muted-foreground ml-2 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
          <div className="p-2 border-b">
            <Input autoFocus placeholder="Type to search…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8" />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loading && leads.length === 0 && <p className="p-4 text-sm text-center text-muted-foreground">No leads found</p>}
            {!loading && leads.map((lead) => (
              <button
                key={lead.id}
                type="button"
                onClick={() => handleSelect(lead)}
                className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors"
              >
                <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{lead.first_name} {lead.last_name}</p>
                  {(lead.company || lead.title) && (
                    <p className="text-xs text-muted-foreground truncate">
                      {[lead.title, lead.company].filter(Boolean).join(' @ ')}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Review Panel (AI-structured) ──────────────────────────────────────────────

function ReviewPanelAi({
  bc,
  onDownload,
  downloading,
}: {
  bc: BusinessCase
  onDownload: () => void
  downloading: boolean
}) {
  const content = { ...(bc.generated_content ?? {}), ...(bc.edited_content ?? {}) }
  const slides = bc.template?.slide_structure?.slice().sort((a, b) => a.slide_number - b.slide_number) ?? []
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-green-600 font-medium">
        <CheckCircle className="h-5 w-5" />
        Business case generated successfully!
      </div>
      <div className="rounded-lg border bg-muted/30 p-4 flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold">{bc.company_name}</p>
          {bc.contact_name && <p className="text-sm text-muted-foreground">{bc.contact_name}</p>}
          <p className="text-xs text-muted-foreground mt-1">
            {slides.length} slides &bull; {bc.template?.name ?? 'Unknown template'}
          </p>
        </div>
        <Button onClick={onDownload} disabled={downloading}>
          {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          {downloading ? 'Generating PPTX…' : 'Download PPTX'}
        </Button>
      </div>
      {bc.signals_used && bc.signals_used.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Research Signals Used</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {bc.signals_used.map((sig, i) => (
              <div key={i} className="text-sm">
                <span className="font-medium">{sig.name}:</span>{' '}
                <span className="text-muted-foreground">{sig.summary}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <div className="space-y-2">
        <h3 className="font-semibold text-sm">Slide Content Preview</h3>
        {slides.map((slide) => {
          const hasContent = slide.fixed_content || slide.fields.some((f) => content[`${slide.slide_number}_${f.key}`])
          return (
            <Card key={slide.slide_number} className={!hasContent ? 'opacity-40' : ''}>
              <CardContent className="pt-3 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-muted-foreground w-6">{slide.slide_number}</span>
                  <span className="font-medium text-sm">{slide.title}</span>
                  <Badge variant="outline" className="text-xs">{slide.layout}</Badge>
                </div>
                <div className="ml-8 space-y-1">
                  {slide.fixed_content && <p className="text-xs text-muted-foreground">{slide.fixed_content}</p>}
                  {slide.fields.map((field) => {
                    const val = content[`${slide.slide_number}_${field.key}`]
                    if (!val) return null
                    return (
                      <div key={field.key} className="text-xs">
                        <span className="text-muted-foreground font-medium">{field.name}: </span>
                        <span className="line-clamp-2">{val}</span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ── Review Panel (PPTX uploaded) ──────────────────────────────────────────────

function ReviewPanelPptx({
  companyName,
  contactName,
  templateName,
  content,
  signals,
  onDownload,
  downloading,
}: {
  companyName: string
  contactName?: string | null
  templateName: string
  content: Record<string, string>
  signals: Array<{ name: string; summary: string; sourceUrl?: string }>
  onDownload: () => void
  downloading: boolean
}) {
  const entries = Object.entries(content)
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-green-600 font-medium">
        <CheckCircle className="h-5 w-5" />
        Business case generated! Ready to download.
      </div>
      <div className="rounded-lg border bg-muted/30 p-4 flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold">{companyName}</p>
          {contactName && <p className="text-sm text-muted-foreground">{contactName}</p>}
          <p className="text-xs text-muted-foreground mt-1">
            {entries.length} variables filled &bull; {templateName}
          </p>
        </div>
        <Button onClick={onDownload} disabled={downloading}>
          {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          {downloading ? 'Generating PPTX…' : 'Download PPTX'}
        </Button>
      </div>
      {signals.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Research Signals Used</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {signals.map((sig, i) => (
              <div key={i} className="text-sm">
                <span className="font-medium">{sig.name}:</span>{' '}
                <span className="text-muted-foreground">{sig.summary}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <div className="space-y-2">
        <h3 className="font-semibold text-sm">Generated Content Preview</h3>
        {entries.map(([key, value]) => (
          <Card key={key}>
            <CardContent className="pt-3 pb-3">
              <p className="text-xs font-mono text-muted-foreground mb-1">{'{{' + key + '}}'}</p>
              <p className="text-sm line-clamp-3">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function BusinessCaseGenerate() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const {
    templates,
    generateCase,
    generatePptxContent,
    downloadPptxTemplate,
    isLoadingTemplates,
  } = useBusinessCases()
  const { orgId } = useOrg()

  const defaultTemplateId = searchParams.get('templateId') ?? ''

  const [templateId, setTemplateId] = useState(defaultTemplateId)
  const [leadId, setLeadId] = useState('')
  const [leadName, setLeadName] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [downloading, setDownloading] = useState(false)

  // AI-structured result
  const [generatedCase, setGeneratedCase] = useState<BusinessCase | null>(null)
  // PPTX result
  const [pptxResult, setPptxResult] = useState<{
    businessCaseId: string
    content: Record<string, string>
    signals: Array<{ name: string; summary: string; sourceUrl?: string }>
    template: BusinessCaseTemplate
    companyName: string
    contactName: string
  } | null>(null)

  const activeTemplates = templates.filter((t) => t.is_active)
  const selectedTemplate = activeTemplates.find((t) => t.id === templateId)
  const isPptxTemplate = selectedTemplate?.template_type === 'uploaded_pptx'

  const handleGenerate = async () => {
    if (!templateId) { toast.error('Please select a template'); return }
    if (!leadId) { toast.error('Please select a lead'); return }

    setIsGenerating(true)
    setGeneratedCase(null)
    setPptxResult(null)

    try {
      if (isPptxTemplate) {
        // Path B: PPTX substitution
        const result = await generatePptxContent(templateId, leadId)
        setPptxResult({
          ...result,
          template: selectedTemplate!,
          companyName: result.content['empresa'] || result.content['company'] || leadName.split(' ')[0] || 'Company',
          contactName: leadName,
        })
      } else {
        // Path A: AI-structured
        const result = await generateCase(templateId, leadId)
        result.template = templates.find((t) => t.id === templateId)
        setGeneratedCase(result)
      }
      toast.success('Business case generated!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate business case')
    } finally {
      setIsGenerating(false)
    }
  }

  // Download for AI-structured
  const handleDownloadAi = async () => {
    if (!generatedCase?.template) { toast.error('Template data not available'); return }
    setDownloading(true)
    try {
      const content = { ...(generatedCase.generated_content ?? {}), ...(generatedCase.edited_content ?? {}) }
      await downloadBusinessCasePptx(generatedCase, generatedCase.template, content)
      toast.success('PPTX downloaded')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate PPTX')
    } finally {
      setDownloading(false)
    }
  }

  // Download for PPTX template (substitution in browser)
  const handleDownloadPptx = async () => {
    if (!pptxResult?.template.pptx_storage_path) {
      toast.error('Template file not available')
      return
    }
    setDownloading(true)
    try {
      const templateBlob = await downloadPptxTemplate(pptxResult.template.pptx_storage_path)
      const resultBlob = await substitutePptx(templateBlob, pptxResult.content)
      const url = URL.createObjectURL(resultBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${pptxResult.companyName.replace(/[^a-zA-Z0-9 _-]/g, '')}_BusinessCase.pptx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('PPTX downloaded')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate PPTX')
    } finally {
      setDownloading(false)
    }
  }

  if (isLoadingTemplates) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/business-cases')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-heading">Generate Business Case</h1>
          <p className="text-muted-foreground text-sm">
            Select a template and a lead — AI researches the company and fills all variables
          </p>
        </div>
      </div>

      {activeTemplates.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground mb-4">No active templates found. Create a template first.</p>
            <Button onClick={() => navigate('/business-cases/new')}>Create Template</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Generation Settings</CardTitle>
              <CardDescription>
                {isPptxTemplate
                  ? 'AI will fill all {{variables}} in your uploaded PPTX template'
                  : 'AI will research the company and populate each slide with personalized content'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1.5">
                <Label>Template</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template…" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="flex items-center gap-2">
                          {t.template_type === 'uploaded_pptx'
                            ? <Upload className="h-3 w-3 shrink-0" />
                            : <Sparkles className="h-3 w-3 shrink-0" />
                          }
                          <span className="font-medium">{t.name}</span>
                          {t.description && (
                            <span className="text-muted-foreground text-xs">— {t.description}</span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTemplate && (
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {selectedTemplate.template_type === 'uploaded_pptx' ? 'Uploaded PPTX' : 'AI Generated'}
                    </Badge>
                    {selectedTemplate.template_type === 'uploaded_pptx' && selectedTemplate.detected_variables?.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {selectedTemplate.detected_variables.length} variables
                      </span>
                    )}
                    {selectedTemplate.template_type === 'ai_structured' && (
                      <span className="text-xs text-muted-foreground">
                        {selectedTemplate.slide_structure?.length} slides
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Lead</Label>
                <LeadPicker
                  orgId={orgId}
                  onChange={(id, lead) => {
                    setLeadId(id)
                    setLeadName(`${lead.first_name} ${lead.last_name}`)
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  AI uses the lead's company website and recent news to personalize content.
                </p>
              </div>

              <Button
                className="w-full"
                onClick={handleGenerate}
                disabled={isGenerating || !templateId || !leadId}
              >
                {isGenerating ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating (may take 1–2 minutes)…</>
                ) : (
                  <><Sparkles className="mr-2 h-4 w-4" />Generate Business Case</>
                )}
              </Button>

              {isGenerating && (
                <p className="text-xs text-center text-muted-foreground">
                  {isPptxTemplate
                    ? 'Researching company and filling {{variables}}…'
                    : 'Researching company, gathering signals, and generating slide content…'}
                </p>
              )}
            </CardContent>
          </Card>

          {/* AI-structured result */}
          {generatedCase && (
            <ReviewPanelAi bc={generatedCase} onDownload={handleDownloadAi} downloading={downloading} />
          )}

          {/* PPTX result */}
          {pptxResult && (
            <ReviewPanelPptx
              companyName={pptxResult.companyName}
              contactName={pptxResult.contactName}
              templateName={pptxResult.template.name}
              content={pptxResult.content}
              signals={pptxResult.signals}
              onDownload={handleDownloadPptx}
              downloading={downloading}
            />
          )}
        </div>
      )}
    </div>
  )
}
