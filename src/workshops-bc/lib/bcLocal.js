// bcLocal.js — single source of truth for workshop BC numbers in LOCAL
// currency. Wraps the FX conversion + total recomputation so every slide
// renders consistent values.
//
// Why this exists: workshops-bc-math.ts stores dev cost + reconciliation
// values as TRUE USD (they come from hardcoded USD benchmark inputs), but
// the math then sums them with mdr/antifraud/gateway savings which are in
// LOCAL currency (computed from per-vertical avg_ticket × tx_volume). The
// resulting `direct_savings_annual_usd` and `total_annual_value_usd` are
// a broken currency mix for any non-USD deck (e.g. Coppel in MXN).
//
// This helper:
//   1. Detects whether USD→local conversion is required (currency !== USD).
//   2. Returns dev/recon values pre-multiplied by FX.
//   3. Recomputes direct_savings + total_annual_value using the corrected
//      operational component so the stored mixed totals are bypassed.
//
// For future decks, the math file should also be patched to store correct
// `_local` variants; this helper prefers those when present and falls back
// to FX-scaling the legacy `_usd` fields, so it handles both eras.

const DEV_TEAMS_MONTHLY_USD = 6300 + 1575 + 1350 + 1350 + 900 + 810 + 675 // 12,960
const DEFAULT_DEV_MONTHS_PER_INTEGRATION = 3
const DEFAULT_RECON_MONTHLY_USD = 10_000
const DEFAULT_INTEGRATIONS = 6

export function deriveLocalBC(data) {
  const inputs = data?.INPUTS || {}
  const bc = data?.BUSINESS_CASE || {}
  // Math currency is what the BC numbers (mdr/af/gateway/revenue) are
  // denominated in — that's inputs.currency, not the top-level deck
  // display currency (which may have defaulted to USD in migration 147).
  const currency = (inputs.currency || bc.currency || 'USD').toUpperCase()
  const fx = Math.max(1, Number(bc.usd_to_local_fx) || Number(inputs.usd_to_local_fx) || 18)
  const isUSD = currency === 'USD'
  const usdToLocal = isUSD ? 1 : fx

  const integrations = Math.max(0, Number(inputs.integrations_planned) || DEFAULT_INTEGRATIONS)
  const devMonthsPerInt = Math.max(0, Number(inputs.dev_months_per_integration) || DEFAULT_DEV_MONTHS_PER_INTEGRATION)
  const devMonthlyUsd = Math.max(0, Number(inputs.dev_cost_monthly_usd) || DEV_TEAMS_MONTHLY_USD)
  // Explicit 0 means "no reconciliation savings in this deck" (BCI Seguros)
  // — only fall back to the 10K benchmark when the input is absent. A bare
  // `|| DEFAULT` here resurrected the $120K/yr recon line in slide formulas
  // for decks that had explicitly zeroed it out.
  const reconMonthlyUsd = inputs.reconciliation_savings_monthly_usd != null
    ? Math.max(0, Number(inputs.reconciliation_savings_monthly_usd) || 0)
    : DEFAULT_RECON_MONTHLY_USD

  // Per-team / per-month USD benchmarks scaled to local
  const devMonthlyLocal = devMonthlyUsd * usdToLocal
  const reconMonthlyLocal = reconMonthlyUsd * usdToLocal

  // Prefer _local fields if math file was patched; otherwise FX-scale _usd
  const perIntegrationLocal = Number(bc.dev_cost_per_integration_local)
    || ((Number(bc.dev_cost_per_integration_usd) || (devMonthlyUsd * devMonthsPerInt)) * usdToLocal)
  const devOneTimeLocal = Number(bc.dev_cost_savings_one_time_local)
    || ((Number(bc.dev_cost_savings_one_time_usd) || (devMonthlyUsd * devMonthsPerInt * integrations)) * usdToLocal)
  // Same explicit-0 rule: a stored 0 is a real value, not a missing field.
  const reconAnnualLocal = bc.reconciliation_savings_annual_local != null
    ? (Number(bc.reconciliation_savings_annual_local) || 0)
    : (bc.reconciliation_savings_annual_usd != null
        ? (Number(bc.reconciliation_savings_annual_usd) || 0) * usdToLocal
        : reconMonthlyUsd * 12 * usdToLocal)
  const operationalYear1Local = Number(bc.operational_savings_year1_local)
    || (devOneTimeLocal + reconAnnualLocal)
  const engMonthsSaved = Number(bc.engineering_months_saved) || (devMonthsPerInt * integrations)

  // Local-currency savings (already correct in bc — misnamed with _usd
  // suffix but values reflect the math currency).
  const mdrSavings = Number(bc.mdr_savings_annual_usd) || 0
  const mdrCreditSavings = Number(bc.mdr_credit_savings_annual) || 0
  const mdrDebitSavings = Number(bc.mdr_debit_savings_annual) || 0
  const antifraudSavings = Number(bc.antifraud_savings_annual_usd) || 0
  const gatewaySavings = Number(bc.gateway_savings_annual) || 0
  const incrementalRevenue = Number(bc.incremental_revenue_annual_usd) || 0

  // Recomputed totals — bypass the broken stored _usd totals
  const directSavings = Number(bc.direct_savings_annual_local)
    || (mdrSavings + antifraudSavings + gatewaySavings + operationalYear1Local)
  const totalAnnualValue = Number(bc.total_annual_value_local)
    || (incrementalRevenue + directSavings)

  return {
    currency, fx, isUSD, usdToLocal,
    integrations, devMonthsPerInt,
    devMonthlyUsd, devMonthlyLocal,
    reconMonthlyUsd, reconMonthlyLocal,
    perIntegrationLocal, devOneTimeLocal, reconAnnualLocal, operationalYear1Local,
    engMonthsSaved,
    mdrSavings, mdrCreditSavings, mdrDebitSavings,
    antifraudSavings, gatewaySavings, incrementalRevenue,
    directSavings, totalAnnualValue,
  }
}
