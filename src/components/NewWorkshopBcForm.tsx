import { useState, useEffect, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Presentation, Loader2 } from 'lucide-react'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { invokeWithFreshAuth } from '@/lib/edge-functions'
import { toast } from 'sonner'

// Workshop BC form — handles both CREATE (no editTarget) and EDIT (editTarget set).
// Surfaces EVERY input the workshop slides read so AEs never have to edit JSONB
// directly to override a default. Inputs map 1:1 with the BCInputs interface in
// supabase/functions/_shared/workshops-bc-math.ts.

export interface WorkshopEditTarget {
  slug: string
  clientName: string
  country: string | null
  language: 'es' | 'en'
  workshopDate: string | null
  inputs: Record<string, unknown>
}

interface Props {
  open: boolean
  onClose: () => void
  onSaved?: (slug: string, url: string, total: number) => void
  editTarget?: WorkshopEditTarget | null
}

// ── Defaults align with edge-fn defaults so blank → known fallback ─────────
const DEFAULTS = {
  country: 'MX',
  language: 'es' as const,
  workshopDate: 'Mayo 2026',
  currency: 'USD',
  usdToLocalFx: '18',

  monthlyTx: '',
  avgTicket: '',

  currentAcquirers: '',
  acquirersConsolidated: '',
  currentAntifraud: '',

  currentApproval: '82',
  targetApproval: '85',

  currentMdr: '1.60',
  targetMdr: '1.50',

  currentCreditMdr: '',
  targetCreditMdr: '',
  currentDebitMdrPerTx: '',
  targetDebitMdrPerTx: '',
  currentGatewayPerAttempt: '',
  targetGatewayPerAttempt: '',

  currentAf: '0.04',
  targetAf: '0.03',

  integrationsPlanned: '6',
  devCostMonthly: '12960',
  devMonthsPerIntegration: '3',
  reconciliationSavingsMonthly: '10000',

  yunoSaasMonthly: '5000',
  yunoMinTxMonthly: '200000',

  takeRate: '15',
}

const COUNTRY_OPTIONS = [
  { value: 'MX', label: 'México' },
  { value: 'BR', label: 'Brasil' },
  { value: 'AR', label: 'Argentina' },
  { value: 'CO', label: 'Colombia' },
  { value: 'PE', label: 'Perú' },
  { value: 'CL', label: 'Chile' },
  { value: 'US', label: 'United States' },
  { value: 'ES', label: 'España' },
]

const CURRENCY_OPTIONS = ['USD', 'MXN', 'BRL', 'ARS', 'COP', 'PEN', 'CLP', 'EUR']

function str(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v)
}

// Push a numeric input into the payload only if the user actually filled it.
// Empty strings → undefined so the edge fn keeps the existing/default value.
function maybeNum(payload: Record<string, unknown>, key: string, raw: string) {
  if (raw === '' || raw === null || raw === undefined) return
  const n = Number(raw)
  if (Number.isFinite(n)) payload[key] = n
}

export function NewWorkshopBcForm({ open, onClose, onSaved, editTarget }: Props) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const isEdit = !!editTarget

  // ── Cliente ──
  const [clientName, setClientName] = useState('')
  const [country, setCountry] = useState(DEFAULTS.country)
  const [language, setLanguage] = useState<'es' | 'en'>(DEFAULTS.language)
  const [workshopDate, setWorkshopDate] = useState(DEFAULTS.workshopDate)
  const [createdByEmail, setCreatedByEmail] = useState('')
  const [currency, setCurrency] = useState(DEFAULTS.currency)
  const [usdToLocalFx, setUsdToLocalFx] = useState(DEFAULTS.usdToLocalFx)

  // ── Volumen ──
  const [monthlyTx, setMonthlyTx] = useState(DEFAULTS.monthlyTx)
  const [avgTicket, setAvgTicket] = useState(DEFAULTS.avgTicket)

  // ── Stack actual ──
  const [currentAcquirers, setCurrentAcquirers] = useState(DEFAULTS.currentAcquirers)
  const [acquirersConsolidated, setAcquirersConsolidated] = useState(DEFAULTS.acquirersConsolidated)
  const [currentAntifraud, setCurrentAntifraud] = useState(DEFAULTS.currentAntifraud)

  // ── Approval ──
  const [currentApproval, setCurrentApproval] = useState(DEFAULTS.currentApproval)
  const [targetApproval, setTargetApproval] = useState(DEFAULTS.targetApproval)

  // ── MDR legacy ──
  const [currentMdr, setCurrentMdr] = useState(DEFAULTS.currentMdr)
  const [targetMdr, setTargetMdr] = useState(DEFAULTS.targetMdr)

  // ── MDR per método (retail MX) ──
  const [currentCreditMdr, setCurrentCreditMdr] = useState(DEFAULTS.currentCreditMdr)
  const [targetCreditMdr, setTargetCreditMdr] = useState(DEFAULTS.targetCreditMdr)
  const [currentDebitMdrPerTx, setCurrentDebitMdrPerTx] = useState(DEFAULTS.currentDebitMdrPerTx)
  const [targetDebitMdrPerTx, setTargetDebitMdrPerTx] = useState(DEFAULTS.targetDebitMdrPerTx)
  const [currentGatewayPerAttempt, setCurrentGatewayPerAttempt] = useState(DEFAULTS.currentGatewayPerAttempt)
  const [targetGatewayPerAttempt, setTargetGatewayPerAttempt] = useState(DEFAULTS.targetGatewayPerAttempt)

  // ── Antifraude ──
  const [currentAf, setCurrentAf] = useState(DEFAULTS.currentAf)
  const [targetAf, setTargetAf] = useState(DEFAULTS.targetAf)

  // ── Palanca 04 · Operaciones ──
  const [integrationsPlanned, setIntegrationsPlanned] = useState(DEFAULTS.integrationsPlanned)
  const [devCostMonthly, setDevCostMonthly] = useState(DEFAULTS.devCostMonthly)
  const [devMonthsPerIntegration, setDevMonthsPerIntegration] = useState(DEFAULTS.devMonthsPerIntegration)
  const [reconciliationSavingsMonthly, setReconciliationSavingsMonthly] = useState(DEFAULTS.reconciliationSavingsMonthly)

  // ── Yuno pricing ──
  const [yunoSaasMonthly, setYunoSaasMonthly] = useState(DEFAULTS.yunoSaasMonthly)
  const [yunoMinTxMonthly, setYunoMinTxMonthly] = useState(DEFAULTS.yunoMinTxMonthly)

  // ── Avanzado ──
  const [takeRate, setTakeRate] = useState(DEFAULTS.takeRate)

  // Optional collapse of advanced sections — defaults open in edit mode (so the
  // AE sees what they captured before) and closed in create (cleaner blank slate).
  const [showRetailMx, setShowRetailMx] = useState(false)
  const [showOperations, setShowOperations] = useState(false)
  const [showPricing, setShowPricing] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (editTarget) {
      const i = editTarget.inputs
      setClientName(editTarget.clientName)
      setCountry(editTarget.country || DEFAULTS.country)
      setLanguage(editTarget.language || DEFAULTS.language)
      setWorkshopDate(editTarget.workshopDate || DEFAULTS.workshopDate)
      setCurrency(str(i.currency) || DEFAULTS.currency)
      setUsdToLocalFx(str(i.usd_to_local_fx) || DEFAULTS.usdToLocalFx)

      setMonthlyTx(str(i.monthly_transactions))
      setAvgTicket(str(i.avg_ticket_usd))

      const acqs = Array.isArray(i.current_acquirers) ? i.current_acquirers : []
      setCurrentAcquirers(acqs.join(', '))
      const acqsCon = Array.isArray(i.acquirers_consolidated) ? i.acquirers_consolidated : []
      setAcquirersConsolidated(acqsCon.join(', '))
      setCurrentAntifraud(str(i.current_antifraud))

      setCurrentApproval(str(i.current_approval_rate_pct) || DEFAULTS.currentApproval)
      setTargetApproval(str(i.target_approval_rate_pct) || DEFAULTS.targetApproval)

      setCurrentMdr(str(i.current_mdr_pct) || DEFAULTS.currentMdr)
      setTargetMdr(str(i.target_mdr_pct) || DEFAULTS.targetMdr)

      setCurrentCreditMdr(str(i.current_credit_mdr_pct))
      setTargetCreditMdr(str(i.target_credit_mdr_pct))
      setCurrentDebitMdrPerTx(str(i.current_debit_mdr_per_tx))
      setTargetDebitMdrPerTx(str(i.target_debit_mdr_per_tx))
      setCurrentGatewayPerAttempt(str(i.current_gateway_per_attempt))
      setTargetGatewayPerAttempt(str(i.target_gateway_per_attempt))

      setCurrentAf(str(i.current_antifraud_per_attempt) || DEFAULTS.currentAf)
      setTargetAf(str(i.target_antifraud_per_attempt) || DEFAULTS.targetAf)

      setIntegrationsPlanned(str(i.integrations_planned) || DEFAULTS.integrationsPlanned)
      setDevCostMonthly(str(i.dev_cost_monthly_usd) || DEFAULTS.devCostMonthly)
      setDevMonthsPerIntegration(str(i.dev_months_per_integration) || DEFAULTS.devMonthsPerIntegration)
      setReconciliationSavingsMonthly(str(i.reconciliation_savings_monthly_usd) || DEFAULTS.reconciliationSavingsMonthly)

      setYunoSaasMonthly(str(i.yuno_saas_monthly_usd) || DEFAULTS.yunoSaasMonthly)
      setYunoMinTxMonthly(str(i.yuno_min_tx_monthly) || DEFAULTS.yunoMinTxMonthly)

      setTakeRate(str(i.take_rate_pct) || DEFAULTS.takeRate)

      // If the row has retail-MX rates filled, auto-expand so the AE can see them.
      setShowRetailMx(!!(i.current_credit_mdr_pct || i.current_debit_mdr_per_tx))
      setShowOperations(true)
      setShowPricing(true)
    } else {
      setClientName('')
      setCountry(DEFAULTS.country)
      setLanguage(DEFAULTS.language)
      setWorkshopDate(DEFAULTS.workshopDate)
      setCurrency(DEFAULTS.currency)
      setUsdToLocalFx(DEFAULTS.usdToLocalFx)
      setMonthlyTx(DEFAULTS.monthlyTx)
      setAvgTicket(DEFAULTS.avgTicket)
      setCurrentAcquirers(DEFAULTS.currentAcquirers)
      setAcquirersConsolidated(DEFAULTS.acquirersConsolidated)
      setCurrentAntifraud(DEFAULTS.currentAntifraud)
      setCurrentApproval(DEFAULTS.currentApproval)
      setTargetApproval(DEFAULTS.targetApproval)
      setCurrentMdr(DEFAULTS.currentMdr)
      setTargetMdr(DEFAULTS.targetMdr)
      setCurrentCreditMdr(DEFAULTS.currentCreditMdr)
      setTargetCreditMdr(DEFAULTS.targetCreditMdr)
      setCurrentDebitMdrPerTx(DEFAULTS.currentDebitMdrPerTx)
      setTargetDebitMdrPerTx(DEFAULTS.targetDebitMdrPerTx)
      setCurrentGatewayPerAttempt(DEFAULTS.currentGatewayPerAttempt)
      setTargetGatewayPerAttempt(DEFAULTS.targetGatewayPerAttempt)
      setCurrentAf(DEFAULTS.currentAf)
      setTargetAf(DEFAULTS.targetAf)
      setIntegrationsPlanned(DEFAULTS.integrationsPlanned)
      setDevCostMonthly(DEFAULTS.devCostMonthly)
      setDevMonthsPerIntegration(DEFAULTS.devMonthsPerIntegration)
      setReconciliationSavingsMonthly(DEFAULTS.reconciliationSavingsMonthly)
      setYunoSaasMonthly(DEFAULTS.yunoSaasMonthly)
      setYunoMinTxMonthly(DEFAULTS.yunoMinTxMonthly)
      setTakeRate(DEFAULTS.takeRate)
      setShowRetailMx(false)
      setShowOperations(false)
      setShowPricing(false)
    }
    setError(null)
    if (user?.email && !createdByEmail) setCreatedByEmail(user.email)
  }, [open, editTarget, user?.email]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!clientName.trim()) { setError('Cliente es requerido'); return }
    if (!isEdit && !createdByEmail.trim()) { setError('Gmail conectado es requerido para crear'); return }

    const inputs: Record<string, unknown> = {
      monthly_transactions: Number(monthlyTx),
      avg_ticket_usd: Number(avgTicket),
      current_approval_rate_pct: Number(currentApproval),
      target_approval_rate_pct: Number(targetApproval),
      current_mdr_pct: Number(currentMdr),
      target_mdr_pct: Number(targetMdr),
      current_antifraud_per_attempt: Number(currentAf),
      target_antifraud_per_attempt: Number(targetAf),
      take_rate_pct: Number(takeRate),
    }
    if (currency.trim()) inputs.currency = currency.trim().toUpperCase()
    maybeNum(inputs, 'usd_to_local_fx', usdToLocalFx)

    // Retail-MX per-method rates (all optional — math falls back to legacy MDR
    // when these are unset).
    maybeNum(inputs, 'current_credit_mdr_pct', currentCreditMdr)
    maybeNum(inputs, 'target_credit_mdr_pct', targetCreditMdr)
    maybeNum(inputs, 'current_debit_mdr_per_tx', currentDebitMdrPerTx)
    maybeNum(inputs, 'target_debit_mdr_per_tx', targetDebitMdrPerTx)
    maybeNum(inputs, 'current_gateway_per_attempt', currentGatewayPerAttempt)
    maybeNum(inputs, 'target_gateway_per_attempt', targetGatewayPerAttempt)

    // Operations lever defaults
    maybeNum(inputs, 'integrations_planned', integrationsPlanned)
    maybeNum(inputs, 'dev_cost_monthly_usd', devCostMonthly)
    maybeNum(inputs, 'dev_months_per_integration', devMonthsPerIntegration)
    maybeNum(inputs, 'reconciliation_savings_monthly_usd', reconciliationSavingsMonthly)

    // Yuno pricing
    maybeNum(inputs, 'yuno_saas_monthly_usd', yunoSaasMonthly)
    maybeNum(inputs, 'yuno_min_tx_monthly', yunoMinTxMonthly)

    const acqList = currentAcquirers.split(',').map((s) => s.trim()).filter(Boolean)
    if (acqList.length > 0) inputs.current_acquirers = acqList
    const acqConList = acquirersConsolidated.split(',').map((s) => s.trim()).filter(Boolean)
    if (acqConList.length > 0) inputs.acquirers_consolidated = acqConList
    if (currentAntifraud.trim()) inputs.current_antifraud = currentAntifraud.trim()

    setSubmitting(true)
    try {
      const endpoint = isEdit ? 'workshops-bc-update' : 'workshops-bc-generate'
      const body: Record<string, unknown> = isEdit
        ? {
            slug: editTarget!.slug,
            client_name: clientName.trim(),
            country,
            language,
            workshop_date: workshopDate.trim() || null,
            inputs,
          }
        : {
            createdByEmail: createdByEmail.trim(),
            client_name: clientName.trim(),
            country,
            language,
            workshop_date: workshopDate.trim() || null,
            inputs,
          }

      const { data, error: invokeErr } = await invokeWithFreshAuth<{ slug?: string; url?: string; total_annual_value_usd?: number; business_case?: { total_annual_value_usd: number } }>(endpoint, {
        body,
        timeoutMs: 60_000,
      })
      if (invokeErr) {
        const ctx = (invokeErr as { context?: Response }).context
        if (ctx && typeof ctx.json === 'function') {
          try {
            const b = await ctx.clone().json() as { error?: string } | null
            if (b?.error) throw new Error(b.error)
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message && parseErr.message !== 'Unexpected end of JSON input') {
              throw parseErr
            }
          }
        }
        throw invokeErr
      }

      const result = data as { slug?: string; url?: string; total_annual_value_usd?: number; business_case?: { total_annual_value_usd: number } } | null
      if (!result?.slug && !isEdit) throw new Error('Invalid server response (no slug)')

      const slug = result?.slug || editTarget?.slug || ''
      const url = result?.url || `https://chief.yuno.tools/workshop/${slug}`
      const total = result?.total_annual_value_usd
        ?? result?.business_case?.total_annual_value_usd
        ?? 0

      qc.invalidateQueries({ queryKey: ['workshops_bc'] })
      toast.success(isEdit ? `Workshop actualizado · ${clientName.trim()}` : `Workshop creado · ${clientName.trim()}`, {
        description: `Total: ${total.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} · ${url}`,
        action: { label: 'Abrir', onClick: () => window.open(url, '_blank', 'noopener') },
      })

      onSaved?.(slug, url, total)
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error generando el workshop'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !submitting) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Presentation className="h-5 w-5 text-primary" aria-hidden />
            {isEdit ? `Editar workshop · ${editTarget?.clientName}` : 'Nuevo Workshop BC'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Modifica cualquier input del business case. El URL del deck se mantiene; los números se recomputan al guardar.'
              : 'Workshop BC con math determinístico. Cada campo corresponde a un input del cálculo; los defaults aplican si dejas blanco.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-2">

          {/* ── Cliente ── */}
          <Section title="Cliente">
            <Row>
              <Field id="w-client" label="Nombre del cliente" required>
                <Input id="w-client" value={clientName} onChange={(e) => setClientName(e.target.value)}
                  disabled={submitting} placeholder="Coppel" autoFocus />
              </Field>
              <Field id="w-country" label="País">
                <Select value={country} onValueChange={setCountry} disabled={submitting}>
                  <SelectTrigger id="w-country"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COUNTRY_OPTIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </Row>
            <Row>
              <Field id="w-language" label="Idioma">
                <Select value={language} onValueChange={(v) => setLanguage(v as 'es' | 'en')} disabled={submitting}>
                  <SelectTrigger id="w-language"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="es">Español</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field id="w-date" label="Fecha del workshop">
                <Input id="w-date" value={workshopDate} onChange={(e) => setWorkshopDate(e.target.value)}
                  disabled={submitting} placeholder="Mayo 2026" />
              </Field>
            </Row>
            <Row>
              <Field id="w-currency" label="Moneda de display">
                <Select value={currency} onValueChange={setCurrency} disabled={submitting}>
                  <SelectTrigger id="w-currency"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Para pricing Yuno + display general. USD = legacy.</p>
              </Field>
              <Field id="w-fx" label="USD → local FX">
                <Input id="w-fx" type="number" value={usdToLocalFx} onChange={(e) => setUsdToLocalFx(e.target.value)}
                  disabled={submitting} step="0.1" min={1} placeholder="18" />
                <p className="text-xs text-muted-foreground">MX ≈ 18, BR ≈ 5, AR varía.</p>
              </Field>
            </Row>
            {!isEdit && (
              <Field id="w-email" label="Tu Gmail conectado" required>
                <Input id="w-email" type="email" value={createdByEmail}
                  onChange={(e) => setCreatedByEmail(e.target.value)}
                  disabled={submitting} placeholder="you@y.uno" />
                <p className="text-xs text-muted-foreground">Resuelve el org del workshop. Default: tu email de login.</p>
              </Field>
            )}
          </Section>

          {/* ── Volumen ── */}
          <Section title="Volumen" hint="Base de todos los cálculos.">
            <Row>
              <Field id="w-tx" label="Transacciones / mes" required>
                <Input id="w-tx" type="number" value={monthlyTx} onChange={(e) => setMonthlyTx(e.target.value)}
                  disabled={submitting} placeholder="2800000" min={1} />
              </Field>
              <Field id="w-ticket" label="Ticket promedio (USD)" required>
                <Input id="w-ticket" type="number" value={avgTicket} onChange={(e) => setAvgTicket(e.target.value)}
                  disabled={submitting} placeholder="110" min={0.01} step="0.01" />
              </Field>
            </Row>
          </Section>

          {/* ── Stack actual ── */}
          <Section title="Stack actual" hint="Aparece en la slide de diagnóstico (S13).">
            <Field id="w-acquirers" label="Adquirentes actuales (CSV)">
              <Input id="w-acquirers" value={currentAcquirers}
                onChange={(e) => setCurrentAcquirers(e.target.value)}
                disabled={submitting} placeholder="BBVA, EVO" />
              <p className="text-xs text-muted-foreground">Separados por coma. Primero = primario.</p>
            </Field>
            <Field id="w-acquirers-con" label="Adquirentes consolidados con Yuno (CSV, opcional)">
              <Input id="w-acquirers-con" value={acquirersConsolidated}
                onChange={(e) => setAcquirersConsolidated(e.target.value)}
                disabled={submitting} placeholder="Banorte, Citibanamex" />
              <p className="text-xs text-muted-foreground">Los nuevos adquirentes que Yuno trae. Aparecen como "fallback" en S16.</p>
            </Field>
            <Field id="w-antifraud" label="Antifraude actual">
              <Input id="w-antifraud" value={currentAntifraud}
                onChange={(e) => setCurrentAntifraud(e.target.value)}
                disabled={submitting} placeholder="Cybersource" />
            </Field>
          </Section>

          {/* ── Aprobación ── */}
          <Section title="Aprobación · actual vs target Yuno" hint="Lever 1 · Smart Routing.">
            <Row>
              <Field id="w-app-now" label="Aprobación actual (%)" required>
                <Input id="w-app-now" type="number" value={currentApproval}
                  onChange={(e) => setCurrentApproval(e.target.value)}
                  disabled={submitting} step="0.1" min={1} max={100} />
              </Field>
              <Field id="w-app-new" label="Aprobación target Yuno (%)">
                <Input id="w-app-new" type="number" value={targetApproval}
                  onChange={(e) => setTargetApproval(e.target.value)}
                  disabled={submitting} step="0.1" min={1} max={100} />
              </Field>
            </Row>
          </Section>

          {/* ── MDR legacy ── */}
          <Section title="MDR (modelo simple % sobre TPV)" hint="Lever 2 · MDR consolidado.">
            <Row>
              <Field id="w-mdr-now" label="MDR actual (%)">
                <Input id="w-mdr-now" type="number" value={currentMdr}
                  onChange={(e) => setCurrentMdr(e.target.value)}
                  disabled={submitting} step="0.01" min={0} />
              </Field>
              <Field id="w-mdr-new" label="MDR target Yuno (%)">
                <Input id="w-mdr-new" type="number" value={targetMdr}
                  onChange={(e) => setTargetMdr(e.target.value)}
                  disabled={submitting} step="0.01" min={0} />
              </Field>
            </Row>
          </Section>

          {/* ── MDR per método (retail MX) — collapsible ── */}
          <CollapsibleSection
            title="MDR per método (retail MX · crédito + débito + gateway)"
            hint="Sobreescribe el modelo legacy cuando crédito y débito tienen tasas distintas."
            open={showRetailMx} onToggle={() => setShowRetailMx((v) => !v)}
          >
            <Row>
              <Field id="w-credit-now" label="MDR crédito actual (%)">
                <Input id="w-credit-now" type="number" value={currentCreditMdr}
                  onChange={(e) => setCurrentCreditMdr(e.target.value)}
                  disabled={submitting} step="0.01" min={0} placeholder="ej. 2.37" />
              </Field>
              <Field id="w-credit-new" label="MDR crédito target (%)">
                <Input id="w-credit-new" type="number" value={targetCreditMdr}
                  onChange={(e) => setTargetCreditMdr(e.target.value)}
                  disabled={submitting} step="0.01" min={0} placeholder="ej. 1.95" />
              </Field>
            </Row>
            <Row>
              <Field id="w-debit-now" label="MDR débito actual (moneda local / tx aprobada)">
                <Input id="w-debit-now" type="number" value={currentDebitMdrPerTx}
                  onChange={(e) => setCurrentDebitMdrPerTx(e.target.value)}
                  disabled={submitting} step="0.01" min={0} placeholder="ej. 2.33 MXN" />
              </Field>
              <Field id="w-debit-new" label="MDR débito target (moneda local / tx aprobada)">
                <Input id="w-debit-new" type="number" value={targetDebitMdrPerTx}
                  onChange={(e) => setTargetDebitMdrPerTx(e.target.value)}
                  disabled={submitting} step="0.01" min={0} placeholder="ej. 1.85 MXN" />
              </Field>
            </Row>
            <Row>
              <Field id="w-gw-now" label="Gateway actual (moneda local / intento)">
                <Input id="w-gw-now" type="number" value={currentGatewayPerAttempt}
                  onChange={(e) => setCurrentGatewayPerAttempt(e.target.value)}
                  disabled={submitting} step="0.01" min={0} placeholder="ej. 0.45 MXN" />
              </Field>
              <Field id="w-gw-new" label="Gateway target (moneda local / intento)">
                <Input id="w-gw-new" type="number" value={targetGatewayPerAttempt}
                  onChange={(e) => setTargetGatewayPerAttempt(e.target.value)}
                  disabled={submitting} step="0.01" min={0} placeholder="ej. 0.30 MXN" />
              </Field>
            </Row>
          </CollapsibleSection>

          {/* ── Antifraude ── */}
          <Section title="Antifraude · per intento" hint="Lever 3.">
            <Row>
              <Field id="w-af-now" label="Antifraude actual ($/intento)">
                <Input id="w-af-now" type="number" value={currentAf}
                  onChange={(e) => setCurrentAf(e.target.value)}
                  disabled={submitting} step="0.001" min={0} />
              </Field>
              <Field id="w-af-new" label="Antifraude Yuno ($/intento)">
                <Input id="w-af-new" type="number" value={targetAf}
                  onChange={(e) => setTargetAf(e.target.value)}
                  disabled={submitting} step="0.001" min={0} />
              </Field>
            </Row>
          </Section>

          {/* ── Operaciones ── */}
          <CollapsibleSection
            title="Operaciones · dev + conciliación"
            hint="Lever 4 · ahorros operativos year-1."
            open={showOperations} onToggle={() => setShowOperations((v) => !v)}
          >
            <Row>
              <Field id="w-int" label="Integraciones planeadas">
                <Input id="w-int" type="number" value={integrationsPlanned}
                  onChange={(e) => setIntegrationsPlanned(e.target.value)}
                  disabled={submitting} step="1" min={0} placeholder="6" />
                <p className="text-xs text-muted-foreground">Default 6.</p>
              </Field>
              <Field id="w-dev-months" label="Meses dev / integración">
                <Input id="w-dev-months" type="number" value={devMonthsPerIntegration}
                  onChange={(e) => setDevMonthsPerIntegration(e.target.value)}
                  disabled={submitting} step="0.5" min={0} placeholder="3" />
              </Field>
            </Row>
            <Row>
              <Field id="w-dev-cost" label="Costo dev mensual (USD)">
                <Input id="w-dev-cost" type="number" value={devCostMonthly}
                  onChange={(e) => setDevCostMonthly(e.target.value)}
                  disabled={submitting} step="100" min={0} placeholder="12960" />
                <p className="text-xs text-muted-foreground">Default $12,960/mes (1 senior dev cargado).</p>
              </Field>
              <Field id="w-recon" label="Ahorro conciliación mensual (USD)">
                <Input id="w-recon" type="number" value={reconciliationSavingsMonthly}
                  onChange={(e) => setReconciliationSavingsMonthly(e.target.value)}
                  disabled={submitting} step="100" min={0} placeholder="10000" />
                <p className="text-xs text-muted-foreground">Default $10K/mes (1 FTE de reconciliation).</p>
              </Field>
            </Row>
          </CollapsibleSection>

          {/* ── Yuno pricing ── */}
          <CollapsibleSection
            title="Yuno pricing · SaaS + tx mínimo"
            hint="Costo Yuno = SaaS mensual + tiers per-tx aprobada (vienen del rate-card por default)."
            open={showPricing} onToggle={() => setShowPricing((v) => !v)}
          >
            <Row>
              <Field id="w-saas" label="SaaS mensual Yuno (USD)">
                <Input id="w-saas" type="number" value={yunoSaasMonthly}
                  onChange={(e) => setYunoSaasMonthly(e.target.value)}
                  disabled={submitting} step="100" min={0} placeholder="5000" />
                <p className="text-xs text-muted-foreground">Default $5K USD/mes.</p>
              </Field>
              <Field id="w-min-tx" label="Mínimo tx / mes facturable">
                <Input id="w-min-tx" type="number" value={yunoMinTxMonthly}
                  onChange={(e) => setYunoMinTxMonthly(e.target.value)}
                  disabled={submitting} step="1000" min={0} placeholder="200000" />
                <p className="text-xs text-muted-foreground">Default 200K tx/mes. Por debajo se factura el mínimo.</p>
              </Field>
            </Row>
            <p className="text-xs text-muted-foreground">
              Tiers per-tx (250K / 500K / 750K / 1M / 1M+ a 0.72 / 0.63 / 0.54 / 0.45 / 0.36 MXN) son fixed.
              Si necesitas un rate-card distinto, editá el row vía SQL directamente.
            </p>
          </CollapsibleSection>

          {/* ── Avanzado ── */}
          <Section title="Avanzado" hint="Asunción del revenue uplift de Smart Routing.">
            <Field id="w-take" label="Take rate revenue uplift (%)">
              <Input id="w-take" type="number" value={takeRate}
                onChange={(e) => setTakeRate(e.target.value)}
                disabled={submitting} step="0.1" min={0} max={100} />
              <p className="text-xs text-muted-foreground">Default 15% (contribution margin retail). Diseño Claude.</p>
            </Field>
          </Section>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>Cancelar</Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {submitting
                ? (isEdit ? 'Recomputando…' : 'Generando…')
                : (isEdit ? 'Guardar cambios' : 'Generar workshop')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Layout helpers ────────────────────────────────────────────────────────

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between border-b pb-1.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function CollapsibleSection({
  title, hint, open, onToggle, children,
}: { title: string; hint?: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <button
        type="button" onClick={onToggle}
        className="w-full flex items-baseline justify-between border-b pb-1.5 text-left hover:bg-accent/20 transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono">{open ? '−' : '+'}</span>
          <span className="text-sm font-semibold">{title}</span>
        </span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </button>
      {open && <div className="space-y-3">{children}</div>}
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
}

function Field({ id, label, required, children }: { id: string; label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {children}
    </div>
  )
}
