import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText,
  MoreVertical,
  Copy,
  Archive,
  ExternalLink,
  RefreshCw,
  Search,
  Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PageTransition } from '@/components/PageTransition'
import { supabase } from '@/integrations/supabase/client'
import { useOrg } from '@/contexts/OrgContext'
import { toast } from 'sonner'

// Shape of a row in the `presentations` table
interface Presentation {
  id: string
  org_id: string
  client_name: string
  slug: string
  kind: string
  defaults: Record<string, unknown>
  created_at: string
  expires_at: string
  archived: boolean
  parent_id: string | null
}

const BC_BASE_URL = 'https://chief.yuno.tools/bc'

function daysUntil(iso: string): number {
  const diff = new Date(iso).getTime() - Date.now()
  return Math.ceil(diff / (24 * 60 * 60 * 1000))
}

function statusBadge(p: Presentation) {
  if (p.archived) {
    return <Badge variant="outline" className="text-muted-foreground">Archivado</Badge>
  }
  const days = daysUntil(p.expires_at)
  if (days <= 0) {
    return <Badge variant="outline" className="text-muted-foreground">Expirado</Badge>
  }
  if (days <= 14) {
    return <Badge variant="secondary">Expira en {days}d</Badge>
  }
  return <Badge variant="default">Activo</Badge>
}

export function Presentaciones() {
  const { org } = useOrg()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const { data: presentations = [], isLoading, error } = useQuery({
    queryKey: ['presentations', org?.id, showArchived],
    queryFn: async (): Promise<Presentation[]> => {
      if (!org?.id) return []
      const query = supabase
        .from('presentations')
        .select('id, org_id, client_name, slug, kind, defaults, created_at, expires_at, archived, parent_id')
        .eq('org_id', org.id)
        .order('created_at', { ascending: false })

      if (!showArchived) query.eq('archived', false)

      const { data, error: err } = await query
      if (err) throw err
      return data || []
    },
    enabled: !!org?.id,
  })

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error: err } = await supabase
        .from('presentations')
        .update({ archived: true })
        .eq('id', id)
      if (err) throw err
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['presentations'] })
      toast.success('Presentación archivada')
    },
    onError: (e: Error) => toast.error(`No se pudo archivar: ${e.message}`),
  })

  const unarchiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error: err } = await supabase
        .from('presentations')
        .update({ archived: false })
        .eq('id', id)
      if (err) throw err
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['presentations'] })
      toast.success('Presentación restaurada')
    },
    onError: (e: Error) => toast.error(`No se pudo restaurar: ${e.message}`),
  })

  const copyLink = (slug: string) => {
    const url = `${BC_BASE_URL}/${slug}`
    navigator.clipboard.writeText(url)
    toast.success('Link copiado', { description: url })
  }

  const regenerate = (p: Presentation) => {
    toast.info('Regenerar próximamente', {
      description: `Por ahora invoca "/yuno-bc ${p.client_name}" en Claude Code o pídeselo a Chief en WhatsApp.`,
    })
  }

  const filtered = search.trim()
    ? presentations.filter((p) =>
        p.client_name.toLowerCase().includes(search.toLowerCase()) ||
        p.slug.toLowerCase().includes(search.toLowerCase())
      )
    : presentations

  return (
    <PageTransition>
      <div className="container mx-auto max-w-6xl p-6 lg:p-8">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-semibold">Presentaciones</h1>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Business case decks generados para clientes específicos. Cada URL es pública, válida por 90 días, y se renderiza con los datos personalizados del cliente.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() =>
              toast.info('Crea desde WhatsApp o Claude Code', {
                description: 'Dile a Chief "crea BC para <cliente>" o usa /yuno-bc desde la CLI.',
              })
            }
          >
            Nueva presentación
          </Button>
        </div>

        {/* Filters */}
        <div className="mb-6 flex items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente o slug..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant={showArchived ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setShowArchived(!showArchived)}
          >
            <Archive className="mr-2 h-4 w-4" />
            {showArchived ? 'Ocultando archivados' : 'Ver archivados'}
          </Button>
        </div>

        {/* Body */}
        {isLoading && (
          <div className="py-20 text-center text-sm text-muted-foreground">Cargando...</div>
        )}
        {error && (
          <Card className="border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
            Error cargando presentaciones: {(error as Error).message}
          </Card>
        )}
        {!isLoading && !error && filtered.length === 0 && (
          <Card className="border-dashed p-12 text-center">
            <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="mb-1 text-sm font-medium">
              {search ? 'Sin resultados' : 'Aún no hay presentaciones'}
            </p>
            <p className="text-xs text-muted-foreground">
              {search
                ? 'Intenta con otro término de búsqueda.'
                : 'Crea tu primera desde WhatsApp ("crea BC para Rappi") o desde Claude Code (/yuno-bc).'}
            </p>
          </Card>
        )}

        {!isLoading && !error && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((p) => {
              const url = `${BC_BASE_URL}/${p.slug}`
              const isExpired = new Date(p.expires_at) <= new Date() || p.archived
              const createdAt = new Date(p.created_at).toLocaleDateString('es', { dateStyle: 'medium' })
              const expiresAt = new Date(p.expires_at).toLocaleDateString('es', { dateStyle: 'medium' })

              return (
                <Card key={p.id} className="p-4 transition-colors hover:bg-accent/30">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="truncate font-medium">{p.client_name}</span>
                        {statusBadge(p)}
                        {p.parent_id && (
                          <Badge variant="outline" className="text-xs">
                            Regenerado
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="font-mono">{p.slug}</span>
                        <span>·</span>
                        <span>Creado {createdAt}</span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Expira {expiresAt}
                        </span>
                      </div>
                    </div>
                    {!isExpired && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(url, '_blank', 'noopener')}
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Abrir
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => copyLink(p.slug)}>
                          <Copy className="mr-2 h-4 w-4" />
                          Copiar link
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => regenerate(p)}>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Regenerar
                        </DropdownMenuItem>
                        {!p.archived ? (
                          <DropdownMenuItem
                            onClick={() => archiveMutation.mutate(p.id)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Archive className="mr-2 h-4 w-4" />
                            Archivar
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => unarchiveMutation.mutate(p.id)}>
                            <Archive className="mr-2 h-4 w-4" />
                            Restaurar
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </PageTransition>
  )
}
