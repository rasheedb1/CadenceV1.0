// discover-company-domains
// =============================================================================
// Bulletproof multi-domain discovery pipeline. Finds ALL real domains owned by
// a company across countries — including renamed subsidiaries (Walmart → Lider
// Chile, Walmart → Flipkart India) — then verifies each via SimilarWeb.
//
// POST { primary_domain, company_name?, expected_markets?, refresh? }
//
// Pipeline (5 parallel scouts + verifier + final synthesis):
//   1. Cert Scout      → crt.sh SSL cert transparency (deterministic, no LLM)
//   2. Self-Site Scout → /privacy, /terms, /locations (Sonnet extracts)
//   3. Corporate Scout → Wikipedia subsidiaries (Sonnet extracts)
//   4. Search Scout    → targeted Firecrawl queries (Sonnet extracts)
//   5. Verifier        → DNS + SimilarWeb top-country match (deterministic)
//   6. Synthesizer     → Sonnet merges + scores confidence + detects gaps
//
// Manual override: if account_map_companies.domain_aliases is set, skip
// discovery and trust the curated list (still runs Verifier for sanity).
//
// Cache: 30-day TTL in company_domain_groups, cross-org shared.
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'
import { createFirecrawlClient } from '../_shared/firecrawl.ts'
import {
  fetchCertsByDomain,
  uniqueApexDomainsFromCerts,
} from '../_shared/cert-transparency.ts'
import {
  type DomainCandidate,
  type VerifiedDomain,
  type CoverageGap,
  type ExcludedCandidate,
  type DiscoveryResult,
  type Confidence,
  mergeCandidates,
  normalizeDomain,
  brandStemFromDomain,
  inferCountryFromCcTld,
  sanitizeMarketCode,
  countryNameToCode,
  dnsResolves,
  fetchPageTitle,
  brandKeywords,
} from '../_shared/domain-discovery.ts'
import { buildCcTldProbeList, MARKET_CCTLDS } from '../_shared/cctld-catalog.ts'

const CACHE_TTL_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
const VERIFY_CONCURRENCY = 5
const SONNET = 'claude-sonnet-4-6'

interface DiscoveryRequest {
  primary_domain: string
  company_name?: string
  expected_markets?: string[]
  refresh?: boolean
}

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return errorResponse('Missing bearer token', 401)
    }

    const body = (await req.json()) as DiscoveryRequest
    const primary = normalizeDomain(body.primary_domain || '')
    if (!primary || !primary.includes('.')) {
      return errorResponse('Invalid primary_domain', 400)
    }

    const companyName = body.company_name || brandStemFromDomain(primary)
    const supabase = createSupabaseClient()
    const startMs = Date.now()

    // ── Cache lookup ──
    const { data: cached } = await supabase
      .from('company_domain_groups')
      .select('*')
      .eq('primary_domain', primary)
      .maybeSingle()

    if (cached && !body.refresh && new Date(cached.expires_at).getTime() > Date.now()) {
      return jsonResponse({
        success: true,
        cached: true,
        ...buildResultFromCache(cached),
      })
    }

    // ── Manual override path ──
    const { data: company } = await supabase
      .from('account_map_companies')
      .select('id, company_name, domain_aliases')
      .eq('website', primary)
      .maybeSingle<{ id: string; company_name: string; domain_aliases: string[] | null }>()

    if (company?.domain_aliases && company.domain_aliases.length > 0) {
      console.log(`[discover] manual override for ${primary}: ${company.domain_aliases.join(', ')}`)
      const manualCandidates: DomainCandidate[] = company.domain_aliases.map(d => ({
        domain: normalizeDomain(d),
        confidence: 'high' as const,
        sources: ['manual' as const],
        market: inferCountryFromCcTld(d) || undefined,
      }))
      const verified = await runVerifier(manualCandidates, companyName, primary)
      const result = buildDiscoveryResult({
        primary, companyName, candidates: manualCandidates, verified,
        expected_markets: body.expected_markets || [],
        coverage_gaps: [], scouts_run: ['manual_override'],
        cost_usd: 0, cost_credits: verified.length * 33,
        startMs,
      })
      await persistResult(supabase, result, true)
      return jsonResponse({ success: true, cached: false, ...result })
    }

    // ── Run 6 scouts in parallel ──
    //
    // Three "smart" scouts (self-site, corporate, search) ask Sonnet to extract
    // candidates from text corpora and are the easiest to fail when wiki or
    // search coverage is thin.
    //
    // Three "deterministic" scouts (cert-sh, cctld-probe, sw-spillover) run
    // without LLM and are independent of expected_markets — they're the
    // safety net that prevented the Crocs/India failure mode after 2026-05-13.
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return errorResponse('ANTHROPIC_API_KEY not set', 500)

    const swApiKey = Deno.env.get('SIMILARWEB_API_KEY')
    const firecrawl = createFirecrawlClient()
    const scoutsRun: string[] = []
    let totalCostUsd = 0

    const [
      certResult,
      selfSiteResult,
      corporateResult,
      searchResult,
      cctldProbeResult,
      swSpilloverResult,
    ] = await Promise.allSettled([
      runCertScout(primary),
      runSelfSiteScout(primary, companyName, firecrawl, apiKey),
      runCorporateScout(companyName, firecrawl, apiKey),
      runSearchScout(companyName, primary, firecrawl, apiKey),
      runCcTldProbeScout(primary, companyName),
      runSimilarWebSpilloverScout(primary, companyName, swApiKey),
    ])

    const certCands = unwrapScout(certResult, 'cert-scout', scoutsRun).candidates
    const ssCands = unwrapScout(selfSiteResult, 'self-site-scout', scoutsRun)
    const corpCands = unwrapScout(corporateResult, 'corporate-scout', scoutsRun)
    const searchCands = unwrapScout(searchResult, 'search-scout', scoutsRun)
    const cctldCands = unwrapScout(cctldProbeResult, 'cctld-probe', scoutsRun)
    const swSpillCands = unwrapScout(swSpilloverResult, 'sw-spillover', scoutsRun)
    totalCostUsd += (ssCands.cost || 0) + (corpCands.cost || 0) + (searchCands.cost || 0)

    // Always include primary domain itself
    const primaryCand: DomainCandidate = {
      domain: primary,
      confidence: 'high',
      sources: ['primary'],
      market: inferCountryFromCcTld(primary) || undefined,
    }

    // ── Merge + verify ──
    const merged = mergeCandidates(
      [primaryCand],
      certCands,
      ssCands.candidates,
      corpCands.candidates,
      searchCands.candidates,
      cctldCands.candidates,
      swSpillCands.candidates,
    )
    console.log(`[discover] ${primary}: merged ${merged.length} candidates from ${scoutsRun.length} scouts`)

    const verified = await runVerifier(merged, companyName, primary)
    scoutsRun.push('verifier')

    // ── Gap detection ──
    const expectedMarkets = Array.from(new Set([
      ...(body.expected_markets || []).map(m => sanitizeMarketCode(m)).filter((m): m is string => Boolean(m)),
      ...(corpCands.expected_markets || []),
    ]))
    // Build set of verified ISO codes from BOTH the candidate's claimed market AND the inferred top-country
    const verifiedMarkets = new Set(
      verified
        .filter(v => v.similarweb_verified && v.dns_ok)
        .flatMap(v => [v.market, countryNameToCode(v.top_country)])
        .filter((m): m is string => Boolean(m))
    )
    const gaps: CoverageGap[] = expectedMarkets
      .filter(m => !verifiedMarkets.has(m))
      .map(m => ({ expected_market: m, reason: 'No verified domain found for this market' }))

    // Verification cost only (downstream aggregation is a separate edge function call)
    const verificationCredits = merged.length * 3 // ~3c per geo verification call (limit=3, 1mo, 404s free)
    const result = buildDiscoveryResult({
      primary,
      companyName,
      candidates: merged,
      verified,
      expected_markets: expectedMarkets,
      coverage_gaps: gaps,
      scouts_run: scoutsRun,
      cost_usd: totalCostUsd,
      cost_credits: verificationCredits,
      startMs,
    })

    await persistResult(supabase, result, false)
    return jsonResponse({ success: true, cached: false, ...result })
  } catch (err) {
    console.error('[discover] fatal error:', err)
    return errorResponse(`Internal error: ${(err as Error).message}`, 500)
  }
})

// ═════════════════════════════════════════════════════════════════════════════
// Scouts
// ═════════════════════════════════════════════════════════════════════════════

async function runCertScout(domain: string): Promise<{ candidates: DomainCandidate[] }> {
  const stem = brandStemFromDomain(domain)
  // Two parallel queries: wildcard on full domain (catches subdomains) +
  // brand stem suffix-less (catches sister domains like "rappi.cl" alongside "rappi.com")
  const [certsA, certsB] = await Promise.all([
    fetchCertsByDomain(domain, { excludeExpired: true }),
    fetchCertsByDomain(stem, { excludeExpired: true }),
  ])
  const allApexes = uniqueApexDomainsFromCerts([...certsA, ...certsB])
  // Filter to apexes that share the brand stem (avoids generic Let's Encrypt noise)
  const candidates: DomainCandidate[] = allApexes
    .filter(d => d.includes(stem) || d.split('.')[0] === stem)
    .map(d => ({
      domain: d,
      confidence: 'low' as const,
      sources: ['crt-sh' as const],
      market: inferCountryFromCcTld(d) || undefined,
    }))
  console.log(`[cert-scout] ${domain}: ${candidates.length} candidates from ${allApexes.length} apex domains`)
  return { candidates }
}

async function runSelfSiteScout(
  domain: string,
  companyName: string,
  firecrawl: ReturnType<typeof createFirecrawlClient>,
  apiKey: string,
): Promise<{ candidates: DomainCandidate[]; cost: number }> {
  // Try common paths in parallel; not all will exist
  const paths = ['/privacy', '/privacy-policy', '/terms', '/locations', '/international', '/contact']
  const scrapes = await Promise.allSettled(
    paths.map(p => firecrawl.scrape(`https://${domain}${p}`).catch(() => null))
  )

  const corpus = scrapes
    .map((s, i) => {
      if (s.status !== 'fulfilled' || !s.value?.data?.markdown) return null
      return `=== ${paths[i]} ===\n${s.value.data.markdown.slice(0, 8000)}`
    })
    .filter(Boolean)
    .join('\n\n')

  if (!corpus) {
    console.log(`[self-site-scout] ${domain}: no scrapable pages`)
    return { candidates: [], cost: 0 }
  }

  const system = `You extract domain names from a company's own privacy policy, terms of service, and locations pages.

LEGAL CONTEXT: Companies operating internationally MUST list every domain where they collect user data in their privacy policy (GDPR Article 13, CCPA, LGPD). This makes self-published privacy/terms pages the most authoritative source for finding all owned domains.

EXTRACT:
- Every domain mentioned as being owned/operated by the company
- For each, identify the target country if mentioned (e.g. "our German site walmart.de" → market=DE)
- Skip third-party tools (Google Analytics, facebook.com, etc.) — only domains the company itself operates

OUTPUT: Strict JSON only (no markdown fences):
{
  "candidates": [
    { "domain": "example.com", "market": "MX" | null, "evidence": "brief quote from source" }
  ]
}`

  const userPrompt = `Company: ${companyName}\nPrimary domain: ${domain}\n\nText from company's own published pages:\n\n${corpus.slice(0, 30000)}`

  const { json, usage } = await callSonnet(apiKey, system, userPrompt, 2048)
  const cost = costFromUsage(usage, 'sonnet')
  const parsed = json as { candidates?: Array<{ domain: string; market?: string; evidence?: string }> }
  const candidates = (parsed.candidates || [])
    .filter(c => c.domain && c.domain.includes('.'))
    .map(c => ({
      domain: normalizeDomain(c.domain),
      confidence: 'high' as const,    // privacy policies are legally authoritative
      sources: ['self-site' as const],
      market: sanitizeMarketCode(c.market) || inferCountryFromCcTld(c.domain) || undefined,
      evidence: c.evidence,
    }))
  console.log(`[self-site-scout] ${domain}: ${candidates.length} candidates from ${scrapes.filter(s => s.status === 'fulfilled').length} pages`)
  return { candidates, cost }
}

async function runCorporateScout(
  companyName: string,
  firecrawl: ReturnType<typeof createFirecrawlClient>,
  apiKey: string,
): Promise<{ candidates: DomainCandidate[]; cost: number; expected_markets?: string[] }> {
  // Try Wikipedia article. Firecrawl handles redirects.
  const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(companyName.replace(/\s+/g, '_'))}`
  const scrape = await firecrawl.scrape(wikiUrl).catch(() => null)

  if (!scrape?.data?.markdown) {
    console.log(`[corporate-scout] ${companyName}: no Wikipedia page found`)
    return { candidates: [], cost: 0 }
  }

  const system = `You research corporate subsidiaries from authoritative sources. Many large companies operate under DIFFERENT BRAND NAMES in different countries:
  - Walmart → Lider (Chile), Flipkart (India), Asda (UK, divested 2021)
  - Yum! Brands → KFC, Pizza Hut, Taco Bell
  - Inditex → Zara, Bershka, Pull&Bear

From the provided Wikipedia content, extract:
1. All current operating subsidiaries with their country
2. For each, infer the most likely web domain
3. Note any DIVESTED operations (sold/exited) — DO NOT include as candidates
4. List countries where the company operates (for gap detection)

CRITICAL: Be conservative on domain inference. If unsure, mark confidence "low" and let downstream verification drop bad guesses.

OUTPUT: Strict JSON only (no markdown fences):
{
  "candidates": [
    { "domain": "lider.cl", "market": "CL", "evidence": "Walmart Chile operates as Lider", "confidence": "high|medium|low" }
  ],
  "divested": [
    { "subsidiary": "Asda", "market": "GB", "year": "2021", "reason": "Sold to TDR Capital" }
  ],
  "operates_in": ["US", "MX", "CA", "CN", "IN", "CL"]
}`

  const userPrompt = `Company: ${companyName}\n\nWikipedia article content:\n\n${scrape.data.markdown.slice(0, 25000)}`

  const { json, usage } = await callSonnet(apiKey, system, userPrompt, 2048)
  const cost = costFromUsage(usage, 'sonnet')
  const parsed = json as {
    candidates?: Array<{ domain: string; market?: string; evidence?: string; confidence?: 'high' | 'medium' | 'low' }>
    divested?: Array<{ subsidiary?: string; market?: string }>
    operates_in?: string[]
  }
  const candidates = (parsed.candidates || [])
    .filter(c => c.domain && c.domain.includes('.'))
    .map(c => ({
      domain: normalizeDomain(c.domain),
      confidence: (c.confidence || 'medium') as 'high' | 'medium' | 'low',
      sources: ['wikipedia' as const],
      market: sanitizeMarketCode(c.market) || inferCountryFromCcTld(c.domain) || undefined,
      evidence: c.evidence,
    }))
  const expected_markets = (parsed.operates_in || [])
    .map(m => sanitizeMarketCode(m))
    .filter((m): m is string => Boolean(m))
  console.log(`[corporate-scout] ${companyName}: ${candidates.length} candidates, operates_in: ${expected_markets.length} markets`)
  return { candidates, cost, expected_markets }
}

async function runSearchScout(
  companyName: string,
  primary: string,
  firecrawl: ReturnType<typeof createFirecrawlClient>,
  apiKey: string,
): Promise<{ candidates: DomainCandidate[]; cost: number }> {
  // Decoupled from expected_markets — these 7 queries cover all major
  // regions independently. Without this, a missing wiki market (e.g. Crocs/
  // India) cascades into every downstream scout. Each region query is broad
  // enough that one search surfaces the official ccTLD or a Wikipedia/Tracxn
  // reference that the LLM can pin to a country.
  const queries = [
    // Generic + corporate moves (kept from original)
    `"${companyName}" international subsidiaries domains country list`,
    `"${companyName}" divested OR sold OR acquired subsidiary site`,
    // Per-region — broad coverage, no market-list dependency
    `"${companyName}" official site LATAM Chile Brazil Mexico Argentina Colombia Peru`,
    `"${companyName}" official site Europe Germany France UK Italy Spain Netherlands Sweden Poland`,
    `"${companyName}" official site APAC India Japan Korea Singapore Indonesia Philippines Vietnam Thailand Malaysia Australia`,
    `"${companyName}" official site MEA UAE Saudi Israel Turkey Egypt Morocco "South Africa"`,
    `"${companyName}" ecommerce store country domain ".in" OR ".id" OR ".br" OR ".mx" OR ".tr" OR ".ae"`,
  ]
  const searches = await Promise.allSettled(
    queries.map(q => firecrawl.search(q, { limit: 5, tbs: 'qdr:y' }))
  )
  const results: Array<{ title: string; description: string; url: string }> = []
  for (const s of searches) {
    if (s.status === 'fulfilled' && s.value.success && Array.isArray(s.value.data)) {
      results.push(...s.value.data)
    }
  }
  if (results.length === 0) {
    console.log(`[search-scout] ${companyName}: no search results`)
    return { candidates: [], cost: 0 }
  }

  const system = `You extract candidate domains from web search results about a company's international presence.

From the search snippets, find:
- Domains mentioned as belonging to ${companyName} in different markets
- Subsidiary brand names + their domains (e.g. "Walmart owns Flipkart in India" → flipkart.com)
- Mark anything sold/divested in 'divested' (don't include as candidates)

Be conservative — downstream verification will drop bad guesses, but don't flood with junk.

OUTPUT: Strict JSON only (no markdown fences):
{
  "candidates": [
    { "domain": "lider.cl", "market": "CL", "evidence": "Walmart's Chilean operation", "confidence": "high|medium|low" }
  ],
  "divested": [...]
}`

  const corpus = results.map(r => `[${r.title}] ${r.description} (${r.url})`).join('\n')
  const userPrompt = `Company: ${companyName}\nPrimary domain: ${primary}\n\nSearch results:\n${corpus.slice(0, 15000)}`

  const { json, usage } = await callSonnet(apiKey, system, userPrompt, 2048)
  const cost = costFromUsage(usage, 'sonnet')
  const parsed = json as { candidates?: Array<{ domain: string; market?: string; evidence?: string; confidence?: 'high' | 'medium' | 'low' }> }
  const candidates = (parsed.candidates || [])
    .filter(c => c.domain && c.domain.includes('.'))
    .map(c => ({
      domain: normalizeDomain(c.domain),
      confidence: (c.confidence || 'low') as 'high' | 'medium' | 'low',
      sources: ['search' as const],
      market: sanitizeMarketCode(c.market) || inferCountryFromCcTld(c.domain) || undefined,
      evidence: c.evidence,
    }))
  console.log(`[search-scout] ${companyName}: ${candidates.length} candidates from ${results.length} search results`)
  return { candidates, cost }
}

// ─────────────────────────────────────────────────────────────────────────────
// cctld-probe scout — brute-force HEAD pings against {brand}.{cctld} variants.
//
// Why: corporate-scout depends on Wikipedia's coverage of operates_in[], and
// self-site-scout depends on the primary returning scrapable content. When a
// brand has a FRANCHISED ccTLD that wiki doesn't highlight (e.g. crocs.in
// operated by Crocs India Pvt Ltd, never linked from crocs.com), no other
// scout catches it. Brute-force probing the standard ccTLD patterns for ~50
// global markets is cheap (~150 parallel HEAD pings, ~0$, ~2s) and is the
// most reliable line of defense against this failure mode.
//
// Verification is intentionally light at this stage — we only confirm DNS +
// HTTP-200/3xx + brand-in-title. SimilarWeb verification happens downstream
// in runVerifier(), so candidates that survive that gate become real
// VerifiedDomain entries; the rest are filtered out as excluded_candidates.
async function runCcTldProbeScout(
  primaryDomain: string,
  companyName: string,
): Promise<{ candidates: DomainCandidate[]; cost: number }> {
  const stem = brandStemFromDomain(primaryDomain)
  if (!stem || stem.length < 3) {
    console.log(`[cctld-probe] ${primaryDomain}: brand stem too short, skipping`)
    return { candidates: [], cost: 0 }
  }

  const probeList = buildCcTldProbeList(stem, { includeFranchisePatterns: true })
    .filter(p => p.domain !== primaryDomain)

  const brandKeywordsList = brandKeywords(companyName, primaryDomain)
  const PROBE_CONCURRENCY = 30
  const hits: Array<{ domain: string; market: string; titleMatch: boolean }> = []

  for (let i = 0; i < probeList.length; i += PROBE_CONCURRENCY) {
    const batch = probeList.slice(i, i + PROBE_CONCURRENCY)
    const batchResults = await Promise.all(batch.map(p => probeOne(p.domain, p.market, brandKeywordsList)))
    for (const r of batchResults) {
      if (r) hits.push(r)
    }
  }

  const candidates: DomainCandidate[] = hits.map(h => ({
    domain: h.domain,
    market: h.market,
    confidence: (h.titleMatch ? 'medium' : 'low') as Confidence,
    sources: ['cctld-probe' as const],
    evidence: h.titleMatch ? 'HEAD 200 + brand keyword in <title>' : 'HEAD 200 (title check inconclusive)',
  }))
  console.log(`[cctld-probe] ${primaryDomain}: ${candidates.length} hits from ${probeList.length} probes`)
  return { candidates, cost: 0 }
}

async function probeOne(
  domain: string,
  market: string,
  brandKeywordsList: string[],
): Promise<{ domain: string; market: string; titleMatch: boolean } | null> {
  // Use a real browser UA — many sites 403 default fetch UAs.
  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

  // First check DNS resolves — cheap, eliminates 80%+ of probe targets.
  if (!(await dnsResolves(domain))) return null

  try {
    // Range-limited GET fetches the <head> only (~4KB). Beats HEAD for two
    // reasons: (a) lets us read <title> in the same call, (b) some sites
    // 405 on HEAD but happily serve GET.
    const r = await fetch(`https://${domain}/`, {
      method: 'GET',
      headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Range': 'bytes=0-4096' },
      redirect: 'follow',
      signal: AbortSignal.timeout(4000),
    })
    if (!r.ok && r.status !== 206) return null

    // Reject obvious squatter / parked redirects (e.g. redirect off-brand).
    const finalUrl = new URL(r.url).hostname.toLowerCase().replace(/^www\./, '')
    const matchesBrand = brandKeywordsList.some(kw => finalUrl.includes(kw))
    if (!matchesBrand) return null

    // Read first 4KB for <title> check.
    const buf = new Uint8Array(await r.arrayBuffer())
    const html = new TextDecoder('utf-8', { fatal: false }).decode(buf)
    const titleMatch = (() => {
      const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
      if (!m) return false
      const t = m[1].toLowerCase()
      // Reject classic parking-page markers
      if (/(domain (is )?for sale|parked|godaddy|sedo|hugedomains)/i.test(t)) return false
      return brandKeywordsList.some(kw => t.includes(kw))
    })()

    return { domain, market, titleMatch }
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// sw-spillover scout — uses the primary domain's SimilarWeb top_countries as
// EVIDENCE that the brand has users in a given country, then probes plausible
// ccTLDs there. This is the complement to cctld-probe: where cctld-probe
// blanket-covers ~50 markets, sw-spillover targets the countries where we
// already have positive signal that users exist (even if the corporate-scout
// missed them). For Crocs, this would flag India because crocs.com itself
// receives 0.23% of traffic from India.
//
// Threshold (≥0.1%) is loose on purpose — even small share is enough to merit
// a $0 ccTLD probe. Countries already covered by the default cctld-probe set
// are skipped to avoid duplicate work.
async function runSimilarWebSpilloverScout(
  primaryDomain: string,
  companyName: string,
  apiKey: string | undefined,
): Promise<{ candidates: DomainCandidate[]; cost: number }> {
  if (!apiKey) {
    console.log(`[sw-spillover] ${primaryDomain}: SIMILARWEB_API_KEY not set, skipping`)
    return { candidates: [], cost: 0 }
  }
  const stem = brandStemFromDomain(primaryDomain)
  if (!stem || stem.length < 3) return { candidates: [], cost: 0 }

  // Fetch the primary's per-country traffic distribution (single SW call).
  const today = new Date()
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1))
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 4, 1))
  const endM = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, '0')}`
  const startM = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`
  const url = `https://api.similarweb.com/v4/website/${encodeURIComponent(primaryDomain)}/geo/total-traffic-by-country?api_key=${apiKey}&start_date=${startM}&end_date=${endM}&main_domain_only=false&format=json&limit=20&sort=share&asc=false`

  let records: Array<{ country_name: string; share: number }> = []
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!r.ok) {
      console.log(`[sw-spillover] ${primaryDomain}: SimilarWeb returned ${r.status}, skipping`)
      return { candidates: [], cost: 0 }
    }
    const data = await r.json() as { records?: Array<{ country_name: string; share: number }> }
    records = data.records || []
  } catch (err) {
    console.log(`[sw-spillover] ${primaryDomain}: fetch failed: ${(err as Error).message}`)
    return { candidates: [], cost: 0 }
  }

  // Filter to countries with ≥0.1% share (signal of any meaningful local presence).
  const cctldByMarket = new Map(MARKET_CCTLDS.map(m => [m.market, m.cctlds]))
  const brandKeywordsList = brandKeywords(companyName, primaryDomain)
  const SPILLOVER_THRESHOLD = 0.001

  const probeTargets: Array<{ domain: string; market: string }> = []
  const seen = new Set<string>([primaryDomain])
  for (const rec of records) {
    if (rec.share < SPILLOVER_THRESHOLD) continue
    const code = countryNameToCode(rec.country_name)
    if (!code) continue
    const cctlds = cctldByMarket.get(code)
    if (!cctlds) continue
    for (const tld of cctlds) {
      const d = `${stem}.${tld}`.toLowerCase()
      if (!seen.has(d)) {
        seen.add(d)
        probeTargets.push({ domain: d, market: code })
      }
    }
  }

  if (probeTargets.length === 0) {
    console.log(`[sw-spillover] ${primaryDomain}: no spillover candidates (records=${records.length})`)
    return { candidates: [], cost: 0 }
  }

  // Re-use the same probe function as cctld-probe.
  const PROBE_CONCURRENCY = 20
  const hits: Array<{ domain: string; market: string; titleMatch: boolean }> = []
  for (let i = 0; i < probeTargets.length; i += PROBE_CONCURRENCY) {
    const batch = probeTargets.slice(i, i + PROBE_CONCURRENCY)
    const batchResults = await Promise.all(batch.map(p => probeOne(p.domain, p.market, brandKeywordsList)))
    for (const r of batchResults) {
      if (r) hits.push(r)
    }
  }

  const candidates: DomainCandidate[] = hits.map(h => ({
    domain: h.domain,
    market: h.market,
    confidence: (h.titleMatch ? 'medium' : 'low') as Confidence,
    sources: ['sw-spillover' as const],
    evidence: h.titleMatch
      ? `primary domain has traffic from this market; ccTLD probe returned HTTP 200 + brand keyword in <title>`
      : `primary domain has traffic from this market; ccTLD probe returned HTTP 200`,
  }))
  console.log(`[sw-spillover] ${primaryDomain}: ${candidates.length} hits from ${probeTargets.length} spillover probes (${records.length} SW records)`)
  return { candidates, cost: 0 }
}

// ═════════════════════════════════════════════════════════════════════════════
// Verifier — deterministic, per-candidate
// ═════════════════════════════════════════════════════════════════════════════

async function runVerifier(
  candidates: DomainCandidate[],
  companyName: string,
  primaryDomain: string,
): Promise<VerifiedDomain[]> {
  const apiKey = Deno.env.get('SIMILARWEB_API_KEY')
  const keywords = brandKeywords(companyName, primaryDomain)

  // Process in batches to avoid hammering SimilarWeb
  const results: VerifiedDomain[] = []
  for (let i = 0; i < candidates.length; i += VERIFY_CONCURRENCY) {
    const batch = candidates.slice(i, i + VERIFY_CONCURRENCY)
    const batchResults = await Promise.all(batch.map(c => verifyOne(c, keywords, apiKey)))
    results.push(...batchResults)
  }
  return results
}

async function verifyOne(
  cand: DomainCandidate,
  brandKeywordsList: string[],
  apiKey: string | undefined,
): Promise<VerifiedDomain> {
  const out: VerifiedDomain = {
    ...cand,
    similarweb_verified: false,
    dns_ok: false,
    brand_in_title: false,
  }

  // 1. DNS check
  const dns = await dnsResolves(cand.domain)
  out.dns_ok = dns
  if (!dns) return out

  // 2. SimilarWeb top-country sanity check (3 months × top 3 — more lenient for small sites)
  if (apiKey) {
    const today = new Date()
    const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1))
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 4, 1))
    const endM = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, '0')}`
    const startM = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`
    const url = `https://api.similarweb.com/v4/website/${encodeURIComponent(cand.domain)}/geo/total-traffic-by-country?api_key=${apiKey}&start_date=${startM}&end_date=${endM}&main_domain_only=false&format=json&limit=3&sort=share&asc=false`
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) })
      if (r.ok) {
        const data = await r.json() as { records?: Array<{ country_name: string; share: number }> }
        const top = data.records?.[0]
        if (top) {
          out.top_country = top.country_name
          out.top_country_share = top.share
          const records = data.records || []
          const isPrimary = cand.sources.includes('primary') || cand.sources.includes('manual')

          // Tiered verification thresholds:
          //  - Primary/manual: any SimilarWeb data passes (no geo concentration required)
          //    Reason: mono-domain B2B SaaS often has dispersed traffic (no country dominant)
          //  - Has claimed market: that market must appear in top 5 with ≥15% share
          //    Reason: ccTLD-specific sites are usually 80-100% concentrated, but the merge
          //    might assign a market from a weak signal — be lenient
          //  - No claimed market: top country share ≥ 25%
          //    Reason: catches squatters/parked domains that show random country
          if (isPrimary) {
            out.similarweb_verified = true
            if (!out.market) {
              const inferredCode = countryNameToCode(top.country_name)
              if (inferredCode) out.market = inferredCode
            }
          } else if (cand.market) {
            const matchedRecord = records.find(rec => {
              const recCode = countryNameToCode(rec.country_name)
              return rec.share >= 0.15 && (recCode === cand.market || rec.country_name.toLowerCase().includes(cand.market!.toLowerCase()))
            })
            if (matchedRecord) out.similarweb_verified = true
          } else {
            if (top.share >= 0.25) {
              out.similarweb_verified = true
              const inferredCode = countryNameToCode(top.country_name)
              if (inferredCode) out.market = inferredCode
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[verifier] SimilarWeb check failed for ${cand.domain}: ${(err as Error).message}`)
    }
  }

  // 3. Title brand-keyword check (only as supplementary signal)
  try {
    const title = await fetchPageTitle(cand.domain)
    if (title) {
      const lower = title.toLowerCase()
      out.brand_in_title = brandKeywordsList.some(kw => lower.includes(kw))
    }
  } catch {}

  return out
}

// countryNameToCode is now imported from domain-discovery.ts

// ═════════════════════════════════════════════════════════════════════════════
// Helpers — LLM, persistence, response shaping
// ═════════════════════════════════════════════════════════════════════════════

interface Usage { input_tokens: number; output_tokens: number }

async function callSonnet(apiKey: string, system: string, user: string, maxTokens: number): Promise<{ json: unknown; usage: Usage }> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: SONNET,
      max_tokens: maxTokens,
      temperature: 0,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })
  if (!r.ok) {
    const errText = await r.text()
    throw new Error(`Anthropic ${r.status}: ${errText.slice(0, 200)}`)
  }
  const data = await r.json()
  const text = data.content?.[0]?.text || ''
  const usage = data.usage as Usage
  const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) || [null, text]
  let json: unknown = {}
  try {
    json = JSON.parse(jsonMatch[1] || text)
  } catch (e) {
    console.error(`[callSonnet] JSON parse failed: ${(e as Error).message}, raw: ${text.slice(0, 300)}`)
  }
  return { json, usage }
}

function costFromUsage(usage: Usage, model: 'sonnet' | 'haiku'): number {
  const rates = model === 'sonnet'
    ? { input: 3 / 1_000_000, output: 15 / 1_000_000 }
    : { input: 1 / 1_000_000, output: 5 / 1_000_000 }
  return usage.input_tokens * rates.input + usage.output_tokens * rates.output
}

function unwrapScout<T>(
  result: PromiseSettledResult<T>,
  name: string,
  scoutsRun: string[],
): (T extends { candidates: unknown[] } ? T : { candidates: DomainCandidate[]; cost?: number; expected_markets?: string[] }) {
  if (result.status === 'fulfilled') {
    scoutsRun.push(name)
    return result.value as never
  }
  console.warn(`[${name}] failed: ${(result.reason as Error)?.message || 'unknown'}`)
  return { candidates: [] } as never
}

function buildDiscoveryResult(opts: {
  primary: string
  companyName: string
  candidates: DomainCandidate[]
  verified: VerifiedDomain[]
  expected_markets: string[]
  coverage_gaps: CoverageGap[]
  scouts_run: string[]
  cost_usd: number
  cost_credits: number
  startMs: number
}): DiscoveryResult {
  const accepted = opts.verified.filter(v => v.similarweb_verified && v.dns_ok)
  const rejected: ExcludedCandidate[] = opts.verified
    .filter(v => !(v.similarweb_verified && v.dns_ok))
    .map(v => {
      const topCode = countryNameToCode(v.top_country)
      const claimedMatches = v.market && topCode === v.market
      const reason = !v.dns_ok
        ? 'DNS does not resolve'
        : !v.top_country
        ? 'No SimilarWeb data (domain may be too small or untracked)'
        : v.market && !claimedMatches
        ? `Top country ${v.top_country} (${topCode || '?'}) does not match claimed market ${v.market}`
        : v.top_country_share !== undefined && v.top_country_share < 0.15
        ? `Traffic too dispersed (top country ${v.top_country} only ${Math.round((v.top_country_share || 0) * 100)}%)`
        : 'Did not pass verification thresholds'
      return { domain: v.domain, reason, sources: v.sources }
    })

  const now = new Date()
  const expires_at = new Date(now.getTime() + CACHE_TTL_DAYS * DAY_MS).toISOString()

  return {
    primary_domain: opts.primary,
    company_name: opts.companyName,
    discovered_domains: accepted,
    coverage_gaps: opts.coverage_gaps,
    excluded_candidates: rejected,
    expected_markets: opts.expected_markets,
    discovery_metadata: {
      scouts_run: opts.scouts_run,
      duration_ms: Date.now() - opts.startMs,
      cost_usd: +opts.cost_usd.toFixed(4),
      cost_credits: opts.cost_credits,
      cache_status: 'miss',
    },
  }
}

function buildResultFromCache(row: Record<string, unknown>): Omit<DiscoveryResult, 'discovery_metadata'> & { discovery_metadata: DiscoveryResult['discovery_metadata'] } {
  const md = (row.discovery_metadata as DiscoveryResult['discovery_metadata']) || { scouts_run: [], duration_ms: 0, cost_usd: 0, cost_credits: 0, cache_status: 'miss' }
  return {
    primary_domain: row.primary_domain as string,
    company_name: row.company_name as string,
    discovered_domains: (row.discovered_domains as VerifiedDomain[]) || [],
    coverage_gaps: (row.coverage_gaps as CoverageGap[]) || [],
    excluded_candidates: (row.excluded_candidates as ExcludedCandidate[]) || [],
    expected_markets: (row.expected_markets as string[]) || [],
    discovery_metadata: { ...md, cache_status: 'hit' },
  }
}

async function persistResult(
  supabase: ReturnType<typeof createSupabaseClient>,
  result: DiscoveryResult,
  manualCurated: boolean,
): Promise<void> {
  const expires_at = new Date(Date.now() + CACHE_TTL_DAYS * DAY_MS).toISOString()
  const { error } = await supabase
    .from('company_domain_groups')
    .upsert({
      primary_domain: result.primary_domain,
      company_name: result.company_name,
      discovered_domains: result.discovered_domains,
      coverage_gaps: result.coverage_gaps,
      excluded_candidates: result.excluded_candidates,
      discovery_metadata: result.discovery_metadata,
      expected_markets: result.expected_markets,
      fetched_at: new Date().toISOString(),
      expires_at,
      manual_curated: manualCurated,
      error: null,
    })
  if (error) {
    console.error('[persist] error:', error)
  }
}
