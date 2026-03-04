import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft, Plus, Search, Play, Loader2, Trash2,
  ChevronDown, ChevronRight, Globe, MapPin, Factory,
  PlayCircle, Settings2, RotateCcw,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useCompanyResearch, useResearchProjectCompanies, type ResearchProjectCompany } from '@/contexts/CompanyResearchContext'
import { ResearchReportView } from '@/components/company-research/ResearchReportView'
import { CreateProjectDialog } from '@/components/company-research/CreateProjectDialog'
import { toast } from 'sonner'

export function ResearchProjectDetail() {
  const { id: projectId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { projects, updateProject, addCompanyToProject, removeCompanyFromProject, runResearch, runAllPending, resetStuckResearch } = useCompanyResearch()
  const { data: companies = [], isLoading: isLoadingCompanies } = useResearchProjectCompanies(projectId)

  const project = projects.find(p => p.id === projectId)

  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isRunningAll, setIsRunningAll] = useState(false)
  const [showAddCompany, setShowAddCompany] = useState(false)
  const [showEditProject, setShowEditProject] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)

  // Add company form state
  const [newCompanyName, setNewCompanyName] = useState('')
  const [newCompanyWebsite, setNewCompanyWebsite] = useState('')
  const [newCompanyIndustry, setNewCompanyIndustry] = useState('')

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-medium mb-2">Project not found</h2>
          <Button variant="outline" onClick={() => navigate('/company-research')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Projects
          </Button>
        </div>
      </div>
    )
  }

  const filtered = companies.filter(c =>
    c.company_name.toLowerCase().includes(search.toLowerCase())
  )

  const pendingCount = companies.filter(c => c.status === 'pending').length

  const handleRunResearch = async (companyResearchId: string) => {
    const company = companies.find(c => c.id === companyResearchId)
    const name = company?.company_name || 'Company'
    const mins = company?.company_website ? 2 : 1
    try {
      await runResearch(companyResearchId)
      toast.success(`Research started for ${name}. Estimated time: ~${mins} min`, { duration: 8000 })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start research')
    }
  }

  const handleRunAll = async () => {
    setIsRunningAll(true)
    try {
      await runAllPending(projectId!)
      toast.success(`${pendingCount} research tasks started. They will complete in the background.`, { duration: 8000 })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start batch research')
    } finally {
      setIsRunningAll(false)
    }
  }

  const handleAddCompany = async () => {
    if (!newCompanyName.trim()) return
    try {
      await addCompanyToProject(projectId!, {
        company_name: newCompanyName.trim(),
        company_website: newCompanyWebsite.trim() || undefined,
        company_industry: newCompanyIndustry.trim() || undefined,
      })
      toast.success(`${newCompanyName} added`)
      setShowAddCompany(false)
      setNewCompanyName('')
      setNewCompanyWebsite('')
      setNewCompanyIndustry('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add company')
    }
  }

  const statusBadge = (status: ResearchProjectCompany['status']) => {
    const styles: Record<typeof status, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      pending: { variant: 'secondary', label: 'Pending' },
      researching: { variant: 'outline', label: 'Researching...' },
      completed: { variant: 'default', label: 'Completed' },
      failed: { variant: 'destructive', label: 'Failed' },
    }
    const s = styles[status]
    return <Badge variant={s.variant}>{s.label}</Badge>
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate('/company-research')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Projects
        </Button>

        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h1 className="text-[28px] font-bold tracking-tight font-heading">{project.name}</h1>
            {project.description && (
              <p className="text-muted-foreground mt-1">{project.description}</p>
            )}
            <button
              className="text-sm text-primary hover:underline mt-1 text-left"
              onClick={() => setShowPrompt(!showPrompt)}
            >
              {showPrompt ? 'Hide prompt' : 'Show research prompt'}
            </button>
            {showPrompt && (
              <Card className="mt-2">
                <CardContent className="pt-4">
                  <p className="text-sm whitespace-pre-wrap">{project.research_prompt}</p>
                </CardContent>
              </Card>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowEditProject(true)}>
              <Settings2 className="mr-2 h-4 w-4" />
              Edit
            </Button>
            {pendingCount > 0 && (
              <Button size="sm" variant="default" onClick={handleRunAll} disabled={isRunningAll}>
                {isRunningAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
                Run All Pending ({pendingCount})
              </Button>
            )}
            <Button size="sm" onClick={() => setShowAddCompany(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Company
            </Button>
          </div>
        </div>
      </div>

      {/* Search */}
      {companies.length > 0 && (
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search companies..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="text-sm text-muted-foreground">
            {companies.length} companies
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoadingCompanies && (
        <div className="flex justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )}

      {/* Empty State */}
      {!isLoadingCompanies && filtered.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Search className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-medium">
              {search ? 'No matching companies' : 'No companies added yet'}
            </h3>
            <p className="mb-4 text-sm text-muted-foreground text-center max-w-md">
              {search
                ? 'Try adjusting your search'
                : 'Add companies to this project to start researching them with AI.'}
            </p>
            {!search && (
              <Button onClick={() => setShowAddCompany(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Company
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Company List */}
      {!isLoadingCompanies && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((company) => {
            const isExpanded = expandedId === company.id
            const isRunning = company.status === 'researching'

            return (
              <Card key={company.id} className="overflow-hidden">
                <div
                  className="flex items-center gap-4 p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : company.id)}
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{company.company_name}</span>
                      {statusBadge(company.status)}
                      {company.quality_score && (
                        <Badge variant="outline" className="text-xs">
                          Score: {company.quality_score}/10
                        </Badge>
                      )}
                      {company.source === 'auto_trigger' && (
                        <Badge variant="outline" className="text-xs">Auto</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {company.company_website && (
                        <span className="flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          {company.company_website.replace(/^https?:\/\//, '')}
                        </span>
                      )}
                      {company.company_industry && (
                        <span className="flex items-center gap-1">
                          <Factory className="h-3 w-3" />
                          {company.company_industry}
                        </span>
                      )}
                      {company.company_location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {company.company_location}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {(company.status === 'pending' || company.status === 'failed') && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRunResearch(company.id)}
                        disabled={isRunning}
                      >
                        {isRunning ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Play className="mr-1 h-3 w-3" />}
                        {company.status === 'failed' ? 'Retry' : 'Research'}
                      </Button>
                    )}
                    {company.status === 'researching' && (
                      <Badge variant="outline" className="gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        ~{company.company_website ? '2' : '1'} min
                      </Badge>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => {
                        if (confirm(`Remove ${company.company_name} from this project?`)) {
                          removeCompanyFromProject(company.id)
                          toast.success('Company removed')
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>

                {/* Expanded Research Report */}
                {isExpanded && (company.status === 'completed' || company.status === 'failed') && (
                  <div className="border-t px-4 py-4 bg-muted/25">
                    <ResearchReportView
                      company={company}
                      onRerun={() => handleRunResearch(company.id)}
                      isRerunning={isRunning}
                    />
                  </div>
                )}

                {isExpanded && company.status === 'pending' && (
                  <div className="border-t px-4 py-6 bg-muted/25 text-center">
                    <p className="text-sm text-muted-foreground mb-2">Research has not been run yet</p>
                    <Button size="sm" onClick={() => handleRunResearch(company.id)} disabled={isRunning}>
                      {isRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                      Run Research
                    </Button>
                  </div>
                )}

                {isExpanded && company.status === 'researching' && (
                  <div className="border-t px-4 py-6 bg-muted/25 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary mb-2" />
                    <p className="text-sm font-medium mb-1">Research in progress...</p>
                    <p className="text-xs text-muted-foreground mb-1">
                      Estimated time: ~{company.company_website ? '2' : '1'} minutes
                    </p>
                    {company.started_at && (
                      <p className="text-xs text-muted-foreground">
                        Started {Math.round((Date.now() - new Date(company.started_at).getTime()) / 1000)}s ago
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      Searching the web, scraping company pages, and generating an exhaustive report...
                    </p>
                    {company.started_at && Date.now() - new Date(company.started_at).getTime() > 300000 && (
                      <div className="mt-3">
                        <p className="text-xs text-muted-foreground mb-2">This research seems to be taking longer than expected.</p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            await resetStuckResearch(company.id)
                            toast.success('Status reset to pending')
                          }}
                        >
                          <RotateCcw className="mr-2 h-4 w-4" />
                          Reset to Pending
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Add Company Dialog */}
      <Dialog open={showAddCompany} onOpenChange={setShowAddCompany}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Company</DialogTitle>
            <DialogDescription>
              Add a company to research. At minimum, provide the company name.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="companyName">Company Name *</Label>
              <Input
                id="companyName"
                placeholder="e.g., Stripe"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="companyWebsite">Website</Label>
              <Input
                id="companyWebsite"
                placeholder="e.g., https://stripe.com"
                value={newCompanyWebsite}
                onChange={(e) => setNewCompanyWebsite(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="companyIndustry">Industry</Label>
              <Input
                id="companyIndustry"
                placeholder="e.g., Financial Technology"
                value={newCompanyIndustry}
                onChange={(e) => setNewCompanyIndustry(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddCompany(false)}>Cancel</Button>
            <Button onClick={handleAddCompany} disabled={!newCompanyName.trim()}>
              Add Company
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Project Dialog */}
      <CreateProjectDialog
        open={showEditProject}
        onOpenChange={setShowEditProject}
        editProject={project}
        onSubmit={async (data) => {
          await updateProject(projectId!, data)
          toast.success('Project updated')
        }}
      />
    </div>
  )
}
