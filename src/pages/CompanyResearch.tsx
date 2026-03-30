import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Plus, Search, Building2, FileText, Trash2,
  ChevronDown, ChevronRight, Globe, MapPin, Factory,
  User, Star, Clock, RotateCcw,
} from 'lucide-react'
import { useCompanyResearch, useAllResearchedCompanies } from '@/contexts/CompanyResearchContext'
import type { ResearchedCompanyWithProject } from '@/contexts/CompanyResearchContext'
import { CreateProjectDialog } from '@/components/company-research/CreateProjectDialog'
import { ResearchReportView } from '@/components/company-research/ResearchReportView'
import { toast } from 'sonner'
import { PageTransition } from '@/components/PageTransition'

export function CompanyResearch() {
  const navigate = useNavigate()
  const { projects, isLoadingProjects, createProject, deleteProject, resetStuckResearch } = useCompanyResearch()
  const { data: allCompanies = [], isLoading: isLoadingCompanies } = useAllResearchedCompanies()
  const [projectSearch, setProjectSearch] = useState('')
  const [companySearch, setCompanySearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
    (p.description || '').toLowerCase().includes(projectSearch.toLowerCase())
  )

  // Filter all companies by search — matches name, industry, project name, researcher name
  const filteredCompanies = useMemo(() => {
    if (!companySearch.trim()) return allCompanies
    const q = companySearch.toLowerCase()
    return allCompanies.filter(c =>
      c.company_name.toLowerCase().includes(q) ||
      (c.company_industry || '').toLowerCase().includes(q) ||
      (c.project_name || '').toLowerCase().includes(q) ||
      (c.researcher_name || '').toLowerCase().includes(q) ||
      (c.company_website || '').toLowerCase().includes(q)
    )
  }, [allCompanies, companySearch])

  const statusBadge = (status: ResearchedCompanyWithProject['status']) => {
    const styles: Record<typeof status, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      pending: { variant: 'secondary', label: 'Pending' },
      researching: { variant: 'outline', label: 'Researching...' },
      completed: { variant: 'default', label: 'Completed' },
      failed: { variant: 'destructive', label: 'Failed' },
    }
    const s = styles[status]
    return <Badge variant={s.variant}>{s.label}</Badge>
  }

  if (isLoadingProjects) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <PageTransition className="p-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight font-heading">Company Research</h1>
          <p className="text-muted-foreground">Exhaustive AI-powered research on target companies</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Research Project
        </Button>
      </div>

      {/* ═══ Global Company Search ═══ */}
      <Card className="mb-8">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Buscar Empresas Investigadas</CardTitle>
          <CardDescription>
            Find research done by anyone in your organization across all projects
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por empresa, industria, proyecto o investigador..."
              value={companySearch}
              onChange={(e) => setCompanySearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {isLoadingCompanies ? (
            <div className="flex justify-center py-4">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : allCompanies.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hay empresas investigadas aún. Crea un proyecto y comienza a investigar.
            </p>
          ) : filteredCompanies.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No companies match "{companySearch}"
            </p>
          ) : (
            <div className="max-h-[500px] overflow-y-auto space-y-1 pr-1">
              {filteredCompanies.map((company) => {
                const isExpanded = expandedId === company.id
                return (
                  <div key={company.id} className="rounded-lg border">
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : company.id)}
                    >
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      }

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{company.company_name}</span>
                          {statusBadge(company.status)}
                          {company.quality_score && (
                            <Badge variant="outline" className="gap-1 text-xs">
                              <Star className="h-3 w-3" />
                              {company.quality_score}/10
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            {company.project_name}
                          </span>
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {company.researcher_name}
                          </span>
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
                          {company.completed_at && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(company.completed_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Report */}
                    {isExpanded && company.status === 'completed' && (
                      <div className="border-t px-4 py-4 bg-muted/25">
                        <ResearchReportView company={company} />
                      </div>
                    )}
                    {isExpanded && company.status === 'pending' && (
                      <div className="border-t px-4 py-4 bg-muted/25 text-center">
                        <p className="text-sm text-muted-foreground">Research is pending — not yet started</p>
                      </div>
                    )}
                    {isExpanded && company.status === 'researching' && (
                      <div className="border-t px-4 py-4 bg-muted/25 text-center">
                        <div className="h-5 w-5 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-2" />
                        <p className="text-sm font-medium">Research in progress...</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Estimated time: ~{company.company_website ? '2' : '1'} minutes
                        </p>
                        {company.started_at && (
                          <p className="text-xs text-muted-foreground">
                            Started {Math.round((Date.now() - new Date(company.started_at).getTime()) / 1000)}s ago
                          </p>
                        )}
                        {company.started_at && Date.now() - new Date(company.started_at).getTime() > 300000 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2"
                            onClick={async (e) => {
                              e.stopPropagation()
                              await resetStuckResearch(company.id)
                              toast.success('Estado reiniciado a pendiente')
                            }}
                          >
                            <RotateCcw className="mr-2 h-3 w-3" />
                            Reset
                          </Button>
                        )}
                      </div>
                    )}
                    {isExpanded && company.status === 'failed' && (
                      <div className="border-t px-4 py-4 bg-muted/25">
                        <ResearchReportView company={company} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Result count */}
          {allCompanies.length > 0 && (
            <div className="mt-3 text-xs text-muted-foreground text-right">
              {companySearch
                ? `${filteredCompanies.length} of ${allCompanies.length} companies`
                : `${allCompanies.length} total researched companies`}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ Research Projects Section ═══ */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Research Projects</h2>
        {projects.length > 3 && (
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filtrar proyectos..."
              value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
          </div>
        )}
      </div>

      {/* Empty State */}
      {filteredProjects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-medium">
              {projectSearch ? 'No hay proyectos coincidentes' : 'No hay proyectos de investigación aún'}
            </h3>
            <p className="mb-4 text-sm text-muted-foreground text-center max-w-md">
              {projectSearch
                ? 'Try adjusting your search terms'
                : 'Create a research project with a custom prompt. Add companies to research them exhaustively with AI.'}
            </p>
            {!projectSearch && (
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Research Project
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        /* Project Grid */
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => (
            <Card
              key={project.id}
              className="cursor-pointer transition-shadow hover:shadow-md group"
              onClick={() => navigate(`/company-research/${project.id}`)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg line-clamp-1">{project.name}</CardTitle>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (confirm('¿Eliminar este proyecto de investigación y todos sus datos?')) {
                        deleteProject(project.id).then(() => toast.success('Proyecto eliminado'))
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
                {project.description && (
                  <CardDescription className="line-clamp-2">{project.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <FileText className="h-3.5 w-3.5" />
                  <span className="line-clamp-1">{project.research_prompt.substring(0, 80)}...</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {project.company_count || 0} companies
                  </Badge>
                  {(project.completed_count || 0) > 0 && (
                    <Badge variant="default">
                      {project.completed_count} completed
                    </Badge>
                  )}
                  {project.auto_trigger_enabled && (
                    <Badge variant="outline" className="text-xs">Auto</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <CreateProjectDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onSubmit={async (data) => {
          await createProject(data)
          toast.success('Proyecto de investigación creado')
        }}
      />
    </PageTransition>
  )
}
