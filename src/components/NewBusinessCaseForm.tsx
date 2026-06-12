import { useState, useEffect, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, FileText, Loader2, Pencil } from 'lucide-react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'
import { invokeWithFreshAuth } from '@/lib/edge-functions'
import { toast } from 'sonner'

interface CountryRow {
  code: string
  name: string
  tx: string
  mdrBps: string
  avgTicket: string
}

interface RateTierRow {
  upToTx: string  // monthly threshold (last row is "" for unlimited)
  ratePerTx: string
}

type PricingModel = 'flat' | 'tramos' | 'tiers'

// Canonical list — must mirror ADDITIONAL_SERVICES in bc-components.jsx and
// ADDITIONAL_SERVICE_IDS on the backend. Order is the order the deck shows.
const ADDITIONAL_SERVICES_DEFINITIONS: Array<{ id: string; label: string; defaultPrice: number }> = [
  { id: 'risk_conditions',          label: 'Risk conditions',                       defaultPrice: 0.0305 },
  { id: 'external_3ds_api',         label: 'External 3DS API call',                 defaultPrice: 0.0207 },
  { id: 'monitoring_alerts',        label: 'Monitoring and alerts',                 defaultPrice: 0.0103 },
  { id: 'smart_routing',            label: 'Smart Routing',                         defaultPrice: 0.0101 },
  { id: 'network_tokens',           label: 'Network Tokens',                        defaultPrice: 0.0150 },
  { id: 'fraud_prevention_success', label: 'Successful transaction (fraud prevention)', defaultPrice: 0.0202 },
  { id: '3ds_transaction',          label: '3DS transaction',                       defaultPrice: 0.0353 },
]
interface AdditionalServiceRow {
  enabled: boolean
  price: string  // input value (kept as string for free typing; parsed on submit)
}

// Mirrors the SUPPORTED_CURRENCIES in presentation-create / presentation-update.
// Keep in sync if you add a currency on the backend.
type Currency = 'USD' | 'MXN' | 'BRL' | 'COP' | 'ARS' | 'CLP' | 'PEN' | 'EUR' | 'GBP'
const CURRENCY_OPTIONS: Array<{ code: Currency; label: string }> = [
  { code: 'USD', label: 'USD · US Dollar' },
  { code: 'MXN', label: 'MXN · Peso mexicano' },
  { code: 'BRL', label: 'BRL · Real brasileiro' },
  { code: 'COP', label: 'COP · Peso colombiano' },
  { code: 'ARS', label: 'ARS · Peso argentino' },
  { code: 'CLP', label: 'CLP · Peso chileno' },
  { code: 'PEN', label: 'PEN · Sol peruano' },
  { code: 'EUR', label: 'EUR · Euro' },
  { code: 'GBP', label: 'GBP · Pound sterling' },
]

// Shape stored in `presentations.defaults` JSONB. Optional because `editTarget` may
// arrive before the row's defaults have been fetched (loaded === false).
interface BCDefaults {
  clientName?: string
  locale?: 'es' | 'en' | 'pt'
  currency?: Currency
  additionalServices?: Record<string, { enabled?: boolean; price?: number }>
  countries?: Array<{ code: string; name: string; tx: number; mdrBps?: number; avgTicket?: number }>
  activeMarkets?: number
  currentAPMs?: number
  currentProviders?: number
  todayProviders?: string[]
  avgTicket?: number
  currentApproval?: number
  currentMDR?: number
  grossMargin?: number
  approvalLiftPp?: number
  mdrReductionBps?: number
  pricingModel?: 'flat' | 'tramos' | 'tiers'
  ratePerTx?: number
  rateTiers?: Array<{ upToTx: number | null; ratePerTx: number }>
  minTxAnnual?: number
  monthlySaaS?: number
  reconciliationFee?: number
  numNewIntegrations?: number
  salesName?: string
  salesEmail?: string
  salesTitle?: string
}

export interface EditTarget {
  slug: string
  clientName: string
  createdByEmail: string | null
  defaults: BCDefaults
}

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (slug: string, url: string) => void
  editTarget?: EditTarget | null
}

// Parse a plain integer with optional commas/spaces. Returns null on invalid.
// Rejects K/M/B suffixes — inputs are now plain monthly numbers (e.g. 1500000 for 1.5M).
function parseTxMonthly(s: string): number | null {
  const cleaned = s.replace(/[,\s]/g, '').trim()
  if (!cleaned || !/^\d+$/.test(cleaned)) return null
  const n = parseInt(cleaned, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

function parseNum(s: string): number | null {
  const n = parseFloat(s.replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : null
}

// Stacked / progressive: each tier charges its rate for the slice of tx in it.
function computeTramosFee(tx: number, tiers: Array<{ upToTx: number | null; ratePerTx: number }>): number {
  if (!tiers.length) return 0
  let fee = 0, remaining = tx, prev = 0
  for (const t of tiers) {
    if (remaining <= 0) break
    const cap = t.upToTx == null ? remaining : Math.max(0, t.upToTx - prev)
    const take = Math.min(remaining, cap)
    fee += take * t.ratePerTx
    remaining -= take
    prev = t.upToTx ?? prev
  }
  return fee
}

// Whole-volume by bracket: charge tx × rate of bracket where tx falls.
function computeTiersFee(tx: number, tiers: Array<{ upToTx: number | null; ratePerTx: number }>): number {
  if (!tiers.length) return 0
  for (const t of tiers) {
    if (t.upToTx == null || tx <= t.upToTx) return tx * t.ratePerTx
  }
  return tx * tiers[tiers.length - 1].ratePerTx
}

function fmtMoney(n: number, currency: Currency = 'USD'): string {
  if (!Number.isFinite(n)) return '—'
  // Intl.NumberFormat handles all ISO 4217 codes — for COP/MXN/BRL it picks the
  // local symbol convention. Locale 'en-US' keeps thousands separators consistent.
  return n.toLocaleString('en-US', { style: 'currency', currency, maximumFractionDigits: 0 })
}

export function NewBusinessCaseForm({ open, onClose, onCreated, editTarget }: Props) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isEdit = !!editTarget

  // Identity / language
  const [createdByEmail, setCreatedByEmail] = useState(user?.email || '')
  const [clientName, setClientName] = useState('')
  const [locale, setLocale] = useState<'es' | 'en' | 'pt'>('en')
  const [currency, setCurrency] = useState<Currency>('USD')

  // Countries — start with one row
  const [countries, setCountries] = useState<CountryRow[]>([
    { code: '', name: '', tx: '', mdrBps: '', avgTicket: '' },
  ])

  // Presence
  const [activeMarkets, setActiveMarkets] = useState('')
  const [currentAPMs, setCurrentAPMs] = useState('')
  const [currentProviders, setCurrentProviders] = useState('')
  // Comma- or newline-separated list of provider names. When non-empty, the
  // edge function uses these instead of running Firecrawl. Drives slide 11
  // "Tu stack hoy" so the AE controls exactly which logos/names show up.
  const [todayProvidersList, setTodayProvidersList] = useState('')

  // Globals
  const [avgTicket, setAvgTicket] = useState('')
  const [currentApproval, setCurrentApproval] = useState('')
  const [currentMDR, setCurrentMDR] = useState('')
  const [grossMargin, setGrossMargin] = useState('4')
  // Client-tunable Yuno levers — blank means "use backend defaults" (7.4 pp / 38 bps).
  // Drive Lever 1 (approvals incremental TPV) and Lever 2 (MDR savings) on the deck.
  const [approvalLiftPp, setApprovalLiftPp] = useState('')
  const [mdrReductionBps, setMdrReductionBps] = useState('')

  // Pricing
  const [pricingModel, setPricingModel] = useState<PricingModel>('flat')
  const [ratePerTx, setRatePerTx] = useState('')
  const [rateTiers, setRateTiers] = useState<RateTierRow[]>([
    { upToTx: '', ratePerTx: '' },  // single unlimited row by default
  ])
  const [minTxMonthly, setMinTxMonthly] = useState('')  // user enters monthly; converted ×12 to minTxAnnual on submit
  const [monthlySaaS, setMonthlySaaS] = useState('')
  const [reconciliationFee, setReconciliationFee] = useState('0')

  // Operations
  const [numNewIntegrations, setNumNewIntegrations] = useState('0')

  // Sales rep
  const [salesName, setSalesName] = useState('')
  const [salesEmail, setSalesEmail] = useState('')
  const [salesTitle, setSalesTitle] = useState('')

  // Additional services. Initial state: all enabled with default prices.
  const [additionalServices, setAdditionalServices] = useState<Record<string, AdditionalServiceRow>>(() => {
    const init: Record<string, AdditionalServiceRow> = {}
    for (const svc of ADDITIONAL_SERVICES_DEFINITIONS) {
      init[svc.id] = { enabled: true, price: String(svc.defaultPrice) }
    }
    return init
  })
  function toggleService(id: string) {
    setAdditionalServices(prev => ({ ...prev, [id]: { ...prev[id], enabled: !prev[id].enabled } }))
  }
  function setServicePrice(id: string, price: string) {
    setAdditionalServices(prev => ({ ...prev, [id]: { ...prev[id], price } }))
  }

  function resetForm() {
    setClientName('')
    setLocale('en')
    setCurrency('USD')
    setCountries([{ code: '', name: '', tx: '', mdrBps: '', avgTicket: '' }])
    setActiveMarkets('')
    setCurrentAPMs('')
    setCurrentProviders('')
    setTodayProvidersList('')
    setAvgTicket('')
    setCurrentApproval('')
    setCurrentMDR('')
    setGrossMargin('4')
    setApprovalLiftPp('')
    setMdrReductionBps('')
    setPricingModel('flat')
    setRatePerTx('')
    setRateTiers([{ upToTx: '', ratePerTx: '' }])
    setMinTxMonthly('')
    setMonthlySaaS('')
    setReconciliationFee('0')
    setNumNewIntegrations('0')
    setSalesName('')
    setSalesEmail('')
    setSalesTitle('')
    const initSvc: Record<string, AdditionalServiceRow> = {}
    for (const svc of ADDITIONAL_SERVICES_DEFINITIONS) initSvc[svc.id] = { enabled: true, price: String(svc.defaultPrice) }
    setAdditionalServices(initSvc)
    setError(null)
  }

  // Hydrate form from editTarget when it changes. DB stores annual tx values; UI is
  // monthly, so divide by 12 at the boundary (mirrors the ×12 done on submit). Empty
  // editTarget (close → reopen for new BC) reverts to a clean form.
  useEffect(() => {
    if (!open) return
    if (!editTarget) {
      resetForm()
      setCreatedByEmail(user?.email || '')
      return
    }
    const d = editTarget.defaults || {}
    setError(null)
    setClientName(editTarget.clientName || d.clientName || '')
    setCreatedByEmail(editTarget.createdByEmail || user?.email || '')
    setLocale((d.locale as 'es' | 'en' | 'pt') || 'en')
    setCurrency((d.currency as Currency) || 'USD')
    if (Array.isArray(d.countries) && d.countries.length > 0) {
      setCountries(d.countries.map((c) => ({
        code: String(c.code || ''),
        name: String(c.name || ''),
        // DB stores annual tx; UI shows monthly. Round to int (form parser rejects decimals).
        tx: c.tx ? String(Math.round(c.tx / 12)) : '',
        mdrBps: c.mdrBps != null ? String(c.mdrBps) : '',
        avgTicket: c.avgTicket != null ? String(c.avgTicket) : '',
      })))
    } else {
      setCountries([{ code: '', name: '', tx: '', mdrBps: '', avgTicket: '' }])
    }
    setActiveMarkets(d.activeMarkets != null ? String(d.activeMarkets) : '')
    setCurrentAPMs(d.currentAPMs != null ? String(d.currentAPMs) : '')
    setCurrentProviders(d.currentProviders != null ? String(d.currentProviders) : '')
    setTodayProvidersList(Array.isArray(d.todayProviders) ? d.todayProviders.join(', ') : '')
    setAvgTicket(d.avgTicket != null ? String(d.avgTicket) : '')
    setCurrentApproval(d.currentApproval != null ? String(d.currentApproval) : '')
    setCurrentMDR(d.currentMDR != null ? String(d.currentMDR) : '')
    setGrossMargin(d.grossMargin != null ? String(d.grossMargin) : '4')
    setApprovalLiftPp(d.approvalLiftPp != null ? String(d.approvalLiftPp) : '')
    setMdrReductionBps(d.mdrReductionBps != null ? String(d.mdrReductionBps) : '')
    setPricingModel((d.pricingModel as PricingModel) || 'flat')
    setRatePerTx(d.ratePerTx ? String(d.ratePerTx) : '')
    if (Array.isArray(d.rateTiers) && d.rateTiers.length > 0) {
      // Tiers store annual upToTx; UI is monthly. Last tier (unlimited) keeps empty string.
      setRateTiers(d.rateTiers.map((t, i, arr) => ({
        upToTx: i === arr.length - 1 || t.upToTx == null ? '' : String(Math.round(t.upToTx / 12)),
        ratePerTx: String(t.ratePerTx),
      })))
    } else {
      setRateTiers([{ upToTx: '', ratePerTx: '' }])
    }
    setMinTxMonthly(d.minTxAnnual ? String(Math.round(d.minTxAnnual / 12)) : '')
    setMonthlySaaS(d.monthlySaaS != null ? String(d.monthlySaaS) : '')
    setReconciliationFee(d.reconciliationFee != null ? String(d.reconciliationFee) : '0')
    setNumNewIntegrations(d.numNewIntegrations != null ? String(d.numNewIntegrations) : '0')
    setSalesName(d.salesName || '')
    setSalesEmail(d.salesEmail || '')
    setSalesTitle(d.salesTitle || '')
    // Hydrate additional services: missing entries → enabled with default price.
    const svc: Record<string, AdditionalServiceRow> = {}
    const stored = d.additionalServices || {}
    for (const def of ADDITIONAL_SERVICES_DEFINITIONS) {
      const existing = stored[def.id]
      svc[def.id] = {
        enabled: existing?.enabled !== false,
        price: String(existing?.price ?? def.defaultPrice),
      }
    }
    setAdditionalServices(svc)
  }, [editTarget, open, user?.email])

  function addCountry() {
    setCountries([...countries, { code: '', name: '', tx: '', mdrBps: '', avgTicket: '' }])
  }
  function removeCountry(idx: number) {
    if (countries.length === 1) return
    setCountries(countries.filter((_, i) => i !== idx))
  }
  function updateCountry(idx: number, field: keyof CountryRow, value: string) {
    setCountries(countries.map((c, i) => (i === idx ? { ...c, [field]: value } : c)))
  }

  function addTier() {
    // Insert before the unlimited (last) row so the last one always stays unlimited.
    const next = [...rateTiers]
    next.splice(next.length - 1, 0, { upToTx: '', ratePerTx: '' })
    setRateTiers(next)
  }
  function removeTier(idx: number) {
    if (rateTiers.length === 1) return
    setRateTiers(rateTiers.filter((_, i) => i !== idx))
  }
  function updateTier(idx: number, field: keyof RateTierRow, value: string) {
    setRateTiers(rateTiers.map((t, i) => (i === idx ? { ...t, [field]: value } : t)))
  }

  // Build validated tiers in ANNUAL units (×12 from monthly thresholds). Returns null on invalid.
  function buildAnnualTiers(): Array<{ upToTx: number | null; ratePerTx: number }> | { error: string } {
    if (pricingModel === 'flat') return []
    const out: Array<{ upToTx: number | null; ratePerTx: number }> = []
    let prevAnnual = 0
    for (let i = 0; i < rateTiers.length; i++) {
      const t = rateTiers[i]
      const isLast = i === rateTiers.length - 1
      const rate = parseNum(t.ratePerTx)
      if (rate === null || rate <= 0 || rate > 10) {
        return { error: `Tier ${i + 1}: rate ${currency}/tx must be > 0 and ≤ 10 (got "${t.ratePerTx}")` }
      }
      let upToAnnual: number | null
      if (isLast) {
        if (t.upToTx.trim()) {
          return { error: `The last tier must be uncapped (leave "Up to tx/mo" empty)` }
        }
        upToAnnual = null
      } else {
        const monthly = parseTxMonthly(t.upToTx)
        if (monthly === null) {
          return { error: `Tier ${i + 1}: "Up to tx/mo" must be a positive integer (got "${t.upToTx}")` }
        }
        upToAnnual = monthly * 12
        if (upToAnnual <= prevAnnual) {
          return { error: `Tier ${i + 1}: "Up to tx/mo" must be greater than the previous tier` }
        }
        prevAnnual = upToAnnual
      }
      out.push({ upToTx: upToAnnual, ratePerTx: rate })
    }
    return out
  }

  // Live preview: compute monthly + annual cost from current inputs (best-effort, silent on errors).
  const preview = (() => {
    const txMonthlyTotal = countries.reduce((sum, c) => {
      const tx = parseTxMonthly(c.tx)
      return sum + (tx ?? 0)
    }, 0)
    if (txMonthlyTotal <= 0) return null
    const txAnnualTotal = txMonthlyTotal * 12
    let actualTxFeeAnnual = 0
    if (pricingModel === 'flat') {
      const r = parseNum(ratePerTx)
      if (r === null || r <= 0) return null
      actualTxFeeAnnual = txAnnualTotal * r
    } else {
      const built = buildAnnualTiers()
      if ('error' in built) return null
      if (!built.length) return null
      actualTxFeeAnnual = pricingModel === 'tramos'
        ? computeTramosFee(txAnnualTotal, built)
        : computeTiersFee(txAnnualTotal, built)
    }
    const minMonthly = parseTxMonthly(minTxMonthly) ?? 0
    const minAnnual = minMonthly * 12
    let minCommitFeeAnnual = 0
    if (minAnnual > 0) {
      if (pricingModel === 'flat') {
        const r = parseNum(ratePerTx) ?? 0
        minCommitFeeAnnual = minAnnual * r
      } else {
        const built = buildAnnualTiers()
        if (!('error' in built) && built.length) {
          minCommitFeeAnnual = pricingModel === 'tramos'
            ? computeTramosFee(minAnnual, built)
            : computeTiersFee(minAnnual, built)
        }
      }
    }
    const txAnnualFee = Math.max(actualTxFeeAnnual, minCommitFeeAnnual)
    const saasAnnual = (parseNum(monthlySaaS) ?? 0) * 12
    const reconAnnual = (parseNum(reconciliationFee) ?? 0) * 12
    const totalAnnual = txAnnualFee + saasAnnual + reconAnnual
    return {
      txMonthlyTotal,
      txAnnualTotal,
      txMonthly: txAnnualFee / 12,
      txAnnual: txAnnualFee,
      saasMonthly: (parseNum(monthlySaaS) ?? 0),
      saasAnnual,
      reconMonthly: (parseNum(reconciliationFee) ?? 0),
      reconAnnual,
      totalMonthly: totalAnnual / 12,
      totalAnnual,
    }
  })()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    // Build + validate countries (monthly tx in form; convert to annual ×12 for payload)
    const cleanCountries = countries
      .filter(c => c.code.trim() && c.tx.trim())
      .map(c => {
        const txMonthly = parseTxMonthly(c.tx)
        if (txMonthly === null) return null
        return {
          code: c.code.trim().toUpperCase(),
          name: c.name.trim().toLowerCase() || c.code.trim().toLowerCase(),
          tx: txMonthly * 12,
          ...(c.mdrBps.trim() ? { mdrBps: parseNum(c.mdrBps) ?? undefined } : {}),
          ...(c.avgTicket.trim() ? { avgTicket: parseNum(c.avgTicket) ?? undefined } : {}),
        }
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)

    if (!clientName.trim()) { setError('Client name is missing.'); return }
    if (!createdByEmail.trim()) { setError('Your connected email is missing.'); return }
    if (cleanCountries.length === 0) { setError('Add at least one country with TX/mo as a whole number (e.g. 1500000 = 1.5M).'); return }
    if (!avgTicket || !currentApproval || !currentMDR || !grossMargin) {
      setError('Fill in avg ticket, approval, MDR and gross margin.')
      return
    }
    if (pricingModel === 'flat' && !ratePerTx) {
      setError('Fill in the rate per TX.')
      return
    }
    if (!minTxMonthly || !monthlySaaS) {
      setError('Fill in pricing fields (min TX/mo, SaaS).')
      return
    }
    // Build/validate tier brackets (×12 from monthly to annual). Returns error string if invalid.
    let annualTiers: Array<{ upToTx: number | null; ratePerTx: number }> = []
    if (pricingModel !== 'flat') {
      const built = buildAnnualTiers()
      if ('error' in built) { setError(built.error); return }
      if (!built.length) { setError('Add at least one tier.'); return }
      annualTiers = built
    }

    // Reject negatives / out-of-range across all numeric fields. The edge function
    // also validates, but catching it here gives a precise, immediate error
    // instead of a round-trip that surfaces a generic message.
    const numericChecks: Array<{ label: string; raw: string; min: number; max?: number }> = [
      { label: 'avg ticket', raw: avgTicket, min: 1, max: 1e6 },
      { label: 'approval %', raw: currentApproval, min: 0.01, max: 100 },
      { label: 'MDR %', raw: currentMDR, min: 0.01, max: 10 },
      { label: 'gross margin %', raw: grossMargin, min: 0.01, max: 100 },
      ...(pricingModel === 'flat'
        ? [{ label: 'rate per TX', raw: ratePerTx, min: 0.0001, max: 10 }]
        : []),
      { label: 'min TX/mo', raw: minTxMonthly, min: 0 },
      { label: 'monthly SaaS', raw: monthlySaaS, min: 0 },
      { label: 'reconciliation fee', raw: reconciliationFee, min: 0 },
      { label: 'countries where it operates', raw: activeMarkets, min: 0, max: 500 },
      { label: 'current APMs', raw: currentAPMs, min: 0 },
      { label: 'current PSPs/gateways', raw: currentProviders, min: 0, max: 500 },
      { label: 'new integrations', raw: numNewIntegrations, min: 0, max: 1000 },
      { label: 'approval lift (pp)', raw: approvalLiftPp, min: 0, max: 100 },
      { label: 'MDR reduction (bps)', raw: mdrReductionBps, min: 0, max: 1000 },
    ]
    for (const { label, raw, min, max } of numericChecks) {
      if (!raw.trim()) continue
      const val = parseNum(raw)
      if (val === null || val < min || (max !== undefined && val > max)) {
        const range = max !== undefined ? `[${min}, ${max}]` : `≥ ${min}`
        setError(`"${label}" must be in ${range}, got: ${raw}`)
        return
      }
    }

    // Sanity warnings — common typos that produce a broken-looking deck.
    const globalAvgTicket = parseNum(avgTicket) ?? 0
    const computedTpv = cleanCountries.reduce(
      (sum, c) => sum + c.tx * (c.avgTicket ?? globalAvgTicket),
      0,
    )
    if (computedTpv > 0 && computedTpv < 1_000_000) {
      if (!window.confirm(
        `Computed TPV (Σ countries × ticket × 12) is only $${computedTpv.toLocaleString()}/year.\n\n` +
        `Did you type "tx = 200" thinking in thousands? TX are MONTHLY as plain numbers (e.g. 1500000 = 1.5M tx/mo).\n\n` +
        `Continue anyway?`,
      )) return
    }
    const reconNum = parseNum(reconciliationFee) ?? 0
    if (reconNum > 50000) {
      if (!window.confirm(
        `Reconciliation fee = $${reconNum.toLocaleString()}/mo is very high vs market benchmark ($10K/mo).\n\n` +
        `With this value, the deck's "operational savings" will come out as $0 (floor at parity).\n\n` +
        `Continue anyway?`,
      )) return
    }

    const minMonthlyParsed = parseTxMonthly(minTxMonthly) ?? 0
    const payload: Record<string, unknown> = {
      createdByEmail: createdByEmail.trim().toLowerCase(),
      clientName: clientName.trim(),
      locale,
      currency,
      countries: cleanCountries,
      avgTicket: parseNum(avgTicket),
      currentApproval: parseNum(currentApproval),
      currentMDR: parseNum(currentMDR),
      grossMargin: parseNum(grossMargin),
      pricingModel,
      // Backend always expects annual units. UI inputs are monthly → ×12 at the boundary.
      minTxAnnual: minMonthlyParsed * 12,
      monthlySaaS: parseNum(monthlySaaS),
      reconciliationFee: parseNum(reconciliationFee) || 0,
      numNewIntegrations: parseNum(numNewIntegrations) || 0,
    }
    if (pricingModel === 'flat') {
      payload.ratePerTx = parseNum(ratePerTx)
    } else {
      payload.rateTiers = annualTiers
    }
    if (activeMarkets) payload.activeMarkets = parseNum(activeMarkets)
    if (currentAPMs) payload.currentAPMs = parseNum(currentAPMs)
    if (currentProviders) payload.currentProviders = parseNum(currentProviders)
    // Yuno levers — only include when AE overrides; backend defaults to 7.4 pp / 38 bps otherwise.
    if (approvalLiftPp.trim()) payload.approvalLiftPp = parseNum(approvalLiftPp)
    if (mdrReductionBps.trim()) payload.mdrReductionBps = parseNum(mdrReductionBps)
    // Parse provider list (comma- or newline-separated). Trim, lowercase, dedupe.
    // Empty array → omit so the edge function falls back to Firecrawl research.
    const todayProviders = Array.from(new Set(
      todayProvidersList.split(/[,\n]/).map(s => s.trim().toLowerCase()).filter(Boolean),
    )).slice(0, 12)
    if (todayProviders.length > 0) payload.todayProviders = todayProviders
    if (salesName.trim()) payload.salesName = salesName.trim()
    if (salesEmail.trim()) payload.salesEmail = salesEmail.trim()
    if (salesTitle.trim()) payload.salesTitle = salesTitle.trim()

    // additionalServices: send full map. Disabled rows still need a numeric
    // price (the backend stores it; the deck just hides it). Empty/invalid
    // price falls back to the default.
    const svcPayload: Record<string, { enabled: boolean; price: number }> = {}
    for (const def of ADDITIONAL_SERVICES_DEFINITIONS) {
      const row = additionalServices[def.id]
      const parsed = parseNum(row?.price ?? '')
      const price = parsed != null && parsed >= 0 && parsed <= 10 ? parsed : def.defaultPrice
      svcPayload[def.id] = { enabled: row?.enabled !== false, price }
    }
    payload.additionalServices = svcPayload

    // Edit mode mutates the existing slug; new mode creates a new row.
    const fnName = isEdit ? 'presentation-update' : 'presentation-create'
    if (isEdit && editTarget) payload.slug = editTarget.slug

    setSubmitting(true)
    try {
      const { data, error: invokeErr } = await invokeWithFreshAuth<{ slug?: string; url?: string; error?: string }>(fnName, {
        body: payload,
        // Yuno BC research/render takes ~30-60s for new clients.
        timeoutMs: 120_000,
      })
      if (invokeErr) {
        // supabase-js wraps non-2xx responses in FunctionsHttpError. The actual
        // error body lives on `context` (a cloned Response). Read it so the user
        // sees the validation reason instead of the generic wrapper message.
        const ctx = (invokeErr as { context?: Response }).context
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = await ctx.clone().json() as { error?: string } | null
            if (body?.error) throw new Error(body.error)
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message && parseErr.message !== 'Unexpected end of JSON input') {
              throw parseErr
            }
          }
        }
        throw invokeErr
      }
      const errMsg = (data as { error?: string } | null)?.error
      if (errMsg) throw new Error(errMsg)
      const result = data as { slug?: string; url?: string }
      if (!result?.slug) throw new Error('Invalid server response')

      qc.invalidateQueries({ queryKey: ['presentations'] })
      toast.success(isEdit ? 'Business case updated' : 'Business case created', {
        description: result.url || `https://chief.yuno.tools/bc/${result.slug}`,
      })
      onCreated(result.slug, result.url || `https://chief.yuno.tools/bc/${result.slug}`)
      resetForm()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : (isEdit ? 'Error saving' : 'Error creating the BC')
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !submitting) { onClose(); setError(null) } }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? (
              <Pencil className="h-5 w-5 text-primary" aria-hidden="true" />
            ) : (
              <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
            )}
            {isEdit ? `Edit · ${editTarget?.clientName || 'Business Case'}` : 'New Business Case'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Edit the data. The public URL stays the same; on save, the deck reflects the changes.'
              : 'Fill in the client details to generate the deck. The URL is public for 90 days.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-2">
          {/* Identity */}
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Identity</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="bc-client">Client *</Label>
                <Input id="bc-client" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Rappi" required />
              </div>
              <div>
                <Label htmlFor="bc-locale">Language</Label>
                <Select value={locale} onValueChange={(v: 'es' | 'en' | 'pt') => setLocale(v)}>
                  <SelectTrigger id="bc-locale"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="pt">Portuguese</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="bc-currency">Currency</Label>
                <Select value={currency} onValueChange={(v: Currency) => setCurrency(v)}>
                  <SelectTrigger id="bc-currency"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCY_OPTIONS.map(opt => (
                      <SelectItem key={opt.code} value={opt.code}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">All deck inputs and amounts use this currency.</p>
              </div>
            </div>
            <div>
              <Label htmlFor="bc-email">Your connected Gmail *</Label>
              <Input id="bc-email" type="email" value={createdByEmail} onChange={e => setCreatedByEmail(e.target.value)} placeholder="you@company.com" required />
              <p className="text-xs text-muted-foreground mt-1">Open notifications are sent to this email.</p>
            </div>
          </section>

          <Separator />

          {/* Countries */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Countries (slide 15)</h3>
              <Button type="button" variant="ghost" size="sm" onClick={addCountry}>
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Country
              </Button>
            </div>
            <div className="space-y-2">
              {countries.map((c, idx) => (
                <div key={idx} className="grid grid-cols-[60px_1fr_120px_90px_90px_36px] gap-2 items-end">
                  <div>
                    {idx === 0 && <Label className="text-xs">Code</Label>}
                    <Input value={c.code} onChange={e => updateCountry(idx, 'code', e.target.value)} placeholder="BR" maxLength={3} />
                  </div>
                  <div>
                    {idx === 0 && <Label className="text-xs">Name</Label>}
                    <Input value={c.name} onChange={e => updateCountry(idx, 'name', e.target.value)} placeholder="brazil" />
                  </div>
                  <div>
                    {idx === 0 && <Label className="text-xs">TX/mo *</Label>}
                    <Input value={c.tx} onChange={e => updateCountry(idx, 'tx', e.target.value)} placeholder="1500000" />
                  </div>
                  <div>
                    {idx === 0 && <Label className="text-xs">MDR bps</Label>}
                    <Input value={c.mdrBps} onChange={e => updateCountry(idx, 'mdrBps', e.target.value)} placeholder="285" />
                  </div>
                  <div>
                    {idx === 0 && <Label className="text-xs">Ticket</Label>}
                    <Input value={c.avgTicket} onChange={e => updateCountry(idx, 'avgTicket', e.target.value)} placeholder="42" />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeCountry(idx)}
                    disabled={countries.length === 1}
                    aria-label="Remove country"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              TX as plain MONTHLY number (e.g. 1500000 = 1.5M tx/mo). MDR/Ticket per country are optional.
            </p>
          </section>

          <Separator />

          {/* Presence */}
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Presence (slide 11)</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="bc-active">Countries where it operates</Label>
                <Input id="bc-active" type="number" min="0" max="500" value={activeMarkets} onChange={e => setActiveMarkets(e.target.value)} placeholder="3" />
              </div>
              <div>
                <Label htmlFor="bc-apms">Current APMs</Label>
                <Input id="bc-apms" type="number" min="0" value={currentAPMs} onChange={e => setCurrentAPMs(e.target.value)} placeholder="12" />
              </div>
              <div>
                <Label htmlFor="bc-providers">Current PSPs/gateways</Label>
                <Input id="bc-providers" type="number" min="0" max="500" value={currentProviders} onChange={e => setCurrentProviders(e.target.value)} placeholder="3" />
              </div>
            </div>
            <div>
              <Label htmlFor="bc-providers-list">Current providers list (slide "Your stack today")</Label>
              <Textarea
                id="bc-providers-list"
                value={todayProvidersList}
                onChange={e => setTodayProvidersList(e.target.value)}
                placeholder="stripe, adyen, dlocal, mercado pago, payu, ..."
                rows={2}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Names separated by comma or newline (max 12). Leave empty to have Firecrawl research them
                automatically — but recommended to fill in when you know them for full control.
              </p>
            </div>
          </section>

          <Separator />

          {/* Globals */}
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Global values</h3>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <Label htmlFor="bc-tkt">Avg ticket {currency} *</Label>
                <Input id="bc-tkt" value={avgTicket} onChange={e => setAvgTicket(e.target.value)} placeholder="48" required />
              </div>
              <div>
                <Label htmlFor="bc-appr">Approval % *</Label>
                <Input id="bc-appr" value={currentApproval} onChange={e => setCurrentApproval(e.target.value)} placeholder="82.4" required />
              </div>
              <div>
                <Label htmlFor="bc-mdr">MDR % *</Label>
                <Input id="bc-mdr" value={currentMDR} onChange={e => setCurrentMDR(e.target.value)} placeholder="2.45" required />
              </div>
              <div>
                <Label htmlFor="bc-margin">Gross margin % *</Label>
                <Input id="bc-margin" value={grossMargin} onChange={e => setGrossMargin(e.target.value)} placeholder="4" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="bc-appr-lift">Approval lift (pp)</Label>
                <Input
                  id="bc-appr-lift"
                  value={approvalLiftPp}
                  onChange={e => setApprovalLiftPp(e.target.value)}
                  placeholder="7.4"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Percentage points added to current approval (Lever 1). Yuno default 7.4 — adjust per client.
                </p>
              </div>
              <div>
                <Label htmlFor="bc-mdr-red">MDR reduction (bps)</Label>
                <Input
                  id="bc-mdr-red"
                  value={mdrReductionBps}
                  onChange={e => setMdrReductionBps(e.target.value)}
                  placeholder="38"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Basis points cut off MDR (Lever 2 · 100 bps = 1%). Yuno default 38 — adjust per client.
                </p>
              </div>
            </div>
          </section>

          <Separator />

          {/* Pricing */}
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Yuno Pricing</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="bc-pmodel">Model</Label>
                <Select value={pricingModel} onValueChange={(v: PricingModel) => setPricingModel(v)}>
                  <SelectTrigger id="bc-pmodel"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flat">Flat (single rate)</SelectItem>
                    <SelectItem value="tramos">Tramos (stacked · each bracket charges its rate)</SelectItem>
                    <SelectItem value="tiers">Tiers (whole volume at the bracket's rate)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {pricingModel === 'flat' && `A single ${currency}/tx rate for the whole volume.`}
                  {pricingModel === 'tramos' && 'Ex: 100K@0.05 + 50K@0.04 = $7,000/mo for 150K tx.'}
                  {pricingModel === 'tiers' && 'Ex: 150K tx falls into bracket "100K+ @ 0.04" → 150K × 0.04 = $6,000/mo.'}
                </p>
              </div>
              {pricingModel === 'flat' && (
                <div>
                  <Label htmlFor="bc-rate">Rate per TX {currency} *</Label>
                  <Input id="bc-rate" value={ratePerTx} onChange={e => setRatePerTx(e.target.value)} placeholder="0.04" required />
                </div>
              )}
              <div>
                <Label htmlFor="bc-min">Min TX/mo *</Label>
                <Input id="bc-min" value={minTxMonthly} onChange={e => setMinTxMonthly(e.target.value)} placeholder="200000" required />
                <p className="text-xs text-muted-foreground mt-1">Minimum monthly commitment (×12 internally).</p>
              </div>
              <div>
                <Label htmlFor="bc-saas">Monthly SaaS {currency} *</Label>
                <Input id="bc-saas" value={monthlySaaS} onChange={e => setMonthlySaaS(e.target.value)} placeholder="8000" required />
              </div>
              <div>
                <Label htmlFor="bc-recon">Reconciliation fee {currency}/mo</Label>
                <Input id="bc-recon" value={reconciliationFee} onChange={e => setReconciliationFee(e.target.value)} placeholder="0" />
              </div>
            </div>

            {/* Tier editor — only for tramos / tiers */}
            {pricingModel !== 'flat' && (
              <div className="space-y-2 rounded-md border border-border/40 bg-muted/30 p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase tracking-wide">Brackets ({pricingModel})</Label>
                  <Button type="button" variant="ghost" size="sm" onClick={addTier}>
                    <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Bracket
                  </Button>
                </div>
                {rateTiers.map((t, idx) => {
                  const isLast = idx === rateTiers.length - 1
                  return (
                    <div key={idx} className="grid grid-cols-[1fr_140px_36px] gap-2 items-end">
                      <div>
                        {idx === 0 && <Label className="text-xs">Up to tx/mo</Label>}
                        <Input
                          value={isLast ? '' : t.upToTx}
                          onChange={e => updateTier(idx, 'upToTx', e.target.value)}
                          placeholder={isLast ? '∞ (no cap)' : '100000'}
                          disabled={isLast}
                        />
                      </div>
                      <div>
                        {idx === 0 && <Label className="text-xs">{currency}/tx *</Label>}
                        <Input
                          value={t.ratePerTx}
                          onChange={e => updateTier(idx, 'ratePerTx', e.target.value)}
                          placeholder="0.05"
                          required
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeTier(idx)}
                        disabled={rateTiers.length === 1}
                        aria-label="Remove bracket"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  )
                })}
                <p className="text-xs text-muted-foreground">
                  The last bracket is always uncapped. Ascending brackets (each greater than the previous).
                </p>
              </div>
            )}

            {/* Live preview */}
            {preview && (
              <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs space-y-1">
                <div className="font-medium uppercase tracking-wide text-primary mb-2">
                  Preview · {preview.txMonthlyTotal.toLocaleString()} tx/mo ({preview.txAnnualTotal.toLocaleString()} tx/yr)
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>tx fee: <span className="font-medium">{fmtMoney(preview.txMonthly, currency)}/mo</span> · {fmtMoney(preview.txAnnual, currency)}/yr</div>
                  <div>saas: <span className="font-medium">{fmtMoney(preview.saasMonthly, currency)}/mo</span> · {fmtMoney(preview.saasAnnual, currency)}/yr</div>
                  {preview.reconAnnual > 0 && (
                    <div>recon: <span className="font-medium">{fmtMoney(preview.reconMonthly, currency)}/mo</span> · {fmtMoney(preview.reconAnnual, currency)}/yr</div>
                  )}
                </div>
                <div className="border-t border-primary/20 pt-1 mt-1 font-semibold">
                  TOTAL Yuno: {fmtMoney(preview.totalMonthly, currency)}/mo · {fmtMoney(preview.totalAnnual, currency)}/yr
                </div>
              </div>
            )}
          </section>

          <Separator />

          {/* Additional services (slide 17) */}
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Additional services (slide 17)</h3>
            <p className="text-xs text-muted-foreground">
              Each service shows on the slide with its price. Uncheck to display "included in the pricing" instead. All active by default.
            </p>
            <div className="space-y-2 rounded-md border border-border/40 bg-muted/30 p-3">
              {ADDITIONAL_SERVICES_DEFINITIONS.map(def => {
                const row = additionalServices[def.id]
                if (!row) return null
                return (
                  <div key={def.id} className="grid grid-cols-[24px_1fr_140px] gap-3 items-center">
                    <input
                      type="checkbox"
                      id={`bc-svc-${def.id}`}
                      checked={row.enabled}
                      onChange={() => toggleService(def.id)}
                      aria-label={`Include ${def.label}`}
                      className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                    />
                    <Label htmlFor={`bc-svc-${def.id}`} className="text-sm font-normal cursor-pointer">
                      {def.label}
                    </Label>
                    <Input
                      value={row.price}
                      onChange={e => setServicePrice(def.id, e.target.value)}
                      placeholder={String(def.defaultPrice)}
                      disabled={!row.enabled}
                      className="text-right text-sm"
                      aria-label={`Price ${def.label}`}
                    />
                  </div>
                )
              })}
              <p className="text-xs text-muted-foreground pt-1">
                Price per tx in {currency}. Up to 4 decimals (e.g. 0.0305).
              </p>
            </div>
          </section>

          <Separator />

          {/* Operations + Sales */}
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Operations · Sales rep</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="bc-newint">New integrations (Lever 03)</Label>
                <Input id="bc-newint" type="number" min="0" max="1000" value={numNewIntegrations} onChange={e => setNumNewIntegrations(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="bc-salesname">Sales rep name</Label>
                <Input id="bc-salesname" value={salesName} onChange={e => setSalesName(e.target.value)} placeholder="Rasheed Bayter" />
              </div>
              <div>
                <Label htmlFor="bc-salesemail">Sales rep email</Label>
                <Input id="bc-salesemail" value={salesEmail} onChange={e => setSalesEmail(e.target.value)} placeholder="rasheed@y.uno" />
              </div>
              <div>
                <Label htmlFor="bc-salestitle">Title</Label>
                <Input id="bc-salestitle" value={salesTitle} onChange={e => setSalesTitle(e.target.value)} placeholder="Account Executive" />
              </div>
            </div>
          </section>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />{isEdit ? 'Saving...' : 'Generating...'}</>
              ) : (
                isEdit ? 'Save changes' : 'Create Business Case'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
