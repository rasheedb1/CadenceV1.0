import { useState, useEffect, useMemo, useRef, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FileText, Loader2, AlertCircle, ArrowLeft, Sparkles, RotateCcw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/contexts/AuthContext'
import { invokeWithFreshAuth } from '@/lib/edge-functions'
import { toast } from 'sonner'

// Two-step SDR BC wizard. Step 1 is just lookup inputs (client/website/email
// + optional SDR cover fields). On submit it calls sdr-bc-research which runs
// the full research pipeline (Firecrawl + SimilarWeb + deep-research, all
// cache-hot on re-runs) and returns suggestions per country. Step 2 lets the
// AE override industry / avg ticket / per-country legal entity / per-country
// APMs — anything left as Auto/unchanged falls back to the auto-resolved
// values when sdr-bc-generate runs. See plan tasks/plan-sdr-bc-optional-overrides.md.

// ── Shared types (mirror sdr-bc-research / sdr-bc-generate response shapes) ──

interface IndustryCatalogEntry { category: string; take_rate_pct: number }

interface ResearchCountry {
  iso: string
  name: string
  share: number
  visits: number
  suggested_legal_entity: boolean | null
  suggested_legal_entity_source: 'research' | 'ema_propagation' | null
  suggested_existing_apms: string[]
  catalog_apms: string[]
}

interface ResearchRegion {
  region: 'us' | 'lat' | 'ema' | 'apa'
  label: string
  countries: ResearchCountry[]
}

interface SuggestedPaymentStack {
  acquirers: string[]
  gateways: string[]
  methods: string[]
  inferred_from_region: 'us' | 'lat' | 'ema' | 'apa' | null
}

interface ResearchResponse {
  domain: string
  domain_resolution: { domain: string; confidence: 'high' | 'med' | 'low'; source: 'cache' | 'firecrawl' } | null
  suggested_payment_stack?: SuggestedPaymentStack | null
  suggested_industry: string | null
  suggested_avg_ticket_usd: number | null
  suggested_avg_ticket_confidence: string
  suggested_avg_ticket_source_url: string | null
  industries_catalog: IndustryCatalogEntry[]
  regions: ResearchRegion[]
  ema_propagation_anchor: string | null
  similarweb_monthly_visits_avg: number
  suggested_annual_revenue_usd: number | null
  suggested_annual_revenue_confidence: 'high' | 'med' | 'low' | 'unknown' | null
  suggested_annual_revenue_source_urls: string[]
  suggested_annual_revenue_evidence_quote: string | null
}

interface SdrBcSuccess {
  id: string
  slug: string
  url: string
  expiresAt: string
  industry?: string
  avg_ticket_usd?: number
  avg_ticket_confidence?: 'high' | 'med' | 'low'
  regions_rendered?: Array<{ region: string; label: string; country_count: number }>
  warnings?: Record<string, unknown>
  domain_used?: string
}

interface SdrBcError {
  error: string
  reason?: string
  candidates?: Array<{ domain: string; title?: string; snippet?: string }>
  valid_categories?: string[]
}

// Step 2 per-country edit state. legal_entity tri-state:
//   'auto' = use research value (don't include in override array)
//   'yes' / 'no' = explicit AE choice (sent as override)
// apms_touched = true if the AE added/removed APMs vs the suggested set.
interface CountryEditState {
  legal_entity: 'auto' | 'yes' | 'no'
  apms: string[]
  apms_touched: boolean
}

// Snapshot of the wizard inputs persisted in defaults._wizard_inputs by
// sdr-bc-generate. Every field is optional because legacy decks (generated
// before this snapshot existed) only carry whatever was assigned at the time.
interface WizardInputs {
  sdr_name?: string | null
  sdr_position?: string | null
  industry_override?: string | null
  avg_ticket_override_usd?: number | null
  acquirers_override?: string[] | null
  gateways_override?: string[] | null
  methods_override?: string[] | null
  legal_entities_override?: Array<{ iso: string; has_entity: boolean }> | null
  existing_apms_override?: Array<{ iso: string; apms: string[] }> | null
  emergency_mode?: boolean
  skip_deep_research?: boolean
  manual_traffic?: {
    total_monthly_visits?: number
    top_countries?: Array<{ iso: string; share: number }>
  } | null
  app_traffic_mode?: boolean
  annual_revenue_usd_override?: number | null
}

interface NewSdrBcFormProps {
  open: boolean
  onClose: () => void
  onCreated?: (slug: string, url: string) => void
  // When set, the form opens in "edit" mode: Step 1 fields are pre-filled
  // from the existing slug so the AE can tweak overrides and regenerate.
  // wizardInputs (when present) re-hydrates Step 2 overrides AFTER the
  // research call lands. Edit always produces a NEW slug (the original
  // stays until archived).
  editTarget?: {
    clientName: string
    website?: string
    createdByEmail?: string
    wizardInputs?: WizardInputs | null
  } | null
}

function arraysEqualIgnoringOrder(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const setB = new Set(b)
  return a.every(x => setB.has(x))
}

export function NewSdrBcForm({ open, onClose, onCreated, editTarget = null }: NewSdrBcFormProps) {
  const { user } = useAuth()
  const qc = useQueryClient()

  // ── Wizard state ──
  const [step, setStep] = useState<1 | 2>(1)
  const [researchResult, setResearchResult] = useState<ResearchResponse | null>(null)

  // ── Step 1 fields ──
  const [clientName, setClientName] = useState('')
  const [website, setWebsite] = useState('')
  const [createdByEmail, setCreatedByEmail] = useState('')
  const [sdrName, setSdrName] = useState('')
  const [sdrPosition, setSdrPosition] = useState('')
  const [forceRefresh, setForceRefresh] = useState(false)
  // Emergency mode — bypass SimilarWeb (used when API credits are exhausted).
  // When on, the AE provides total monthly visits + 1-15 countries with share %.
  // Optionally skips deep research too (industry/ticket fall back to defaults).
  const [emergencyMode, setEmergencyMode] = useState(false)
  const [skipDeepResearch, setSkipDeepResearch] = useState(false)
  const [manualTotalVisits, setManualTotalVisits] = useState('')
  const [manualCountries, setManualCountries] = useState<Array<{ iso: string; share: string }>>([
    { iso: '', share: '' },
  ])
  // App-traffic mode — for app-first clients where webviews aren't a reliable
  // transaction proxy. When on, math inverts to TPV = revenue / take_rate.
  // Revenue can be provided manually here or extracted by deep research
  // (≥2 source-URL double-check). Step 2 shows the research finding for review.
  const [appTrafficMode, setAppTrafficMode] = useState(false)
  const [annualRevenueOverride, setAnnualRevenueOverride] = useState('')

  // ── Step 2 fields ──
  const [industryOverride, setIndustryOverride] = useState('')
  const [avgTicketOverride, setAvgTicketOverride] = useState('')
  // Slide-4 payment stack columns. Pre-filled with what research inferred (the
  // same values the deck would otherwise show); the AE edits them in place.
  // `touched` per column → only send a column as an override when changed,
  // so untouched columns keep the auto/regional-fallback behavior.
  const [stackAcquirers, setStackAcquirers] = useState<string[]>([])
  const [stackGateways, setStackGateways] = useState<string[]>([])
  const [stackMethods, setStackMethods] = useState<string[]>([])
  const [stackTouched, setStackTouched] = useState({ acquirers: false, gateways: false, methods: false })
  // Keyed by ISO. Initialized when researchResult lands.
  const [countryEdits, setCountryEdits] = useState<Record<string, CountryEditState>>({})

  // ── Shared error state ──
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorReason, setErrorReason] = useState<string | null>(null)
  const [domainCandidates, setDomainCandidates] = useState<Array<{ domain: string; title?: string; snippet?: string }>>([])

  // Default email to logged-in user (memory feedback: Chief login email ≠ Gmail
  // integration email is common, so we let the AE override).
  useEffect(() => {
    if (open && user?.email && !createdByEmail) {
      setCreatedByEmail(user.email)
    }
  }, [open, user?.email, createdByEmail])

  // Pending Step 2 overrides — set when we open in edit mode, applied once
  // research lands. Ref instead of state so the researchResult effect can
  // consume + null it without triggering an extra render cycle.
  const pendingStep2OverridesRef = useRef<WizardInputs | null>(null)

  // Pre-fill Step 1 when opening in edit mode. Only runs when editTarget
  // arrives (i.e., dropdown 'Edit' clicked). User can change anything before
  // submitting; a new slug is generated regardless.
  useEffect(() => {
    if (!open || !editTarget) return
    setClientName(editTarget.clientName || '')
    setWebsite(editTarget.website || '')
    if (editTarget.createdByEmail) setCreatedByEmail(editTarget.createdByEmail)

    // Hydrate Step 1 wizard-state from the persisted snapshot. Legacy decks
    // (no _wizard_inputs) just skip this block — the user gets the same
    // 3-field pre-fill as before.
    const w = editTarget.wizardInputs
    if (!w) return
    if (w.sdr_name) setSdrName(w.sdr_name)
    if (w.sdr_position) setSdrPosition(w.sdr_position)
    if (w.emergency_mode) {
      setEmergencyMode(true)
      if (w.skip_deep_research) setSkipDeepResearch(true)
      const mt = w.manual_traffic
      if (mt) {
        if (typeof mt.total_monthly_visits === 'number' && mt.total_monthly_visits > 0) {
          setManualTotalVisits(String(mt.total_monthly_visits))
        }
        const rows = Array.isArray(mt.top_countries)
          ? mt.top_countries
              .filter(c => c && typeof c.iso === 'string')
              .map(c => ({
                iso: c.iso,
                // Decimal (0.78) → percentage string ("78.0") so the input
                // mirrors what the AE originally typed.
                share: typeof c.share === 'number' ? (c.share * 100).toFixed(1) : '',
              }))
          : []
        if (rows.length > 0) setManualCountries(rows)
      }
    }
    if (w.app_traffic_mode) {
      setAppTrafficMode(true)
      if (typeof w.annual_revenue_usd_override === 'number' && w.annual_revenue_usd_override > 0) {
        setAnnualRevenueOverride(String(w.annual_revenue_usd_override))
      }
    }

    // Queue the Step 2 overrides — the researchResult effect applies them
    // after research lands (cache-hot so ~5-10s in edit mode).
    pendingStep2OverridesRef.current = w
  }, [open, editTarget])

  // When research lands, initialize Step 2 state.
  useEffect(() => {
    if (!researchResult) return
    // Edit-mode overrides queued from the editTarget effect. Applied on top of
    // the research-suggested values so the AE sees their previous decisions
    // (industry, ticket, stack columns, per-country legal+APMs) pre-selected.
    const overrides = pendingStep2OverridesRef.current

    setIndustryOverride(overrides?.industry_override || researchResult.suggested_industry || '')
    setAvgTicketOverride(
      typeof overrides?.avg_ticket_override_usd === 'number'
        ? String(overrides.avg_ticket_override_usd)
        : researchResult.suggested_avg_ticket_usd != null
          ? String(researchResult.suggested_avg_ticket_usd)
          : '',
    )
    const ps = researchResult.suggested_payment_stack
    const acqOverride = Array.isArray(overrides?.acquirers_override) ? overrides!.acquirers_override : null
    const gwOverride = Array.isArray(overrides?.gateways_override) ? overrides!.gateways_override : null
    const mOverride = Array.isArray(overrides?.methods_override) ? overrides!.methods_override : null
    setStackAcquirers(acqOverride ?? (ps?.acquirers?.slice() ?? []))
    setStackGateways(gwOverride ?? (ps?.gateways?.slice() ?? []))
    setStackMethods(mOverride ?? (ps?.methods?.slice() ?? []))
    setStackTouched({
      acquirers: acqOverride !== null,
      gateways: gwOverride !== null,
      methods: mOverride !== null,
    })
    // Per-country edits: seed with research suggestions, then layer the
    // per-ISO overrides. legal_entities_override → tri-state to 'yes'/'no'.
    // existing_apms_override → swap the apm list + mark touched.
    const legalByIso = new Map(
      (overrides?.legal_entities_override || []).map(x => [x.iso, x.has_entity]),
    )
    const apmsByIso = new Map(
      (overrides?.existing_apms_override || []).map(x => [x.iso, x.apms]),
    )
    const initial: Record<string, CountryEditState> = {}
    for (const region of researchResult.regions) {
      for (const country of region.countries) {
        const legalOv = legalByIso.get(country.iso)
        const apmsOv = apmsByIso.get(country.iso)
        initial[country.iso] = {
          legal_entity: legalOv === true ? 'yes' : legalOv === false ? 'no' : 'auto',
          apms: apmsOv ?? country.suggested_existing_apms.slice(),
          apms_touched: apmsOv !== undefined,
        }
      }
    }
    setCountryEdits(initial)
    // One-shot — clear so a subsequent research re-run (e.g. user clicked Back
    // and modified Step 1) restarts from suggestions.
    pendingStep2OverridesRef.current = null
  }, [researchResult])

  function resetForm() {
    setStep(1)
    setResearchResult(null)
    setClientName('')
    setWebsite('')
    setSdrName('')
    setSdrPosition('')
    setForceRefresh(false)
    setEmergencyMode(false)
    setSkipDeepResearch(false)
    setManualTotalVisits('')
    setManualCountries([{ iso: '', share: '' }])
    setAppTrafficMode(false)
    setAnnualRevenueOverride('')
    setIndustryOverride('')
    setAvgTicketOverride('')
    setStackAcquirers([])
    setStackGateways([])
    setStackMethods([])
    setStackTouched({ acquirers: false, gateways: false, methods: false })
    setCountryEdits({})
    setError(null)
    setErrorReason(null)
    setDomainCandidates([])
    pendingStep2OverridesRef.current = null
  }

  function handleClose() {
    if (submitting) return
    resetForm()
    onClose()
  }

  // ──────────────────────────────────────────────────────────────────────
  // Step 1 submit → call sdr-bc-research → advance to step 2
  // ──────────────────────────────────────────────────────────────────────
  async function handleStep1Submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setErrorReason(null)
    setDomainCandidates([])

    if (!clientName.trim()) { setError('Client name is required'); return }
    if (!createdByEmail.trim()) { setError('Your connected Gmail is required'); return }

    // Emergency mode validation: must have website + ≥1 country. Total visits
    // is required UNLESS app-traffic mode is also on — there, TPV = revenue /
    // take_rate, so the visit count is never read (only country shares matter).
    let manualTrafficPayload: { total_monthly_visits: number; top_countries: Array<{ iso: string; share: number }> } | null = null
    if (emergencyMode) {
      if (!website.trim()) { setError('Website is required in emergency mode (no domain resolver call)'); return }
      const total = parseFloat(manualTotalVisits)
      const hasTotal = Number.isFinite(total) && total > 0
      if (!appTrafficMode && !hasTotal) { setError('Total monthly visits must be a positive number'); return }
      const cleaned = manualCountries
        .map(c => ({ iso: c.iso.trim().toUpperCase(), share: parseFloat(c.share) }))
        .filter(c => c.iso && Number.isFinite(c.share) && c.share > 0)
      if (cleaned.length === 0) { setError('Add at least 1 country with ISO + share %'); return }
      const shareSum = cleaned.reduce((s, c) => s + c.share, 0)
      if (shareSum > 100.5) { setError(`Country shares sum to ${shareSum.toFixed(1)}% (must be ≤ 100)`); return }
      // Convert share % → decimal (0.78 instead of 78) before sending.
      manualTrafficPayload = {
        total_monthly_visits: hasTotal ? total : 0,
        top_countries: cleaned.map(c => ({ iso: c.iso, share: c.share / 100 })),
      }
    }

    const payload: Record<string, unknown> = {
      clientName: clientName.trim(),
      createdByEmail: createdByEmail.trim(),
    }
    if (website.trim()) payload.website = website.trim()
    if (forceRefresh) payload.force_refresh = true
    if (emergencyMode) {
      if (manualTrafficPayload) payload.manual_traffic = manualTrafficPayload
      if (skipDeepResearch) payload.skip_deep_research = true
    }
    if (appTrafficMode) {
      payload.app_traffic_mode = true
      const rev = parseFloat(annualRevenueOverride)
      if (Number.isFinite(rev) && rev > 0) {
        payload.annual_revenue_usd_override = rev
      }
    }

    setSubmitting(true)
    try {
      const { data, error: invokeErr } = await invokeWithFreshAuth<ResearchResponse>('sdr-bc-research', {
        body: payload,
        // Research takes 60-90s end-to-end for new companies; cache-hot for
        // already-researched ones is ~5-10s. 3-min timeout absorbs both.
        timeoutMs: 180_000,
      })
      if (invokeErr) {
        const ctx = (invokeErr as { context?: Response }).context
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = await ctx.clone().json() as SdrBcError | null
            if (body?.reason) setErrorReason(body.reason)
            if (body?.reason === 'company_domain_unresolved') {
              if (Array.isArray(body.candidates)) setDomainCandidates(body.candidates)
              throw new Error(
                `Could not auto-resolve a domain for "${clientName.trim()}". Pick one below or type it manually.`,
              )
            }
            if (body?.error) throw new Error(body.error)
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message && parseErr.message !== 'Unexpected end of JSON input') {
              throw parseErr
            }
          }
        }
        throw invokeErr
      }

      const result = data as ResearchResponse | null
      if (!result?.regions?.length) throw new Error('Research returned no regions above the 1% share floor')

      setResearchResult(result)
      setStep(2)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error running research'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Step 2 submit → call sdr-bc-generate with overrides → create deck
  // ──────────────────────────────────────────────────────────────────────
  async function handleStep2Submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setErrorReason(null)

    if (!researchResult) { setError('Missing research result'); return }

    const payload: Record<string, unknown> = {
      clientName: clientName.trim(),
      createdByEmail: createdByEmail.trim(),
    }
    if (website.trim()) payload.website = website.trim()
    if (forceRefresh) payload.force_refresh = true
    if (sdrName.trim()) payload.sdr_name = sdrName.trim()
    if (sdrPosition.trim()) payload.sdr_position = sdrPosition.trim()
    // Forward emergency-mode flags so the generate call doesn't re-hit
    // SimilarWeb / deep-research either (the cached research bundle in
    // Step 2 was already manual).
    if (emergencyMode) {
      const total = parseFloat(manualTotalVisits)
      const hasTotal = Number.isFinite(total) && total > 0
      const cleaned = manualCountries
        .map(c => ({ iso: c.iso.trim().toUpperCase(), share: parseFloat(c.share) / 100 }))
        .filter(c => c.iso && Number.isFinite(c.share) && c.share > 0)
      // Visit count is optional in app-traffic mode (revenue drives TPV).
      if (cleaned.length > 0 && (hasTotal || appTrafficMode)) {
        payload.manual_traffic = { total_monthly_visits: hasTotal ? total : 0, top_countries: cleaned }
      }
      if (skipDeepResearch) payload.skip_deep_research = true
    }
    if (appTrafficMode) {
      payload.app_traffic_mode = true
      const rev = parseFloat(annualRevenueOverride)
      if (Number.isFinite(rev) && rev > 0) {
        payload.annual_revenue_usd_override = rev
      }
    }

    // Industry override: only send if AE selected something different from the suggestion.
    if (industryOverride && industryOverride !== researchResult.suggested_industry) {
      payload.industry_override = industryOverride
    }

    // Avg ticket override: only send if AE typed a number AND it differs from suggested.
    const ticketStr = avgTicketOverride.trim()
    if (ticketStr) {
      const n = parseFloat(ticketStr)
      if (!Number.isFinite(n) || n <= 0) {
        setError('Average ticket must be a positive number (USD per transaction)')
        return
      }
      if (n !== researchResult.suggested_avg_ticket_usd) {
        payload.avg_ticket_override_usd = n
      }
    }

    // Per-country overrides.
    const legalOverrides: Array<{ iso: string; has_entity: boolean }> = []
    const apmsOverrides: Array<{ iso: string; apms: string[] }> = []
    for (const region of researchResult.regions) {
      for (const country of region.countries) {
        const edit = countryEdits[country.iso]
        if (!edit) continue
        if (edit.legal_entity !== 'auto') {
          legalOverrides.push({ iso: country.iso, has_entity: edit.legal_entity === 'yes' })
        }
        if (edit.apms_touched && !arraysEqualIgnoringOrder(edit.apms, country.suggested_existing_apms)) {
          apmsOverrides.push({ iso: country.iso, apms: edit.apms })
        }
      }
    }
    if (legalOverrides.length > 0) payload.legal_entities_override = legalOverrides
    if (apmsOverrides.length > 0) payload.existing_apms_override = apmsOverrides

    // Slide-4 stack overrides: only send columns the AE actually edited. An
    // untouched column falls back to auto (research + regional catalog) on the
    // backend, identical to today's behavior.
    if (stackTouched.acquirers) payload.acquirers_override = stackAcquirers
    if (stackTouched.gateways) payload.gateways_override = stackGateways
    if (stackTouched.methods) payload.methods_override = stackMethods

    setSubmitting(true)
    try {
      const { data, error: invokeErr } = await invokeWithFreshAuth<SdrBcSuccess>('sdr-bc-generate', {
        body: payload,
        timeoutMs: 120_000,
      })
      if (invokeErr) {
        const ctx = (invokeErr as { context?: Response }).context
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = await ctx.clone().json() as SdrBcError | null
            if (body?.reason) setErrorReason(body.reason)
            if (body?.error) throw new Error(body.error)
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message && parseErr.message !== 'Unexpected end of JSON input') {
              throw parseErr
            }
          }
        }
        throw invokeErr
      }

      const result = data as SdrBcSuccess | null
      if (!result?.slug) throw new Error('Invalid server response (no slug)')

      qc.invalidateQueries({ queryKey: ['presentations'] })

      const overrideCount = legalOverrides.length + apmsOverrides.length
        + (payload.industry_override ? 1 : 0) + (payload.avg_ticket_override_usd ? 1 : 0)
      const tip = overrideCount > 0 ? ` (${overrideCount} override${overrideCount > 1 ? 's' : ''} applied)` : ''
      toast.success(`SDR BC generated for ${clientName.trim()}${tip}`, {
        description: result.url,
        action: { label: 'Open', onClick: () => window.open(result.url, '_blank', 'noopener') },
      })

      onCreated?.(result.slug, result.url)
      handleClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error generating the SDR BC'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      {/* Override DialogContent's default `grid gap-4` so the inner flex column
          (header → scrollable body → sticky footer) chains height correctly.
          Without `!flex !flex-col !gap-0 overflow-hidden`, the Radix Dialog
          primitive lets the body grow past the viewport instead of scrolling. */}
      <DialogContent className="max-w-3xl max-h-[90vh] !grid-rows-none !grid-cols-none !flex !flex-col !gap-0 overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
            New SDR BC
            <Badge variant="outline" className="ml-2 text-xs">Step {step} of 2</Badge>
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? 'Lookup inputs. We will research the client and surface optional overrides in step 2.'
              : 'Review what research suggested. Override anything you need; leave the rest as Auto.'}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <Step1Form
            clientName={clientName} setClientName={setClientName}
            website={website} setWebsite={setWebsite}
            createdByEmail={createdByEmail} setCreatedByEmail={setCreatedByEmail}
            sdrName={sdrName} setSdrName={setSdrName}
            sdrPosition={sdrPosition} setSdrPosition={setSdrPosition}
            forceRefresh={forceRefresh} setForceRefresh={setForceRefresh}
            emergencyMode={emergencyMode} setEmergencyMode={setEmergencyMode}
            skipDeepResearch={skipDeepResearch} setSkipDeepResearch={setSkipDeepResearch}
            manualTotalVisits={manualTotalVisits} setManualTotalVisits={setManualTotalVisits}
            manualCountries={manualCountries} setManualCountries={setManualCountries}
            appTrafficMode={appTrafficMode} setAppTrafficMode={setAppTrafficMode}
            annualRevenueOverride={annualRevenueOverride} setAnnualRevenueOverride={setAnnualRevenueOverride}
            submitting={submitting}
            error={error} errorReason={errorReason} domainCandidates={domainCandidates}
            onPickCandidate={(d) => { setWebsite(d); setError(null); setErrorReason(null); setDomainCandidates([]) }}
            onSubmit={handleStep1Submit}
            onCancel={handleClose}
          />
        ) : (
          <Step2Form
            research={researchResult!}
            industryOverride={industryOverride} setIndustryOverride={setIndustryOverride}
            avgTicketOverride={avgTicketOverride} setAvgTicketOverride={setAvgTicketOverride}
            stackAcquirers={stackAcquirers} setStackAcquirers={setStackAcquirers}
            stackGateways={stackGateways} setStackGateways={setStackGateways}
            stackMethods={stackMethods} setStackMethods={setStackMethods}
            stackTouched={stackTouched} setStackTouched={setStackTouched}
            countryEdits={countryEdits} setCountryEdits={setCountryEdits}
            appTrafficMode={appTrafficMode}
            annualRevenueOverride={annualRevenueOverride} setAnnualRevenueOverride={setAnnualRevenueOverride}
            submitting={submitting}
            error={error}
            onBack={() => { setStep(1); setError(null); setErrorReason(null) }}
            onSubmit={handleStep2Submit}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Step 1 — Lookup inputs
// ────────────────────────────────────────────────────────────────────────

interface Step1Props {
  clientName: string; setClientName: (v: string) => void
  website: string; setWebsite: (v: string) => void
  createdByEmail: string; setCreatedByEmail: (v: string) => void
  sdrName: string; setSdrName: (v: string) => void
  sdrPosition: string; setSdrPosition: (v: string) => void
  forceRefresh: boolean; setForceRefresh: (v: boolean) => void
  emergencyMode: boolean; setEmergencyMode: (v: boolean) => void
  skipDeepResearch: boolean; setSkipDeepResearch: (v: boolean) => void
  manualTotalVisits: string; setManualTotalVisits: (v: string) => void
  manualCountries: Array<{ iso: string; share: string }>
  setManualCountries: React.Dispatch<React.SetStateAction<Array<{ iso: string; share: string }>>>
  appTrafficMode: boolean; setAppTrafficMode: (v: boolean) => void
  annualRevenueOverride: string; setAnnualRevenueOverride: (v: string) => void
  submitting: boolean
  error: string | null; errorReason: string | null
  domainCandidates: Array<{ domain: string; title?: string; snippet?: string }>
  onPickCandidate: (domain: string) => void
  onSubmit: (e: FormEvent) => void
  onCancel: () => void
}

function Step1Form(p: Step1Props) {
  return (
    <form onSubmit={p.onSubmit} className="flex flex-col flex-1 min-h-0 mt-2 space-y-4 overflow-y-auto pr-1">
      <div>
        <Label htmlFor="sdr-client">Client *</Label>
        <Input
          id="sdr-client" value={p.clientName}
          onChange={(e) => p.setClientName(e.target.value)}
          placeholder="Rappi" required disabled={p.submitting} autoFocus
        />
        <p className="text-xs text-muted-foreground mt-1">Casing is preserved end-to-end (Rappi stays Rappi).</p>
      </div>

      <div>
        <Label htmlFor="sdr-website">Website <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Input
          id="sdr-website" value={p.website}
          onChange={(e) => p.setWebsite(e.target.value)}
          placeholder="rappi.com" disabled={p.submitting}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Leave blank to auto-resolve from the company name. Fill in if you want to skip ambiguity.
        </p>
      </div>

      <div>
        <Label htmlFor="sdr-email">Your connected Gmail *</Label>
        <Input
          id="sdr-email" type="email" value={p.createdByEmail}
          onChange={(e) => p.setCreatedByEmail(e.target.value)}
          placeholder="you@company.com" required disabled={p.submitting}
        />
        <p className="text-xs text-muted-foreground mt-1">Used to resolve your AE record (org + identity).</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="sdr-name">Your name <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input
            id="sdr-name" value={p.sdrName}
            onChange={(e) => p.setSdrName(e.target.value)}
            placeholder="Rasheed Bayter" disabled={p.submitting}
          />
        </div>
        <div>
          <Label htmlFor="sdr-position">Your position <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input
            id="sdr-position" value={p.sdrPosition}
            onChange={(e) => p.setSdrPosition(e.target.value)}
            placeholder="SDR · LATAM" disabled={p.submitting}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">Shown on the cover slide as &ldquo;Prepared by&rdquo; when both filled.</p>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox" checked={p.forceRefresh}
          onChange={(e) => p.setForceRefresh(e.target.checked)}
          disabled={p.submitting || p.emergencyMode} className="h-4 w-4 rounded border-input"
        />
        <span className={p.emergencyMode ? 'text-muted-foreground' : ''}>Force refresh (skip the 30-day research cache)</span>
      </label>

      {/* Emergency mode — skip SimilarWeb when API credits are exhausted. */}
      <div className={`rounded-md border ${p.emergencyMode ? 'border-amber-500/40 bg-amber-500/5' : 'border-border'} p-3 space-y-3`}>
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox" checked={p.emergencyMode}
            onChange={(e) => p.setEmergencyMode(e.target.checked)}
            disabled={p.submitting} className="h-4 w-4 rounded border-input mt-0.5"
          />
          <div className="flex-1">
            <span className="font-medium">🚨 Emergency mode (skip SimilarWeb)</span>
            <p className="text-xs text-muted-foreground mt-0.5">
              Use when SimilarWeb credits are exhausted. You supply traffic data manually; everything else runs as normal.
            </p>
          </div>
        </label>

        {p.emergencyMode && (
          <div className="space-y-3 pl-6 border-l-2 border-amber-500/30 ml-1">
            <div>
              <Label htmlFor="sdr-total-visits" className="text-xs">
                Total monthly visits (site-wide) {p.appTrafficMode
                  ? <span className="text-muted-foreground font-normal">(optional — not used in app traffic mode)</span>
                  : '*'}
              </Label>
              <Input
                id="sdr-total-visits" type="number" min="1" step="1"
                value={p.manualTotalVisits}
                onChange={(e) => p.setManualTotalVisits(e.target.value)}
                placeholder={p.appTrafficMode ? 'Leave blank — revenue drives TPV' : 'e.g. 5000000'}
                disabled={p.submitting}
                className="h-9 text-sm"
              />
            </div>

            <div>
              <Label className="text-xs">Top countries (ISO + share %) *</Label>
              <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                ISO-2 code (US, BR, FR, IN, …) + share as percentage of total. Shares should sum to ≤ 100%.
              </p>
              <div className="space-y-2">
                {p.manualCountries.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={c.iso}
                      onChange={(e) => p.setManualCountries(prev => prev.map((x, j) => j === i ? { ...x, iso: e.target.value.toUpperCase().slice(0, 2) } : x))}
                      placeholder="US"
                      disabled={p.submitting}
                      className="h-9 text-sm font-mono uppercase w-20"
                      maxLength={2}
                    />
                    <Input
                      type="number" min="0" max="100" step="0.1"
                      value={c.share}
                      onChange={(e) => p.setManualCountries(prev => prev.map((x, j) => j === i ? { ...x, share: e.target.value } : x))}
                      placeholder="78.1"
                      disabled={p.submitting}
                      className="h-9 text-sm flex-1"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                    <Button
                      type="button" variant="ghost" size="icon"
                      onClick={() => p.setManualCountries(prev => prev.length > 1 ? prev.filter((_, j) => j !== i) : prev)}
                      disabled={p.submitting || p.manualCountries.length === 1}
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label="Remove country"
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button" variant="outline" size="sm"
                onClick={() => p.setManualCountries(prev => [...prev, { iso: '', share: '' }])}
                disabled={p.submitting || p.manualCountries.length >= 15}
                className="mt-2 h-8 text-xs"
              >
                + Add country
              </Button>
              {(() => {
                const sum = p.manualCountries.reduce((s, c) => s + (parseFloat(c.share) || 0), 0)
                if (sum === 0) return null
                const over = sum > 100.5
                return (
                  <p className={`text-xs mt-2 ${over ? 'text-destructive' : 'text-muted-foreground'}`}>
                    Shares sum: {sum.toFixed(1)}% {over && '— exceeds 100%'}
                  </p>
                )
              })()}
            </div>

            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox" checked={p.skipDeepResearch}
                onChange={(e) => p.setSkipDeepResearch(e.target.checked)}
                disabled={p.submitting} className="h-4 w-4 rounded border-input mt-0.5"
              />
              <div className="flex-1">
                <span>Also skip deep research</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Off = deep research still runs (industry, ticket, legal entities). On = use industry defaults + manual overrides only.
                </p>
              </div>
            </label>
          </div>
        )}
      </div>

      {/* App traffic mode — for app-first clients (revenue / take_rate path). */}
      <div className={`rounded-md border ${p.appTrafficMode ? 'border-violet-500/40 bg-violet-500/5' : 'border-border'} p-3 space-y-3`}>
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox" checked={p.appTrafficMode}
            onChange={(e) => p.setAppTrafficMode(e.target.checked)}
            disabled={p.submitting} className="h-4 w-4 rounded border-input mt-0.5"
          />
          <div className="flex-1">
            <span className="font-medium">📱 App traffic mode (revenue → TPV)</span>
            <p className="text-xs text-muted-foreground mt-0.5">
              For clients where most volume comes through native apps (SimilarWeb webviews under-count transactions).
              The math inverts: TPV = annual_revenue / take_rate. Country shares still drive the per-country split.
            </p>
          </div>
        </label>

        {p.appTrafficMode && (
          <div className="space-y-2 pl-6 border-l-2 border-violet-500/30 ml-1">
            <div>
              <Label htmlFor="sdr-revenue" className="text-xs">Annual revenue USD <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="sdr-revenue" type="number" min="0" step="1000"
                value={p.annualRevenueOverride}
                onChange={(e) => p.setAnnualRevenueOverride(e.target.value)}
                placeholder="e.g. 8500000000"
                disabled={p.submitting}
                className="h-9 text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Leave blank → deep research extracts it from public sources with a ≥2 source-URL double-check.
                Step 2 shows the value + sources for your review before generating.
              </p>
            </div>
          </div>
        )}
      </div>

      {p.error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
            <div className="flex-1">
              <div>{p.error}</div>
              {p.errorReason === 'company_domain_unresolved' && p.domainCandidates.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-xs opacity-80">Pick the right domain:</div>
                  {p.domainCandidates.map((c) => (
                    <button
                      key={c.domain} type="button"
                      className="block w-full text-left text-xs rounded border border-destructive/20 bg-background/50 px-2 py-1 hover:bg-background"
                      onClick={() => p.onPickCandidate(c.domain)} disabled={p.submitting}
                    >
                      <span className="font-mono text-foreground">{c.domain}</span>
                      {c.title && <span className="text-muted-foreground ml-2">— {c.title}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={p.onCancel} disabled={p.submitting}>Cancel</Button>
        <Button type="submit" disabled={p.submitting}>
          {p.submitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              Researching… (~60-90s)
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" aria-hidden="true" />
              Run research
            </>
          )}
        </Button>
      </DialogFooter>
    </form>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Step 2 — Override review
// ────────────────────────────────────────────────────────────────────────

interface StackTouched { acquirers: boolean; gateways: boolean; methods: boolean }

interface Step2Props {
  research: ResearchResponse
  industryOverride: string; setIndustryOverride: (v: string) => void
  avgTicketOverride: string; setAvgTicketOverride: (v: string) => void
  stackAcquirers: string[]; setStackAcquirers: React.Dispatch<React.SetStateAction<string[]>>
  stackGateways: string[]; setStackGateways: React.Dispatch<React.SetStateAction<string[]>>
  stackMethods: string[]; setStackMethods: React.Dispatch<React.SetStateAction<string[]>>
  stackTouched: StackTouched; setStackTouched: React.Dispatch<React.SetStateAction<StackTouched>>
  countryEdits: Record<string, CountryEditState>
  setCountryEdits: React.Dispatch<React.SetStateAction<Record<string, CountryEditState>>>
  appTrafficMode: boolean
  annualRevenueOverride: string; setAnnualRevenueOverride: (v: string) => void
  submitting: boolean
  error: string | null
  onBack: () => void
  onSubmit: (e: FormEvent) => void
}

function Step2Form(p: Step2Props) {
  // Sort industries alphabetically for the dropdown (easier to scan than the
  // catalog's strategic order). Take rate is shown beside the label.
  const industryOptions = useMemo(
    () => [...p.research.industries_catalog].sort((a, b) => a.category.localeCompare(b.category)),
    [p.research.industries_catalog],
  )
  const selectedIndustry = industryOptions.find(i => i.category === p.industryOverride)

  return (
    <form onSubmit={p.onSubmit} className="flex flex-col flex-1 min-h-0 mt-2">
      {/* Plain overflow-y-auto div instead of ScrollArea — Radix ScrollArea
          doesn't propagate scroll reliably inside a Dialog's flex chain. */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-2">
        <div className="space-y-4 pb-2">
          {/* Research summary banner */}
          <div className="rounded-md border bg-muted/30 p-3 text-xs flex flex-wrap items-center gap-x-4 gap-y-1">
            <span><span className="text-muted-foreground">Domain:</span> <span className="font-mono">{p.research.domain}</span></span>
            <span><span className="text-muted-foreground">Monthly visits:</span> {Math.round(p.research.similarweb_monthly_visits_avg).toLocaleString()}</span>
            <span><span className="text-muted-foreground">Regions:</span> {p.research.regions.map(r => r.label).join(' · ')}</span>
          </div>

          {/* Industry + ticket */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="step2-industry">Industry</Label>
              <Select
                value={p.industryOverride}
                onValueChange={p.setIndustryOverride}
                disabled={p.submitting}
              >
                <SelectTrigger id="step2-industry" className="mt-1">
                  <SelectValue placeholder="Select industry…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {industryOptions.map(opt => (
                    <SelectItem key={opt.category} value={opt.category}>
                      <span className="flex items-center justify-between gap-3 w-full">
                        <span>{opt.category}</span>
                        <span className="text-xs text-muted-foreground">{opt.take_rate_pct}% take</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {p.research.suggested_industry
                  ? <>Suggested by research: <span className="font-medium">{p.research.suggested_industry}</span>{selectedIndustry ? <> · take rate {selectedIndustry.take_rate_pct}%</> : null}</>
                  : 'Research could not classify the industry — pick one to anchor the take rate math.'}
              </p>
            </div>
            <div>
              <Label htmlFor="step2-ticket">Average ticket (USD)</Label>
              <Input
                id="step2-ticket" type="number" step="0.01" min="0"
                value={p.avgTicketOverride}
                onChange={(e) => p.setAvgTicketOverride(e.target.value)}
                placeholder={p.research.suggested_avg_ticket_usd != null
                  ? String(p.research.suggested_avg_ticket_usd)
                  : 'e.g. 60'}
                disabled={p.submitting}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {p.research.suggested_avg_ticket_usd != null
                  ? <>Suggested: ${p.research.suggested_avg_ticket_usd} (confidence: {p.research.suggested_avg_ticket_confidence}). Leave blank to fall back to the industry default.</>
                  : 'Research could not find a credible ticket — leave blank to use the industry default, or type one.'}
              </p>
            </div>
          </div>

          {/* App-traffic mode: review research-found annual revenue + override */}
          {p.appTrafficMode && (
            <div className="rounded-md border border-violet-500/40 bg-violet-500/5 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">📱 Annual revenue (app traffic mode)</span>
                {p.research.suggested_annual_revenue_confidence && (
                  <Badge variant="outline" className="text-xs">
                    research: {p.research.suggested_annual_revenue_confidence}
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="step2-revenue" className="text-xs">Annual revenue USD <span className="text-muted-foreground font-normal">(override)</span></Label>
                  <Input
                    id="step2-revenue" type="number" min="0" step="1000"
                    value={p.annualRevenueOverride}
                    onChange={(e) => p.setAnnualRevenueOverride(e.target.value)}
                    placeholder={p.research.suggested_annual_revenue_usd != null ? String(p.research.suggested_annual_revenue_usd) : 'e.g. 8500000000'}
                    disabled={p.submitting}
                    className="h-9 text-sm font-mono"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {p.research.suggested_annual_revenue_usd != null
                      ? <>Suggested: ${p.research.suggested_annual_revenue_usd.toLocaleString('en-US')} — leave blank to use it.</>
                      : 'Research did not find revenue — input required to generate.'}
                  </p>
                </div>
                <div>
                  <Label className="text-xs">Sources (double-check)</Label>
                  {p.research.suggested_annual_revenue_source_urls.length > 0 ? (
                    <ul className="text-xs space-y-0.5 mt-1 max-h-24 overflow-y-auto pr-1">
                      {p.research.suggested_annual_revenue_source_urls.map((url, i) => (
                        <li key={i} className="truncate">
                          <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            {i + 1}. {url.replace(/^https?:\/\//, '').slice(0, 60)}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">No sources found by research.</p>
                  )}
                  {p.research.suggested_annual_revenue_evidence_quote && (
                    <p className="text-xs text-muted-foreground italic mt-2 pl-2 border-l-2 border-violet-500/30">
                      &ldquo;{p.research.suggested_annual_revenue_evidence_quote}&rdquo;
                    </p>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Math: TPV = revenue / take_rate ({selectedIndustry ? `${selectedIndustry.take_rate_pct}%` : 'industry %'}). Distributed across countries by share.
              </p>
            </div>
          )}

          <Separator />

          {/* Slide-4 payment stack — pre-filled with what research inferred,
              editable in place. Untouched columns fall back to auto on submit. */}
          <div className="rounded-md border">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b">
              <div className="font-medium text-sm">Payment stack <span className="text-muted-foreground font-normal">(slide 4)</span></div>
              {p.research.suggested_payment_stack?.inferred_from_region && (
                <Badge variant="outline" className="text-xs">inferred from region</Badge>
              )}
            </div>
            <div className="p-3 space-y-3">
              <p className="text-xs text-muted-foreground">
                These are the three columns shown on slide 4. Pre-filled with what research inferred
                {p.research.suggested_payment_stack?.inferred_from_region
                  ? ' (no specific public data — regional benchmarks). Edit to match what the prospect actually uses.'
                  : '. Edit any column to override what the deck shows.'}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StackColumnEditor
                  label="Acquirers"
                  placeholder="e.g. Chase Paymentech"
                  items={p.stackAcquirers}
                  touched={p.stackTouched.acquirers}
                  submitting={p.submitting}
                  onItemsChange={(next) => { p.setStackAcquirers(next); p.setStackTouched(t => ({ ...t, acquirers: true })) }}
                  onReset={() => { p.setStackAcquirers(p.research.suggested_payment_stack?.acquirers?.slice() ?? []); p.setStackTouched(t => ({ ...t, acquirers: false })) }}
                />
                <StackColumnEditor
                  label="Gateways / PSPs"
                  placeholder="e.g. Stripe"
                  items={p.stackGateways}
                  touched={p.stackTouched.gateways}
                  submitting={p.submitting}
                  onItemsChange={(next) => { p.setStackGateways(next); p.setStackTouched(t => ({ ...t, gateways: true })) }}
                  onReset={() => { p.setStackGateways(p.research.suggested_payment_stack?.gateways?.slice() ?? []); p.setStackTouched(t => ({ ...t, gateways: false })) }}
                />
                <StackColumnEditor
                  label="Payment methods"
                  placeholder="e.g. Visa, PIX"
                  items={p.stackMethods}
                  touched={p.stackTouched.methods}
                  submitting={p.submitting}
                  onItemsChange={(next) => { p.setStackMethods(next); p.setStackTouched(t => ({ ...t, methods: true })) }}
                  onReset={() => { p.setStackMethods(p.research.suggested_payment_stack?.methods?.slice() ?? []); p.setStackTouched(t => ({ ...t, methods: false })) }}
                />
              </div>
            </div>
          </div>

          {/* Per-region accordions */}
          {p.research.regions.map(region => (
            <div key={region.region} className="rounded-md border">
              <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b">
                <div className="font-medium text-sm">{region.label}</div>
                <Badge variant="secondary" className="text-xs">{region.countries.length} {region.countries.length === 1 ? 'country' : 'countries'}</Badge>
              </div>
              <div className="divide-y">
                {region.countries.map(country => {
                  const edit = p.countryEdits[country.iso]
                  if (!edit) return null
                  return (
                    <CountryRow
                      key={country.iso}
                      country={country}
                      edit={edit}
                      submitting={p.submitting}
                      onUpdate={(next) => p.setCountryEdits(prev => ({ ...prev, [country.iso]: next }))}
                    />
                  )
                })}
              </div>
            </div>
          ))}

          {p.error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                <div>{p.error}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <DialogFooter className="pt-3 border-t mt-2 shrink-0">
        <Button type="button" variant="ghost" onClick={p.onBack} disabled={p.submitting}>
          <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" /> Back
        </Button>
        <Button type="submit" disabled={p.submitting}>
          {p.submitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              Generating deck…
            </>
          ) : (
            'Generate SDR BC'
          )}
        </Button>
      </DialogFooter>
    </form>
  )
}

// ────────────────────────────────────────────────────────────────────────
// One editable slide-4 column (Acquirers / Gateways / Payment methods).
// Tag-style list: type + Enter (or blur) to add, × to remove. Reset restores
// the research-suggested values and clears the touched flag.
// ────────────────────────────────────────────────────────────────────────

interface StackColumnEditorProps {
  label: string
  placeholder: string
  items: string[]
  touched: boolean
  submitting: boolean
  onItemsChange: (next: string[]) => void
  onReset: () => void
}

function StackColumnEditor({ label, placeholder, items, touched, submitting, onItemsChange, onReset }: StackColumnEditorProps) {
  const [draft, setDraft] = useState('')

  function commitDraft() {
    const v = draft.trim()
    if (!v) return
    if (items.some(i => i.toLowerCase() === v.toLowerCase())) { setDraft(''); return }
    onItemsChange([...items, v])
    setDraft('')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <Label className="text-xs">{label}</Label>
        {touched && (
          <button
            type="button" disabled={submitting} onClick={onReset}
            className="text-xs inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" /> Reset
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[1.25rem]">
        {items.length === 0 && (
          <span className="text-xs text-muted-foreground italic">Empty — column hidden on slide 4</span>
        )}
        {items.map((it, idx) => (
          <span
            key={`${it}-${idx}`}
            className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-0.5 text-xs"
          >
            {it}
            <button
              type="button" disabled={submitting}
              onClick={() => onItemsChange(items.filter((_, i) => i !== idx))}
              className="text-muted-foreground hover:text-destructive"
              aria-label={`Remove ${it}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitDraft() } }}
        onBlur={commitDraft}
        placeholder={placeholder}
        disabled={submitting}
        className="h-8 text-sm"
      />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Per-country row in Step 2: legal entity tri-state + APM checkboxes
// ────────────────────────────────────────────────────────────────────────

interface CountryRowProps {
  country: ResearchCountry
  edit: CountryEditState
  submitting: boolean
  onUpdate: (next: CountryEditState) => void
}

function CountryRow({ country, edit, submitting, onUpdate }: CountryRowProps) {
  const sharePct = (country.share * 100).toFixed(country.share < 0.1 ? 2 : 1)
  const autoLegalLabel = (() => {
    const src = country.suggested_legal_entity_source
    if (src === 'ema_propagation') return 'Auto (EMA propagation: Yes — inherited from another EMA market)'
    if (country.suggested_legal_entity === true)  return 'Auto (research: Yes)'
    if (country.suggested_legal_entity === false) return 'Auto (research: No)'
    return 'Auto (research: unknown — defaults to No)'
  })()

  function toggleApm(apm: string, checked: boolean) {
    const next = checked
      ? Array.from(new Set([...edit.apms, apm]))
      : edit.apms.filter(a => a !== apm)
    onUpdate({ ...edit, apms: next, apms_touched: true })
  }

  function resetApms() {
    onUpdate({ ...edit, apms: country.suggested_existing_apms.slice(), apms_touched: false })
  }

  return (
    <div className="px-3 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{country.name}</span>
          <span className="text-xs text-muted-foreground">{country.iso}</span>
          <Badge variant="outline" className="text-xs">{sharePct}% share</Badge>
        </div>
      </div>

      {/* Legal entity tri-state */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground w-24">Local entity:</span>
        <div className="inline-flex rounded-md border">
          {(['auto', 'yes', 'no'] as const).map(opt => (
            <button
              key={opt} type="button" disabled={submitting}
              className={
                'px-2 py-1 text-xs capitalize first:rounded-l-md last:rounded-r-md transition-colors '
                + (edit.legal_entity === opt
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background hover:bg-muted')
              }
              onClick={() => onUpdate({ ...edit, legal_entity: opt })}
            >
              {opt === 'auto' ? 'Auto' : opt === 'yes' ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
        {edit.legal_entity === 'auto' && (
          <span className="text-muted-foreground italic">{autoLegalLabel}</span>
        )}
      </div>

      {/* APM checkboxes from catalog_apms */}
      {country.catalog_apms.length > 0 && (
        <div className="text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-muted-foreground">Existing APMs (uncheck or add from catalog):</span>
            {edit.apms_touched && (
              <button
                type="button" disabled={submitting}
                onClick={resetApms}
                className="text-xs inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" /> Reset to auto
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {country.catalog_apms.map(apm => {
              const id = `${country.iso}-${apm}`
              const checked = edit.apms.includes(apm)
              return (
                <label
                  key={apm} htmlFor={id}
                  className={
                    'flex items-center gap-1.5 rounded-md border px-2 py-1 cursor-pointer text-xs '
                    + (checked ? 'bg-primary/5 border-primary/40' : 'bg-background hover:bg-muted')
                  }
                >
                  <Checkbox
                    id={id} checked={checked}
                    onCheckedChange={(v) => toggleApm(apm, v === true)}
                    disabled={submitting} className="h-3.5 w-3.5"
                  />
                  <span>{apm}</span>
                </label>
              )
            })}
            {/* Any APM that came from research but isn't in the catalog: render it
                disabled so the AE sees it but can't toggle (catalog drives valid options). */}
            {edit.apms.filter(a => !country.catalog_apms.includes(a)).map(apm => (
              <label key={`extra-${apm}`} className="flex items-center gap-1.5 rounded-md border border-dashed px-2 py-1 text-xs bg-muted/30">
                <Checkbox
                  checked={true}
                  onCheckedChange={(v) => toggleApm(apm, v === true)}
                  disabled={submitting} className="h-3.5 w-3.5"
                />
                <span className="italic">{apm}</span>
                <span className="text-muted-foreground">(from research)</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
