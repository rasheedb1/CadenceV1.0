import { useState, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Search, Loader2, Linkedin, Mail, UserPlus, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { callEdgeFunction, EdgeFunctionError } from '@/lib/edge-functions'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { SendLinkedInDialog } from '@/components/lead-search/SendLinkedInDialog'
import { SendEmailDialog } from '@/components/lead-search/SendEmailDialog'

interface SearchResult {
  firstName: string
  lastName: string
  title: string
  company: string
  linkedinUrl: string
  linkedinProviderId: string
  headline: string
  location: string
}

interface SearchFilters {
  keywords: string
  companyNames: string
  titleKeywords: string
  seniority: string[]
}

const SENIORITY_OPTIONS = [
  { value: 'owner', label: 'Owner' },
  { value: 'partner', label: 'Partner' },
  { value: 'cxo', label: 'CXO' },
  { value: 'vp', label: 'VP' },
  { value: 'director', label: 'Director' },
  { value: 'manager', label: 'Manager' },
  { value: 'senior', label: 'Senior' },
  { value: 'entry', label: 'Entry' },
]

export function LeadSearch() {
  const { session, user } = useAuth()
  const { orgId } = useOrg()

  // Search state
  const [filters, setFilters] = useState<SearchFilters>({
    keywords: '',
    companyNames: '',
    titleKeywords: '',
    seniority: [],
  })
  const [results, setResults] = useState<SearchResult[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Dialog state
  const [linkedInTarget, setLinkedInTarget] = useState<SearchResult | null>(null)
  const [emailTarget, setEmailTarget] = useState<SearchResult | null>(null)
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null)

  // Search mutation
  const searchMutation = useMutation({
    mutationFn: async () => {
      if (!session?.access_token) throw new EdgeFunctionError('Not authenticated')

      const body: Record<string, unknown> = {}
      if (filters.keywords.trim()) body.keywords = filters.keywords.trim()
      if (filters.companyNames.trim()) {
        body.companyNames = filters.companyNames.split(',').map((s) => s.trim()).filter(Boolean)
      }
      if (filters.titleKeywords.trim()) {
        body.titleKeywords = filters.titleKeywords.split(',').map((s) => s.trim()).filter(Boolean)
      }
      if (filters.seniority.length > 0) body.seniority = filters.seniority
      body.limit = 25

      return callEdgeFunction<{
        success: boolean
        results: SearchResult[]
        cursor: string | null
        hasMore: boolean
        total: number
      }>('search-sales-navigator', body, session.access_token)
    },
    onSuccess: (data) => {
      setResults(data.results || [])
      setHasSearched(true)
      if (data.results.length === 0) {
        toast.info('No se encontraron resultados. Intenta con otros filtros.')
      } else {
        toast.success(`${data.results.length} resultados encontrados`)
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Error al buscar')
    },
  })

  // Save as lead mutation
  const saveLeadMutation = useMutation({
    mutationFn: async (prospect: SearchResult) => {
      if (!user?.id || !orgId) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('leads')
        .insert({
          first_name: prospect.firstName,
          last_name: prospect.lastName,
          title: prospect.title,
          company: prospect.company,
          linkedin_url: prospect.linkedinUrl,
          linkedin_provider_id: prospect.linkedinProviderId,
          status: 'active',
          user_id: user.id,
          org_id: orgId,
        })
        .select('id')
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Lead guardado')
      setSavingLeadId(null)
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Error al guardar lead')
      setSavingLeadId(null)
    },
  })

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!filters.keywords.trim() && !filters.companyNames.trim() && !filters.titleKeywords.trim()) {
        toast.error('Ingresa al menos un filtro de busqueda')
        return
      }
      searchMutation.mutate()
    },
    [filters, searchMutation]
  )

  const toggleSeniority = (value: string) => {
    setFilters((prev) => ({
      ...prev,
      seniority: prev.seniority.includes(value)
        ? prev.seniority.filter((s) => s !== value)
        : [...prev.seniority, value],
    }))
  }

  const handleSaveLead = (prospect: SearchResult) => {
    const key = prospect.linkedinProviderId || `${prospect.firstName}-${prospect.lastName}`
    setSavingLeadId(key)
    saveLeadMutation.mutate(prospect)
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Lead Search</h1>
        <p className="text-muted-foreground">
          Busca personas en LinkedIn y enviales mensajes o emails directamente.
        </p>
      </div>

      {/* Search Form */}
      <Card className="p-4">
        <form onSubmit={handleSearch} className="space-y-4">
          {/* Main search row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                placeholder="Nombre, cargo, o palabras clave..."
                value={filters.keywords}
                onChange={(e) => setFilters((f) => ({ ...f, keywords: e.target.value }))}
              />
            </div>
            <div className="flex-1">
              <Input
                placeholder="Empresa (ej: Google, Meta)"
                value={filters.companyNames}
                onChange={(e) => setFilters((f) => ({ ...f, companyNames: e.target.value }))}
              />
            </div>
            <Button type="submit" disabled={searchMutation.isPending}>
              {searchMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Buscar
            </Button>
          </div>

          {/* Advanced toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Filtros avanzados
          </button>

          {/* Advanced filters */}
          {showAdvanced && (
            <div className="space-y-3 pt-2 border-t">
              <div>
                <Label className="text-sm">Titulo / Cargo (separados por coma)</Label>
                <Input
                  placeholder="CEO, CTO, VP Sales, Director Marketing"
                  value={filters.titleKeywords}
                  onChange={(e) => setFilters((f) => ({ ...f, titleKeywords: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-sm">Nivel de seniority</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {SENIORITY_OPTIONS.map((opt) => (
                    <Badge
                      key={opt.value}
                      variant={filters.seniority.includes(opt.value) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleSeniority(opt.value)}
                    >
                      {opt.label}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </form>
      </Card>

      {/* Results */}
      {searchMutation.isPending && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Buscando en Sales Navigator...</span>
        </div>
      )}

      {hasSearched && !searchMutation.isPending && results.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No se encontraron resultados. Intenta con otros filtros.
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{results.length} resultados</p>
          <div className="grid gap-3">
            {results.map((prospect, idx) => {
              const key = prospect.linkedinProviderId || `${prospect.firstName}-${prospect.lastName}-${idx}`
              return (
                <Card key={key} className="p-4 flex items-center justify-between gap-4">
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">
                        {prospect.firstName} {prospect.lastName}
                      </span>
                      {prospect.linkedinUrl && (
                        <a
                          href={prospect.linkedinUrl as string}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {prospect.title}
                      {prospect.title && prospect.company && ' @ '}
                      {prospect.company}
                    </p>
                    {prospect.location && (
                      <p className="text-xs text-muted-foreground/70">{prospect.location as string}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLinkedInTarget(prospect)}
                    >
                      <Linkedin className="h-4 w-4 mr-1" />
                      LinkedIn
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEmailTarget(prospect)}
                    >
                      <Mail className="h-4 w-4 mr-1" />
                      Email
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSaveLead(prospect)}
                      disabled={savingLeadId === key || saveLeadMutation.isPending}
                    >
                      {savingLeadId === key && saveLeadMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <UserPlus className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Dialogs */}
      <SendLinkedInDialog
        open={!!linkedInTarget}
        onOpenChange={(open) => !open && setLinkedInTarget(null)}
        prospect={linkedInTarget}
      />
      <SendEmailDialog
        open={!!emailTarget}
        onOpenChange={(open) => !open && setEmailTarget(null)}
        prospect={emailTarget}
      />
    </div>
  )
}
