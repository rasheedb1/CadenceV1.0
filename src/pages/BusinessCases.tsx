import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Briefcase,
  Plus,
  Layers,
  MoreVertical,
  Trash2,
  Download,
  Sparkles,
  FileText,
} from 'lucide-react'
import { useBusinessCases } from '@/contexts/BusinessCasesContext'
import { toast } from 'sonner'
import { downloadBusinessCasePptx } from '@/lib/pptx-generator'
import type { BusinessCase } from '@/types/business-cases'

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(status: BusinessCase['status']) {
  const map = {
    draft:     { label: 'Draft',     variant: 'secondary' },
    generated: { label: 'Generated', variant: 'default' },
    edited:    { label: 'Edited',    variant: 'default' },
    sent:      { label: 'Sent',      variant: 'outline' },
  } as const
  const cfg = map[status] ?? { label: status, variant: 'secondary' }
  return <Badge variant={cfg.variant as 'default' | 'secondary' | 'outline'}>{cfg.label}</Badge>
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BusinessCases() {
  const navigate = useNavigate()
  const { cases, templates, isLoadingCases, isLoadingTemplates, deleteCase, deleteTemplate } = useBusinessCases()
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  if (isLoadingCases || isLoadingTemplates) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  // ── Download PPTX ──
  const handleDownload = async (bc: BusinessCase) => {
    if (!bc.template) {
      toast.error('Template data not available')
      return
    }
    setDownloadingId(bc.id)
    try {
      const content = { ...(bc.generated_content ?? {}), ...(bc.edited_content ?? {}) }
      await downloadBusinessCasePptx(bc, bc.template, content)
      toast.success('PPTX downloaded')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate PPTX')
    } finally {
      setDownloadingId(null)
    }
  }

  // ── Delete case ──
  const handleDeleteCase = async (id: string, name: string) => {
    if (!confirm(`Delete business case for "${name}"? This cannot be undone.`)) return
    try {
      await deleteCase(id)
      toast.success('Business case deleted')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  // ── Delete template ──
  const handleDeleteTemplate = async (id: string, name: string) => {
    if (!confirm(`Delete template "${name}"? All generated cases will remain but can no longer be traced back to this template.`)) return
    try {
      await deleteTemplate(id)
      toast.success('Template deleted')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight font-heading">Business Cases</h1>
          <p className="text-muted-foreground">
            AI-generated business cases personalized for each prospect
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/business-cases/new')}>
            <Plus className="mr-2 h-4 w-4" />
            New Template
          </Button>
          <Button onClick={() => navigate('/business-cases/generate')} disabled={templates.length === 0}>
            <Sparkles className="mr-2 h-4 w-4" />
            Generate Case
          </Button>
        </div>
      </div>

      <Tabs defaultValue="cases">
        <TabsList className="mb-6">
          <TabsTrigger value="cases">
            Cases Library
            {cases.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">{cases.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="templates">
            Templates
            {templates.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">{templates.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Cases Library ── */}
        <TabsContent value="cases">
          {cases.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-medium">No business cases yet</h3>
                <p className="mb-6 text-sm text-muted-foreground text-center max-w-md">
                  {templates.length === 0
                    ? 'Start by creating a template, then generate personalized cases for your leads.'
                    : 'Select a template and a lead to generate your first personalized business case.'}
                </p>
                {templates.length === 0 ? (
                  <Button onClick={() => navigate('/business-cases/new')}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create First Template
                  </Button>
                ) : (
                  <Button onClick={() => navigate('/business-cases/generate')}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Business Case
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {cases.map((bc) => (
                <Card key={bc.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-3 min-w-0">
                        <Briefcase className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-semibold line-clamp-1">{bc.company_name}</p>
                          {bc.contact_name && (
                            <p className="text-sm text-muted-foreground line-clamp-1">{bc.contact_name}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {bc.template?.name ?? 'Unknown template'}
                          </p>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleDownload(bc)}
                            disabled={downloadingId === bc.id}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            {downloadingId === bc.id ? 'Generating...' : 'Download PPTX'}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDeleteCase(bc.id, bc.company_name)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      {statusBadge(bc.status)}
                      <span className="text-xs text-muted-foreground">
                        {new Date(bc.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Signals used */}
                    {bc.signals_used && bc.signals_used.length > 0 && (
                      <div className="mt-3 border-t pt-3">
                        <p className="text-xs text-muted-foreground font-medium mb-1">
                          Research signals used
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {bc.signals_used.slice(0, 3).map((s, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {s.name}
                            </Badge>
                          ))}
                          {bc.signals_used.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{bc.signals_used.length - 3} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 w-full"
                      onClick={() => handleDownload(bc)}
                      disabled={downloadingId === bc.id}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {downloadingId === bc.id ? 'Generating PPTX...' : 'Download PPTX'}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Templates ── */}
        <TabsContent value="templates">
          {templates.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Layers className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-medium">No templates yet</h3>
                <p className="mb-6 text-sm text-muted-foreground text-center max-w-md">
                  Create a template by describing the business case structure you need. The AI will generate the slide layout.
                </p>
                <Button onClick={() => navigate('/business-cases/new')}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create First Template
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {templates.map((t) => (
                <Card
                  key={t.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => navigate(`/business-cases/templates/${t.id}`)}
                >
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold line-clamp-1">{t.name}</p>
                        {t.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{t.description}</p>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          asChild
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/business-cases/generate?templateId=${t.id}`)
                            }}
                          >
                            <Sparkles className="mr-2 h-4 w-4" />
                            Generate Case
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteTemplate(t.id, t.name)
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {t.slide_structure.length} slides
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {t.source === 'ai_generated' ? 'AI Generated' : 'Uploaded'}
                      </Badge>
                      {!t.is_active && <Badge variant="destructive" className="text-xs">Inactive</Badge>}
                    </div>

                    <p className="text-xs text-muted-foreground mt-2">
                      Created {new Date(t.created_at).toLocaleDateString()}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
