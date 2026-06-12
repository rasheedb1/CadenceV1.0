// chief-deep-research-company
// =============================================================================
// Adapted from Yuno's internal "SDR Research Brief v5.0" framework.
// Extracts STRUCTURED intelligence per company that drives outreach messaging:
//   • Top markets by traffic (cross-ref with legal entities)
//   • Cross-border opportunities (high traffic country + no legal entity = MoR/local acquiring pitch)
//   • APM gaps per market (no PIX in BR, no OXXO in MX = revenue left on table)
//   • Payment stack (PSPs detected, orchestrator presence, gateway evidence)
//   • Payment complaints (Reddit/Trustpilot evidence of pain)
//   • Expansion + funding signals (timing windows)
//
// Strategy:
//   1. Run 6 parallel firecrawl searches (targeted queries from SDR brief)
//   2. LLM synthesis (Sonnet 4.5) → structured JSON intelligence
//   3. Save to account_map_companies.research_json.intelligence
//   4. TTL 30 days (re-run if older or never synthesized)
//
// Cost: ~$0.30-0.50 per company (cached, shared across 12 leads at company)
// Used by: ai-research-generate at message gen time + can be eagerly triggered
//          after chief-process-company promotes leads
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthContext, createSupabaseClient } from '../_shared/supabase.ts'
import { createFirecrawlClient } from '../_shared/firecrawl.ts'
import { normalizeDomain } from '../_shared/similarweb.ts'
import { isoFromCountryName, regionOf, CCTLD, type RegionKey } from '../_shared/regions.ts'
import { INDUSTRY_CATEGORIES_FOR_PROMPT } from '../_shared/industries.ts'
import { buildRegionEntityQuery } from '../_shared/legal-markers.ts'

interface AggregatedTraffic {
  domain: string
  monthly_visits: { avg: number; latest: number; window: { start: string; end: string }; last_updated: string }
  top_countries: Array<{ name: string; share: number; visits: number }>
  engagement: { avg_visit_duration_sec: number | null; pages_per_visit: number | null; bounce_rate: number | null }
  domain_group: string[]
  domains_aggregated?: number
  domains_requested?: number
}

async function fetchAggregatedTraffic(supaUrl: string, authHeader: string, domain: string, companyName: string): Promise<AggregatedTraffic | null> {
  const r = await fetch(`${supaUrl}/functions/v1/similarweb-traffic`, {
    method: 'POST',
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain, aggregate: true }),
  })
  if (!r.ok) return null
  const data = await r.json() as AggregatedTraffic & { success?: boolean }
  if (!data || !data.monthly_visits) return null
  return data
}

function summarizeAggregatedForPrompt(t: AggregatedTraffic, companyName: string): string {
  const avgM = (t.monthly_visits.avg / 1_000_000).toFixed(2)
  const top = (t.top_countries || []).slice(0, 8)
    .map(c => `${c.name} ${(c.share * 100).toFixed(1)}%`)
    .join(', ')
  const eng = t.engagement
  const engStr = eng.bounce_rate !== null
    ? `bounce ${Math.round((eng.bounce_rate || 0) * 100)}%, ${eng.pages_per_visit} pages/visit, ${eng.avg_visit_duration_sec}s avg`
    : 'n/a'
  const groupSize = (t.domain_group || []).length
  const coverageNote = t.domains_aggregated !== undefined && t.domains_requested !== undefined && t.domains_aggregated < t.domains_requested
    ? ` (${t.domains_aggregated}/${t.domains_requested} domains successfully aggregated)`
    : ''
  return [
    `Company: ${companyName}`,
    `Aggregated across ${groupSize} verified domains: ${(t.domain_group || []).join(', ')}${coverageNote}`,
    `Total monthly web visits (window ${t.monthly_visits.window.start}..${t.monthly_visits.window.end}): ${avgM}M`,
    `Top countries by aggregated traffic share: ${top}`,
    `Weighted engagement: ${engStr}`,
    `Source: SimilarWeb bulletproof multi-domain aggregation (data last updated ${t.monthly_visits.last_updated}).`,
  ].join('\n')
}

interface DeepResearchRequest {
  company_id: string
  force_refresh?: boolean
  ownerId?: string
  orgId?: string
  // Opt-in (default false): when true, the LLM ALSO extracts annual revenue
  // from public sources with a ≥2 source-URL "double-check" requirement.
  // Set by sdr-bc-research-core when the AE picks "app traffic mode".
  // Other callers leave it false → zero behavioural change.
  include_revenue_research?: boolean
}

interface EntityQuery { region: RegionKey; q: string; countries: string[] }
interface CctldProbe { iso: string; name: string; domain: string }

// Plan phase-2 (legal entity queries + cctld probes) from SimilarWeb top countries.
// Filters to countries with share ≥1% (matches the SDR-BC slide floor). Groups by
// region and emits one targeted Firecrawl query per region with legal markers.
function planPhase2(
  sw: AggregatedTraffic | null,
  companyName: string,
  domain: string | null,
): { entityQueries: EntityQuery[]; cctldProbes: CctldProbe[] } {
  if (!sw || !sw.top_countries) return { entityQueries: [], cctldProbes: [] }

  const byRegion = new Map<RegionKey, string[]>()
  const cctldProbes: CctldProbe[] = []
  for (const c of sw.top_countries) {
    if (!c.share || c.share < 0.01) continue
    const iso = isoFromCountryName(c.name)
    if (!iso) continue
    const region = regionOf(iso)
    if (!region) continue
    if (!byRegion.has(region)) byRegion.set(region, [])
    byRegion.get(region)!.push(c.name)

    if (domain) {
      const root = domain.split('.')[0] // rough root extractor; refined per-case
      const ccs = CCTLD[iso] || []
      for (const cc of ccs) {
        cctldProbes.push({ iso, name: c.name, domain: `${root}.${cc}` })
      }
    }
  }
  const entityQueries: EntityQuery[] = []
  for (const [region, countries] of byRegion.entries()) {
    entityQueries.push({
      region,
      countries,
      q: buildRegionEntityQuery(companyName, region, countries),
    })
  }
  return { entityQueries, cctldProbes }
}

// HEAD-ping cctld variants in parallel. Returns the ones that resolved (200/3xx).
// 3-second timeout per probe; safe failures (network error, abort) → not included.
async function probeCctld(_domain: string | null, probes: CctldProbe[]): Promise<CctldProbe[]> {
  if (probes.length === 0) return []
  const TIMEOUT_MS = 3000
  const results = await Promise.allSettled(
    probes.map(async (p) => {
      const url = `https://${p.domain}`
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
      try {
        const r = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ctrl.signal })
        clearTimeout(timer)
        return r.ok || (r.status >= 300 && r.status < 400) ? p : null
      } catch {
        clearTimeout(timer)
        return null
      }
    }),
  )
  const hits: CctldProbe[] = []
  // Dedupe by ISO — only keep the first resolved domain per country.
  const seen = new Set<string>()
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value && !seen.has(r.value.iso)) {
      hits.push(r.value)
      seen.add(r.value.iso)
    }
  }
  return hits
}

const INTELLIGENCE_TTL_DAYS = 30

// Appended to SYNTHESIS_SYSTEM_PROMPT ONLY when include_revenue_research=true
// (opt-in by SDR BC app-traffic mode). Asks the LLM to find annual revenue
// from public sources with a ≥2 corroborating sources requirement —
// "double check" the user explicitly asked for.
const REVENUE_RESEARCH_SECTION = `

ANNUAL REVENUE (annual_revenue_usd / annual_revenue_confidence — REQUIRED for this call):
The SDR BC's app-traffic flow needs the company's most-recent ANNUAL REVENUE in USD.
This data is high-stakes (drives the entire TPV math), so apply a DOUBLE-SOURCE rule:

  • "high"    → ≥2 independent reputable sources cite the SAME value within ±10% AND at least
                one source is a primary disclosure (10-K, 20-F, S-1, investor deck, earnings call,
                press release on company-issued newswire). Example: Bloomberg + Reuters both
                report \\$2.1B annual revenue for 2024.
  • "med"     → ≥2 sources but lower quality (TechCrunch + Statista without a primary filing),
                OR 1 primary disclosure that's >12 months old, OR sources disagree by 10-30%
                (take the median).
  • "low"     → exactly 1 reputable source, OR sources disagree by >30%, OR analyst estimate
                only with no primary corroboration.
  • "unknown" → no public revenue figure (pre-IPO private without disclosure, etc.).
                Set annual_revenue_usd: null.

annual_revenue_source_urls MUST contain ALL the URLs you used (max 5). MUST be ≥2 for high/med.
annual_revenue_evidence_quote: short verbatim snippet from the most authoritative source.
If reported in non-USD, convert at a rough current spot rate and note the original currency.
Use TRAILING-TWELVE-MONTHS or most recent fiscal year. Annual run-rate is OK for fast-growing
companies as a fallback (mark confidence one tier lower).

NEVER invent a number. If you can't find ≥1 source → annual_revenue_usd: null + confidence: unknown.
`

const SYNTHESIS_SYSTEM_PROMPT = `You are a payments intelligence analyst for Yuno (payment orchestration platform). Synthesize raw research data into structured intelligence for sales outreach.

AUTHORITATIVE DATA POLICY:
- The "TRAFFIC DATA (SimilarWeb)" section, if present, is AUTHORITATIVE for traffic volume and top markets by country share. Use those numbers verbatim in top_markets[].traffic_share_estimate.
- Only fall back to Firecrawl-scraped estimates when SimilarWeb data is missing or marked unavailable.
- Cite "SimilarWeb" as source_url placeholder when the value comes from that section.

YUNO ICP signals (these matter most):
- Multi-market presence with NO local legal entity in top traffic markets → cross-border processing → higher fees + lower approval
- Missing local APMs in top markets (PIX Brazil, OXXO Mexico, PSE Colombia, BLIK Poland, UPI India, GrabPay/GoPay SE Asia, CMI Morocco, Sofort Germany)
- Single PSP / no orchestrator → no failover, no routing optimization
- Recent expansion / funding / RFP signals → window for orchestrator adoption
- Customer payment complaints (Reddit, Trustpilot) → evidence of pain

YUNO CAPABILITIES (recommend these in opportunities):
- Smart Routing → up to +7% approval uplift
- 50% transaction recovery (NOVA AI agent retries failed payments)
- Single API to 1000+ payment methods
- Local acquiring + Merchant of Record (MoR) for cross-border merchants
- Real-time monitoring (anomaly detection in milliseconds)

VERIFIED YUNO CUSTOMERS (only cite these): Rappi, inDrive, Uber, McDonald's, Avianca, Viva Aerobus, Xcaret, Livelo, Reserva, Open English, Smartfit, SpaceX.

INTEGRITY RULES:
- Every claim needs source_url. No URL = exclude.
- If not found, use empty array or null. NEVER fabricate.
- "[INFERENCE — not confirmed]" label for any inference.
- ALWAYS escape double-quotes inside string values as \" — never emit a raw \` " \` inside a quoted-string evidence/quote.
- Keep evidence_quote ≤ 200 characters. Truncate with "…" if needed.

AVERAGE TICKET RULES (avg_ticket_usd / ticket_confidence):
Resolve the company's GLOBAL average order value / ticket promedio (USD). ORDERED preference:
  1. Official financial disclosure (earnings call, 10-K, 20-F, investor deck, prospectus) → confidence: "high"
  2. Reputable analyst report or trade press citing a primary source (Statista, eMarketer, Reuters, FT, Bloomberg, TechCrunch) → "med"
  3. Industry benchmark applied to the company's vertical + primary geographies → "low"
     ALMOST ALL consumer-facing businesses fall here when no specific number exists. Pick a
     reasonable typical AOV for the vertical (footwear/apparel ~$60-80, SaaS subscription ~$50,
     food delivery ~$25, hotel booking ~$200, etc) and ground it in your industry knowledge.
     Use this whenever 1 or 2 don't apply — it should be the COMMON case, not rare.
  4. ONLY if the company is so unique that no industry vertical benchmark applies → confidence: "unknown"
     AND avg_ticket_usd: null. This must be RARE. Examples where this is acceptable: pure B2B
     services with no public pricing, holding companies, niche enterprise where vertical AOV
     is meaningless. NEVER use this for ordinary consumer or SaaS businesses.
NEVER invent a company-specific number that doesn't exist. NEVER average mixed currencies without explicit conversion.
If multiple ticket sizes by region/product exist, prefer the company-wide BLENDED number;
otherwise the largest revenue segment.

INDUSTRY CLASSIFICATION (industry_category):
Classify the company into EXACTLY ONE of these 37 categories (controlled vocabulary):
${INDUSTRY_CATEGORIES_FOR_PROMPT}
Pick the closest match by PRIMARY revenue stream. If it straddles two, pick the one with majority revenue.
Include a 1-sentence rationale in industry_classification_evidence. If unclassifiable, set industry_category: null.

EXISTING APMs (per-country — REQUIRED for every top country, even if uncertain):
You MUST emit one entry in existing_apms[] for EVERY country present in the SimilarWeb
top_countries list above (or every entry in top_markets[] if SimilarWeb is unavailable).
This is NOT optional — even if the research data is sparse, emit an entry with your best
inference based on:
  • The APMs / PAYMENT METHODS research section
  • Public knowledge of the company's checkout (super-apps in LATAM almost always have
    Pix in BR, OXXO/SPEI in MX, PSE/Nequi in CO, Yape in PE, Mercado Pago in AR/UY/CL, etc.)
  • The company's industry vertical (e-com platforms typically accept the country's
    instant-rail + dominant wallet)

Shape:
  {
    "country": "<English country name, matching SimilarWeb spelling>",
    "iso": "<ISO 3166-1 alpha-2>",
    "apms": ["Pix", "Mercado Pago"]   // empty array [] ONLY if you can confirm none
  }

Rules:
  • Only list local/alternative payment methods. Do NOT list raw cards ("Visa", "Mastercard",
    "Amex") — they're implied and not "alternative" methods.
  • Use canonical names from the country's APM catalog (Pix not "PIX BR", Mercado Pago not "MP").
  • If your best guess is empty (e.g. cards-only US merchant), emit "apms": [].
  • Tag [INFERENCE] inside the country name when uncertain — but still emit the entry.

LEGAL ENTITIES (per-country, with confidence):
For EVERY country in the SimilarWeb top_countries list (or top markets if SimilarWeb is unavailable),
emit ONE entry in legal_entities[] with this shape:
  {
    "country": "<English country name, matching SimilarWeb spelling>",
    "iso": "<ISO 3166-1 alpha-2, e.g. BR>",
    "has_entity": true | false | null,
    "confidence": "high" | "med" | "low" | "unknown",
    "entity_name": "<legal name if known>" | null,
    "evidence_type": "legal_filing" | "corp_disclosure" | "country_domain" | "press" | "inference",
    "evidence_quote": "<short verbatim snippet from a source>",
    "source_url": "<single URL>"
  }
Confidence rubric:
- "high": explicit legal filing or corporate disclosure naming the entity (CNPJ, EIN, Companies House, SIREN, etc.)
- "med":  country-specific website (e.g. brand.com.br resolves) + operational mentions, no legal doc
- "low":  press / inference only
- "unknown": no signal → set has_entity: null
The "CCTLD CHECK" section in the user prompt lists country domains that resolved for this company —
use them as primary evidence for the "med" confidence tier.

Output STRICT JSON only (no markdown fences, no preamble):
{
  "executive_summary": "3-4 sentences: who is the company + key payment-stack finding + main Yuno opportunity",
  "avg_ticket_usd": 0,
  "avg_ticket_confidence": "high|med|low|unknown",
  "avg_ticket_source_url": "...",
  "avg_ticket_evidence_quote": "...",
  "industry_category": "<one of the 37 categories or null>",
  "industry_classification_evidence": "1 sentence",
  "top_markets": [{"country": "...", "traffic_share_estimate": "X%", "source_url": "..."}],
  "existing_apms": [{"country":"...","iso":"..","apms":["..."]}],
  "legal_entities": [{"country":"...","iso":"..","has_entity":true,"confidence":"high","entity_name":"...","evidence_type":"legal_filing","evidence_quote":"...","source_url":"..."}],
  "cross_border_opportunities": [{"country": "...", "missing_entity": true, "opportunity_score": "high|medium|low", "why": "..."}],
  "apm_gaps": [{"country": "...", "missing_apms": ["PIX","Boleto"], "opportunity_score": "high|medium|low"}],
  "payment_stack": {"psps_detected": [{"name":"...","evidence_type":"...","source_url":"..."}], "orchestrator_detected": true|false, "gateway_evidence": [...]},
  "payment_complaints": [{"issue_type": "...", "source_url": "...", "frequency_estimate": "high|moderate|low"}],
  "expansion_signals": [{"date": "YYYY-MM-DD", "type": "...", "description": "...", "source_url": "..."}],
  "funding_signals": [{"date": "YYYY-MM-DD", "amount": "$XM", "round": "...", "source_url": "..."}],
  "psp_changes": [{"date": "YYYY-MM-DD", "type": "added|removed", "psp_name": "...", "source_url": "..."}],
  "primary_yuno_pitch": "1-2 sentences: the strongest hook for this specific company based on findings",
  "recommended_peer_case": "Rappi|inDrive|Uber|McDonald's|Avianca|Viva Aerobus|Xcaret|Livelo|Reserva|Open English|Smartfit|SpaceX"
}`

// Extra JSON keys appended to the output spec ONLY when the caller asks
// for revenue research. Listed here so the prompt template stays clean for
// the default (non-revenue) path used by yuno-bc / ai-research / cadence.
const REVENUE_OUTPUT_KEYS = `,
  "annual_revenue_usd": 0,
  "annual_revenue_confidence": "high|med|low|unknown",
  "annual_revenue_source_urls": ["...", "..."],
  "annual_revenue_evidence_quote": "..."`

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const body = (await req.json()) as DeepResearchRequest
    const auth = await getAuthContext(authHeader, { ownerId: body.ownerId, orgId: body.orgId })
    if (!auth) return errorResponse('Unauthorized', 401)

    const supabase = createSupabaseClient(authHeader)

    // Fetch company
    const { data: company, error: cErr } = await supabase
      .from('account_map_companies')
      .select('id, company_name, industry, location, website, research_json, intelligence_synthesized_at')
      .eq('id', body.company_id)
      .eq('org_id', auth.orgId)
      .single()
    if (cErr || !company) return errorResponse(`Company ${body.company_id} not found`, 404)

    // Cache check (unless force_refresh OR caller needs revenue and cache lacks it)
    if (!body.force_refresh && company.intelligence_synthesized_at) {
      const ageMs = Date.now() - new Date(company.intelligence_synthesized_at).getTime()
      const ttlMs = INTELLIGENCE_TTL_DAYS * 24 * 60 * 60 * 1000
      if (ageMs < ttlMs) {
        const intel = (company.research_json as Record<string, unknown>)?.intelligence as Record<string, unknown> | undefined
        const cachedHasRevenue = intel && intel.annual_revenue_usd !== undefined && intel.annual_revenue_usd !== null
        const needsRevenueRefresh = body.include_revenue_research === true && !cachedHasRevenue
        if (!needsRevenueRefresh) {
          return jsonResponse({
            success: true,
            cached: true,
            age_days: Math.floor(ageMs / (24 * 60 * 60 * 1000)),
            intelligence: intel,
          })
        }
        // else: fall through to a fresh run so the cached intel gets the
        // missing revenue fields (preserves the rest, since the new run will
        // overwrite the row with a full re-synthesis).
      }
    }

    const startMs = Date.now()
    const firecrawl = createFirecrawlClient()
    const companyName = company.company_name

    // ── Phase 1: 6 generic firecrawl searches + SimilarWeb, in parallel ──
    // (Replaced the legacy "entities" generic query with region-scoped phase-2 queries below.)
    const phase1Searches = [
      { key: 'markets', q: `"${companyName}" top markets countries traffic operations` },
      { key: 'payment_stack', q: `"${companyName}" payment processor gateway PSP Stripe Adyen Checkout integration` },
      { key: 'apms', q: `"${companyName}" payment methods checkout PIX OXXO PSE BLIK UPI accepts` },
      { key: 'complaints', q: `"${companyName}" payment failed declined card site:reddit.com OR site:trustpilot.com` },
      { key: 'recent', q: `"${companyName}" expansion funding new market launch announcement 2025 2026` },
      { key: 'avg_ticket', q: `"${companyName}" "average order value" OR "average ticket" OR "AOV" OR "average transaction"` },
    ]
    // Opt-in revenue search — only when SDR BC app-traffic flow asks for it.
    // Two query variants get fired so the LLM has multiple source candidates
    // to satisfy the ≥2-source double-check requirement.
    if (body.include_revenue_research === true) {
      phase1Searches.push(
        { key: 'revenue_primary', q: `"${companyName}" annual revenue 2024 OR 2025 10-K OR 20-F OR S-1 OR earnings OR investor` },
        { key: 'revenue_press',   q: `"${companyName}" revenue site:bloomberg.com OR site:reuters.com OR site:ft.com OR site:techcrunch.com OR site:crunchbase.com` },
      )
    }

    const similarwebDomain = company.website ? normalizeDomain(company.website) : null
    const supaUrl = Deno.env.get('SUPABASE_URL')!
    const [phase1Results, similarwebResult] = await Promise.all([
      Promise.allSettled(phase1Searches.map(s => firecrawl.search(s.q, { limit: 5, tbs: 'qdr:y' }))),
      similarwebDomain
        ? fetchAggregatedTraffic(supaUrl, authHeader, similarwebDomain, companyName).catch(err => {
            console.warn(`[chief-deep-research-company] SimilarWeb aggregated fetch failed for ${similarwebDomain}:`, err.message)
            return null
          })
        : Promise.resolve(null),
    ])

    // Aggregated traffic already cached by similarweb-traffic edge function.
    const similarwebSummary = similarwebResult
      ? summarizeAggregatedForPrompt(similarwebResult, companyName)
      : (similarwebDomain
          ? `[SimilarWeb data unavailable for ${similarwebDomain} — fall back to Firecrawl estimates.]`
          : `[No website on file — SimilarWeb data unavailable. Fall back to Firecrawl estimates.]`)

    // ── Phase 2: per-region legal-entity queries + cctld HEAD pings, in parallel ──
    // Only fires for regions where SimilarWeb saw ≥1% share. Falls back to no phase-2
    // queries when SimilarWeb is unavailable (LLM works from phase-1 markers only).
    const phase2Plan = planPhase2(similarwebResult, companyName, similarwebDomain)
    const [phase2SearchResults, cctldHits] = await Promise.all([
      Promise.allSettled(phase2Plan.entityQueries.map(q => firecrawl.search(q.q, { limit: 5, tbs: 'qdr:y' }))),
      probeCctld(similarwebDomain, phase2Plan.cctldProbes),
    ])

    // ── Aggregate raw results ──
    const rawData: Record<string, Array<{ title: string; description: string; url: string }>> = {}
    phase1Searches.forEach((s, i) => {
      const result = phase1Results[i]
      if (result.status === 'fulfilled') {
        const data = (result.value as { success: boolean; data?: Array<{ title: string; description: string; url: string }> }).data || []
        rawData[s.key] = data
      } else {
        rawData[s.key] = []
      }
    })
    // Merge phase-2 entity searches under a single `entities` bucket, grouped by region.
    const entitiesByRegion: Record<string, Array<{ title: string; description: string; url: string }>> = {}
    phase2Plan.entityQueries.forEach((q, i) => {
      const result = phase2SearchResults[i]
      if (result.status === 'fulfilled') {
        const data = (result.value as { success: boolean; data?: Array<{ title: string; description: string; url: string }> }).data || []
        entitiesByRegion[q.region] = data
      } else {
        entitiesByRegion[q.region] = []
      }
    })
    rawData.entities = Object.values(entitiesByRegion).flat()

    // ── LLM synthesis ──
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return errorResponse('ANTHROPIC_API_KEY not set', 500)

    const entitiesPerRegionSection = phase2Plan.entityQueries.length === 0
      ? '[No SimilarWeb data — phase-2 entity queries skipped. Use the AUTHORITATIVE policy to extract entity signals from MARKETS / TRAFFIC results only.]'
      : phase2Plan.entityQueries
          .map(q => {
            const items = entitiesByRegion[q.region] || []
            const header = `-- region: ${q.region.toUpperCase()} (top countries by traffic: ${q.countries.join(', ')}) --`
            const body = items.length === 0
              ? '(no Firecrawl hits)'
              : items.map(r => `[${r.title}] ${r.description} (${r.url})`).join('\n')
            return `${header}\n${body}`
          })
          .join('\n\n')

    const cctldSection = cctldHits.length === 0
      ? '[No country-domain probes resolved (or SimilarWeb unavailable).]'
      : cctldHits
          .map(h => `${h.iso} (${h.name}): https://${h.domain} resolved [evidence_type: country_domain]`)
          .join('\n')

    const userPrompt = `Synthesize intelligence for company: **${companyName}** (industry hint: ${company.industry || 'unknown'}, location: ${company.location || 'unknown'}, website: ${company.website || 'unknown'}).

== TRAFFIC DATA (SimilarWeb — AUTHORITATIVE) ==
${similarwebSummary}

== CCTLD CHECK (country domains that resolved live for this company) ==
${cctldSection}

Raw research data from targeted web searches:

== MARKETS / TRAFFIC ==
${(rawData.markets || []).map(r => `[${r.title}] ${r.description} (${r.url})`).join('\n')}

== LEGAL ENTITIES (per-region, with local legal markers like CNPJ/RFC/Companies House/Handelsregister) ==
${entitiesPerRegionSection}

== AVERAGE TICKET (AOV / earnings disclosures) ==
${(rawData.avg_ticket || []).map(r => `[${r.title}] ${r.description} (${r.url})`).join('\n')}

== PAYMENT STACK (PSPs) ==
${(rawData.payment_stack || []).map(r => `[${r.title}] ${r.description} (${r.url})`).join('\n')}

== APMs / PAYMENT METHODS ==
${(rawData.apms || []).map(r => `[${r.title}] ${r.description} (${r.url})`).join('\n')}

== PAYMENT COMPLAINTS ==
${(rawData.complaints || []).map(r => `[${r.title}] ${r.description} (${r.url})`).join('\n')}

== RECENT EXPANSION / FUNDING ==
${(rawData.recent || []).map(r => `[${r.title}] ${r.description} (${r.url})`).join('\n')}
${body.include_revenue_research === true ? `
== ANNUAL REVENUE (primary disclosures) ==
${(rawData.revenue_primary || []).map(r => `[${r.title}] ${r.description} (${r.url})`).join('\n')}

== ANNUAL REVENUE (financial press) ==
${(rawData.revenue_press || []).map(r => `[${r.title}] ${r.description} (${r.url})`).join('\n')}
` : ''}
Output JSON per the schema. Be conservative — only include claims you can support with the source URLs above. Use [INFERENCE] label or empty arrays where appropriate. Emit one legal_entities[] entry for EVERY country in the SimilarWeb top_countries list above (or top_markets if SimilarWeb is unavailable).`

    // Compose system prompt: append the revenue research section + JSON keys
    // only when this caller asked for them. Other callers see the original
    // template unchanged (zero behavioural impact).
    const effectiveSystemPrompt = body.include_revenue_research === true
      ? SYNTHESIS_SYSTEM_PROMPT.replace(
          '"recommended_peer_case": "Rappi|inDrive|Uber|McDonald\'s|Avianca|Viva Aerobus|Xcaret|Livelo|Reserva|Open English|Smartfit|SpaceX"\n}',
          `"recommended_peer_case": "Rappi|inDrive|Uber|McDonald\'s|Avianca|Viva Aerobus|Xcaret|Livelo|Reserva|Open English|Smartfit|SpaceX"${REVENUE_OUTPUT_KEYS}\n}`,
        ) + REVENUE_RESEARCH_SECTION
      : SYNTHESIS_SYSTEM_PROMPT

    const llmStart = Date.now()
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 8192,
        temperature: 0,
        system: effectiveSystemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      return errorResponse(`Anthropic ${resp.status}: ${errText.slice(0, 500)}`, 502)
    }

    const llmData = await resp.json()
    const text = llmData.content?.[0]?.text || ''
    const usage = llmData.usage || {}
    const cost = (usage.input_tokens * 3 + usage.output_tokens * 15) / 1_000_000
    const llmMs = Date.now() - llmStart

    // Parse JSON. Handles 3 cases:
    //   a) LLM emits raw JSON (preferred, matches "no markdown fences" instruction)
    //   b) LLM wraps in ```json ... ``` fences
    //   c) LLM opens a fence but truncates before closing it (just slice from first { to last })
    let jsonStr = text.trim()
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) jsonStr = fenceMatch[1].trim()
    else {
      // strip leading fence even if no closing fence (truncation case)
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
    }
    // Last resort: extract from first { to last } if there's leading prose.
    if (!jsonStr.startsWith('{')) {
      const firstBrace = jsonStr.indexOf('{')
      const lastBrace = jsonStr.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        jsonStr = jsonStr.slice(firstBrace, lastBrace + 1)
      }
    }

    let intelligence: Record<string, unknown> | null = null
    try {
      intelligence = JSON.parse(jsonStr)
    } catch (parseErr) {
      console.error('[chief-deep-research-company] JSON parse failed. Length:', text.length, 'Raw last 400 chars:', text.slice(-400))
      return errorResponse(`Synthesis parse failed: ${(parseErr as Error).message}. Length=${text.length}. Tail: ...${text.slice(-300)}`, 500)
    }

    // Merge into existing research_json
    const existing = (company.research_json as Record<string, unknown>) || {}
    const merged = { ...existing, intelligence, version: 2 }
    const nowIso = new Date().toISOString()

    await supabase
      .from('account_map_companies')
      .update({
        research_json: merged,
        intelligence_synthesized_at: nowIso,
        intelligence_synthesis_cost_usd: cost,
      })
      .eq('id', company.id)

    return jsonResponse({
      success: true,
      cached: false,
      company_id: company.id,
      company_name: company.company_name,
      intelligence,
      cost_usd: cost.toFixed(4),
      duration_ms: Date.now() - startMs,
      llm_ms: llmMs,
      raw_search_results_counts: {
        ...Object.fromEntries(phase1Searches.map((s, i) => [s.key, (rawData[s.key] || []).length])),
        entities_regions: phase2Plan.entityQueries.length,
        entities_total: rawData.entities.length,
      },
      similarweb: similarwebResult ? {
        domain: similarwebResult.domain,
        avg_monthly_visits: similarwebResult.monthly_visits.avg,
        top_country: similarwebResult.top_countries[0]?.name || null,
        domain_group: similarwebResult.domain_group,
        aggregated_domains: similarwebResult.domains_aggregated,
      } : null,
      phase2: {
        entity_regions: phase2Plan.entityQueries.map(q => ({ region: q.region, countries: q.countries })),
        cctld_hits: cctldHits.map(h => ({ iso: h.iso, country: h.name, domain: h.domain })),
      },
    })
  } catch (err) {
    return errorResponse(`Internal error: ${(err as Error).message}`, 500)
  }
})
