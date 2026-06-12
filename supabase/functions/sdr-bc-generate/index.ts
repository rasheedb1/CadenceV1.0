// sdr-bc-generate
// =============================================================================
// Generates the SDR Business Case deck data for a target client and persists
// it as a row in `presentations` with kind='sdr_bc'. The deck is served at
// chief.yuno.tools/sdr-bc/<slug> by a sister render endpoint (next phase).
//
// Pipeline:
//   1. Auth (X-Agent-Token | service-role | user-jwt) — same model as presentation-create
//   2. Resolve AE via createdByEmail → user_id + org_id from ae_integrations
//   3. Find or create account_map_companies row by website
//   4. Call chief-deep-research-company (30d cache) → intelligence with
//      avg_ticket_usd + industry_category + per-country legal_entities[]
//   5. Call similarweb-traffic for full top_countries[] (cache hit after step 4)
//   6. Bucket top countries (share ≥ 1%) into regions, take top-5 per region
//   7. Compute cards math per country (tpv, ar, dtpv, cost) + region totals
//   8. Persist as presentations row, return { id, slug, url }
//
// APMs slide data is NOT computed here yet — that's a follow-up once the
// uplift/MDR-delta specs land.
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'
import {
  isoFromCountryName, regionOf, baseAuthRate,
  REGION_LABEL, type RegionKey,
} from '../_shared/regions.ts'
import { lookupIndustry, FALLBACK_INDUSTRY, INDUSTRIES, type IndustryEntry } from '../_shared/industries.ts'
import { recommendApms } from '../_shared/apms-by-country.ts'
import { getRegionalStack } from '../_shared/regional-psps.ts'
import {
  validateLang, validateCurrency,
  REGION_LABELS_I18N, type Lang,
} from '../_shared/i18n.ts'
import {
  runResearch, buildPaymentStack,
  type IntelligenceShape, type SimilarWebTopCountry,
} from '../_shared/sdr-bc-research-core.ts'

const PUBLIC_BASE_URL = 'https://chief.yuno.tools'

// ── BC math constants (match plan-sdr-bc-regional-cards.md) ──
const CONVERSION = 0.07
const DELTA_AR_WITH_ENTITY_PP = 2
const DELTA_AR_NO_ENTITY_PP = 4
const DELTA_MDR_WITH_ENTITY_BPS = 20
const DELTA_MDR_NO_ENTITY_BPS = 50
const COUNTRY_SHARE_FLOOR = 0.01
const MAX_COUNTRIES_PER_REGION = 5
const REGION_KEYS: RegionKey[] = ['us', 'lat', 'ema', 'apa']

// APM uplift assumptions (slide 13). Per-country, conditioned on how many
// NEW APMs we can recommend the client to add (max 3 from the catalog).
const APM_NEW_TX_PCT_PER_APM = 0.01     // +1% transactions per new APM proposed
const APM_MIGRATION_PCT_PER_APM = 0.03  // 3% of existing card flow migrates per APM
const APM_MAX_RECOMMENDATIONS = 3
const APM_MDR_PCT = 0.01                // APMs cost 1% MDR
const CARD_MDR_WITH_ENTITY = 0.02       // baseline: 2% if local entity
const CARD_MDR_NO_ENTITY = 0.04         // baseline: 4% if cross-border

// Dev-savings assumptions (slide 14). North America monthly team cost is the
// baseline (from the template); other regions scale to local engineering costs.
const DEV_TEAMS_BASE: Array<{ team: string; m: number }> = [
  { team: 'Product',            m: 2250  },
  { team: 'Engineering',        m: 10500 },
  { team: 'Fraud/Risk',         m: 2250  },
  { team: 'Treasury',           m: 1350  },
  { team: 'Compliance',         m: 1500  },
  { team: 'Finance',            m: 1125  },
  { team: 'Banking & Payments', m: 2625  },
]
const REGION_DEV_MULTIPLIER: Record<RegionKey, number> = {
  us:  1.0,
  lat: 0.6,
  ema: 0.8,
  apa: 0.7,
}
const MONTHS_PER_INTEGRATION = 3

// ── CORS ──
const ALLOWED_ORIGINS = new Set([
  'https://chief.yuno.tools',
  'http://localhost:5173',
  'http://localhost:3000',
])
function corsHeaders(origin: string | null): HeadersInit {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://chief.yuno.tools'
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-agent-token, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  }
}
function ok(body: unknown, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  })
}
function err(msg: string, status: number, origin: string | null, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error: msg, ...extra }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  })
}

// constant-time string compare (avoid timing side-channel on token comparisons)
function timingSafeStrEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'client'
}
function randomSuffix(len = 6): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  let s = ''
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  for (let i = 0; i < len; i++) s += chars[bytes[i] % chars.length]
  return s
}

// ── BC math primitives ──
// Format USD-in-millions for the deck cells. Web-traffic-driven TPV can be
// sub-$0.1M for small/mobile-first companies, so we step decimals down to
// 3 for the long tail (otherwise cost-reduction cells round to 0 and the
// deck looks broken). Examples:
//   32     -> "32"        (>= 10: integer)
//   6.6    -> "6.6"       (1..10: 1 decimal)
//   0.928  -> "0.93"      (0.01..1: 2 decimals)
//   0.0132 -> "0.01"      (still 2 decimals at this band)
//   0.0064 -> "0.006"     (0.001..0.01: 3 decimals)
//   0.0003 -> "<0.001"    (anything smaller is a rounding artifact)
function fmtMoneyM(usd_m: number): string {
  if (!Number.isFinite(usd_m) || usd_m <= 0) return '0'
  if (usd_m < 0.001) return '<0.001'
  const trimZeros = (s: string) => s.replace(/0+$/, '').replace(/\.$/, '')
  if (usd_m < 0.01) return trimZeros(usd_m.toFixed(3))
  if (usd_m < 1)    return trimZeros(usd_m.toFixed(2))
  if (usd_m < 10)   return usd_m.toFixed(1).replace(/\.0$/, '')
  // Integer >= 10: add thousands separators for readability ($17,650M not $17650M).
  return Math.round(usd_m).toLocaleString('en-US')
}

interface CardsRow {
  country: string
  iso: string
  tpv: string
  ar: string
  dtpv: string
  cost: string
}

// IntelligenceShape + SimilarWebTopCountry are imported from sdr-bc-research-core.

// Override shapes accepted from the UI Step-2 wizard. All fields optional; when
// present, override the auto-resolved values from deep-research. See plan
// `tasks/plan-sdr-bc-optional-overrides.md`.
interface LegalEntityOverride { iso: string; has_entity: boolean }
interface ExistingApmsOverride { iso: string; apms: string[] }

// Normalize a Step-2 list override (acquirers/gateways/methods). Returns the
// trimmed, deduped, non-empty string list, or null when the field wasn't an
// array (caller then falls back to the auto-derived column).
function parseStringListOverride(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of raw) {
    if (typeof v !== 'string') continue
    const name = v.trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

// Antifraud vendors — used on the new orchestration slide (slide 6). We only
// render the antifraud node on the "today" side when one of these names is
// explicitly mentioned in research; otherwise that side stays clean (per AE
// brief: "no es necesario pintarlo a menos que el research diga que el
// cliente tiene contrato con cybersource, riskified, etc.").
const ANTIFRAUD_VENDORS_CANONICAL: Record<string, string> = {
  'cybersource':   'Cybersource',
  'riskified':     'Riskified',
  'forter':        'Forter',
  'signifyd':      'Signifyd',
  'kount':         'Kount',
  'sift':          'Sift',
  'clearsale':     'ClearSale',
  'aci':           'ACI Fraud Management',
  'adyen risk':    'Adyen RevenueProtect',
  'stripe radar':  'Stripe Radar',
  'arkose':        'Arkose Labs',
  'incognia':      'Incognia',
  'minfraud':      'MinFraud (MaxMind)',
  'fraudlabs':     'FraudLabs Pro',
}

// Returns the canonical name of an antifraud vendor explicitly mentioned in
// the deep-research payment_stack (psps_detected names OR gateway_evidence
// descriptions), or null if none found. We deliberately don't infer — the
// vendor name must appear verbatim in the research payload.
function detectCurrentAntifraud(intel: IntelligenceShape): string | null {
  const psps = intel.payment_stack?.psps_detected || []
  for (const p of psps) {
    const name = (p.name || '').toLowerCase()
    for (const key of Object.keys(ANTIFRAUD_VENDORS_CANONICAL)) {
      if (name.includes(key)) return ANTIFRAUD_VENDORS_CANONICAL[key]
    }
  }
  const evidence = intel.payment_stack?.gateway_evidence || []
  for (const e of evidence) {
    const desc = (e.description || '').toLowerCase()
    for (const key of Object.keys(ANTIFRAUD_VENDORS_CANONICAL)) {
      if (desc.includes(key)) return ANTIFRAUD_VENDORS_CANONICAL[key]
    }
  }
  return null
}

// Truncate a string at a word boundary (no mid-word cuts). Always ends with "…"
// when shortened so the reader sees the elision.
function truncateAtWord(s: string, max: number): string {
  if (s.length <= max) return s
  const slice = s.slice(0, max)
  const lastSpace = slice.lastIndexOf(' ')
  const cut = lastSpace > max - 30 ? lastSpace : max
  return slice.slice(0, cut).replace(/[,;:.]$/, '').trim() + '…'
}

function buildStackObservations(intel: IntelligenceShape): string[] {
  const out: string[] = []
  // 1. Orchestrator status
  if (intel.payment_stack?.orchestrator_detected === false) {
    out.push('No orchestration layer detected — multiple direct PSP integrations create operational complexity')
  } else if (intel.payment_stack?.orchestrator_detected === true) {
    out.push('Orchestration layer in place — opportunity to consolidate via Yuno for better routing economics')
  }
  // 2. Cross-border / missing entity (highest-priority entry)
  const xb = (intel.cross_border_opportunities || []).find(o => o.opportunity_score === 'high') ?? intel.cross_border_opportunities?.[0]
  if (xb?.why) out.push(truncateAtWord(stripInferenceTag(xb.why), 140))
  // 3. APM gap (highest-priority entry)
  const gap = (intel.apm_gaps || []).find(g => g.opportunity_score === 'high') ?? intel.apm_gaps?.[0]
  if (gap?.why) out.push(truncateAtWord(stripInferenceTag(gap.why), 140))

  // Pad with generic observations if we got fewer than 3 from the intel.
  const generic = [
    'Card networks dominate online volume across primary markets',
    'Limited APM coverage in high-growth regions',
    'Multiple local acquirer integrations create operational complexity',
  ]
  for (const g of generic) {
    if (out.length >= 3) break
    if (!out.some(o => o.toLowerCase().includes(g.split(' ')[0].toLowerCase()))) out.push(g)
  }
  return out.slice(0, 3)
}

function stripInferenceTag(s: string): string {
  return s.replace(/\[INFERENCE[^\]]*\]\s*/gi, '').trim()
}

function existingApmsFor(
  intel: IntelligenceShape, iso: string, countryName: string,
  overrides?: ExistingApmsOverride[] | null,
): string[] {
  // UI override wins when present for this ISO. Empty array IS a valid override
  // ("the AE confirmed this country has no APMs detected") — distinct from null.
  if (overrides) {
    const o = overrides.find(x => x.iso?.toUpperCase() === iso)
    if (o) return Array.isArray(o.apms) ? o.apms : []
  }
  const list = intel.existing_apms || []
  const match = list.find(e => {
    if (e.iso && e.iso.toUpperCase() === iso) return true
    if (e.country && e.country.toLowerCase() === countryName.toLowerCase()) return true
    return false
  })
  return Array.isArray(match?.apms) ? (match!.apms as string[]) : []
}

function verifiedLocal(
  intel: IntelligenceShape, iso: string, countryName: string,
  overrides?: LegalEntityOverride[] | null,
): boolean {
  // UI override wins when present for this ISO. Bypasses the confidence gate —
  // the AE explicitly told us whether the entity exists.
  if (overrides) {
    const o = overrides.find(x => x.iso?.toUpperCase() === iso)
    if (o) return o.has_entity === true
  }
  const list = intel.legal_entities || []
  const match = list.find(e => {
    if (e.iso && e.iso.toUpperCase() === iso) return true
    if (e.country && e.country.toLowerCase() === countryName.toLowerCase()) return true
    return false
  })
  if (!match) return false
  return match.has_entity === true && (match.confidence === 'high' || match.confidence === 'med')
}

// Does ANY country in the EMA bucket (Europe + Middle East + Africa) have a
// verified local entity? If yes, we propagate the entity status to the rest of
// EMA: Yuno-side rationale = once the client has the regulated EU/EEA/MEA
// presence in one market, the same entity unlocks favourable AR/MDR economics
// across the bucket. An AE-provided override (yes OR no) on a specific ISO
// still wins — propagation only fills in countries that have no explicit value.
function emaHasAnyVerifiedEntity(
  intel: IntelligenceShape,
  overrides?: LegalEntityOverride[] | null,
): boolean {
  if (overrides) {
    for (const o of overrides) {
      if (o.has_entity === true && regionOf(o.iso) === 'ema') return true
    }
  }
  const list = intel.legal_entities || []
  for (const e of list) {
    const iso = e.iso?.toUpperCase() || (e.country ? isoFromCountryName(e.country) : null)
    if (!iso) continue
    if (regionOf(iso) !== 'ema') continue
    if (e.has_entity === true && (e.confidence === 'high' || e.confidence === 'med')) return true
  }
  return false
}

function computeRegionalCards(
  topCountries: SimilarWebTopCountry[],
  intel: IntelligenceShape,
  ticketUsd: number,
  avgMonthlyVisitsSiteWide: number,
  lang: Lang = 'en',
  overrides: {
    legalEntities?: LegalEntityOverride[] | null
    existingApms?: ExistingApmsOverride[] | null
    emaPropagation?: boolean
    // App-traffic mode: when set, TPV per country is computed as
    // appTrafficTpvGlobalM × share instead of visits × conversion × ticket.
    // Total TPV comes from revenue / take_rate, derived upstream in the handler.
    appTrafficTpvGlobalM?: number | null
  } = {},
): Record<string, unknown> {
  const buckets: Record<RegionKey, Array<{ iso: string; name: string; share: number; visits: number }>> = {
    us: [], lat: [], ema: [], apa: [],
  }
  for (const c of topCountries) {
    if (!c.share || c.share < COUNTRY_SHARE_FLOOR) continue
    const iso = isoFromCountryName(c.name)
    if (!iso) continue
    const region = regionOf(iso)
    if (!region) continue
    buckets[region].push({ iso, name: c.name, share: c.share, visits: c.visits })
  }
  for (const r of REGION_KEYS) {
    buckets[r].sort((a, b) => b.share - a.share)
    buckets[r] = buckets[r].slice(0, MAX_COUNTRIES_PER_REGION)
  }

  const out: Record<string, unknown> = {}
  const regionsRendered: Array<{ region: RegionKey; label: string; country_count: number }> = []

  // Global rollups (Slide 10 four-levers + Slide 27 grand total). All in M USD.
  let globalCardsUpliftM   = 0   // Σ cards Δ TPV (acceptance-rate lever)
  let globalApmsUpliftM    = 0   // Σ APMs Δ TPV (new-methods-growth lever)
  let globalCardsCostM     = 0   // Σ cards cost reduction (MDR lever, cards portion)
  let globalApmsCostM      = 0   // Σ APMs cost reduction (MDR lever, APMs portion)
  let globalDevSavingsM    = 0   // Σ dev savings (build/run-avoidance lever)
  let globalTpvBaseM       = 0   // Σ cards TPV base (slide 10 footnote)

  for (const region of REGION_KEYS) {
    const countries = buckets[region]
    if (countries.length === 0) continue
    const key = region.toUpperCase()
    const rows: CardsRow[] = []
    let tpvSum = 0
    let dtpvSum = 0
    let costSum = 0
    const apmsRowsForRegion: Array<{ country: string; iso: string; apms: string; dtpv: string; cost: string }> = []
    let apmUpSum = 0
    let apmCostSum = 0
    // Split the integration count so slide 14 can show "X APMs + Y PSPs" —
    // a market without a verified entity adds 1 PSP integration (Yuno covers
    // the local rails), in addition to the APM integrations.
    let numApmsIntegRegion = 0
    let numPspsIntegRegion = 0

    for (const c of countries) {
      // SimilarWeb's geo endpoint returns `c.visits` as the TOTAL visit count
      // across the 3-month query window. Don't multiply that by 12 (it'd
      // overcount by ~4x). Compute annual visits from the site-wide monthly
      // average × the country's share — same end result, dimensionally clean.
      const visitsAnnual = avgMonthlyVisitsSiteWide * c.share * 12
      // App-traffic mode wins: total TPV (in M USD) was derived from
      // annual_revenue / take_rate upstream — distribute by country share.
      // Falls back to the visits × conversion × ticket math when not set.
      const tpv_m = (typeof overrides.appTrafficTpvGlobalM === 'number' && overrides.appTrafficTpvGlobalM > 0)
        ? overrides.appTrafficTpvGlobalM * c.share
        : (visitsAnnual * CONVERSION * ticketUsd) / 1_000_000

      // hasEntity ladder: explicit AE override > intel.legal_entities (high|med
      // confidence) > EMA bucket propagation (only kicks in for EMA countries
      // when at least one EMA country has a verified entity, and the country
      // itself has no explicit AE override). See emaHasAnyVerifiedEntity().
      let hasEntity = verifiedLocal(intel, c.iso, c.name, overrides.legalEntities)
      if (!hasEntity && overrides.emaPropagation && region === 'ema') {
        const hadExplicitOverride = overrides.legalEntities?.some(o => o.iso?.toUpperCase() === c.iso)
        if (!hadExplicitOverride) hasEntity = true
      }
      const dPp = hasEntity ? DELTA_AR_WITH_ENTITY_PP : DELTA_AR_NO_ENTITY_PP
      const dMdr = hasEntity ? DELTA_MDR_WITH_ENTITY_BPS : DELTA_MDR_NO_ENTITY_BPS
      const baseAr = baseAuthRate(c.iso)
      const dtpv_m = tpv_m * (dPp / 100) / baseAr // multiplicative
      const cost_m = tpv_m * (dMdr / 10_000)

      rows.push({
        country: c.name,
        iso: c.iso,
        tpv: fmtMoneyM(tpv_m),
        ar: `+${dPp}`,
        dtpv: fmtMoneyM(dtpv_m),
        cost: fmtMoneyM(cost_m),
      })
      tpvSum += tpv_m
      dtpvSum += dtpv_m
      costSum += cost_m

      // ── APMs row (slide 13) ──
      // Recommend up to 3 catalog APMs the client doesn't already have.
      // Uplift: +1% transactions per new APM. Cost reduction: 3% of card
      // flow migrates per APM, paying 1% MDR vs. the old 2%/4% card MDR.
      const existing = existingApmsFor(intel, c.iso, c.name, overrides.existingApms)
      const recommended = recommendApms(c.iso, existing, APM_MAX_RECOMMENDATIONS)
      const numNew = recommended.length
      const apmUp_m   = tpv_m * APM_NEW_TX_PCT_PER_APM * numNew
      const migration = APM_MIGRATION_PCT_PER_APM * numNew                 // 0..9%
      const oldCardMdr = hasEntity ? CARD_MDR_WITH_ENTITY : CARD_MDR_NO_ENTITY
      const savingsPerDollar = Math.max(0, oldCardMdr - APM_MDR_PCT)
      const apmCost_m = tpv_m * migration * savingsPerDollar

      apmsRowsForRegion.push({
        country: c.name,
        iso: c.iso,
        apms: numNew > 0 ? recommended.join(', ') : '— (already covered)',
        dtpv: fmtMoneyM(apmUp_m),
        cost: fmtMoneyM(apmCost_m),
      })
      apmUpSum += apmUp_m
      apmCostSum += apmCost_m
      numApmsIntegRegion += numNew
      // +1 PSP integration per market without local entity (Yuno absorbs the
      // local rail). Drives a higher dev-savings number on slide 14.
      if (!hasEntity) numPspsIntegRegion += 1
    }

    // ── Dev savings (slide 14) ──
    // Each integration the client would otherwise build in-house = 3 months of
    // cross-functional team time. Integrations come from two sources:
    //   - APMs: one per recommended APM per country (capped at 3/country)
    //   - PSPs: +1 per country WITHOUT a verified local entity (Yuno covers it)
    // Yuno bundles them all into one platform integration, so the savings =
    // team-cost × 3 × (numApms + numPsps).
    const numIntegrationsRegion = numApmsIntegRegion + numPspsIntegRegion
    const devMult = REGION_DEV_MULTIPLIER[region]
    const devRows = DEV_TEAMS_BASE.map(t => {
      const m = Math.round(t.m * devMult)
      const i = m * MONTHS_PER_INTEGRATION
      const all = i * numIntegrationsRegion
      return { team: t.team, m, i, all }
    })
    const devCostMTot   = devRows.reduce((s, r) => s + r.m, 0)
    const devIntegTot   = devRows.reduce((s, r) => s + r.i, 0)
    const devAllTotUsd  = devRows.reduce((s, r) => s + r.all, 0)
    const devAllTot_m   = devAllTotUsd / 1_000_000
    const devTimeMonths = numIntegrationsRegion * MONTHS_PER_INTEGRATION

    out[`${region}_dev_rows`]        = devRows
    out[`${key}_DEV_COSTM_TOT`]      = devCostMTot
    out[`${key}_DEV_INTEG_TOT`]      = devIntegTot
    out[`${key}_DEV_ALL_INTEG_TOT`]  = devAllTotUsd
    out[`${key}_DEV_SAVINGSTOT`]     = fmtMoneyM(devAllTot_m)
    out[`${key}_DEV_TIME`]           = devTimeMonths < 24
      ? `${devTimeMonths} mo`
      : `${(devTimeMonths / 12).toFixed(1)} yrs`
    out[`${key}_DEV_NUM_INTEG`]      = numIntegrationsRegion
    out[`${key}_DEV_NUM_APMS_INTEG`] = numApmsIntegRegion
    out[`${key}_DEV_NUM_PSPS_INTEG`] = numPspsIntegRegion
    out[`${region}_cards_rows`] = rows
    out[`${key}_TPV_TOT`] = fmtMoneyM(tpvSum)
    out[`${key}_TPVUPT`] = fmtMoneyM(dtpvSum)
    out[`${key}_COST_REDTOT`] = fmtMoneyM(costSum)
    // REVENUEUP filled in caller (needs industry take_rate).
    out[`${region}_cards_totals_raw`] = { tpv_m: tpvSum, tpvup_m: dtpvSum, cost_m: costSum }

    out[`${region}_apms_rows`] = apmsRowsForRegion
    out[`${key}_APMUPT`] = fmtMoneyM(apmUpSum)
    out[`${key}_COST_APMREDTOT`] = fmtMoneyM(apmCostSum)
    out[`${region}_apms_totals_raw`] = { apmup_m: apmUpSum, cost_m: apmCostSum }

    // Per-region "TOTAL" (slide 27): cards Δ TPV + APMs Δ TPV + all cost-red + dev savings (M).
    const regionTotalM = dtpvSum + apmUpSum + costSum + apmCostSum + devAllTot_m
    out[`${key}_TOTAL`] = fmtMoneyM(regionTotalM)

    // Accumulate global rollups for slide 10 + slide 27 grand total.
    globalCardsUpliftM += dtpvSum
    globalApmsUpliftM  += apmUpSum
    globalCardsCostM   += costSum
    globalApmsCostM    += apmCostSum
    globalDevSavingsM  += devAllTot_m
    globalTpvBaseM     += tpvSum

    // Use language-aware label so the persisted regions_rendered matches the
    // chosen deck language. Falls back to REGION_LABEL on any unexpected lang.
    const label = REGION_LABELS_I18N[lang]?.[region] ?? REGION_LABEL[region]
    regionsRendered.push({ region, label, country_count: rows.length })
  }
  out._regions_rendered = regionsRendered

  // ── Slide 10 (Four levers) + Slide 27 (grand total) global placeholders ──
  // The math is fully deterministic (single assumption stack), so we emit one
  // value per lever — no conservative/optimistic spread. The MDR lever combines
  // cards + APMs cost reduction; the grand total is the sum of all four.
  const globalCostRedM = globalCardsCostM + globalApmsCostM
  const grandTotalM    = globalCardsUpliftM + globalApmsUpliftM + globalCostRedM + globalDevSavingsM

  out.TOTAL_ARUPTOT     = fmtMoneyM(globalCardsUpliftM)
  out.TOTAL_APMUPT      = fmtMoneyM(globalApmsUpliftM)
  out.TOTAL_COST_REDTOT = fmtMoneyM(globalCostRedM)
  out.TOTAL_DEV_SAVINGS = fmtMoneyM(globalDevSavingsM)
  out.GRAND_TOTAL       = fmtMoneyM(grandTotalM)
  out.TPV_BASE          = fmtMoneyM(globalTpvBaseM)

  return out
}

// Research helpers (callDeepResearch, callSimilarWeb, ensureDomainGroup,
// fetchCanonicalDomainGroup) moved to _shared/sdr-bc-research-core.ts so the
// new sdr-bc-research endpoint can reuse them without duplication.

serve(async (req) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }
  if (req.method !== 'POST') return err('Use POST', 405, origin)

  // ── Auth (mirrors presentation-create) ──
  const expectedToken = Deno.env.get('PRESENTATIONS_AGENT_TOKEN')
  const serviceRoleFull = Deno.env.get('SERVICE_ROLE_KEY_FULL') || ''
  const serviceRoleAuto = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const provided = req.headers.get('x-agent-token') || req.headers.get('X-Agent-Token') || ''
  const authHdr = req.headers.get('authorization') || req.headers.get('Authorization') || ''
  const bearer = authHdr.toLowerCase().startsWith('bearer ') ? authHdr.slice(7) : ''
  const tokenOk = !!expectedToken && timingSafeStrEqual(provided, expectedToken)
  const bearerOk = !!bearer && (
    (!!serviceRoleFull && timingSafeStrEqual(bearer, serviceRoleFull)) ||
    (!!serviceRoleAuto && timingSafeStrEqual(bearer, serviceRoleAuto))
  )
  // User JWT path is allowed too — same as presentation-create. Validation is light here
  // because the SDR-BC is read-only research; we only need the AE's org for persistence.
  let jwtUser: { id: string; email?: string } | null = null
  if (!tokenOk && !bearerOk && bearer) {
    try {
      const adminClient = createSupabaseClient()
      const { data: userData } = await adminClient.auth.getUser(bearer)
      if (userData?.user) jwtUser = { id: userData.user.id, email: userData.user.email || undefined }
    } catch { /* fall through */ }
  }
  if (!tokenOk && !bearerOk && !jwtUser) {
    return err('Invalid auth: provide X-Agent-Token, service-role Bearer, or user JWT', 401, origin)
  }

  // ── Parse body ──
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return err('Invalid JSON body', 400, origin) }

  const clientName = typeof body.clientName === 'string' ? body.clientName.trim() : ''
  const websiteRaw = typeof body.website === 'string' ? body.website.trim() : ''
  const createdByEmail = typeof body.createdByEmail === 'string' ? body.createdByEmail.trim() : ''
  const avgTicketOverride = typeof body.avg_ticket_override_usd === 'number' ? body.avg_ticket_override_usd : null
  const forceRefresh = body.force_refresh === true
  const acceptLowConfidence = body.accept_low_confidence === true
  // Emergency mode: skip SimilarWeb (use AE-provided traffic data) and/or
  // skip deep research. Useful when API credits are exhausted. Both inputs
  // are optional — when absent, the auto flow runs unchanged.
  const skipDeepResearch = body.skip_deep_research === true
  // App-traffic mode: for app-first clients where SimilarWeb webviews aren't
  // representative of transactions. When on, the math inverts — TPV is derived
  // from annual revenue / take rate instead of visits × conversion × ticket.
  // annual_revenue_usd_override (optional) lets the AE provide the figure
  // directly; otherwise the deep-research run extracts it.
  const appTrafficMode = body.app_traffic_mode === true
  const annualRevenueOverride = typeof body.annual_revenue_usd_override === 'number' && body.annual_revenue_usd_override > 0
    ? body.annual_revenue_usd_override
    : null
  const manualTrafficRaw = (body.manual_traffic && typeof body.manual_traffic === 'object')
    ? body.manual_traffic as Record<string, unknown>
    : null
  const manualTraffic = manualTrafficRaw ? (() => {
    const total = typeof manualTrafficRaw.total_monthly_visits === 'number' ? manualTrafficRaw.total_monthly_visits : 0
    const rawCountries = Array.isArray(manualTrafficRaw.top_countries) ? manualTrafficRaw.top_countries : []
    const topCountries = rawCountries
      .filter((c: unknown): c is Record<string, unknown> => !!c && typeof c === 'object')
      .map((c: Record<string, unknown>) => ({
        iso: typeof c.iso === 'string' ? (c.iso as string).toUpperCase() : '',
        share: typeof c.share === 'number' ? c.share : 0,
        visits: typeof c.visits === 'number' ? c.visits : undefined,
      }))
      .filter((c: { iso: string; share: number }) => c.iso && c.share > 0)
    // In app_traffic_mode the visit count is never read (TPV = revenue/take_rate),
    // so manual country shares are valid without total_monthly_visits.
    const ok = topCountries.length > 0 && (total > 0 || appTrafficMode)
    return ok ? { totalMonthlyVisits: total, topCountries } : null
  })() : null
  // Multilingual fields (mig 147). Both fields default to en / USD when caller
  // doesn't pass them — preserves existing English-only behaviour for cadence
  // step + legacy skill calls. Whitelisted in validateLang/validateCurrency.
  const language: Lang = validateLang(body.language, 'en')
  const currency: string = validateCurrency(body.currency, 'USD')

  // ── UI overrides (Step 2 of /sdr-bc wizard, all optional) ──
  // industry_override: validate against INDUSTRIES catalog; reject unknown.
  // legal_entities_override / existing_apms_override: per-ISO arrays; merged
  // in computeRegionalCards (override wins when ISO matches).
  // sdr_name / sdr_position: cover slide only, no math impact.
  const rawIndustryOverride = typeof body.industry_override === 'string' ? body.industry_override.trim() : ''
  let industryOverride: IndustryEntry | null = null
  if (rawIndustryOverride) {
    industryOverride = lookupIndustry(rawIndustryOverride)
    if (!industryOverride) {
      return err(
        `industry_override "${rawIndustryOverride}" not in INDUSTRIES catalog (37 valid categories)`,
        400, origin,
        { reason: 'invalid_industry_override', valid_categories: INDUSTRIES.map(i => i.category) },
      )
    }
  }
  const legalEntitiesOverride: LegalEntityOverride[] | null = Array.isArray(body.legal_entities_override)
    ? (body.legal_entities_override as Array<Record<string, unknown>>)
        .filter(x => typeof x.iso === 'string' && typeof x.has_entity === 'boolean')
        .map(x => ({ iso: String(x.iso).toUpperCase(), has_entity: x.has_entity as boolean }))
    : null
  const existingApmsOverride: ExistingApmsOverride[] | null = Array.isArray(body.existing_apms_override)
    ? (body.existing_apms_override as Array<Record<string, unknown>>)
        .filter(x => typeof x.iso === 'string' && Array.isArray(x.apms))
        .map(x => ({
          iso: String(x.iso).toUpperCase(),
          apms: (x.apms as unknown[]).filter((a): a is string => typeof a === 'string' && a.trim().length > 0),
        }))
    : null
  const sdrName = typeof body.sdr_name === 'string' ? body.sdr_name.trim() : ''
  const sdrPosition = typeof body.sdr_position === 'string' ? body.sdr_position.trim() : ''

  // Slide-4 payment-stack overrides (Step-2 wizard). Each is the full, AE-edited
  // list for that column. null = not provided → fall back to auto (research +
  // regional catalog). An explicitly empty array hides that column.
  const acquirersOverride = parseStringListOverride(body.acquirers_override)
  const gatewaysOverride = parseStringListOverride(body.gateways_override)
  const methodsOverride = parseStringListOverride(body.methods_override)

  if (!clientName) return err('clientName is required', 400, origin)

  const supabase = createSupabaseClient()

  // ── Resolve AE → user_id + org_id ──
  let aeUserId: string | null = null
  let aeOrgId: string | null = null
  if (createdByEmail) {
    const { data: integration, error: intErr } = await supabase
      .from('ae_integrations')
      .select('user_id, org_id')
      .eq('provider', 'gmail')
      .ilike('config->>email', createdByEmail)
      .maybeSingle()
    if (intErr) return err('AE lookup failed', 500, origin)
    if (!integration) {
      return err(
        `No Gmail integration found for ${createdByEmail}. Connect Gmail in Chief (Settings or WhatsApp) before generating an SDR BC.`,
        400, origin,
      )
    }
    aeUserId = integration.user_id
    aeOrgId = integration.org_id
  }
  const orgId = aeOrgId || (typeof body.orgId === 'string' ? body.orgId : null)
  const ownerId = aeUserId || (jwtUser?.id ?? null)
  if (!orgId) return err('orgId is required (pass createdByEmail or orgId)', 400, origin)
  if (!ownerId) return err('ownerId could not be resolved', 400, origin)

  // ── Resolve vendor profile (for the closing slide) ──
  // Service-role bypasses RLS so we can read profiles for any user. Returns
  // null if the user hasn't set one yet — closing slide falls back to defaults.
  let vendorProfile: {
    name: string | null
    title: string | null
    email: string | null
    phone: string | null
    demo_calendar_url: string | null
    avatar_url: string | null
  } | null = null
  {
    const { data: vp } = await supabase
      .from('user_sales_profiles')
      .select('name, title, email, phone, demo_calendar_url, avatar_url')
      .eq('user_id', ownerId)
      .maybeSingle()
    if (vp) vendorProfile = vp as typeof vendorProfile
  }

  // Build a service-role authorization header for downstream edge function calls.
  const supaUrl = Deno.env.get('SUPABASE_URL')!
  const downstreamAuth = `Bearer ${serviceRoleFull || serviceRoleAuto}`
  if (!serviceRoleFull && !serviceRoleAuto) {
    return err('Service role key not configured on this function', 500, origin)
  }

  // ── Research pipeline (shared with sdr-bc-research) ──
  // Resolves domain (Firecrawl if no website), upserts AMC row, kicks off
  // discover-company-domains in parallel with deep-research, then pulls the
  // full SimilarWeb top_countries (cache-hot after deep-research). Single call
  // — failure modes (domain_unresolved / similarweb_unavailable / ...) map
  // straight to HTTP responses.
  const research = await runResearch(supabase, supaUrl, downstreamAuth, ownerId, {
    clientName, websiteRaw, orgId, forceRefresh, acceptLowConfidence,
    skipDeepResearch,
    appTrafficMode,
    ...(manualTraffic ? { manualTraffic } : {}),
  })
  if (!research.ok) {
    return err(research.error, research.status, origin, {
      ...(research.reason ? { reason: research.reason } : {}),
      ...(research.details || {}),
    })
  }
  const { domain, domainResolution, intel, sw, topCountries } = research

  // ── Resolve industry FIRST (so we can use industry default ticket as fallback) ──
  // Override ladder: UI override (validated above) > deep-research classification > FALLBACK_INDUSTRY.
  const warnings: Record<string, boolean | string> = {}
  let industry: IndustryEntry
  if (industryOverride) {
    industry = industryOverride
    warnings.industry_source = 'user_override'
  } else {
    industry = lookupIndustry(intel.industry_category) ?? FALLBACK_INDUSTRY
    if (industry === FALLBACK_INDUSTRY && intel.industry_category !== FALLBACK_INDUSTRY.category) {
      warnings.industry_fallback = true
    }
  }

  // ── Resolve ticket — ladder: override > deep-research (high|med only) > industry default ──
  // Policy: only accept the LLM's company-specific ticket when confidence is high/med.
  // low/unknown → always fall back to industry default_ticket_usd. The LLM has shown it
  // will anchor to misleading numbers in research data (e.g. Kaseya MSP survey "$25k+
  // spending tier" → invented $15,000 enterprise ticket at confidence=low). Trust the
  // industry benchmark over an unverified inference.
  let avgTicketUsd: number | null = typeof intel.avg_ticket_usd === 'number' && Number.isFinite(intel.avg_ticket_usd)
    ? intel.avg_ticket_usd : null
  let confidence = intel.avg_ticket_confidence || 'unknown'

  if (avgTicketOverride !== null) {
    avgTicketUsd = avgTicketOverride
    confidence = 'high'
    warnings.ticket_source = 'user_override'
  } else if (!avgTicketUsd || confidence === 'unknown' || confidence === 'low') {
    if (avgTicketUsd && (confidence === 'low' || confidence === 'unknown')) {
      warnings.ticket_llm_value_discarded = String(avgTicketUsd)
      if (intel.avg_ticket_source_url) warnings.ticket_llm_source_discarded = intel.avg_ticket_source_url
    }
    avgTicketUsd = industry.default_ticket_usd
    confidence = 'low'
    warnings.ticket_industry_default = industry.category
  }

  // ── Compute cards data ──
  // EMA propagation: if research finds (or AE overrides) a verified entity in
  // ANY country in the EMA bucket, treat all other EMA countries (without an
  // explicit override) as if they had local entity too. Surfaces in warnings.
  const emaPropagation = emaHasAnyVerifiedEntity(intel, legalEntitiesOverride)
  if (emaPropagation) warnings.ema_entity_propagated = true

  // ── App-traffic mode: derive global TPV from revenue (override > research) ──
  // Math: TPV_global = revenue / (take_rate / 100). Per-country TPV is then
  // TPV_global × share, distributed by SimilarWeb/manual shares. Caller must
  // provide revenue (or research must find it ≥2 sources) OR we error out.
  let appTrafficTpvGlobalM: number | null = null
  if (appTrafficMode) {
    const effectiveRevenue = annualRevenueOverride ?? intel.annual_revenue_usd ?? null
    if (!effectiveRevenue || effectiveRevenue <= 0) {
      return err(
        `Annual revenue is required when app_traffic_mode is on but neither a manual override nor a research-verified value (≥2 sources) was available.`,
        422, origin,
        { reason: 'revenue_required_for_app_traffic', research_confidence: intel.annual_revenue_confidence || 'unknown' },
      )
    }
    const takeRateDecimal = industry.take_rate_pct / 100
    const tpvGlobalUsd = effectiveRevenue / takeRateDecimal
    appTrafficTpvGlobalM = tpvGlobalUsd / 1_000_000
    warnings.traffic_source = 'app_revenue'
    warnings.app_revenue_used_usd = String(Math.round(effectiveRevenue))
    warnings.app_revenue_source = annualRevenueOverride ? 'user_input' : 'research'
    if (!annualRevenueOverride) {
      warnings.app_revenue_research_confidence = intel.annual_revenue_confidence || 'unknown'
      if (Array.isArray(intel.annual_revenue_source_urls)) {
        warnings.app_revenue_source_url_count = String(intel.annual_revenue_source_urls.length)
      }
    }
  }

  const avgMonthlySite = sw.monthly_visits?.avg ?? 0
  const cards = computeRegionalCards(topCountries, intel, avgTicketUsd, avgMonthlySite, language, {
    legalEntities: legalEntitiesOverride,
    existingApms: existingApmsOverride,
    emaPropagation,
    appTrafficTpvGlobalM,
  })
  // Surface in warnings so the deck reader knows manual values were applied.
  if (manualTraffic) {
    // App-traffic mode already set traffic_source='app_revenue' above; in that
    // case the manual_traffic only provides country shares, not the TPV signal.
    if (!appTrafficMode) warnings.traffic_source = 'manual_input'
    else warnings.country_shares_source = 'manual_input'
    warnings.manual_country_count = String(manualTraffic.topCountries.length)
  }
  if (skipDeepResearch) warnings.deep_research_skipped = true
  if (legalEntitiesOverride && legalEntitiesOverride.length > 0) {
    warnings.legal_entities_override_count = String(legalEntitiesOverride.length)
  }
  if (existingApmsOverride && existingApmsOverride.length > 0) {
    warnings.existing_apms_override_count = String(existingApmsOverride.length)
  }
  // Add REVENUEUP per region from raw totals + take_rate
  for (const r of REGION_KEYS) {
    const totals = cards[`${r}_cards_totals_raw`] as { tpv_m: number; tpvup_m: number; cost_m: number } | undefined
    if (!totals) continue
    const revenue_m = totals.tpvup_m * (industry.take_rate_pct / 100)
    cards[`${r.toUpperCase()}_REVENUEUP`] = fmtMoneyM(revenue_m)
  }

  const regionsRendered = cards._regions_rendered as Array<{ region: string; label: string; country_count: number }>
  if (regionsRendered.length === 0) {
    return err(
      `No region above the 1% share floor for ${domain} — nothing to render.`,
      422, origin, { reason: 'no_regions_above_floor', top_countries: topCountries.slice(0, 10) },
    )
  }

  // ── Assemble deck defaults ──
  // Strip the raw working totals (not for the deck) before persisting.
  const deckData: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(cards)) {
    if (k.endsWith('_cards_totals_raw') || k.endsWith('_apms_totals_raw') || k === '_regions_rendered') continue
    deckData[k] = v
  }

  // markets_geo for slide 5 (Geography). Pass top-5 by share, names match SimilarWeb spelling
  // — Slide05Geography self-resolves coords from its internal SVG_COUNTRY_COORDS
  // (Equal Earth table + name aliases in public/sdr-bc-assets/slides-01-context.jsx).
  const marketsGeo = topCountries
    .filter(c => c.share && c.share >= COUNTRY_SHARE_FLOOR)
    .slice(0, 5)
    .map(c => ({ name: c.name, share: Math.round(c.share * 100) }))

  // Slide 4 — current payment stack. Primary source is deep-research's
  // `payment_stack.psps_detected[]` (Firecrawl + LLM extraction), padded from a
  // regional catalog when research is weak (see buildPaymentStack). The Step-2
  // wizard can override any of the three columns; an override always wins and
  // suppresses the "inferred" disclaimer for the acquirers/gateways pair.
  const autoStack = buildPaymentStack(intel, topCountries)
  const acquirers = acquirersOverride ?? autoStack.acquirers
  const gateways = gatewaysOverride ?? autoStack.gateways
  const stackMethods = methodsOverride ?? autoStack.methods
  // Slide 6 (orchestration) reads the final, post-override split too.
  const stackSplit = { acquirers, gateways }
  const stackObservations = buildStackObservations(intel)

  // Disclaimer only when the displayed acquirers/gateways are still the
  // inferred regional ones (i.e. the AE didn't confirm/override that pair).
  if (autoStack.inferredFromRegion && !acquirersOverride && !gatewaysOverride) {
    const topRegion = autoStack.inferredFromRegion
    const regionLabel = REGION_LABELS_I18N[language]?.[topRegion] ?? REGION_LABEL[topRegion] ?? topRegion
    // Inferred-stack observation. Localized for non-English decks. English
    // version preserved verbatim so existing decks render identically.
    const inferredObs = language === 'es'
      ? `Stack de pagos inferido de benchmarks regionales de ${regionLabel} — no se encontraron datos públicos específicos. A validar con el prospecto.`
      : language === 'pt'
        ? `Stack de pagamentos inferido a partir de benchmarks regionais de ${regionLabel} — não foram encontrados dados públicos específicos. A validar com o prospecto.`
        : `Payment stack inferred from ${regionLabel} regional benchmarks — no specific public data found. To be validated with the prospect.`
    stackObservations.unshift(inferredObs)
    warnings.stack_assumed_from_region = topRegion
  }

  const now = new Date()
  Object.assign(deckData, {
    clientName,
    domain,
    docType: 'Business Case',
    locale: language,
    // Cover slide "Prepared by" — populated when the AE filled the optional
    // Step 1 fields in the wizard. Cover slide renders the line only when both
    // are non-empty; otherwise falls back to vendorProfile name/title below.
    sdr_name: sdrName || null,
    sdr_position: sdrPosition || null,
    // Multilingual fields (per mig 147 comment). Persist on the same `defaults`
    // JSONB so sdr-bc-render can read them without a separate column.
    language,
    currency,
    date: String(now.getFullYear()),
    preparedBy: vendorProfile?.name || 'Yuno Sales Strategy',
    // Sales contact — pulled from user_sales_profiles when available.
    // Falls back to generic Yuno team strings so legacy decks still render.
    contactName: vendorProfile?.name || 'Yuno Sales Team',
    contactTitle: vendorProfile?.title || 'Sales Strategy',
    contactEmail: vendorProfile?.email || 'sales@yuno.io',
    contactPhone: vendorProfile?.phone || '',
    // Closing slide additions (Slide27 reads these directly).
    vendor_name: vendorProfile?.name || 'Yuno Sales Team',
    vendor_title: vendorProfile?.title || 'Sales Strategy',
    vendor_email: vendorProfile?.email || 'sales@yuno.io',
    vendor_phone: vendorProfile?.phone || '',
    vendor_demo_url: vendorProfile?.demo_calendar_url || '',
    vendor_avatar_url: vendorProfile?.avatar_url || '',
    markets_geo: marketsGeo,
    // Slide 4 — payment stack (replaces hardcoded Stripe/Adyen/Worldpay defaults)
    acquirers: stackSplit.acquirers,
    gateways: stackSplit.gateways,
    methods: stackMethods,
    stack_observations: stackObservations,
    // Metadata the deck (and renderer) can use for slide footers + warnings:
    industry: industry.category,
    industry_take_rate_pct: industry.take_rate_pct,
    avg_ticket_usd: avgTicketUsd,
    avg_ticket_confidence: confidence,
    avg_ticket_source_url: warnings.ticket_industry_default ? null : (intel.avg_ticket_source_url || null),
    warnings,
    regions_rendered: regionsRendered,
    // Wizard inputs snapshot — lets the /presentaciones edit-dropdown pre-fill
    // every field the AE entered (Step 1 + Step 2) so editing doesn't require
    // re-typing anything. Null when the AE didn't provide that input. Read by
    // src/pages/Presentaciones.tsx → NewSdrBcForm.editTarget.
    _wizard_inputs: {
      sdr_name: sdrName || null,
      sdr_position: sdrPosition || null,
      industry_override: rawIndustryOverride || null,
      avg_ticket_override_usd: avgTicketOverride,
      acquirers_override: acquirersOverride,
      gateways_override: gatewaysOverride,
      methods_override: methodsOverride,
      legal_entities_override: legalEntitiesOverride,
      existing_apms_override: existingApmsOverride,
      emergency_mode: manualTraffic !== null,
      skip_deep_research: skipDeepResearch,
      manual_traffic: manualTraffic
        ? { total_monthly_visits: manualTraffic.totalMonthlyVisits, top_countries: manualTraffic.topCountries }
        : null,
      app_traffic_mode: appTrafficMode,
      annual_revenue_usd_override: annualRevenueOverride,
    },
  })

  // ── Slide 6 — Orchestration ("stack actual" replicated from workshop) ──
  // Builds the data for the side-by-side "today (point-to-point) vs target
  // (Yuno orchestrated)" diagram. Current PSPs come from the deep-research
  // stack (max 2); current antifraud only renders if research mentions a
  // known vendor verbatim. Proposed PSPs = current ∪ top-3 from the regional
  // catalog. See plan tasks/plan-sdr-bc-orchestration-slide.md.
  {
    const currentPspsAll = [...stackSplit.acquirers, ...stackSplit.gateways]
      .filter(n => !Object.keys(ANTIFRAUD_VENDORS_CANONICAL).some(af => n.toLowerCase().includes(af)))
    const currentPsps = Array.from(new Set(currentPspsAll)).slice(0, 2)

    const currentAntifraud = detectCurrentAntifraud(intel)
    // Workshop slide 14 pattern: 1st pass + cascade (high risk). If research
    // detected one, keep it as 1ra vuelta and add the complementary cascade
    // (Cybersource ↔ Riskified rotation). If nothing detected, use Cybersource
    // + Riskified — most recognizable global pair.
    const proposedAntifraud = currentAntifraud || 'Cybersource'
    const proposedAntifraudCascade = proposedAntifraud.toLowerCase().includes('riskified')
      ? 'Cybersource'
      : 'Riskified'

    // Pick top region by traffic share, fall back to regional catalog acquirers.
    const topCountryForOrch = topCountries.find(c => c.share && c.share > 0)
    const topIsoForOrch = topCountryForOrch ? isoFromCountryName(topCountryForOrch.name) : null
    const topRegionForOrch = topIsoForOrch ? regionOf(topIsoForOrch) : null
    const regionalStackForOrch = topRegionForOrch ? getRegionalStack(topRegionForOrch) : null
    const regionalCandidates = regionalStackForOrch
      ? [...regionalStackForOrch.acquirers, ...regionalStackForOrch.gateways]
      : []

    const seenLc = new Set(currentPsps.map(n => n.toLowerCase()))
    const newProposed: string[] = []
    for (const cand of regionalCandidates) {
      if (newProposed.length >= 3) break
      if (seenLc.has(cand.toLowerCase())) continue
      newProposed.push(cand)
      seenLc.add(cand.toLowerCase())
    }
    const proposedPspsList = [
      ...currentPsps.map(name => ({ name, role: 'integrado' as const })),
      ...newProposed.map(name => ({ name, role: 'nuevo' as const })),
    ]

    // Approximate tx volume + blended AR. Both flagged as "(est.)" in the slide.
    // In app-traffic mode the site-wide visit count is 0 (revenue drives TPV),
    // so derive monthly tx from TPV / ticket instead of visits × conversion.
    const avgMonthlyTx = (appTrafficTpvGlobalM && appTrafficTpvGlobalM > 0 && avgTicketUsd > 0)
      ? Math.round((appTrafficTpvGlobalM * 1_000_000 / avgTicketUsd) / 12)
      : Math.round(avgMonthlySite * CONVERSION)
    // Weighted AR across top-5 countries (those that passed the 1% floor + region bucket).
    let arNumer = 0
    let arDenom = 0
    for (const c of topCountries) {
      if (!c.share || c.share < COUNTRY_SHARE_FLOOR) continue
      const iso = isoFromCountryName(c.name)
      if (!iso || !regionOf(iso)) continue
      arNumer += baseAuthRate(iso) * c.share
      arDenom += c.share
    }
    const blendedAr = arDenom > 0 ? arNumer / arDenom : 0.80

    function fmtTxCount(n: number): string {
      if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
      if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
      return String(n)
    }

    Object.assign(deckData, {
      orchestration_client_tx_per_month: fmtTxCount(avgMonthlyTx),
      orchestration_client_ar_pct: Math.round(blendedAr * 100),
      orchestration_current_psps: currentPsps,
      orchestration_current_antifraud: currentAntifraud,
      orchestration_proposed_antifraud: proposedAntifraud,
      orchestration_proposed_antifraud_cascade: proposedAntifraudCascade,
      orchestration_proposed_psps: proposedPspsList,
    })
  }

  // ── Insert presentation row ──
  const slug = `${slugify(clientName)}-${randomSuffix()}`
  const { data: inserted, error: insErr } = await supabase
    .from('presentations')
    .insert({
      org_id: orgId,
      created_by: ownerId,
      kind: 'sdr_bc',
      client_name: clientName,
      slug,
      defaults: deckData,
      raw_research: { intelligence: intel, similarweb: { domain: sw.domain, monthly_visits: sw.monthly_visits, top_countries: topCountries } },
      expires_at: '2099-12-31T23:59:59Z',  // V2: SDR BC effectively never expires (column is NOT NULL so we use a far-future date).
    })
    .select('id, slug, expires_at')
    .single()
  if (insErr || !inserted) {
    return err(`Insert failed: ${insErr?.message || 'unknown'}`, 500, origin)
  }

  return ok({
    id: inserted.id,
    slug: inserted.slug,
    url: `${PUBLIC_BASE_URL}/sdr-bc/${inserted.slug}`,
    expiresAt: inserted.expires_at,
    regions_rendered: regionsRendered,
    industry: industry.category,
    avg_ticket_usd: avgTicketUsd,
    avg_ticket_confidence: confidence,
    language,
    currency,
    warnings,
    deck_data: deckData,
    domain_used: domain,
    domain_resolution: domainResolution
      ? { domain: domainResolution.domain, confidence: domainResolution.confidence, source: domainResolution.source }
      : null,
  }, origin)
})
