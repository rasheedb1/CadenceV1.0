// Shared business-case math for /yuno-workshops-bc — used by both
// workshops-bc-generate (create + compute) and workshops-bc-update
// (recompute after AE edits inputs). Pure functions, no I/O — the
// only side effect is the computed_at timestamp.
//
// Math reference: yuno-bdm-ppt-pricing/project/Coppel Workshop.html (the
// Claude Design handoff). Keep this file as the single source of truth so
// the deck math never diverges between create + update flows.

// ── Types ────────────────────────────────────────────────────────────────

export interface VerticalInput {
  id: string
  name: string
  monthly_tx: number
  avg_ticket: number
  credit_mix_pct?: number  // 0-100. Defaults: retail-style = 50, banking/abonos = 0.
  // Per-vertical approval rates override the global current/target_approval_rate_pct
  // when set — retail-style verticals run lower (~85-90%) than abonos (~95%).
  approval_rate_pct?: number
  target_approval_rate_pct?: number
}

export interface VerticalOutput {
  id: string
  name: string
  monthly_tx: number
  avg_ticket: number
  credit_mix_pct: number
  annual_approved: number
  annual_attempts: number
  approved_credit: number
  approved_debit: number
  tpv_credit: number
  tpv_debit: number
  annual_tpv: number
  cost_mdr_credit_current: number
  cost_mdr_debit_current: number
  cost_antifraud_current: number
  cost_gateway_current: number
  cost_total_current: number
  approved_new: number
  incremental_approved: number
  incremental_tpv: number
  incremental_revenue: number
  mdr_credit_savings: number
  mdr_debit_savings: number
  mdr_savings: number
  antifraud_savings: number
  gateway_savings: number
}

export interface BCInputs {
  monthly_transactions: number
  avg_ticket_usd: number
  verticals?: VerticalInput[]
  currency?: string
  current_credit_mdr_pct?: number
  target_credit_mdr_pct?: number
  current_debit_mdr_per_tx?: number
  target_debit_mdr_per_tx?: number
  // Optional: debit MDR as % of TPV (e.g. Chile insurance — 1.36% → 0.76%).
  // Takes precedence over `*_debit_mdr_per_tx` when set. Pure % math:
  //   mdrDebitSavings = tpvDebitNew × (currentPct − targetPct) / 100
  current_debit_mdr_pct?: number
  target_debit_mdr_pct?: number
  current_gateway_per_attempt?: number
  target_gateway_per_attempt?: number
  current_mdr_pct?: number
  target_mdr_pct?: number
  current_antifraud_per_attempt?: number
  target_antifraud_per_attempt?: number
  current_approval_rate_pct: number
  target_approval_rate_pct?: number
  take_rate_pct?: number
  current_acquirers?: string[]
  current_antifraud?: string
  integrations_planned?: number
  reconciliation_savings_monthly_usd?: number
  dev_cost_monthly_usd?: number
  dev_months_per_integration?: number
  acquirers_consolidated?: string[]
  yuno_saas_monthly_usd?: number
  yuno_min_tx_monthly?: number
  yuno_pricing_tiers?: Array<{ limit_tx: number; rate_local: number }>
  usd_to_local_fx?: number
  // ── Presentation-only flags ──────────────────────────────────────────
  // Never used by the math below, but they MUST survive validateInputs:
  // generate + update both persist the VALIDATED value (not the raw body),
  // so anything missing here is silently dropped and the slides that read
  // inputs.* (SlideYunoCost, SlideYunoExtras filter, PSP arena) fall back
  // to their Coppel defaults.
  yuno_tier_discount_pct?: number
  yuno_min_tx_ramp_enabled?: boolean
  yuno_credit_promo_enabled?: boolean
  yuno_credit_offer_title?: string
  yuno_credit_offer_body?: string
  yuno_extras_enabled?: boolean
  psp_arena_roster?: Array<{ name: string; bid: number; share: number; status?: string }>
}

export interface BusinessCase {
  currency: string
  tpv_monthly_usd: number
  tpv_annual_usd: number
  annual_approved_tx: number
  annual_attempts: number
  approved_new_annual: number
  incremental_approved_tx_annual: number
  incremental_tpv_annual_usd: number
  incremental_revenue_annual_usd: number
  mdr_credit_savings_annual: number
  mdr_debit_savings_annual: number
  mdr_savings_annual_usd: number
  antifraud_savings_annual_usd: number
  gateway_savings_annual: number
  verticals: VerticalOutput[]
  dev_cost_per_integration_usd: number
  dev_cost_savings_one_time_usd: number
  engineering_months_saved: number
  reconciliation_savings_annual_usd: number
  operational_savings_year1_usd: number
  // _local variants — ops/recon multiplied by FX so they share the local
  // currency of mdr/af/gw savings. Use these when computing direct_savings
  // or summing into total_annual_value.
  dev_cost_per_integration_local: number
  dev_cost_savings_one_time_local: number
  reconciliation_savings_annual_local: number
  operational_savings_year1_local: number
  direct_savings_annual_local: number
  total_annual_value_local: number
  // Legacy USD-suffixed sums kept for backward compatibility but mixed
  // currency for non-USD decks. Slides should prefer the _local variants.
  direct_savings_annual_usd: number
  total_annual_value_usd: number
  take_rate_pct: number
  monitors_qualitative: boolean
  yuno_saas_monthly_local: number
  yuno_saas_annual_local: number
  yuno_per_tx_monthly_local: number
  yuno_per_tx_annual_local: number
  yuno_pricing_tier_breakdown: Array<{ tier: string; tx: number; rate_local: number; subtotal_local: number }>
  yuno_blended_rate_local: number
  yuno_cost_annual_local: number
  yuno_min_tx_monthly: number
  yuno_meets_minimum: boolean
  usd_to_local_fx: number
  net_benefit_annual_local: number
  roi_multiple: number
  computed_at: string
}

// ── Helpers ──────────────────────────────────────────────────────────────

export function round(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

// Per-vertical math worker. Cost model (Mexican retail / abonos):
//   MDR crédito  = TPV crédito × creditMdrPct        (% sobre TPV aprobado)
//   MDR débito   = aprobadas-débito × debitMdrPerTx  (fijo por tx aprobada)
//   Antifraude   = intentos × afPerAttempt           (per intento, incluye declines)
//   Gateway      = aprobadas × gwPerApproved         (per tx aprobada)
function computeVertical(
  v: VerticalInput,
  rates: {
    defaultAppNow: number, defaultAppNew: number,
    creditMdrNow: number, creditMdrNew: number,
    debitMdrNow: number, debitMdrNew: number,
    // % alternative for debit (takes precedence when debitMdrPctMode=true)
    debitMdrPctNow: number, debitMdrPctNew: number,
    debitMdrPctMode: boolean,
    gwNow: number, gwNew: number,
    afNow: number, afNew: number,
    takeRate: number,
    defaultCreditMix: number,
  },
): VerticalOutput {
  const ticket = v.avg_ticket
  const monthlyTx = v.monthly_tx
  const creditMix = (v.credit_mix_pct ?? rates.defaultCreditMix) / 100
  const debitMix = Math.max(0, 1 - creditMix)

  const appNow = Math.max(0.01, Math.min(1, (v.approval_rate_pct ?? rates.defaultAppNow * 100) / 100))
  const appNew = Math.max(appNow, Math.min(1, (v.target_approval_rate_pct ?? rates.defaultAppNew * 100) / 100))

  const annualApproved = monthlyTx * 12
  const annualAttempts = annualApproved / appNow

  const approvedCredit = annualApproved * creditMix
  const approvedDebit = annualApproved * debitMix
  const tpvCredit = approvedCredit * ticket
  const tpvDebit = approvedDebit * ticket
  const annualTPV = tpvCredit + tpvDebit

  const costMdrCreditCurrent = tpvCredit * (rates.creditMdrNow / 100)
  const costMdrDebitCurrent  = rates.debitMdrPctMode
    ? tpvDebit * (rates.debitMdrPctNow / 100)
    : approvedDebit * rates.debitMdrNow
  const costAntifraudCurrent = annualAttempts * rates.afNow
  const costGatewayCurrent   = annualApproved * rates.gwNow
  const costTotalCurrent = costMdrCreditCurrent + costMdrDebitCurrent
                         + costAntifraudCurrent + costGatewayCurrent

  const approvedNew = annualAttempts * appNew
  const incrementalApproved = Math.max(0, approvedNew - annualApproved)
  const incrementalTPV = incrementalApproved * ticket
  const incrementalRevenue = incrementalTPV * rates.takeRate

  const approvedCreditNew = approvedNew * creditMix
  const approvedDebitNew  = approvedNew * debitMix
  const tpvCreditNew = approvedCreditNew * ticket
  const tpvDebitNew  = approvedDebitNew * ticket
  const mdrCreditSavings = tpvCreditNew * Math.max(0, rates.creditMdrNow - rates.creditMdrNew) / 100
  const mdrDebitSavings  = rates.debitMdrPctMode
    ? tpvDebitNew * Math.max(0, rates.debitMdrPctNow - rates.debitMdrPctNew) / 100
    : approvedDebitNew * Math.max(0, rates.debitMdrNow - rates.debitMdrNew)
  const mdrSavings = mdrCreditSavings + mdrDebitSavings

  const antifraudSavings = annualAttempts * Math.max(0, rates.afNow - rates.afNew)
  const gatewaySavings = approvedNew * Math.max(0, rates.gwNow - rates.gwNew)

  return {
    id: v.id,
    name: v.name,
    monthly_tx: round(monthlyTx),
    avg_ticket: round(ticket),
    credit_mix_pct: round(creditMix * 100),
    annual_approved: round(annualApproved),
    annual_attempts: round(annualAttempts),
    approved_credit: round(approvedCredit),
    approved_debit: round(approvedDebit),
    tpv_credit: round(tpvCredit),
    tpv_debit: round(tpvDebit),
    annual_tpv: round(annualTPV),
    cost_mdr_credit_current: round(costMdrCreditCurrent),
    cost_mdr_debit_current: round(costMdrDebitCurrent),
    cost_antifraud_current: round(costAntifraudCurrent),
    cost_gateway_current: round(costGatewayCurrent),
    cost_total_current: round(costTotalCurrent),
    approved_new: round(approvedNew),
    incremental_approved: round(incrementalApproved),
    incremental_tpv: round(incrementalTPV),
    incremental_revenue: round(incrementalRevenue),
    mdr_credit_savings: round(mdrCreditSavings),
    mdr_debit_savings: round(mdrDebitSavings),
    mdr_savings: round(mdrSavings),
    antifraud_savings: round(antifraudSavings),
    gateway_savings: round(gatewaySavings),
  }
}

export function computeBusinessCase(i: BCInputs): BusinessCase {
  const TAKE_RATE = (i.take_rate_pct ?? 15) / 100
  const currency = (i.currency || 'USD').toUpperCase()

  const appNow = Math.max(0.01, Math.min(1, i.current_approval_rate_pct / 100))
  const appNew = Math.max(appNow, Math.min(1, ((i.target_approval_rate_pct ?? i.current_approval_rate_pct) / 100)))

  const legacyMdrNow = i.current_mdr_pct ?? 0
  const legacyMdrNew = i.target_mdr_pct ?? legacyMdrNow
  const creditMdrNow = i.current_credit_mdr_pct ?? legacyMdrNow
  const creditMdrNew = i.target_credit_mdr_pct ?? legacyMdrNew
  const debitMdrNow = i.current_debit_mdr_per_tx ?? 0
  const debitMdrNew = i.target_debit_mdr_per_tx ?? debitMdrNow
  const debitMdrPctNow = i.current_debit_mdr_pct ?? 0
  const debitMdrPctNew = i.target_debit_mdr_pct ?? debitMdrPctNow
  const debitMdrPctMode = i.current_debit_mdr_pct != null
  const gwNow = i.current_gateway_per_attempt ?? 0
  const gwNew = i.target_gateway_per_attempt ?? 0
  const afNow = i.current_antifraud_per_attempt ?? 0
  const afNew = i.target_antifraud_per_attempt ?? afNow

  const defaultCreditMix = (i.current_debit_mdr_per_tx == null && i.current_debit_mdr_pct == null) ? 100 : 50

  const rates = {
    defaultAppNow: appNow, defaultAppNew: appNew,
    creditMdrNow, creditMdrNew,
    debitMdrNow, debitMdrNew,
    debitMdrPctNow, debitMdrPctNew, debitMdrPctMode,
    gwNow, gwNew,
    afNow, afNew,
    takeRate: TAKE_RATE,
    defaultCreditMix,
  }

  const vertInputs: VerticalInput[] = (Array.isArray(i.verticals) && i.verticals.length > 0)
    ? i.verticals
    : [{
        id: 'all',
        name: 'Total',
        monthly_tx: i.monthly_transactions,
        avg_ticket: i.avg_ticket_usd,
        credit_mix_pct: defaultCreditMix,
      }]

  const verticals = vertInputs.map((v) => computeVertical(v, rates))

  const sum = (key: keyof VerticalOutput) =>
    verticals.reduce((s, v) => s + (Number(v[key]) || 0), 0)

  const annualApprovedTx = sum('annual_approved')
  const annualTPV = sum('annual_tpv')
  const annualAttempts = sum('annual_attempts')
  const approvedNew = sum('approved_new')
  const incrementalApprovedTx = sum('incremental_approved')
  const incrementalTPV = sum('incremental_tpv')
  const incrementalRevenue = sum('incremental_revenue')
  const mdrCreditSavings = sum('mdr_credit_savings')
  const mdrDebitSavings = sum('mdr_debit_savings')
  const mdrSavings = mdrCreditSavings + mdrDebitSavings
  const antifraudSavings = sum('antifraud_savings')
  const gatewaySavings = sum('gateway_savings')

  const integrations = Math.max(0, i.integrations_planned ?? 6)
  const devMonthlyCost = Math.max(0, i.dev_cost_monthly_usd ?? 12_960)
  const devMonthsPerInt = Math.max(0, i.dev_months_per_integration ?? 3)
  const reconMonthly = Math.max(0, i.reconciliation_savings_monthly_usd ?? 10_000)
  const devCostPerIntegration = devMonthlyCost * devMonthsPerInt
  const devCostOneTime = devCostPerIntegration * integrations
  const engMonthsSaved = devMonthsPerInt * integrations
  const reconAnnual = reconMonthly * 12
  const operationalYear1 = devCostOneTime + reconAnnual

  // ops/recon inputs are TRUE USD. For non-USD decks they need to be FX-
  // converted before summing with mdr/af/gw savings (which are in the
  // input currency). Without this conversion, direct_savings and
  // total_annual_value mix currencies and read as ~6M too low for MXN.
  const fxForOps = Math.max(1, i.usd_to_local_fx ?? 18)
  const usdToLocal = currency === 'USD' ? 1 : fxForOps
  const devCostPerIntegrationLocal = devCostPerIntegration * usdToLocal
  const devCostOneTimeLocal = devCostOneTime * usdToLocal
  const reconAnnualLocal = reconAnnual * usdToLocal
  const operationalYear1Local = operationalYear1 * usdToLocal

  const directSavingsLocal = mdrSavings + antifraudSavings + gatewaySavings + operationalYear1Local
  const totalAnnualValueLocal = incrementalRevenue + directSavingsLocal
  // Legacy: USD-suffixed sums (broken currency mix for non-USD decks,
  // kept only so older consumers don't crash on missing fields).
  const directSavings = mdrSavings + antifraudSavings + gatewaySavings + operationalYear1
  const totalAnnualValue = incrementalRevenue + directSavings

  const monthlyTPV = annualTPV / 12

  const saasMonthlyUsd = Math.max(0, i.yuno_saas_monthly_usd ?? 5_000)
  const fx = Math.max(1, i.usd_to_local_fx ?? 18)
  const minTxMonthly = Math.max(0, i.yuno_min_tx_monthly ?? 200_000)
  const tiers = Array.isArray(i.yuno_pricing_tiers) && i.yuno_pricing_tiers.length > 0
    ? i.yuno_pricing_tiers
    : [
        { limit_tx: 250_000,   rate_local: 0.72 },
        { limit_tx: 500_000,   rate_local: 0.63 },
        { limit_tx: 750_000,   rate_local: 0.54 },
        { limit_tx: 1_000_000, rate_local: 0.45 },
        { limit_tx: Number.POSITIVE_INFINITY, rate_local: 0.36 },
      ]
  const monthlyApproved = annualApprovedTx / 12
  const billableMonthly = Math.max(monthlyApproved, minTxMonthly)
  let remaining = billableMonthly
  let prevLimit = 0
  let perTxMonthly = 0
  const tierBreakdown: BusinessCase['yuno_pricing_tier_breakdown'] = []
  for (const t of tiers) {
    if (remaining <= 0) break
    const slabCap = Math.max(0, t.limit_tx - prevLimit)
    const slab = Math.min(remaining, slabCap)
    const subtotal = slab * t.rate_local
    perTxMonthly += subtotal
    const upperLabel = Number.isFinite(t.limit_tx) ? `${prevLimit.toLocaleString('es-MX')}–${t.limit_tx.toLocaleString('es-MX')}` : `${prevLimit.toLocaleString('es-MX')}+`
    tierBreakdown.push({
      tier: upperLabel,
      tx: round(slab),
      rate_local: t.rate_local,
      subtotal_local: round(subtotal),
    })
    remaining -= slab
    prevLimit = t.limit_tx
  }
  const saasMonthlyLocal = saasMonthlyUsd * fx
  const saasAnnualLocal = saasMonthlyLocal * 12
  const perTxAnnualLocal = perTxMonthly * 12
  const yunoCostAnnual = saasAnnualLocal + perTxAnnualLocal
  const blendedRate = billableMonthly > 0 ? perTxMonthly / billableMonthly : 0
  const meetsMin = monthlyApproved >= minTxMonthly
  // net + ROI compare value vs Yuno cost, both in LOCAL currency.
  // totalAnnualValueLocal includes the FX-converted ops component;
  // yunoCostAnnual is already in local (saas × fx + per-tx in local).
  const netBenefit = totalAnnualValueLocal - yunoCostAnnual
  const roi = yunoCostAnnual > 0 ? totalAnnualValueLocal / yunoCostAnnual : 0

  return {
    currency,
    tpv_monthly_usd: round(monthlyTPV),
    tpv_annual_usd: round(annualTPV),
    annual_approved_tx: round(annualApprovedTx),
    annual_attempts: round(annualAttempts),
    approved_new_annual: round(approvedNew),
    incremental_approved_tx_annual: round(incrementalApprovedTx),
    incremental_tpv_annual_usd: round(incrementalTPV),
    incremental_revenue_annual_usd: round(incrementalRevenue),
    mdr_credit_savings_annual: round(mdrCreditSavings),
    mdr_debit_savings_annual: round(mdrDebitSavings),
    mdr_savings_annual_usd: round(mdrSavings),
    antifraud_savings_annual_usd: round(antifraudSavings),
    gateway_savings_annual: round(gatewaySavings),
    verticals,
    dev_cost_per_integration_usd: round(devCostPerIntegration),
    dev_cost_savings_one_time_usd: round(devCostOneTime),
    engineering_months_saved: round(engMonthsSaved),
    reconciliation_savings_annual_usd: round(reconAnnual),
    operational_savings_year1_usd: round(operationalYear1),
    dev_cost_per_integration_local: round(devCostPerIntegrationLocal),
    dev_cost_savings_one_time_local: round(devCostOneTimeLocal),
    reconciliation_savings_annual_local: round(reconAnnualLocal),
    operational_savings_year1_local: round(operationalYear1Local),
    direct_savings_annual_local: round(directSavingsLocal),
    total_annual_value_local: round(totalAnnualValueLocal),
    direct_savings_annual_usd: round(directSavings),
    total_annual_value_usd: round(totalAnnualValue),
    take_rate_pct: i.take_rate_pct ?? 15,
    monitors_qualitative: true,
    yuno_saas_monthly_local: round(saasMonthlyLocal),
    yuno_saas_annual_local: round(saasAnnualLocal),
    yuno_per_tx_monthly_local: round(perTxMonthly),
    yuno_per_tx_annual_local: round(perTxAnnualLocal),
    yuno_pricing_tier_breakdown: tierBreakdown,
    yuno_blended_rate_local: round(blendedRate),
    yuno_cost_annual_local: round(yunoCostAnnual),
    yuno_min_tx_monthly: round(minTxMonthly),
    yuno_meets_minimum: meetsMin,
    usd_to_local_fx: fx,
    net_benefit_annual_local: round(netBenefit),
    roi_multiple: round(roi),
    computed_at: new Date().toISOString(),
  }
}

// ── Validate raw input payload ──────────────────────────────────────────

export function validateInputs(raw: Record<string, unknown>): { ok: true; value: BCInputs } | { ok: false; error: string } {
  const num = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
    return null
  }
  const arr = (v: unknown): string[] => {
    if (!Array.isArray(v)) return []
    return v.map(x => String(x).trim()).filter(Boolean)
  }

  let mt = num(raw.monthly_transactions)
  let at = num(raw.avg_ticket_usd)
  const ar = num(raw.current_approval_rate_pct)
  if ((mt === null || mt <= 0 || at === null || at <= 0) && Array.isArray(raw.verticals)) {
    let txSum = 0
    let weightedTicket = 0
    for (const r of raw.verticals as unknown[]) {
      if (typeof r !== 'object' || r === null) continue
      const row = r as Record<string, unknown>
      const vtx = num(row.monthly_tx)
      const vt = num(row.avg_ticket)
      if (vtx && vtx > 0 && vt && vt > 0) {
        txSum += vtx
        weightedTicket += vtx * vt
      }
    }
    if (txSum > 0) {
      mt = mt && mt > 0 ? mt : txSum
      at = at && at > 0 ? at : weightedTicket / txSum
    }
  }
  if (mt === null || mt <= 0) return { ok: false, error: 'monthly_transactions is required (positive number) — or pass verticals[] with monthly_tx per vertical' }
  if (at === null || at <= 0) return { ok: false, error: 'avg_ticket_usd is required (positive number) — or pass verticals[] with avg_ticket per vertical' }
  if (ar === null || ar <= 0 || ar > 100) return { ok: false, error: 'current_approval_rate_pct is required (0-100)' }

  let verticals: VerticalInput[] | undefined
  if (Array.isArray(raw.verticals) && raw.verticals.length > 0) {
    verticals = []
    for (const r of raw.verticals as unknown[]) {
      if (typeof r !== 'object' || r === null) continue
      const row = r as Record<string, unknown>
      const vid = typeof row.id === 'string' ? row.id.trim() : ''
      const vname = typeof row.name === 'string' ? row.name.trim() : ''
      const vtx = num(row.monthly_tx)
      const vticket = num(row.avg_ticket)
      if (!vid || !vname || vtx === null || vtx <= 0 || vticket === null || vticket <= 0) {
        return { ok: false, error: `vertical "${vname || vid || '?'}" needs id, name, monthly_tx>0, avg_ticket>0` }
      }
      const mix = num(row.credit_mix_pct)
      const vAppNow = num(row.approval_rate_pct)
      const vAppNew = num(row.target_approval_rate_pct)
      verticals.push({
        id: vid, name: vname,
        monthly_tx: vtx, avg_ticket: vticket,
        credit_mix_pct: mix !== null && mix >= 0 && mix <= 100 ? mix : undefined,
        approval_rate_pct: vAppNow !== null && vAppNow > 0 && vAppNow <= 100 ? vAppNow : undefined,
        target_approval_rate_pct: vAppNew !== null && vAppNew > 0 && vAppNew <= 100 ? vAppNew : undefined,
      })
    }
    if (verticals.length === 0) verticals = undefined
  }

  const currency = typeof raw.currency === 'string' && raw.currency.trim()
    ? raw.currency.trim().toUpperCase()
    : undefined

  const value: BCInputs = {
    monthly_transactions: mt,
    avg_ticket_usd: at,
    current_approval_rate_pct: ar,
    currency,
    verticals,
    current_acquirers: arr(raw.current_acquirers),
    current_antifraud: typeof raw.current_antifraud === 'string' ? raw.current_antifraud : undefined,
    current_mdr_pct: num(raw.current_mdr_pct) ?? undefined,
    target_mdr_pct: num(raw.target_mdr_pct) ?? undefined,
    current_credit_mdr_pct: num(raw.current_credit_mdr_pct) ?? undefined,
    target_credit_mdr_pct: num(raw.target_credit_mdr_pct) ?? undefined,
    current_debit_mdr_per_tx: num(raw.current_debit_mdr_per_tx) ?? undefined,
    target_debit_mdr_per_tx: num(raw.target_debit_mdr_per_tx) ?? undefined,
    current_debit_mdr_pct: num(raw.current_debit_mdr_pct) ?? undefined,
    target_debit_mdr_pct: num(raw.target_debit_mdr_pct) ?? undefined,
    current_gateway_per_attempt: num(raw.current_gateway_per_attempt) ?? undefined,
    target_gateway_per_attempt: num(raw.target_gateway_per_attempt) ?? undefined,
    current_antifraud_per_attempt: num(raw.current_antifraud_per_attempt) ?? undefined,
    target_antifraud_per_attempt: num(raw.target_antifraud_per_attempt) ?? undefined,
    target_approval_rate_pct: num(raw.target_approval_rate_pct) ?? undefined,
    take_rate_pct: num(raw.take_rate_pct) ?? undefined,
    integrations_planned: num(raw.integrations_planned) ?? undefined,
    reconciliation_savings_monthly_usd: num(raw.reconciliation_savings_monthly_usd) ?? undefined,
    dev_cost_monthly_usd: num(raw.dev_cost_monthly_usd) ?? undefined,
    dev_months_per_integration: num(raw.dev_months_per_integration) ?? undefined,
    acquirers_consolidated: arr(raw.acquirers_consolidated),
    yuno_saas_monthly_usd: num(raw.yuno_saas_monthly_usd) ?? undefined,
    yuno_min_tx_monthly: num(raw.yuno_min_tx_monthly) ?? undefined,
    usd_to_local_fx: num(raw.usd_to_local_fx) ?? undefined,
    yuno_pricing_tiers: Array.isArray(raw.yuno_pricing_tiers)
      ? (raw.yuno_pricing_tiers as unknown[])
          .map((r) => {
            if (typeof r !== 'object' || r === null) return null
            const row = r as Record<string, unknown>
            const limit = num(row.limit_tx)
            const rate = num(row.rate_local)
            if (limit === null || rate === null || limit <= 0 || rate < 0) return null
            return { limit_tx: limit, rate_local: rate }
          })
          .filter((x): x is { limit_tx: number; rate_local: number } => x !== null)
      : undefined,
    // Presentation-only flags — pass through verbatim (no math impact)
    yuno_tier_discount_pct: num(raw.yuno_tier_discount_pct) ?? undefined,
    yuno_min_tx_ramp_enabled: typeof raw.yuno_min_tx_ramp_enabled === 'boolean' ? raw.yuno_min_tx_ramp_enabled : undefined,
    yuno_credit_promo_enabled: typeof raw.yuno_credit_promo_enabled === 'boolean' ? raw.yuno_credit_promo_enabled : undefined,
    yuno_credit_offer_title: typeof raw.yuno_credit_offer_title === 'string' && raw.yuno_credit_offer_title.trim() ? raw.yuno_credit_offer_title : undefined,
    yuno_credit_offer_body: typeof raw.yuno_credit_offer_body === 'string' && raw.yuno_credit_offer_body.trim() ? raw.yuno_credit_offer_body : undefined,
    yuno_extras_enabled: typeof raw.yuno_extras_enabled === 'boolean' ? raw.yuno_extras_enabled : undefined,
    psp_arena_roster: Array.isArray(raw.psp_arena_roster)
      ? (raw.psp_arena_roster as unknown[])
          .map((r) => {
            if (typeof r !== 'object' || r === null) return null
            const row = r as Record<string, unknown>
            const name = typeof row.name === 'string' ? row.name.trim() : ''
            const bid = num(row.bid)
            const share = num(row.share)
            if (!name || bid === null || bid < 0 || share === null || share < 0) return null
            const status = typeof row.status === 'string' && ['winning', 'active', 'probing'].includes(row.status)
              ? row.status
              : 'active'
            return { name, bid, share, status }
          })
          .filter((x): x is { name: string; bid: number; share: number; status: string } => x !== null)
      : undefined,
  }
  return { ok: true, value }
}
