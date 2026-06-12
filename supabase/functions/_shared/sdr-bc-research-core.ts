// sdr-bc-research-core
// =============================================================================
// Shared research pipeline for /sdr-bc — used by:
//   1. sdr-bc-research (read-only Step 1 of the UI wizard: returns suggestions)
//   2. sdr-bc-generate (full deck assembly; runs research, then math + persist)
//
// Encapsulates: domain resolution → AMC upsert → discover-company-domains →
// chief-deep-research-company → similarweb-traffic → top-N country bucketing.
//
// Returns a discriminated union so both callers can map { ok:false, status, reason, details }
// straight onto an HTTP error response without duplicating logic.
// =============================================================================

import { createSupabaseClient } from './supabase.ts'
import { normalizeDomain } from './similarweb.ts'
import {
  resolveCompanyDomain, DomainResolutionError, type ResolvedDomain,
} from './resolve-company-domain.ts'
import { countryNameFromIso, isoFromCountryName, regionOf, type RegionKey } from './regions.ts'
import { isStackResearchWeak, getRegionalStack } from './regional-psps.ts'

export interface SimilarWebTopCountry { name: string; share: number; visits: number }

export interface IntelligenceShape {
  avg_ticket_usd?: number | null
  avg_ticket_confidence?: 'high' | 'med' | 'low' | 'unknown' | null
  avg_ticket_source_url?: string | null
  industry_category?: string | null
  // App-traffic mode: revenue-driven research (opt-in via
  // include_revenue_research in chief-deep-research). Confidence is high|med
  // only when ≥2 source URLs agree on the value (double-check requirement).
  annual_revenue_usd?: number | null
  annual_revenue_confidence?: 'high' | 'med' | 'low' | 'unknown' | null
  annual_revenue_source_urls?: string[]
  annual_revenue_evidence_quote?: string | null
  legal_entities?: Array<{
    country?: string
    iso?: string
    has_entity?: boolean | null
    confidence?: 'high' | 'med' | 'low' | 'unknown' | null
  }>
  existing_apms?: Array<{
    country?: string
    iso?: string
    apms?: string[]
  }>
  payment_stack?: {
    psps_detected?: Array<{ name?: string; evidence_type?: string; source_url?: string }>
    orchestrator_detected?: boolean
    gateway_evidence?: Array<{ description?: string }>
  }
  apm_gaps?: Array<{ country?: string; missing_apms?: string[]; opportunity_score?: string; why?: string }>
  cross_border_opportunities?: Array<{ country?: string; missing_entity?: boolean; opportunity_score?: string; why?: string }>
  // LLM-extracted country distribution. Only authoritative when SimilarWeb is
  // unavailable — otherwise the SimilarWeb top_countries are preferred. Format:
  // [{country: "United States [INFERENCE — SimilarWeb unavailable]", traffic_share_estimate: "60%", source_url: "..."}, ...]
  top_markets?: Array<{ country?: string; traffic_share_estimate?: string; source_url?: string }>
}

export interface DeepResearchResponse {
  intelligence?: IntelligenceShape
  similarweb?: { domain: string; avg_monthly_visits: number; top_country: string | null } | null
}

export interface SimilarWebResponse {
  domain: string
  monthly_visits: { avg: number; latest: number }
  top_countries: SimilarWebTopCountry[]
}

// ── Slide 4 payment-stack builder (single source of truth) ──────────────────
// Both sdr-bc-research (pre-fill suggestions for Step 2) and sdr-bc-generate
// (actual deck assembly) compute the three slide-4 columns the same way:
//   1. Split deep-research's flat psps_detected[] into acquirers vs gateways.
//   2. Build the payment-methods list (card+wallet floor + detected local APMs).
//   3. If the research stack is too weak, pad acquirers/gateways from the
//      prospect's top-traffic regional catalog and flag inferredFromRegion so
//      the caller can surface the "to be validated" disclaimer.

// PSP names that are predominantly pure acquirers/processors (not orchestrators
// or gateways). Used to split the flat psps_detected[] into Slide 4 columns.
const PURE_ACQUIRER_TOKENS = [
  'worldpay', 'fis', 'fiserv', 'cybersource', 'vantiv', 'chase paymentech',
  'tsys', 'global payments', 'first data', 'cielo', 'rede', 'stone',
  'payu', 'kushki', 'conekta', 'openpay', 'culqi', 'niubiz',
  'transbank', 'webpay', 'multicaja', 'compropago',
]

export interface PaymentStackResult {
  acquirers: string[]
  gateways: string[]
  methods: string[]
  // Non-null when acquirers/gateways were padded from the regional catalog
  // because public research was too weak — the caller adds a disclaimer.
  inferredFromRegion: RegionKey | null
}

function splitPspsIntoAcquirersAndGateways(
  psps: Array<{ name?: string }>,
): { acquirers: string[]; gateways: string[] } {
  const acquirers: string[] = []
  const gateways: string[] = []
  const seen = new Set<string>()
  for (const p of psps) {
    const name = (p.name || '').trim()
    if (!name) continue
    const norm = name.toLowerCase()
    if (seen.has(norm)) continue
    seen.add(norm)
    const isAcquirer = PURE_ACQUIRER_TOKENS.some(t => norm.includes(t))
    if (isAcquirer) acquirers.push(name)
    else gateways.push(name)
  }
  return { acquirers, gateways }
}

function buildMethodsList(
  intel: IntelligenceShape,
  topCountries: SimilarWebTopCountry[],
  maxItems = 8,
): string[] {
  // Cards + ubiquitous global wallets that almost every modern e-com checkout
  // has — these are nearly universal in 2026, so include them as the floor.
  const methods: string[] = ['Visa', 'Mastercard', 'Apple Pay', 'Google Pay']
  const seen = new Set(methods.map(m => m.toLowerCase()))
  // Layer on detected local/alternative APMs from existing_apms, top-traffic first.
  const orderedCountries = [...topCountries].sort((a, b) => b.share - a.share).slice(0, 5)
  for (const c of orderedCountries) {
    const iso = isoFromCountryName(c.name)
    if (!iso) continue
    const entry = (intel.existing_apms || []).find(e =>
      (e.iso || '').toUpperCase() === iso || (e.country || '').toLowerCase() === c.name.toLowerCase(),
    )
    for (const apm of entry?.apms || []) {
      const key = apm.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      methods.push(apm)
      if (methods.length >= maxItems) return methods
    }
  }
  return methods
}

export function buildPaymentStack(
  intel: IntelligenceShape,
  topCountries: SimilarWebTopCountry[],
): PaymentStackResult {
  let stackSplit = splitPspsIntoAcquirersAndGateways(intel.payment_stack?.psps_detected || [])
  const methods = buildMethodsList(intel, topCountries)
  let inferredFromRegion: RegionKey | null = null

  if (isStackResearchWeak(stackSplit.acquirers, stackSplit.gateways)) {
    const topCountry = topCountries.find(c => c.share && c.share > 0)
    const topIso = topCountry ? isoFromCountryName(topCountry.name) : null
    const topRegion = topIso ? regionOf(topIso) : null
    const regionalStack = topRegion ? getRegionalStack(topRegion) : null

    if (regionalStack && topRegion) {
      // Keep whatever real PSPs the LLM found, then pad from the regional
      // catalog. Dedupe case-insensitively.
      const seen = new Set([...stackSplit.acquirers, ...stackSplit.gateways].map(n => n.toLowerCase().trim()))
      const padAcq: string[] = []
      for (const a of regionalStack.acquirers) {
        if (!seen.has(a.toLowerCase())) { padAcq.push(a); seen.add(a.toLowerCase()) }
      }
      const padGw: string[] = []
      for (const g of regionalStack.gateways) {
        if (!seen.has(g.toLowerCase())) { padGw.push(g); seen.add(g.toLowerCase()) }
      }
      stackSplit = {
        acquirers: [...stackSplit.acquirers, ...padAcq],
        gateways:  [...stackSplit.gateways,  ...padGw],
      }
      inferredFromRegion = topRegion
    }
  }

  return { acquirers: stackSplit.acquirers, gateways: stackSplit.gateways, methods, inferredFromRegion }
}

export interface RunResearchInput {
  clientName: string
  websiteRaw: string                  // user-provided; empty = auto-resolve
  orgId: string
  forceRefresh?: boolean
  acceptLowConfidence?: boolean       // recover from ambiguous domain resolution
  skipDeepResearch?: boolean          // skip chief-deep-research-company entirely
  // App traffic mode: client's volume is mostly through native apps so
  // SimilarWeb webviews aren't representative of transactions. When on,
  // chief-deep-research is asked to ALSO find the annual revenue with
  // ≥2 corroborating source URLs (double-check requirement). The downstream
  // math then derives TPV = revenue / take_rate instead of visits × ticket.
  appTrafficMode?: boolean
  // Emergency mode: bypass SimilarWeb and use AE-provided traffic data instead.
  // Used when SimilarWeb credits are exhausted (cost: $0, no upstream API hits).
  // Requires totalMonthlyVisits + at least 1 topCountry; the rest of the
  // pipeline (intel, regional bucketing, overrides) runs unchanged.
  manualTraffic?: {
    totalMonthlyVisits: number
    topCountries: Array<{ iso: string; share: number; visits?: number }>
  }
}

export interface ResearchSuccess {
  ok: true
  domain: string
  domainResolution: ResolvedDomain | null
  companyId: string
  intel: IntelligenceShape
  sw: SimilarWebResponse
  topCountries: SimilarWebTopCountry[]
}

export interface ResearchFailure {
  ok: false
  status: number
  error: string
  reason?: string
  details?: Record<string, unknown>
}

export type ResearchResult = ResearchSuccess | ResearchFailure

// ── Helpers (duplicated from sdr-bc-generate v1 — single source of truth now) ──

async function callDeepResearch(
  supaUrl: string, authHeader: string,
  company_id: string, orgId: string, ownerId: string, forceRefresh: boolean,
  includeRevenueResearch = false,
): Promise<DeepResearchResponse> {
  const r = await fetch(`${supaUrl}/functions/v1/chief-deep-research-company`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
    body: JSON.stringify({
      company_id, orgId, ownerId,
      force_refresh: forceRefresh,
      include_revenue_research: includeRevenueResearch,
    }),
  })
  if (!r.ok) throw new Error(`deep-research failed ${r.status}: ${(await r.text()).slice(0, 300)}`)
  return await r.json() as DeepResearchResponse
}

// Curate the discovered domain group to "canonical consumer brand" cctlds only —
// domains attested by wikipedia or search sources. Discovery surfaces ALL
// brand-owned domains (B2B portals, product extensions, legal subdomains); these
// over-weight markets that happen to have many product subdomains.
async function fetchCanonicalDomainGroup(
  supabase: ReturnType<typeof createSupabaseClient>,
  primaryDomain: string,
): Promise<string[] | null> {
  const { data, error } = await supabase
    .from('company_domain_groups')
    .select('discovered_domains')
    .eq('primary_domain', primaryDomain)
    .maybeSingle()
  if (error || !data) return null
  const discovered = (data.discovered_domains as Array<Record<string, unknown>>) || []
  if (discovered.length === 0) return null

  const canonicalSources = new Set(['wikipedia', 'search'])
  const canonical = discovered
    .filter(d => {
      const sources = Array.isArray(d.sources) ? (d.sources as string[]) : []
      return sources.some(s => canonicalSources.has(s))
    })
    .map(d => String(d.domain))
    .filter(Boolean)

  const group = Array.from(new Set([primaryDomain, ...canonical]))
  return group.length >= 2 ? group : null
}

async function ensureDomainGroup(
  supabase: ReturnType<typeof createSupabaseClient>,
  supaUrl: string,
  authHeader: string,
  primaryDomain: string,
  companyName: string,
): Promise<void> {
  const { data } = await supabase
    .from('company_domain_groups')
    .select('primary_domain, expires_at')
    .eq('primary_domain', primaryDomain)
    .maybeSingle()
  const cacheValid = data && new Date(data.expires_at as string).getTime() > Date.now()
  if (cacheValid) return

  try {
    const r = await fetch(`${supaUrl}/functions/v1/discover-company-domains`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
      body: JSON.stringify({ primary_domain: primaryDomain, company_name: companyName }),
    })
    if (!r.ok) {
      console.log(`[sdr-bc-research-core] discover-company-domains returned ${r.status} for ${primaryDomain} — falling back to single-domain`)
    }
  } catch (e) {
    console.log(`[sdr-bc-research-core] discover-company-domains call failed: ${(e as Error).message}`)
  }
}

// Build a synthetic SimilarWebResponse from the LLM-extracted top_markets.
// Used as a fallback in app_traffic_mode when SimilarWeb has no data for the
// domain (calm.com, native-only apps, B2B SaaS without consumer web traffic).
// Returns null if top_markets is empty or no shares resolve to a known ISO.
function swFromTopMarkets(
  intel: IntelligenceShape,
  domain: string,
): SimilarWebResponse | null {
  const markets = intel.top_markets || []
  if (markets.length === 0) return null

  const countries: SimilarWebTopCountry[] = []
  for (const m of markets) {
    if (!m.country || !m.traffic_share_estimate) continue
    // Strip "[INFERENCE — ...]" / "[INFERENCE]" tags before ISO resolution
    const cleanName = m.country.replace(/\s*\[[^\]]+\]\s*/g, '').trim()
    if (!cleanName) continue
    const iso = isoFromCountryName(cleanName)
    if (!iso) continue
    // Parse "60%" or "0.60" → 0.60 decimal
    const raw = String(m.traffic_share_estimate).trim()
    const pctMatch = raw.match(/-?\d+(\.\d+)?/)
    if (!pctMatch) continue
    let share = parseFloat(pctMatch[0])
    if (raw.includes('%') || share > 1.5) share = share / 100
    if (!isFinite(share) || share <= 0) continue
    // Persist the canonical name, not the raw LLM spelling ("UK", "USA"…) —
    // markets_geo names must match the deck's SVG_COUNTRY_COORDS keys or the
    // map pin silently disappears (Slide05Geography filters unknown names).
    countries.push({ name: countryNameFromIso(iso) || cleanName, share, visits: 0 })
  }
  if (countries.length === 0) return null

  countries.sort((a, b) => b.share - a.share)
  return {
    domain,
    monthly_visits: { avg: 0, latest: 0 },
    top_countries: countries,
  }
}

async function callSimilarWeb(
  supabase: ReturnType<typeof createSupabaseClient>,
  supaUrl: string,
  authHeader: string,
  domain: string,
): Promise<SimilarWebResponse | null> {
  const curatedGroup = await fetchCanonicalDomainGroup(supabase, domain)

  const body: Record<string, unknown> = curatedGroup
    ? { domain, aggregate: true, domain_group: curatedGroup }
    : { domain, aggregate: false }

  const r = await fetch(`${supaUrl}/functions/v1/similarweb-traffic`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
    body: JSON.stringify(body),
  })
  if (!r.ok) return null
  const data = await r.json()
  if (!data || !data.monthly_visits) return null
  return data as SimilarWebResponse
}

// ── Main entry point ──

export async function runResearch(
  supabase: ReturnType<typeof createSupabaseClient>,
  supaUrl: string,
  downstreamAuth: string,
  ownerId: string,
  input: RunResearchInput,
): Promise<ResearchResult> {
  const {
    clientName, websiteRaw, orgId,
    forceRefresh = false, acceptLowConfidence = false,
    skipDeepResearch = false, manualTraffic,
    appTrafficMode = false,
  } = input

  // ── Resolve domain ──
  let domain: string
  let domainResolution: ResolvedDomain | null = null
  if (websiteRaw) {
    const normalized = normalizeDomain(websiteRaw)
    if (!normalized) {
      return { ok: false, status: 400, error: `Could not normalize website to domain: ${websiteRaw}` }
    }
    domain = normalized
  } else {
    try {
      domainResolution = await resolveCompanyDomain(clientName, { orgId, supabase })
      domain = domainResolution.domain
    } catch (e) {
      if (e instanceof DomainResolutionError) {
        if (acceptLowConfidence && e.reason === 'ambiguous' && e.candidates[0]?.domain) {
          domain = e.candidates[0].domain
          domainResolution = { domain, confidence: 'low', source: 'firecrawl', evidence: null }
        } else {
          return {
            ok: false,
            status: 422,
            error: `Could not resolve domain for "${clientName}": ${e.message}`,
            reason: 'company_domain_unresolved',
            details: { resolution_reason: e.reason, candidates: e.candidates },
          }
        }
      } else {
        return { ok: false, status: 500, error: `Domain resolution failed: ${(e as Error).message}` }
      }
    }
  }

  // ── Find or create account_map_companies row ──
  // Mig 139 enforces UNIQUE(org_id, normalize_company_name(company_name)).
  // Mig 152 added find_amc_by_org_norm — the only safe lookup that matches the
  // constraint. Plain ilike misses suffix-stripped variants ("Apple" vs
  // "Apple Inc") and triggers a 23505 that the user sees as a 500.
  let companyId: string | null = null
  {
    const { data: existing } = await supabase
      .from('account_map_companies')
      .select('id')
      .eq('org_id', orgId)
      .eq('website', domain)
      .maybeSingle()
    if (existing) companyId = existing.id
  }
  if (!companyId) {
    const { data: normRows } = await supabase.rpc('find_amc_by_org_norm', {
      p_org_id: orgId,
      p_company_name: clientName,
    })
    const existingByNorm = Array.isArray(normRows) && normRows.length > 0 ? normRows[0] : null
    if (existingByNorm?.id) {
      companyId = existingByNorm.id
    } else {
      const { data: created, error: cErr } = await supabase
        .from('account_map_companies')
        .insert({ org_id: orgId, company_name: clientName, website: domain })
        .select('id')
        .single()
      if (cErr || !created) {
        if ((cErr as { code?: string } | null)?.code === '23505') {
          const { data: adoptRows } = await supabase.rpc('find_amc_by_org_norm', {
            p_org_id: orgId,
            p_company_name: clientName,
          })
          const adopted = Array.isArray(adoptRows) && adoptRows.length > 0 ? adoptRows[0] : null
          if (adopted?.id) companyId = adopted.id
          else return { ok: false, status: 500, error: `Could not create company row (23505 with no match): ${cErr?.message || 'unknown'}` }
        } else {
          return { ok: false, status: 500, error: `Could not create company row: ${cErr?.message || 'unknown'}` }
        }
      } else {
        companyId = created.id
      }
    }
  }

  // ── Kick off discover-company-domains in parallel with deep-research ──
  // Skip discovery when manual mode is on — there's no SimilarWeb call that
  // would benefit from it, and we want zero upstream credit burn.
  const discoveryPromise = manualTraffic
    ? Promise.resolve()
    : ensureDomainGroup(supabase, supaUrl, downstreamAuth, domain, clientName)

  // ── Deep research (30d cache, optional) ──
  // Skipped when (a) emergency / no-credits AE flag, or (b) explicit user opt-out.
  // When appTrafficMode is on we pass include_revenue_research=true so the LLM
  // also extracts annual revenue with ≥2 source URLs (double-check requirement).
  let intel: IntelligenceShape = {}
  if (!skipDeepResearch) {
    try {
      const dr = await callDeepResearch(
        supaUrl, downstreamAuth, companyId, orgId, ownerId, forceRefresh,
        appTrafficMode,
      )
      intel = dr.intelligence || {}
      // If app traffic was requested but the (possibly cached) intel doesn't
      // carry revenue yet, force a refresh once to populate it.
      if (appTrafficMode && (intel.annual_revenue_usd === undefined || intel.annual_revenue_usd === null) && !forceRefresh) {
        const dr2 = await callDeepResearch(
          supaUrl, downstreamAuth, companyId, orgId, ownerId, /*forceRefresh*/ true,
          appTrafficMode,
        )
        intel = dr2.intelligence || intel
      }
    } catch (e) {
      // Non-fatal in emergency contexts — fall through with empty intel.
      // Caller can still produce a deck using industry defaults + overrides.
      if (manualTraffic || appTrafficMode) {
        console.warn(`[sdr-bc-research-core] deep-research failed: ${(e as Error).message}`)
      } else {
        return { ok: false, status: 502, error: (e as Error).message }
      }
    }
  }

  await discoveryPromise

  // ── SimilarWeb (cache-hot after deep-research) OR manual traffic short-circuit ──
  let sw: SimilarWebResponse
  if (manualTraffic) {
    const { totalMonthlyVisits, topCountries: manualCountries } = manualTraffic
    // In app_traffic_mode the TPV comes from revenue / take_rate, so the
    // visit count is never read — only the per-country shares matter. Outside
    // app mode, the visits×conversion×ticket math needs a positive total.
    const visitsRequired = !appTrafficMode
    if (manualCountries.length === 0 || (visitsRequired && !totalMonthlyVisits)) {
      return {
        ok: false, status: 400,
        error: appTrafficMode
          ? 'manual_traffic requires at least 1 top country (with share %)'
          : 'manual_traffic requires total_monthly_visits + at least 1 top country',
        reason: 'manual_traffic_incomplete',
      }
    }
    sw = {
      domain,
      monthly_visits: { avg: totalMonthlyVisits, latest: totalMonthlyVisits },
      // SimilarWeb's geo endpoint returns the 3-month total — replicate that
      // shape so downstream math (visitsAnnual = avg × share × 12) lines up.
      // When totalMonthlyVisits is 0 (app mode) the per-country visits land at
      // 0 too, which is fine — they're unused under the revenue-driven path.
      top_countries: manualCountries.map(c => ({
        name: countryNameFromIso(c.iso) || c.iso,
        share: c.share,
        visits: c.visits ?? Math.round(totalMonthlyVisits * c.share * 3),
      })),
    }
  } else {
    const resolved = await callSimilarWeb(supabase, supaUrl, downstreamAuth, domain)
    if (!resolved) {
      // Fallback ladder for SimilarWeb misses (calm.com, native-only apps,
      // B2B SaaS without consumer web traffic):
      //   1. app_traffic_mode + LLM top_markets → use those shares.
      //   2. otherwise → 422 so the AE can rerun with manual_traffic or app mode.
      const llmSw = appTrafficMode ? swFromTopMarkets(intel, domain) : null
      if (llmSw) {
        console.log(`[sdr-bc-research-core] SimilarWeb empty for ${domain}; using LLM top_markets (${llmSw.top_countries.length} countries) — app_traffic_mode is on`)
        sw = llmSw
      } else {
        return {
          ok: false,
          status: 422,
          error: appTrafficMode
            ? `SimilarWeb has no data for ${domain} and deep-research did not extract enough top_markets to infer country distribution. Provide manual_traffic with country shares, or set annual_revenue_usd_override + retry.`
            : `SimilarWeb has no data for ${domain} — cannot build SDR BC regional slides. Switch on "App traffic mode" (revenue-based) or provide manual_traffic country shares to bypass.`,
          reason: 'similarweb_unavailable',
          details: {
            app_traffic_mode: appTrafficMode,
            top_markets_count: intel.top_markets?.length ?? 0,
          },
        }
      }
    } else {
      sw = resolved
    }
  }
  const topCountries = sw.top_countries || []

  return {
    ok: true,
    domain,
    domainResolution,
    companyId,
    intel,
    sw,
    topCountries,
  }
}
