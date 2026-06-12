import { useState, useEffect, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Sparkles, Loader2, AlertCircle, ArrowLeft, X, Plus, RotateCcw } from 'lucide-react'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { invokeWithFreshAuth } from '@/lib/edge-functions'
import { toast } from 'sonner'

// Two-step SS deck wizard. Step 1 is just lookup inputs + vendor (AE) info.
// On submit it calls ss-deck-research which runs the deep-research pipeline
// (Firecrawl + chief-deep-research-company) and returns suggested PSPs from
// the merchant's top region. Step 2 lets the AE confirm or edit those PSPs
// + missing APMs. Whatever they submit becomes the slide-3 / slide-4 stack.

// ── Shared types (mirror ss-deck-research / ss-deck-generate shapes) ──

interface PspSuggestion { name: string; role: string | null }
interface MissingMethod { method: string; market: string }

interface SsResearchResponse {
  domain: string | null
  region: 'us' | 'lat' | 'ema' | 'apa' | null
  region_label: string | null
  content_source: 'research' | 'regional_fallback' | 'template'
  suggested_psps: PspSuggestion[]
  regional_catalog_acquirers: string[]
  regional_catalog_gateways: string[]
  suggested_missing_methods: MissingMethod[]
}

interface SsDeckSuccess {
  id: string
  slug: string
  url: string
  company_name: string
  mode: string
  content_source: 'research' | 'regional_fallback' | 'template'
  region: string | null
  domain: string | null
  acquirers_count: number
  acquirers: string[]
  created_at: string
}

interface SsDeckError {
  error: string
  reason?: string
}

interface NewSsDeckFormProps {
  open: boolean
  onClose: () => void
  onCreated?: (slug: string, url: string) => void
  // Edit mode: pre-fill clientName/website/email from existing slug.
  editTarget?: { clientName: string; website?: string; createdByEmail?: string } | null
}

export function NewSsDeckForm({ open, onClose, onCreated, editTarget = null }: NewSsDeckFormProps) {
  const { user } = useAuth()
  const qc = useQueryClient()

  // ── Wizard state ──
  const [step, setStep] = useState<1 | 2>(1)
  const [researchResult, setResearchResult] = useState<SsResearchResponse | null>(null)

  // ── Step 1 fields ──
  const [clientName, setClientName] = useState('')
  const [website, setWebsite] = useState('')
  const [createdByEmail, setCreatedByEmail] = useState('')
  const [vendorName, setVendorName] = useState('')
  const [vendorTitle, setVendorTitle] = useState('')
  // Trilingual deck output. Defaults match the automatic cadence step policy
  // (en/USD). AE can override per-merchant when generating manually — pt
  // typically pairs with BRL, es with the LATAM ccy of the target market.
  const [language, setLanguage] = useState<'es' | 'en' | 'pt'>('en')
  const [currency, setCurrency] = useState<string>('USD')

  // ── Step 2 fields ──
  // PSP selections: union of (suggested ∪ regional catalog) presented as
  // checkboxes; extras typed in freetext appear at the end. `psps` carries
  // the canonical selected list that will be submitted.
  const [pspChecks, setPspChecks] = useState<Record<string, boolean>>({})
  const [pspExtraInput, setPspExtraInput] = useState('')
  const [pspExtras, setPspExtras] = useState<string[]>([])
  // Missing APMs: editable chip list. Each row has method + market text.
  const [missingMethods, setMissingMethods] = useState<MissingMethod[]>([])
  const [newApmMethod, setNewApmMethod] = useState('')
  const [newApmMarket, setNewApmMarket] = useState('')

  // ── Shared error/loading ──
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorReason, setErrorReason] = useState<string | null>(null)

  useEffect(() => {
    if (open && user?.email && !createdByEmail) {
      setCreatedByEmail(user.email)
    }
  }, [open, user?.email, createdByEmail])

  // Pre-fill Step 1 when editTarget arrives (Edit clicked from list dropdown).
  useEffect(() => {
    if (open && editTarget) {
      setClientName(editTarget.clientName || '')
      setWebsite(editTarget.website || '')
      if (editTarget.createdByEmail) setCreatedByEmail(editTarget.createdByEmail)
    }
  }, [open, editTarget])

  // When research lands, seed Step 2 state.
  useEffect(() => {
    if (!researchResult) return
    const initial: Record<string, boolean> = {}
    // Pre-check suggested PSPs
    for (const p of researchResult.suggested_psps) initial[p.name] = true
    // Include catalog (unchecked by default) so AE can opt-in
    for (const n of researchResult.regional_catalog_acquirers) {
      if (!(n in initial)) initial[n] = false
    }
    for (const n of researchResult.regional_catalog_gateways) {
      if (!(n in initial)) initial[n] = false
    }
    setPspChecks(initial)
    setPspExtras([])
    setMissingMethods(researchResult.suggested_missing_methods.slice())
  }, [researchResult])

  function resetForm() {
    setStep(1)
    setResearchResult(null)
    setClientName('')
    setWebsite('')
    setVendorName('')
    setVendorTitle('')
    setLanguage('en')
    setCurrency('USD')
    setPspChecks({})
    setPspExtras([])
    setPspExtraInput('')
    setMissingMethods([])
    setNewApmMethod('')
    setNewApmMarket('')
    setError(null)
    setErrorReason(null)
  }

  function handleClose() {
    if (submitting) return
    resetForm()
    onClose()
  }

  // ──────────────────────────────────────────────────────────────────────
  // Step 1 submit → ss-deck-research → advance to Step 2
  // ──────────────────────────────────────────────────────────────────────
  async function handleStep1Submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setErrorReason(null)

    if (!clientName.trim()) { setError('Client name is required'); return }
    if (!createdByEmail.trim()) { setError('Your connected Gmail is required'); return }

    const payload: Record<string, unknown> = {
      company_name: clientName.trim(),
      createdByEmail: createdByEmail.trim(),
    }
    if (website.trim()) payload.website = website.trim()

    setSubmitting(true)
    try {
      const { data, error: invokeErr } = await invokeWithFreshAuth<SsResearchResponse>('ss-deck-research', {
        body: payload,
        timeoutMs: 120_000,
      })
      if (invokeErr) {
        const ctx = (invokeErr as { context?: Response }).context
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = await ctx.clone().json() as SsDeckError | null
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
      const result = data as SsResearchResponse | null
      if (!result) throw new Error('Research returned no data')
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
  // Step 2 submit → ss-deck-generate with overrides → persist deck
  // ──────────────────────────────────────────────────────────────────────
  async function handleStep2Submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setErrorReason(null)
    if (!researchResult) { setError('Missing research result'); return }

    const selectedPsps = [
      ...Object.entries(pspChecks).filter(([, v]) => v).map(([name]) => ({ name, role: null })),
      ...pspExtras.map(name => ({ name, role: null })),
    ]
    if (selectedPsps.length === 0) {
      setError('Select at least 1 PSP for the deck (or type one in extras)')
      return
    }

    const payload: Record<string, unknown> = {
      company_name: clientName.trim(),
      createdByEmail: createdByEmail.trim(),
      psps_override: selectedPsps,
      missing_methods_override: missingMethods,
      language,
      currency,
    }
    if (website.trim()) payload.website = website.trim()
    if (vendorName.trim()) payload.vendor_name = vendorName.trim()
    if (vendorTitle.trim()) payload.vendor_title = vendorTitle.trim()

    setSubmitting(true)
    try {
      const { data, error: invokeErr } = await invokeWithFreshAuth<SsDeckSuccess>('ss-deck-generate', {
        body: payload,
        timeoutMs: 120_000,
      })
      if (invokeErr) {
        const ctx = (invokeErr as { context?: Response }).context
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = await ctx.clone().json() as SsDeckError | null
            if (body?.error) throw new Error(body.error)
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message && parseErr.message !== 'Unexpected end of JSON input') {
              throw parseErr
            }
          }
        }
        throw invokeErr
      }
      const result = data as SsDeckSuccess | null
      if (!result?.slug) throw new Error('Invalid server response (no slug)')

      qc.invalidateQueries({ queryKey: ['merchants_ss'] })
      toast.success(`SS Deck generated for ${clientName.trim()}`, {
        description: result.url,
        action: { label: 'Open', onClick: () => window.open(result.url, '_blank', 'noopener') },
      })
      onCreated?.(result.slug, result.url)
      handleClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error generating the SS deck'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  function addExtraPsp() {
    const v = pspExtraInput.trim()
    if (!v) return
    if (pspExtras.includes(v) || pspChecks[v]) {
      setPspExtraInput('')
      return
    }
    setPspExtras([...pspExtras, v])
    setPspExtraInput('')
  }

  function removeExtraPsp(name: string) {
    setPspExtras(pspExtras.filter(p => p !== name))
  }

  function addApm() {
    const m = newApmMethod.trim()
    const mk = newApmMarket.trim()
    if (!m || !mk) return
    setMissingMethods([...missingMethods, { method: m, market: mk }])
    setNewApmMethod('')
    setNewApmMarket('')
  }

  function removeApm(idx: number) {
    setMissingMethods(missingMethods.filter((_, i) => i !== idx))
  }

  function resetApms() {
    if (researchResult) setMissingMethods(researchResult.suggested_missing_methods.slice())
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="max-w-3xl max-h-[90vh] !grid-rows-none !grid-cols-none !flex !flex-col !gap-0 overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
            New SS Deck
            <Badge variant="outline" className="ml-2 text-xs">Step {step} of 2</Badge>
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? 'Client + vendor info. We will research the top region and surface PSP suggestions in step 2.'
              : 'Confirm or edit the PSP stack + missing APMs. These drive slides 3 (Diagnostic) and 4 (Yuno Solve).'}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <Step1Form
            clientName={clientName} setClientName={setClientName}
            website={website} setWebsite={setWebsite}
            createdByEmail={createdByEmail} setCreatedByEmail={setCreatedByEmail}
            vendorName={vendorName} setVendorName={setVendorName}
            vendorTitle={vendorTitle} setVendorTitle={setVendorTitle}
            language={language} setLanguage={setLanguage}
            currency={currency} setCurrency={setCurrency}
            submitting={submitting}
            error={error} errorReason={errorReason}
            onSubmit={handleStep1Submit}
            onCancel={handleClose}
          />
        ) : (
          <Step2Form
            research={researchResult!}
            pspChecks={pspChecks} setPspChecks={setPspChecks}
            pspExtras={pspExtras}
            pspExtraInput={pspExtraInput} setPspExtraInput={setPspExtraInput}
            addExtraPsp={addExtraPsp} removeExtraPsp={removeExtraPsp}
            missingMethods={missingMethods}
            newApmMethod={newApmMethod} setNewApmMethod={setNewApmMethod}
            newApmMarket={newApmMarket} setNewApmMarket={setNewApmMarket}
            addApm={addApm} removeApm={removeApm} resetApms={resetApms}
            submitting={submitting}
            error={error}
            onBack={() => { setStep(1); setError(null) }}
            onSubmit={handleStep2Submit}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Step 1 — Client + vendor lookup
// ────────────────────────────────────────────────────────────────────────

interface Step1Props {
  clientName: string; setClientName: (v: string) => void
  website: string; setWebsite: (v: string) => void
  createdByEmail: string; setCreatedByEmail: (v: string) => void
  vendorName: string; setVendorName: (v: string) => void
  vendorTitle: string; setVendorTitle: (v: string) => void
  language: 'es' | 'en' | 'pt'; setLanguage: (v: 'es' | 'en' | 'pt') => void
  currency: string; setCurrency: (v: string) => void
  submitting: boolean
  error: string | null; errorReason: string | null
  onSubmit: (e: FormEvent) => void
  onCancel: () => void
}

const LANG_OPTIONS: ReadonlyArray<{ value: 'es' | 'en' | 'pt'; label: string }> = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
  { value: 'pt', label: 'Português' },
]

const CURRENCY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'USD', label: 'USD · US dollar' },
  { value: 'MXN', label: 'MXN · Mexican peso' },
  { value: 'COP', label: 'COP · Colombian peso' },
  { value: 'BRL', label: 'BRL · Brazilian real' },
  { value: 'EUR', label: 'EUR · Euro' },
]

function Step1Form(p: Step1Props) {
  return (
    <form onSubmit={p.onSubmit} className="flex flex-col flex-1 min-h-0 mt-2 space-y-4 overflow-y-auto pr-1">
      <div>
        <Label htmlFor="ss-client">Client *</Label>
        <Input
          id="ss-client" value={p.clientName}
          onChange={(e) => p.setClientName(e.target.value)}
          placeholder="Free Now" required disabled={p.submitting} autoFocus
        />
      </div>

      <div>
        <Label htmlFor="ss-website">Website <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Input
          id="ss-website" value={p.website}
          onChange={(e) => p.setWebsite(e.target.value)}
          placeholder="free-now.com" disabled={p.submitting}
        />
        <p className="text-xs text-muted-foreground mt-1">Blank → auto-resolve via Firecrawl.</p>
      </div>

      <div>
        <Label htmlFor="ss-email">Your connected Gmail *</Label>
        <Input
          id="ss-email" type="email" value={p.createdByEmail}
          onChange={(e) => p.setCreatedByEmail(e.target.value)}
          placeholder="you@company.com" required disabled={p.submitting}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="ss-vname">Your name <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input
            id="ss-vname" value={p.vendorName}
            onChange={(e) => p.setVendorName(e.target.value)}
            placeholder="Rasheed Bayter" disabled={p.submitting}
          />
        </div>
        <div>
          <Label htmlFor="ss-vtitle">Your title <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input
            id="ss-vtitle" value={p.vendorTitle}
            onChange={(e) => p.setVendorTitle(e.target.value)}
            placeholder="Sales · LATAM" disabled={p.submitting}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">Shown on the cover + closing CTA as &ldquo;Prepared by&rdquo;.</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-sm">Deck language</Label>
          <div className="mt-1 inline-flex rounded-md border bg-background p-0.5">
            {LANG_OPTIONS.map(opt => {
              const selected = p.language === opt.value
              return (
                <button
                  key={opt.value} type="button"
                  onClick={() => p.setLanguage(opt.value)}
                  disabled={p.submitting}
                  className={
                    'px-3 py-1 text-xs rounded transition-colors '
                    + (selected ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:text-foreground')
                  }
                  aria-pressed={selected}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Slide copy + number formatting.</p>
        </div>
        <div>
          <Label htmlFor="ss-currency" className="text-sm">Currency</Label>
          <Select value={p.currency} onValueChange={p.setCurrency} disabled={p.submitting}>
            <SelectTrigger id="ss-currency" className="mt-1">
              <SelectValue placeholder="Select currency" />
            </SelectTrigger>
            <SelectContent>
              {CURRENCY_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">Used for TPV + savings figures.</p>
        </div>
      </div>

      {p.error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
            <div>{p.error}</div>
          </div>
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={p.onCancel} disabled={p.submitting}>Cancel</Button>
        <Button type="submit" disabled={p.submitting}>
          {p.submitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              Researching… (~30-60s)
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
// Step 2 — PSPs + missing APMs override
// ────────────────────────────────────────────────────────────────────────

interface Step2Props {
  research: SsResearchResponse
  pspChecks: Record<string, boolean>
  setPspChecks: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  pspExtras: string[]
  pspExtraInput: string; setPspExtraInput: (v: string) => void
  addExtraPsp: () => void; removeExtraPsp: (name: string) => void
  missingMethods: MissingMethod[]
  newApmMethod: string; setNewApmMethod: (v: string) => void
  newApmMarket: string; setNewApmMarket: (v: string) => void
  addApm: () => void; removeApm: (idx: number) => void; resetApms: () => void
  submitting: boolean
  error: string | null
  onBack: () => void
  onSubmit: (e: FormEvent) => void
}

function Step2Form(p: Step2Props) {
  const suggestedNames = new Set(p.research.suggested_psps.map(x => x.name))
  // Two columns: acquirers + gateways. Within each column show suggested
  // entries first (with a small "research" badge), then the rest of the
  // catalog. Keeps the most-likely picks at the top of the eye scan.
  function pspRows(catalog: string[]) {
    return [
      ...catalog.filter(n => suggestedNames.has(n)),
      ...catalog.filter(n => !suggestedNames.has(n)),
    ]
  }

  function togglePsp(name: string, checked: boolean) {
    p.setPspChecks(prev => ({ ...prev, [name]: checked }))
  }

  // Any PSP in `pspChecks` that wasn't in the catalogs (rare edge case from
  // an earlier research run) — render under "Other detected" so it doesn't
  // disappear.
  const catalogAll = new Set([
    ...p.research.regional_catalog_acquirers,
    ...p.research.regional_catalog_gateways,
  ])
  const detectedExtras = Object.keys(p.pspChecks).filter(n => !catalogAll.has(n))

  return (
    <form onSubmit={p.onSubmit} className="flex flex-col flex-1 min-h-0 mt-2">
      <div className="flex-1 min-h-0 overflow-y-auto pr-2">
        <div className="space-y-4 pb-2">
          {/* Research summary banner */}
          <div className="rounded-md border bg-muted/30 p-3 text-xs flex flex-wrap items-center gap-x-4 gap-y-1">
            {p.research.domain && <span><span className="text-muted-foreground">Domain:</span> <span className="font-mono">{p.research.domain}</span></span>}
            {p.research.region_label && <span><span className="text-muted-foreground">Top region:</span> {p.research.region_label}</span>}
            <span><span className="text-muted-foreground">Stack source:</span> {p.research.content_source === 'research' ? 'detected from research' : p.research.content_source === 'regional_fallback' ? 'regional fallback (research weak)' : 'template'}</span>
          </div>

          {/* PSPs — acquirers column */}
          <div>
            <Label className="text-sm">Current PSP stack <span className="text-muted-foreground font-normal">(slides 3 + 4)</span></Label>
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              Pre-checked = what research suggests. Add more from the regional catalog or type extras below.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Acquirers</div>
                <div className="flex flex-wrap gap-2">
                  {pspRows(p.research.regional_catalog_acquirers).map(name => {
                    const checked = !!p.pspChecks[name]
                    const isSuggested = suggestedNames.has(name)
                    const id = `psp-acq-${name}`
                    return (
                      <label
                        key={name} htmlFor={id}
                        className={
                          'flex items-center gap-1.5 rounded-md border px-2 py-1 cursor-pointer text-xs '
                          + (checked ? 'bg-primary/5 border-primary/40' : 'bg-background hover:bg-muted')
                        }
                      >
                        <Checkbox
                          id={id} checked={checked}
                          onCheckedChange={(v) => togglePsp(name, v === true)}
                          disabled={p.submitting} className="h-3.5 w-3.5"
                        />
                        <span>{name}</span>
                        {isSuggested && <span className="text-[9px] text-primary font-semibold uppercase tracking-wider ml-1">research</span>}
                      </label>
                    )
                  })}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Gateways / Orchestrators</div>
                <div className="flex flex-wrap gap-2">
                  {pspRows(p.research.regional_catalog_gateways).map(name => {
                    const checked = !!p.pspChecks[name]
                    const isSuggested = suggestedNames.has(name)
                    const id = `psp-gw-${name}`
                    return (
                      <label
                        key={name} htmlFor={id}
                        className={
                          'flex items-center gap-1.5 rounded-md border px-2 py-1 cursor-pointer text-xs '
                          + (checked ? 'bg-primary/5 border-primary/40' : 'bg-background hover:bg-muted')
                        }
                      >
                        <Checkbox
                          id={id} checked={checked}
                          onCheckedChange={(v) => togglePsp(name, v === true)}
                          disabled={p.submitting} className="h-3.5 w-3.5"
                        />
                        <span>{name}</span>
                        {isSuggested && <span className="text-[9px] text-primary font-semibold uppercase tracking-wider ml-1">research</span>}
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Detected outside catalog */}
            {detectedExtras.length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Other detected</div>
                <div className="flex flex-wrap gap-2">
                  {detectedExtras.map(name => {
                    const checked = !!p.pspChecks[name]
                    const id = `psp-x-${name}`
                    return (
                      <label key={name} htmlFor={id}
                        className={
                          'flex items-center gap-1.5 rounded-md border border-dashed px-2 py-1 cursor-pointer text-xs italic '
                          + (checked ? 'bg-primary/5 border-primary/40' : 'bg-background hover:bg-muted')
                        }>
                        <Checkbox id={id} checked={checked} onCheckedChange={(v) => togglePsp(name, v === true)} disabled={p.submitting} className="h-3.5 w-3.5" />
                        <span>{name}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Freetext extras */}
            <div className="mt-3">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Add extras (not in catalog)</div>
              <div className="flex gap-2 items-center">
                <Input
                  value={p.pspExtraInput}
                  onChange={(e) => p.setPspExtraInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); p.addExtraPsp() } }}
                  placeholder="Type a PSP name + Enter (e.g. Mercado Pago Brazil)"
                  disabled={p.submitting}
                  className="h-9 text-sm"
                />
                <Button type="button" variant="outline" size="sm" onClick={p.addExtraPsp} disabled={p.submitting}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {p.pspExtras.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {p.pspExtras.map(name => (
                    <span key={name} className="inline-flex items-center gap-1 rounded-md border bg-primary/5 border-primary/40 px-2 py-1 text-xs">
                      {name}
                      <button type="button" onClick={() => p.removeExtraPsp(name)} disabled={p.submitting} className="text-muted-foreground hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Missing APMs */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm">Alternative payment methods missing <span className="text-muted-foreground font-normal">(slide 3 chips)</span></Label>
              <button type="button" onClick={p.resetApms} disabled={p.submitting} className="text-xs inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                <RotateCcw className="h-3 w-3" /> Reset to default
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Method · market pairs. Defaults are the global classics (UPI/Pix/iDEAL/…). Edit to reflect what the client actually doesn&apos;t offer.
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {p.missingMethods.map((apm, i) => (
                <span key={`${apm.method}-${apm.market}-${i}`} className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs">
                  <span className="font-medium">{apm.method}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{apm.market}</span>
                  <button type="button" onClick={() => p.removeApm(i)} disabled={p.submitting} className="text-muted-foreground hover:text-destructive ml-1">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
              <Input
                value={p.newApmMethod}
                onChange={(e) => p.setNewApmMethod(e.target.value)}
                placeholder="Method (e.g. SPEI)"
                disabled={p.submitting}
                className="h-9 text-sm"
              />
              <Input
                value={p.newApmMarket}
                onChange={(e) => p.setNewApmMarket(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); p.addApm() } }}
                placeholder="Market (e.g. Mexico)"
                disabled={p.submitting}
                className="h-9 text-sm"
              />
              <Button type="button" variant="outline" size="sm" onClick={p.addApm} disabled={p.submitting}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

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
            'Generate SS Deck'
          )}
        </Button>
      </DialogFooter>
    </form>
  )
}
