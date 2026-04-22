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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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

// Shape of a row in the `presentations` table. We intentionally do NOT fetch `defaults`
// or `raw_research` in the list query — the jsonb can be 5-50KB per row and the card
// renders nothing from it. Detail views can fetch them on-demand.
interface PresentationRow {
  id: string
  org_id: string
  client_name: string
  slug: string
  kind: string
  created_at: string
  expires_at: string
  archived: boolean
  parent_id: string | null
}

const BC_BASE_URL =
  (import.meta.env.VITE_BC_BASE_URL as string | undefined) || 'https://chief.yuno.tools/bc'

// Chief WhatsApp number (e.g., "+14155551234"). When set, Nueva / Regenerar buttons deep-link
// to WhatsApp with a pre-filled message. When unset, they show a helper toast.
const CHIEF_WHATSAPP =
  (import.meta.env.VITE_CHIEF_WHATSAPP_NUMBER as string | undefined) || ''

function daysUntil(iso: string): number {
  const diff = new Date(iso).getTime() - Date.now()
  return Math.ceil(diff / (24 * 60 * 60 * 1000))
}

function statusBadge(p: PresentationRow) {
  if (p.archived) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Archivado
      </Badge>
    )
  }
  const days = daysUntil(p.expires_at)
  if (days <= 0) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Expirado
      </Badge>
    )
  }
  if (days <= 14) {
    return <Badge variant="secondary">Expira en {days}d</Badge>
  }
  return <Badge variant="default">Activo</Badge>
}

function openWhatsAppWithMessage(message: string) {
  if (CHIEF_WHATSAPP) {
    const phone = CHIEF_WHATSAPP.replace(/[^0-9]/g, '')
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    window.open(url, '_blank', 'noopener')
    return
  }
  // VITE_CHIEF_WHATSAPP_NUMBER not configured — show the message for the user to copy.
  toast.message('Abre WhatsApp con Chief y escribe:', { description: message })
}

export function Presentaciones() {
  const { org } = useOrg()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<PresentationRow | null>(null)

  const {
    data: presentations = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['presentations', org?.id, showArchived],
    queryFn: async (): Promise<PresentationRow[]> => {
      if (!org?.id) return []
      // Explicit column list — no `defaults` or `raw_research`.
      const query = supabase
        .from('presentations')
        .select('id, org_id, client_name, slug, kind, created_at, expires_at, archived, parent_id')
        .eq('org_id', org.id)
        .order('created_at', { ascending: false })

      if (!showArchived) query.eq('archived', false)

      const { data, error: err } = await query
      if (err) throw err
      return (data || []) as PresentationRow[]
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

  const regenerate = (p: PresentationRow) => {
    openWhatsAppWithMessage(
      `Regenera el business case de ${p.client_name} (slug actual: ${p.slug})`,
    )
  }

  const newPresentation = () => {
    openWhatsAppWithMessage(
      'Crea un business case para <Cliente>\n(Chief te pedirá TPV, pricing, approval rate, MDR, y demás datos.)',
    )
  }

  const filtered = search.trim()
    ? presentations.filter(
        (p) =>
          p.client_name.toLowerCase().includes(search.toLowerCase()) ||
          p.slug.toLowerCase().includes(search.toLowerCase()),
      )
    : presentations

  return (
    <PageTransition>
      <div className="container mx-auto max-w-6xl p-6 lg:p-8">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
              <h1 className="text-2xl font-semibold">Presentaciones</h1>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Business case decks generados para clientes específicos. Cada URL es pública,
              válida por 90 días, y se renderiza con los datos personalizados del cliente.
            </p>
          </div>
          <Button variant="outline" onClick={newPresentation}>
            Nueva presentación
          </Button>
        </div>

        {/* Filters */}
        <div className="mb-6 flex items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <label htmlFor="bc-search" className="sr-only">
              Buscar presentaciones
            </label>
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="bc-search"
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
            aria-pressed={showArchived}
          >
            <Archive className="mr-2 h-4 w-4" aria-hidden="true" />
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
            <FileText
              className="mx-auto mb-3 h-10 w-10 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="mb-1 text-sm font-medium">
              {search ? 'Sin resultados' : 'Aún no hay presentaciones'}
            </p>
            <p className="text-xs text-muted-foreground">
              {search
                ? 'Intenta con otro término de búsqueda.'
                : 'Crea tu primera dando clic en "Nueva presentación" — te abrimos WhatsApp con Chief.'}
            </p>
          </Card>
        )}

        {!isLoading && !error && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((p) => {
              const url = `${BC_BASE_URL}/${p.slug}`
              const isUnavailable = new Date(p.expires_at) <= new Date() || p.archived
              const createdAt = new Date(p.created_at).toLocaleDateString('es', {
                dateStyle: 'medium',
              })
              const expiresAt = new Date(p.expires_at).toLocaleDateString('es', {
                dateStyle: 'medium',
              })

              return (
                <Card key={p.id} className="p-4 transition-colors hover:bg-accent/30">
                  <div className="flex items-center gap-4">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"
                      aria-hidden="true"
                    >
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
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          Expira {expiresAt}
                        </span>
                      </div>
                    </div>
                    {!isUnavailable && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(url, '_blank', 'noopener')}
                        aria-label={`Abrir presentación de ${p.client_name} en nueva pestaña`}
                      >
                        <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                        Abrir
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Más acciones para ${p.client_name}`}
                        >
                          <MoreVertical className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => copyLink(p.slug)}>
                          <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                          Copiar link
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => regenerate(p)}>
                          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                          Regenerar
                        </DropdownMenuItem>
                        {!p.archived ? (
                          <DropdownMenuItem
                            onClick={() => setArchiveTarget(p)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Archive className="mr-2 h-4 w-4" aria-hidden="true" />
                            Archivar
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => unarchiveMutation.mutate(p.id)}>
                            <Archive className="mr-2 h-4 w-4" aria-hidden="true" />
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

        {/* Archive confirmation — archived decks return 410 at /bc/<slug>, so confirm first. */}
        <AlertDialog
          open={!!archiveTarget}
          onOpenChange={(open) => !open && setArchiveTarget(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Archivar esta presentación?</AlertDialogTitle>
              <AlertDialogDescription>
                El link público dejará de funcionar para {archiveTarget?.client_name}. Puedes
                restaurarla desde "Ver archivados".
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (archiveTarget) archiveMutation.mutate(archiveTarget.id)
                  setArchiveTarget(null)
                }}
              >
                Archivar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PageTransition>
  )
}
