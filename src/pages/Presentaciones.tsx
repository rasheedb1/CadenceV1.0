import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText,
  MoreVertical,
  Copy,
  Archive,
  ExternalLink,
  RefreshCw,
  Pencil,
  Search,
  Clock,
  BarChart3,
  Eye,
  ArrowLeft,
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageTransition } from '@/components/PageTransition'
import { PresentationStats } from '@/components/PresentationStats'
import { NewBusinessCaseForm, type EditTarget } from '@/components/NewBusinessCaseForm'
import { NewSdrBcForm } from '@/components/NewSdrBcForm'
import { NewSsDeckForm } from '@/components/NewSsDeckForm'
import { NewWorkshopBcForm, type WorkshopEditTarget } from '@/components/NewWorkshopBcForm'
import { VendorProfileDialog, useVendorProfile } from '@/components/VendorProfileDialog'
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

// BDM BC (BD managers, kind='yuno_bc' in DB) is hosted at /bc/<slug>. SDR BC (cold outreach, SimilarWeb-driven)
// at /sdr-bc/<slug>. SS Deck (Stripe Sessions style visual deck) at /m/<slug>.
// All three render from chief.yuno.tools but use different deck templates and tables.
const YUNO_BC_BASE_URL =
  (import.meta.env.VITE_BC_BASE_URL as string | undefined) || 'https://chief.yuno.tools/bc'
const SDR_BC_BASE_URL =
  (import.meta.env.VITE_SDR_BC_BASE_URL as string | undefined) || 'https://chief.yuno.tools/sdr-bc'
const SS_DECK_BASE_URL =
  (import.meta.env.VITE_SS_DECK_BASE_URL as string | undefined) || 'https://chief.yuno.tools/m'
const WORKSHOP_BC_BASE_URL =
  (import.meta.env.VITE_WORKSHOP_BC_BASE_URL as string | undefined) || 'https://chief.yuno.tools/workshop'

type BcKind = 'yuno_bc' | 'sdr_bc' | 'ss_deck' | 'workshop_bc' | 'other'

// Kinds that get their own dedicated tab (with custom forms / render).
// Anything else in `presentations` falls into the 'other' tab automatically.
const MAIN_TAB_KINDS = ['yuno_bc', 'sdr_bc'] as const

// Sub-kinds que viven dentro del tab 'other'. Cuando se generan nuevas
// presentaciones de un kind no listado en MAIN_TAB_KINDS, caen acá.
// Para etiquetar/badgear cada una bajo el tab Other, las describimos abajo.
const OTHER_SUB_KIND_META: Record<string, { label: string; badgeClass: string; baseUrl: string }> = {
  yuno_one_click: {
    label: 'One-Click + Conciliación',
    badgeClass: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/30',
    baseUrl: 'https://chief.yuno.tools/one-click',
  },
}

function baseUrlForKind(kind: string): string {
  if (kind === 'sdr_bc') return SDR_BC_BASE_URL
  if (kind === 'ss_deck') return SS_DECK_BASE_URL
  if (kind === 'workshop_bc') return WORKSHOP_BC_BASE_URL
  if (OTHER_SUB_KIND_META[kind]) return OTHER_SUB_KIND_META[kind].baseUrl
  return YUNO_BC_BASE_URL
}

// Workshop BC row shape — separate table (workshops_bc) like merchants_ss for
// SS Deck. Has its own inputs jsonb (editable) + business_case jsonb (recomputed
// on edit).
interface WorkshopBcRow {
  id: string
  org_id: string
  client_name: string
  slug: string
  country: string | null
  language: 'es' | 'en'
  workshop_date: string | null
  inputs: Record<string, unknown>
  business_case: Record<string, unknown> & { total_annual_value_usd?: number }
  created_at: string
  updated_at?: string | null
}

// SS Deck row shape — separate table (merchants_ss) so the shape differs from
// `presentations`. No expires_at, no archived flag (v1 doesn't soft-delete),
// no client_name (uses `name`), but adds content_source breadcrumb.
interface SsDeckRow {
  id: string
  org_id: string
  name: string
  slug: string
  mode: string
  content_source: 'research' | 'regional_fallback' | 'template'
  psps: Array<{ name: string; role?: string | null }>
  created_at: string
}

// Chief WhatsApp number (e.g., "+14155551234"). When set, Nueva / Regenerar buttons deep-link
// to WhatsApp with a pre-filled message. When unset, they show a helper toast.
const CHIEF_WHATSAPP =
  (import.meta.env.VITE_CHIEF_WHATSAPP_NUMBER as string | undefined) || ''

const KIND_META: Record<BcKind, { label: string; description: string; badgeClass: string }> = {
  yuno_bc: {
    label: 'BDM BC',
    description: 'Built for BD managers. Phase A/B/C inputs: TPV by country, MDR, ticket, pricing model.',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30',
  },
  sdr_bc: {
    label: 'SDR BC',
    description: 'Built for cold outreach. Auto-resolved from SimilarWeb traffic + per-country legal entities + industry take rate.',
    badgeClass: 'bg-blue-500/10 text-blue-700 border-blue-500/30',
  },
  ss_deck: {
    label: 'SS Deck',
    description: '21-slide visual deck (Stripe Sessions style) — cover globe, diagnostic topology, product suite, leadership grid. Researches top-4 acquirers with regional fallback.',
    badgeClass: 'bg-violet-500/10 text-violet-700 border-violet-500/30',
  },
  workshop_bc: {
    label: 'Workshop BC',
    description: '24-slide workshop deck. AE-controlled inputs (tx, ticket, MDR, antifraud, approval) → deterministic 4-lever business case. Editable in place — same URL, recomputed totals.',
    badgeClass: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
  },
  other: {
    label: 'Other',
    description: 'Decks especiales: One-Click + Conciliación, Yape, y cualquier deck nuevo que no cae en las categorías principales. Por default todas las skills nuevas aterrizan acá.',
    badgeClass: 'bg-slate-500/10 text-slate-700 border-slate-500/30',
  },
}

function daysUntil(iso: string): number {
  const diff = new Date(iso).getTime() - Date.now()
  return Math.ceil(diff / (24 * 60 * 60 * 1000))
}

function statusBadge(p: PresentationRow) {
  if (p.archived) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Archived
      </Badge>
    )
  }
  const days = daysUntil(p.expires_at)
  if (days <= 0) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Expired
      </Badge>
    )
  }
  if (days <= 14) {
    return <Badge variant="secondary">Expires in {days}d</Badge>
  }
  return <Badge variant="default">Active</Badge>
}

function openWhatsAppWithMessage(message: string) {
  if (CHIEF_WHATSAPP) {
    const phone = CHIEF_WHATSAPP.replace(/[^0-9]/g, '')
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    window.open(url, '_blank', 'noopener')
    return
  }
  // VITE_CHIEF_WHATSAPP_NUMBER not configured — show the message for the user to copy.
  toast.message('Open WhatsApp with Chief and write:', { description: message })
}

interface ViewAggregate {
  presentation_id: string
  view_count: number
  unique_emails: number
  last_viewed_at: string
}

interface PresentacionesProps {
  embedded?: boolean
}

export function Presentaciones({ embedded = false }: PresentacionesProps = {}) {
  const { org } = useOrg()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<PresentationRow | null>(null)
  const [statsTarget, setStatsTarget] = useState<PresentationRow | null>(null)
  const [newBcOpen, setNewBcOpen] = useState(false)
  const [newSdrBcOpen, setNewSdrBcOpen] = useState(false)
  const [newSsDeckOpen, setNewSsDeckOpen] = useState(false)
  const [ssDeleteTarget, setSsDeleteTarget] = useState<SsDeckRow | null>(null)
  const [newWorkshopOpen, setNewWorkshopOpen] = useState(false)
  const [workshopEditTarget, setWorkshopEditTarget] = useState<WorkshopEditTarget | null>(null)
  const [workshopDeleteTarget, setWorkshopDeleteTarget] = useState<WorkshopBcRow | null>(null)
  const [vendorProfileOpen, setVendorProfileOpen] = useState(false)
  // True when the profile dialog was opened from the "New SDR BC" path because
  // the profile was missing — we then chain back to the BC form on close.
  const [chainToNewBc, setChainToNewBc] = useState(false)
  const { data: vendorProfile } = useVendorProfile()
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
  const [editLoadingSlug, setEditLoadingSlug] = useState<string | null>(null)
  // Edit-mode pre-fill targets for the SDR BC + SS Deck wizards. When set,
  // the corresponding NewXxxForm opens with Step 1 pre-populated so the AE
  // can tweak inputs and generate a fresh slug. The original row stays put.
  const [sdrBcEditTarget, setSdrBcEditTarget] = useState<{
    clientName: string
    website?: string
    createdByEmail?: string
    // Snapshot of the wizard fields persisted by sdr-bc-generate in
    // defaults._wizard_inputs. Decoded by NewSdrBcForm to pre-fill Step 1
    // + Step 2 (industry, ticket, payment stack, per-country legal+APMs).
    wizardInputs?: Record<string, unknown> | null
  } | null>(null)
  const [ssDeckEditTarget, setSsDeckEditTarget] = useState<{ clientName: string; website?: string; createdByEmail?: string } | null>(null)
  const [activeKind, setActiveKind] = useState<BcKind>('yuno_bc')

  const {
    data: presentations = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['presentations', org?.id, showArchived],
    queryFn: async (): Promise<PresentationRow[]> => {
      // No explicit org filter — RLS shows BCs from your orgs PLUS BCs whose
      // created_by_email matches any Gmail you have OAuth-connected (cross-org ownership).
      // This makes the dashboard "your BCs" rather than "this org's BCs".
      const query = supabase
        .from('presentations')
        .select('id, org_id, client_name, slug, kind, created_at, expires_at, archived, parent_id')
        .order('created_at', { ascending: false })

      if (!showArchived) query.eq('archived', false)

      const { data, error: err } = await query
      if (err) throw err
      return (data || []) as PresentationRow[]
    },
    enabled: !!org?.id,
  })

  // SS Decks live in their own table (merchants_ss). Public-read RLS means we
  // see all decks; filter to the current org client-side so the list stays
  // scoped without losing the public-read share-link flow used elsewhere.
  const { data: ssDecks = [] } = useQuery({
    queryKey: ['merchants_ss', org?.id],
    queryFn: async (): Promise<SsDeckRow[]> => {
      const { data, error: err } = await supabase
        .from('merchants_ss')
        .select('id, org_id, name, slug, mode, content_source, psps, created_at')
        .eq('org_id', org?.id || '')
        .order('created_at', { ascending: false })
      if (err) throw err
      return (data || []) as SsDeckRow[]
    },
    enabled: !!org?.id,
  })

  const deleteSsDeck = useMutation({
    mutationFn: async (id: string) => {
      const { error: err } = await supabase.from('merchants_ss').delete().eq('id', id)
      if (err) throw err
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['merchants_ss'] })
      toast.success('SS Deck deleted')
      setSsDeleteTarget(null)
    },
    onError: (e: Error) => toast.error(`Couldn't delete: ${e.message}`),
  })

  // Workshop BC list — parallel pattern to merchants_ss. Public-read RLS so
  // filter to current org client-side. We pull inputs + business_case in the
  // list query so the Edit button can hydrate the form without a 2nd fetch.
  const { data: workshops = [] } = useQuery({
    queryKey: ['workshops_bc', org?.id],
    queryFn: async (): Promise<WorkshopBcRow[]> => {
      const { data, error: err } = await supabase
        .from('workshops_bc')
        .select('id, org_id, client_name, slug, country, language, workshop_date, inputs, business_case, created_at, updated_at')
        .eq('org_id', org?.id || '')
        .order('created_at', { ascending: false })
      if (err) throw err
      return (data || []) as WorkshopBcRow[]
    },
    enabled: !!org?.id,
  })

  const deleteWorkshop = useMutation({
    mutationFn: async (id: string) => {
      const { error: err } = await supabase.from('workshops_bc').delete().eq('id', id)
      if (err) throw err
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workshops_bc'] })
      toast.success('Workshop deleted')
      setWorkshopDeleteTarget(null)
    },
    onError: (e: Error) => toast.error(`Couldn't delete: ${e.message}`),
  })

  // View aggregates per presentation. Single query; RLS scopes to BCs you own
  // (org-membership OR created_by_email matches your connected Gmail).
  const { data: viewAggregates = new Map<string, ViewAggregate>() } = useQuery({
    queryKey: ['presentation_view_aggregates', org?.id],
    queryFn: async (): Promise<Map<string, ViewAggregate>> => {
      const { data, error: err } = await supabase
        .from('presentation_views')
        .select('presentation_id, viewer_email, viewed_at')
        .order('viewed_at', { ascending: false })
      if (err) throw err
      const map = new Map<string, ViewAggregate>()
      const seenEmails = new Map<string, Set<string>>()
      for (const row of data || []) {
        const pid = row.presentation_id as string
        const email = row.viewer_email as string
        const viewedAt = row.viewed_at as string
        const existing = map.get(pid)
        const emails = seenEmails.get(pid) || new Set<string>()
        emails.add(email)
        seenEmails.set(pid, emails)
        if (existing) {
          existing.view_count += 1
          existing.unique_emails = emails.size
          if (viewedAt > existing.last_viewed_at) existing.last_viewed_at = viewedAt
        } else {
          map.set(pid, { presentation_id: pid, view_count: 1, unique_emails: 1, last_viewed_at: viewedAt })
        }
      }
      return map
    },
    enabled: !!org?.id,
    staleTime: 30_000,
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
      toast.success('Presentation archived')
    },
    onError: (e: Error) => toast.error(`Couldn't archive: ${e.message}`),
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
      toast.success('Presentation restored')
    },
    onError: (e: Error) => toast.error(`Couldn't restore: ${e.message}`),
  })

  const copyLink = (slug: string, kind: string) => {
    const url = `${baseUrlForKind(kind)}/${slug}`
    navigator.clipboard.writeText(url)
    toast.success('Link copied', { description: url })
  }

  const regenerate = (p: PresentationRow) => {
    // SDR BC: re-run the /sdr-bc skill. BDM BC: open the rich regen prompt.
    const cmd = p.kind === 'sdr_bc'
      ? `/sdr-bc ${p.client_name}`
      : `Regenerate the business case for ${p.client_name} (current slug: ${p.slug})`
    openWhatsAppWithMessage(cmd)
  }

  const newPresentation = () => {
    if (activeKind === 'sdr_bc') {
      // First-time SDR BC: prompt for sales profile before opening the BC form
      // so the closing slide isn't built with placeholder vendor info.
      if (!vendorProfile) {
        setChainToNewBc(true)
        setVendorProfileOpen(true)
        return
      }
      setNewSdrBcOpen(true)
      return
    }
    if (activeKind === 'ss_deck') {
      setNewSsDeckOpen(true)
      return
    }
    if (activeKind === 'workshop_bc') {
      setWorkshopEditTarget(null)
      setNewWorkshopOpen(true)
      return
    }
    if (activeKind === 'other') {
      // Decks de "Other" se generan vía skills en Chief (no hay form acá).
      toast.info('Estos decks se generan con skills de Chief', {
        description: 'Ejemplo: /yuno-one-click <merchant> en Chief WhatsApp. Cualquier deck nuevo aterriza acá hasta que tenga su propia sección.',
      })
      return
    }
    // BDM BC: rich form lives in the dashboard (it needs many fields).
    setEditTarget(null)
    setNewBcOpen(true)
  }

  // Open the workshop edit dialog with the row already hydrated. No 2nd fetch
  // needed — `inputs` was pulled in the list query.
  const editWorkshop = (w: WorkshopBcRow) => {
    setWorkshopEditTarget({
      slug: w.slug,
      clientName: w.client_name,
      country: w.country,
      language: w.language,
      workshopDate: w.workshop_date,
      inputs: w.inputs || {},
    })
    setNewWorkshopOpen(true)
  }

  // Open the SDR BC wizard pre-filled with the existing slug's clientName +
  // domain. The defaults JSONB carries `domain` (set by sdr-bc-generate).
  // Always generates a NEW slug; the original stays until archived.
  const editSdrBc = async (p: PresentationRow) => {
    setEditLoadingSlug(p.slug)
    try {
      const { data, error: err } = await supabase
        .from('presentations')
        .select('slug, client_name, created_by_email, defaults')
        .eq('id', p.id)
        .maybeSingle()
      if (err) throw err
      if (!data) throw new Error('Not found')
      const d = (data.defaults || {}) as { domain?: string; _wizard_inputs?: Record<string, unknown> }
      setSdrBcEditTarget({
        clientName: data.client_name,
        website: d.domain || undefined,
        createdByEmail: data.created_by_email || undefined,
        wizardInputs: d._wizard_inputs || null,
      })
      setNewSdrBcOpen(true)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error loading'
      toast.error(`Couldn't open SDR BC for editing: ${msg}`)
    } finally {
      setEditLoadingSlug(null)
    }
  }

  // Open the SS Deck wizard pre-filled with the existing merchant's name.
  // merchants_ss doesn't persist `domain` (only `name`), so the form will
  // re-resolve the domain via Firecrawl on submit — same as a fresh run.
  const editSsDeck = (d: SsDeckRow) => {
    setSsDeckEditTarget({
      clientName: d.name,
      website: undefined,
      createdByEmail: undefined,  // form falls back to logged-in user
    })
    setNewSsDeckOpen(true)
  }

  // Fetch the row's `defaults` JSONB on demand (the list query omits it). Open the
  // edit dialog only after defaults arrive — opening empty would force the user to
  // re-fill every field.
  const editPresentation = async (p: PresentationRow) => {
    setEditLoadingSlug(p.slug)
    try {
      const { data, error: err } = await supabase
        .from('presentations')
        .select('slug, client_name, created_by_email, defaults')
        .eq('id', p.id)
        .maybeSingle()
      if (err) throw err
      if (!data) throw new Error('Not found')
      setEditTarget({
        slug: data.slug,
        clientName: data.client_name,
        createdByEmail: data.created_by_email,
        defaults: (data.defaults || {}) as EditTarget['defaults'],
      })
      setNewBcOpen(true)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error loading'
      toast.error(`Couldn't open for editing: ${msg}`)
    } finally {
      setEditLoadingSlug(null)
    }
  }

  // Filter by active tab (kind), then by search term
  const byKind = presentations.filter((p) => (p.kind || 'yuno_bc') === activeKind)
  const filtered = search.trim()
    ? byKind.filter(
        (p) =>
          p.client_name.toLowerCase().includes(search.toLowerCase()) ||
          p.slug.toLowerCase().includes(search.toLowerCase()),
      )
    : byKind

  // "Other" agrupa toda presentación con kind fuera de MAIN_TAB_KINDS, + Yape estático.
  const otherPresentations = presentations.filter(
    (p) => p.kind && !MAIN_TAB_KINDS.includes(p.kind as (typeof MAIN_TAB_KINDS)[number]),
  )
  const counts = {
    yuno_bc: presentations.filter((p) => (p.kind || 'yuno_bc') === 'yuno_bc').length,
    sdr_bc: presentations.filter((p) => p.kind === 'sdr_bc').length,
    ss_deck: ssDecks.length,
    workshop_bc: workshops.length,
    other: otherPresentations.length + 1, // +1 = Yape estático
  }
  const meta = KIND_META[activeKind]

  // Filter para el tab 'other' (también respeta search).
  const filteredOtherPresentations = search.trim()
    ? otherPresentations.filter(
        (p) =>
          p.client_name.toLowerCase().includes(search.toLowerCase()) ||
          p.slug.toLowerCase().includes(search.toLowerCase()),
      )
    : otherPresentations
  // Yape aparece arriba siempre que no haya un search que no matchee "yape".
  const showYapeInOther = !search.trim() || 'yape'.includes(search.toLowerCase())

  // SS decks have a different shape from `presentations`, so the search must
  // know which list to filter against. Filter by name when ss_deck is active.
  const filteredSsDecks = search.trim()
    ? ssDecks.filter(
        (d) =>
          d.name.toLowerCase().includes(search.toLowerCase()) ||
          d.slug.toLowerCase().includes(search.toLowerCase()),
      )
    : ssDecks

  const filteredWorkshops = search.trim()
    ? workshops.filter(
        (w) =>
          w.client_name.toLowerCase().includes(search.toLowerCase()) ||
          w.slug.toLowerCase().includes(search.toLowerCase()),
      )
    : workshops

  return (
    <PageTransition>
      <div className={embedded ? '' : 'min-h-screen bg-background'}>
        {!embedded && (
          /* Standalone top bar with back link to solar nav */
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/40 bg-background/80 px-6 backdrop-blur">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Back to home"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </button>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
              <span className="text-sm font-medium">Presentations</span>
            </div>
            <div className="w-[80px]" aria-hidden="true" />
          </header>
        )}

      <div className="container mx-auto max-w-6xl p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
              <h1 className="text-2xl font-semibold">Presentations</h1>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {meta.description}{' '}
              {activeKind === 'ss_deck' ? 'Each URL is public, no expiration.' : 'Each URL is public, valid for 90 days.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {activeKind === 'sdr_bc' && (
              <Button variant="ghost" size="sm" onClick={() => setVendorProfileOpen(true)}>
                {vendorProfile ? 'Edit my profile' : 'Set up my profile'}
              </Button>
            )}
            <Button variant="outline" onClick={newPresentation}>
              {activeKind === 'other' ? 'Generate via skill' : `New ${meta.label}`}
            </Button>
          </div>
        </div>

        {/* Kind tabs */}
        <Tabs value={activeKind} onValueChange={(v) => setActiveKind(v as BcKind)} className="mb-6">
          <TabsList>
            <TabsTrigger value="yuno_bc" className="gap-2">
              BDM BC
              <span className="text-xs text-muted-foreground">({counts.yuno_bc})</span>
            </TabsTrigger>
            <TabsTrigger value="sdr_bc" className="gap-2">
              SDR BC
              <span className="text-xs text-muted-foreground">({counts.sdr_bc})</span>
            </TabsTrigger>
            <TabsTrigger value="ss_deck" className="gap-2">
              SS Deck
              <span className="text-xs text-muted-foreground">({counts.ss_deck})</span>
            </TabsTrigger>
            <TabsTrigger value="workshop_bc" className="gap-2">
              Workshop
              <span className="text-xs text-muted-foreground">({counts.workshop_bc})</span>
            </TabsTrigger>
            <TabsTrigger value="other" className="gap-2">
              Other
              <span className="text-xs text-muted-foreground">({counts.other})</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filters */}
        <div className="mb-6 flex items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <label htmlFor="bc-search" className="sr-only">
              Search presentations
            </label>
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="bc-search"
              placeholder="Search by client or slug..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {activeKind !== 'ss_deck' && activeKind !== 'workshop_bc' && (
            <Button
              variant={showArchived ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setShowArchived(!showArchived)}
              aria-pressed={showArchived}
            >
              <Archive className="mr-2 h-4 w-4" aria-hidden="true" />
              {showArchived ? 'Hiding archived' : 'View archived'}
            </Button>
          )}
        </div>

        {/* Body */}
        {isLoading && (
          <div className="py-20 text-center text-sm text-muted-foreground">Loading...</div>
        )}
        {error && (
          <Card className="border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
            Error loading presentations: {(error as Error).message}
          </Card>
        )}
        {!isLoading && !error && activeKind === 'ss_deck' && filteredSsDecks.length === 0 && (
          <Card className="border-dashed p-12 text-center">
            <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <p className="mb-1 text-sm font-medium">{search ? 'No results' : 'No SS Decks yet'}</p>
            <p className="text-xs text-muted-foreground">
              {search ? 'Try a different search term.' : 'Create your first by clicking "New SS Deck" — only the client name is required.'}
            </p>
          </Card>
        )}

        {!isLoading && !error && activeKind === 'ss_deck' && filteredSsDecks.length > 0 && (
          <div className="space-y-3">
            {filteredSsDecks.map((d) => {
              const url = `${SS_DECK_BASE_URL}/${d.slug}`
              const createdAt = new Date(d.created_at).toLocaleDateString('en-US', { dateStyle: 'medium' })
              const sourceLabel = d.content_source === 'research'
                ? 'Research'
                : d.content_source === 'regional_fallback'
                  ? 'Regional fallback'
                  : 'Template'
              const acquirerNames = Array.isArray(d.psps) ? d.psps.map(p => p.name).filter(Boolean) : []
              return (
                <Card key={d.id} className="p-4 transition-colors hover:bg-accent/30">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10" aria-hidden="true">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="mb-1 flex items-center gap-2 flex-wrap">
                        <span className="truncate font-medium">{d.name}</span>
                        <Badge variant="outline" className={`text-xs ${KIND_META.ss_deck.badgeClass}`}>SS Deck</Badge>
                        <Badge variant="outline" className="text-xs">{sourceLabel}</Badge>
                        {d.mode !== 'merchant' && (
                          <Badge variant="outline" className="text-xs capitalize">{d.mode}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span className="font-mono">{d.slug}</span>
                        <span>·</span>
                        <span>Created {createdAt}</span>
                        {acquirerNames.length > 0 && (
                          <>
                            <span>·</span>
                            <span className="truncate" title={acquirerNames.join(', ')}>
                              Acquirers: {acquirerNames.slice(0, 3).join(', ')}{acquirerNames.length > 3 ? ` +${acquirerNames.length - 3}` : ''}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => { navigator.clipboard.writeText(url); toast.success('Link copied', { description: url }) }} aria-label="Copy link">
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => window.open(url, '_blank', 'noopener')} aria-label="Open deck">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="More actions">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(url); toast.success('Link copied', { description: url }) }}>
                            <Copy className="mr-2 h-4 w-4" />
                            Copy link
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => editSsDeck(d)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => window.open(`https://bridge.yuno.tools/api/m/${d.slug}/pdf`, '_blank', 'noopener')}>
                            <FileText className="mr-2 h-4 w-4" />
                            Download PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setSsDeleteTarget(d)} className="text-destructive">
                            <Archive className="mr-2 h-4 w-4" />
                            Delete deck
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}

        {/* Workshop BC list — workshops_bc table, editable inputs, in-place recompute */}
        {!isLoading && !error && activeKind === 'workshop_bc' && filteredWorkshops.length === 0 && (
          <Card className="border-dashed p-12 text-center">
            <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <p className="mb-1 text-sm font-medium">{search ? 'No results' : 'No Workshop BCs yet'}</p>
            <p className="text-xs text-muted-foreground">
              {search ? 'Try a different search term.' : 'Create your first by clicking "New Workshop BC". You\'ll need monthly tx, average ticket and current approval rate.'}
            </p>
          </Card>
        )}

        {!isLoading && !error && activeKind === 'workshop_bc' && filteredWorkshops.length > 0 && (
          <div className="space-y-3">
            {filteredWorkshops.map((w) => {
              const url = `${WORKSHOP_BC_BASE_URL}/${w.slug}`
              const createdAt = new Date(w.created_at).toLocaleDateString('en-US', { dateStyle: 'medium' })
              const total = w.business_case?.total_annual_value_usd ?? 0
              const totalLabel = total > 0
                ? total.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
                : '—'
              return (
                <Card key={w.id} className="p-4 transition-colors hover:bg-accent/30">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10" aria-hidden="true">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="mb-1 flex items-center gap-2 flex-wrap">
                        <span className="truncate font-medium">{w.client_name}</span>
                        <Badge variant="outline" className={`text-xs ${KIND_META.workshop_bc.badgeClass}`}>Workshop</Badge>
                        {w.country && <Badge variant="outline" className="text-xs">{w.country}</Badge>}
                        <Badge variant="outline" className="text-xs uppercase">{w.language}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span className="font-mono">{w.slug}</span>
                        <span>·</span>
                        <span>Created {createdAt}</span>
                        {total > 0 && (
                          <>
                            <span>·</span>
                            <span className="font-medium text-foreground">Impact {totalLabel}/yr</span>
                          </>
                        )}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => editWorkshop(w)} aria-label={`Edit ${w.client_name}`}>
                      <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => window.open(url, '_blank', 'noopener')} aria-label="Open workshop">
                      <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                      Open
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="More actions">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(url); toast.success('Link copied', { description: url }) }}>
                          <Copy className="mr-2 h-4 w-4" />
                          Copy link
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => editWorkshop(w)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => window.open(`https://bridge.yuno.tools/api/workshop/${w.slug}/pdf`, '_blank', 'noopener')}>
                          <FileText className="mr-2 h-4 w-4" />
                          Download PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setWorkshopDeleteTarget(w)} className="text-destructive">
                          <Archive className="mr-2 h-4 w-4" />
                          Delete workshop
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </Card>
              )
            })}
          </div>
        )}

        {!isLoading && !error && activeKind !== 'ss_deck' && activeKind !== 'workshop_bc' && activeKind !== 'other' && filtered.length === 0 && (
          <Card className="border-dashed p-12 text-center">
            <FileText
              className="mx-auto mb-3 h-10 w-10 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="mb-1 text-sm font-medium">
              {search ? 'No results' : `No ${meta.label} yet`}
            </p>
            <p className="text-xs text-muted-foreground">
              {search
                ? 'Try a different search term.'
                : activeKind === 'sdr_bc'
                ? 'Type /sdr-bc <ClientName> in Chief WhatsApp to generate your first one (auto-everything from SimilarWeb).'
                : 'Create your first by clicking "New BDM BC".'}
            </p>
          </Card>
        )}

        {!isLoading && !error && activeKind !== 'ss_deck' && activeKind !== 'workshop_bc' && activeKind !== 'other' && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((p) => {
              const kind = (p.kind || 'yuno_bc') as BcKind
              const kindMeta = KIND_META[kind]
              const url = `${baseUrlForKind(kind)}/${p.slug}`
              const isUnavailable = new Date(p.expires_at) <= new Date() || p.archived
              const createdAt = new Date(p.created_at).toLocaleDateString('en-US', {
                dateStyle: 'medium',
              })
              const expiresAt = new Date(p.expires_at).toLocaleDateString('en-US', {
                dateStyle: 'medium',
              })

              const agg = viewAggregates.get(p.id)
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
                        <Badge variant="outline" className={`text-xs ${kindMeta.badgeClass}`}>
                          {kindMeta.label}
                        </Badge>
                        {statusBadge(p)}
                        {p.parent_id && (
                          <Badge variant="outline" className="text-xs">
                            Regenerated
                          </Badge>
                        )}
                        {agg && agg.view_count > 0 && (
                          <Badge variant="secondary" className="text-xs flex items-center gap-1">
                            <Eye className="h-3 w-3" aria-hidden="true" />
                            {agg.view_count} {agg.view_count === 1 ? 'open' : 'opens'}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span className="font-mono">{p.slug}</span>
                        <span>·</span>
                        <span>Created {createdAt}</span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          Expires {expiresAt}
                        </span>
                        {agg && agg.unique_emails > 0 && (
                          <>
                            <span>·</span>
                            <span>{agg.unique_emails} {agg.unique_emails === 1 ? 'unique email' : 'unique emails'}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {agg && agg.view_count > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setStatsTarget(p)}
                        aria-label={`View stats for ${p.client_name}`}
                      >
                        <BarChart3 className="mr-2 h-4 w-4" aria-hidden="true" />
                        Stats
                      </Button>
                    )}
                    {!isUnavailable && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(url, '_blank', 'noopener')}
                        aria-label={`Open ${p.client_name}'s presentation in a new tab`}
                      >
                        <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                        Open
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`More actions for ${p.client_name}`}
                        >
                          <MoreVertical className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => copyLink(p.slug, kind)}>
                          <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                          Copy link
                        </DropdownMenuItem>
                        {!p.archived && kind === 'yuno_bc' && (
                          <DropdownMenuItem
                            onClick={() => editPresentation(p)}
                            disabled={editLoadingSlug === p.slug}
                          >
                            <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                            {editLoadingSlug === p.slug ? 'Loading...' : 'Edit'}
                          </DropdownMenuItem>
                        )}
                        {!p.archived && kind === 'sdr_bc' && (
                          <DropdownMenuItem
                            onClick={() => editSdrBc(p)}
                            disabled={editLoadingSlug === p.slug}
                          >
                            <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                            {editLoadingSlug === p.slug ? 'Loading...' : 'Edit'}
                          </DropdownMenuItem>
                        )}
                        {!p.archived && (
                          <DropdownMenuItem
                            onClick={() => window.open(
                              `https://bridge.yuno.tools/api/${kind === 'sdr_bc' ? 'sdr-bc' : 'bc'}/${p.slug}/pdf`,
                              '_blank', 'noopener'
                            )}
                          >
                            <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
                            Download PDF
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => regenerate(p)}>
                          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                          Regenerate
                        </DropdownMenuItem>
                        {!p.archived ? (
                          <DropdownMenuItem
                            onClick={() => setArchiveTarget(p)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Archive className="mr-2 h-4 w-4" aria-hidden="true" />
                            Archive
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => unarchiveMutation.mutate(p.id)}>
                            <Archive className="mr-2 h-4 w-4" aria-hidden="true" />
                            Restore
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

        {/* ── Tab 'Other' ── Decks especiales que no entran en BC/SDR/SS/Workshop.
             Empieza con Yape (estático one-shot) + luego cualquier presentation
             con kind fuera de MAIN_TAB_KINDS (yuno_one_click hoy; futuros automático). */}
        {!isLoading && !error && activeKind === 'other' && (
          <div className="space-y-3">
            {showYapeInOther && (
              <Card className="p-4 transition-colors hover:bg-accent/30">
                <div className="flex items-center gap-4">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"
                    aria-hidden="true"
                  >
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="mb-1 flex items-center gap-2 flex-wrap">
                      <span className="truncate font-medium">Yape × Yuno Partnership BC</span>
                      <Badge variant="outline" className="text-xs bg-slate-500/10 text-slate-700 border-slate-500/30">
                        Estático
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        One-shot
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span className="font-mono">yape</span>
                      <span>·</span>
                      <span>Sin slug · sin DB · siempre disponible</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText('https://chief.yuno.tools/yape')
                      toast.success('Link copied', { description: 'https://chief.yuno.tools/yape' })
                    }}
                    aria-label="Copy Yape link"
                  >
                    <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                    Copy
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open('https://chief.yuno.tools/yape', '_blank', 'noopener')}
                    aria-label="Open Yape deck"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                    Open
                  </Button>
                </div>
              </Card>
            )}

            {filteredOtherPresentations.length === 0 && !showYapeInOther && (
              <Card className="border-dashed p-12 text-center">
                <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground" aria-hidden="true" />
                <p className="mb-1 text-sm font-medium">No results</p>
                <p className="text-xs text-muted-foreground">Try a different search term.</p>
              </Card>
            )}

            {filteredOtherPresentations.map((p) => {
              const subMeta = OTHER_SUB_KIND_META[p.kind || ''] || {
                label: p.kind || 'unknown',
                badgeClass: 'bg-slate-500/10 text-slate-700 border-slate-500/30',
                baseUrl: '',
              }
              const url = subMeta.baseUrl ? `${subMeta.baseUrl}/${p.slug}` : ''
              const isUnavailable = new Date(p.expires_at) <= new Date() || p.archived
              const createdAt = new Date(p.created_at).toLocaleDateString('en-US', { dateStyle: 'medium' })
              const expiresAt = new Date(p.expires_at).toLocaleDateString('en-US', { dateStyle: 'medium' })
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
                      <div className="mb-1 flex items-center gap-2 flex-wrap">
                        <span className="truncate font-medium">{p.client_name}</span>
                        <Badge variant="outline" className={`text-xs ${subMeta.badgeClass}`}>
                          {subMeta.label}
                        </Badge>
                        {statusBadge(p)}
                        {p.parent_id && (
                          <Badge variant="outline" className="text-xs">Regenerated</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span className="font-mono">{p.slug}</span>
                        <span>·</span>
                        <span>Created {createdAt}</span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          Expires {expiresAt}
                        </span>
                      </div>
                    </div>
                    {!isUnavailable && url && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(url, '_blank', 'noopener')}
                        aria-label={`Open ${p.client_name}'s deck in a new tab`}
                      >
                        <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                        Open
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`More actions for ${p.client_name}`}>
                          <MoreVertical className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => copyLink(p.slug, p.kind || '')}>
                          <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                          Copy link
                        </DropdownMenuItem>
                        {!p.archived && p.kind === 'yuno_one_click' && (
                          <DropdownMenuItem
                            onClick={() => window.open(
                              `https://bridge.yuno.tools/api/one-click/${p.slug}/pdf`,
                              '_blank', 'noopener'
                            )}
                          >
                            <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
                            Download PDF
                          </DropdownMenuItem>
                        )}
                        {!p.archived ? (
                          <DropdownMenuItem
                            onClick={() => setArchiveTarget(p)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Archive className="mr-2 h-4 w-4" aria-hidden="true" />
                            Archive
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => unarchiveMutation.mutate(p.id)}>
                            <Archive className="mr-2 h-4 w-4" aria-hidden="true" />
                            Restore
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

        <PresentationStats
          open={!!statsTarget}
          onClose={() => setStatsTarget(null)}
          presentationId={statsTarget?.id || null}
          clientName={statsTarget?.client_name || ''}
        />

        <NewBusinessCaseForm
          open={newBcOpen}
          onClose={() => { setNewBcOpen(false); setEditTarget(null) }}
          onCreated={() => qc.invalidateQueries({ queryKey: ['presentations'] })}
          editTarget={editTarget}
        />

        <NewSdrBcForm
          open={newSdrBcOpen}
          onClose={() => { setNewSdrBcOpen(false); setSdrBcEditTarget(null) }}
          onCreated={() => qc.invalidateQueries({ queryKey: ['presentations'] })}
          editTarget={sdrBcEditTarget}
        />

        <NewSsDeckForm
          open={newSsDeckOpen}
          onClose={() => { setNewSsDeckOpen(false); setSsDeckEditTarget(null) }}
          onCreated={() => qc.invalidateQueries({ queryKey: ['merchants_ss'] })}
          editTarget={ssDeckEditTarget}
        />

        <NewWorkshopBcForm
          open={newWorkshopOpen}
          onClose={() => { setNewWorkshopOpen(false); setWorkshopEditTarget(null) }}
          onSaved={() => qc.invalidateQueries({ queryKey: ['workshops_bc'] })}
          editTarget={workshopEditTarget}
        />

        <VendorProfileDialog
          open={vendorProfileOpen}
          onClose={() => {
            setVendorProfileOpen(false)
            if (chainToNewBc) {
              setChainToNewBc(false)
              setNewSdrBcOpen(true)
            }
          }}
          isFirstTime={!vendorProfile}
        />

        {/* Archive confirmation — archived decks return 410 at /bc/<slug>, so confirm first. */}
        <AlertDialog
          open={!!archiveTarget}
          onOpenChange={(open) => !open && setArchiveTarget(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive this presentation?</AlertDialogTitle>
              <AlertDialogDescription>
                The public link will stop working for {archiveTarget?.client_name}. You can
                restore it from "View archived".
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (archiveTarget) archiveMutation.mutate(archiveTarget.id)
                  setArchiveTarget(null)
                }}
              >
                Archive
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Workshop BC delete — workshops_bc has no archive flag, hard delete. */}
        <AlertDialog
          open={!!workshopDeleteTarget}
          onOpenChange={(open) => !open && setWorkshopDeleteTarget(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this Workshop BC?</AlertDialogTitle>
              <AlertDialogDescription>
                The public link <span className="font-mono">/workshop/{workshopDeleteTarget?.slug}</span> will return 404. This action can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (workshopDeleteTarget) deleteWorkshop.mutate(workshopDeleteTarget.id)
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* SS Deck delete — merchants_ss has no archive flag, so this is a hard delete. */}
        <AlertDialog
          open={!!ssDeleteTarget}
          onOpenChange={(open) => !open && setSsDeleteTarget(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this SS Deck?</AlertDialogTitle>
              <AlertDialogDescription>
                The public link <span className="font-mono">/m/{ssDeleteTarget?.slug}</span> will return 404. This action can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (ssDeleteTarget) deleteSsDeck.mutate(ssDeleteTarget.id)
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      </div>
    </PageTransition>
  )
}
