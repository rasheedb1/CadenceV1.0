// resolve-company-domain.ts
// Resolve a company name to its canonical primary domain.
//
// Why: SDR BC, Andrés (research), and Chief discover-and-queue all need a
// "seed domain" to start the SimilarWeb + multi-country discovery pipeline.
// SimilarWeb is domain-keyed (no "search by company name" endpoint), so we
// need a primitive that takes "Rappi" → "rappi.com" deterministically.
//
// Flow:
//   1. Cache hit: account_map_companies WHERE org_id AND ilike(company_name)
//   2. Firecrawl /search: `"<name>" official website` with limit=5
//   3. Filter non-corporate hosts (social, dirs, news)
//   4. Score candidates (brand-in-domain + TLD + position)
//   5. Confidence = margin of winner over runner-up

import { createFirecrawlClient } from './firecrawl.ts'
import { normalizeDomain } from './similarweb.ts'

export type DomainConfidence = 'high' | 'med' | 'low'

export interface ResolvedDomain {
  domain: string
  confidence: DomainConfidence
  source: 'cache' | 'firecrawl'
  evidence: {
    query?: string
    candidates: Array<{ domain: string; score: number; title: string; url: string; snippet: string }>
    winner_score: number
    runner_up_score: number
    margin: number
  } | null
}

export class DomainResolutionError extends Error {
  reason: 'no_results' | 'all_filtered' | 'no_firecrawl_key' | 'ambiguous'
  candidates: Array<{ domain: string; title: string; snippet: string }>
  constructor(
    reason: 'no_results' | 'all_filtered' | 'no_firecrawl_key' | 'ambiguous',
    message: string,
    candidates: Array<{ domain: string; title: string; snippet: string }> = [],
  ) {
    super(message)
    this.name = 'DomainResolutionError'
    this.reason = reason
    this.candidates = candidates
  }
}

// Hosts that are never the official corporate site for a given brand.
// We exclude these so they don't poison the scoring.
const NON_CORPORATE_HOSTS = new Set([
  'linkedin.com', 'twitter.com', 'x.com', 'facebook.com', 'instagram.com',
  'crunchbase.com', 'wikipedia.org', 'bloomberg.com', 'forbes.com',
  'glassdoor.com', 'indeed.com', 'youtube.com', 'tiktok.com', 'pinterest.com',
  'reddit.com', 'medium.com', 'substack.com',
  // News/aggregators that often outrank the official site for short brand queries
  'techcrunch.com', 'theverge.com', 'reuters.com', 'cnbc.com', 'nytimes.com',
  'wsj.com', 'businesswire.com', 'prnewswire.com',
  // App stores
  'apps.apple.com', 'play.google.com', 'apple.com/app-store',
  // Marketplaces / e-commerce listings
  'amazon.com', 'ebay.com', 'walmart.com',
])

// TLDs that signal "global corporate" — preferred over country-specific
// when picking the PRIMARY (multi-country discovery finds the ccTLDs later).
const GLOBAL_TLDS = new Set(['com', 'ai', 'io', 'co', 'app', 'net', 'org'])

function rootOfDomain(domain: string): string {
  // "rappi.com.br" → "rappi", "ifood.co" → "ifood", "apple.com" → "apple"
  // We strip the last 1-2 segments depending on whether it's a ccTLD compound.
  const parts = domain.split('.')
  if (parts.length <= 1) return domain
  // Compound ccTLDs like .com.br, .co.uk, .com.mx, .com.ar
  const compoundCcTlds = new Set([
    'com.br', 'com.mx', 'com.ar', 'com.co', 'com.pe', 'com.uy', 'com.ve',
    'co.uk', 'com.au', 'co.jp', 'co.in', 'co.kr', 'com.sg', 'com.tr',
  ])
  const last2 = parts.slice(-2).join('.')
  if (compoundCcTlds.has(last2)) {
    return parts.slice(0, -2).join('.') || parts[0]
  }
  return parts.slice(0, -1).join('.') || parts[0]
}

function tldOfDomain(domain: string): string {
  const parts = domain.split('.')
  return parts.length > 0 ? parts[parts.length - 1] : ''
}

function normalizeCompanyNameForMatching(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/\s+(inc|corp|ltd|llc|sa|s\.a\.|sas|gmbh|ag|holdings?|group)\.?$/i, '')
    .replace(/[^a-z0-9]/g, '')
}

function isNonCorporateHost(domain: string): boolean {
  if (NON_CORPORATE_HOSTS.has(domain)) return true
  // Subdomain checks (e.g., apps.apple.com)
  for (const host of NON_CORPORATE_HOSTS) {
    if (domain.endsWith('.' + host)) return true
  }
  return false
}

interface ScoredCandidate {
  domain: string
  score: number
  title: string
  url: string
  snippet: string
}

function scoreCandidate(
  domain: string,
  position: number,
  title: string,
  companyNameNorm: string,
): number {
  let score = 0
  const root = rootOfDomain(domain)
  const tld = tldOfDomain(domain)

  // Strongest signal: brand name appears in the domain root.
  if (root.includes(companyNameNorm) || companyNameNorm.includes(root)) {
    score += 3
    // Exact match bonus (rappi.com root === "rappi")
    if (root === companyNameNorm) score += 1
  }

  // Global TLD vs ccTLD — primary should be the global one
  if (GLOBAL_TLDS.has(tld)) score += 1

  // Position in search results (1-indexed)
  if (position === 1) score += 2
  else if (position === 2) score += 1

  // Title contains "Official" — extra signal
  if (/\bofficial\b/i.test(title)) score += 0.5

  return score
}

/**
 * Resolve a company name to its canonical primary domain.
 *
 * @param companyName - Brand name as written (case preserved upstream)
 * @param opts.orgId - If provided, check account_map_companies cache first
 * @param opts.supabase - Supabase client (only needed if orgId is provided)
 * @param opts.firecrawlKey - Optional override; defaults to FIRECRAWL_API_KEY env
 *
 * @throws DomainResolutionError when no usable candidate is found
 */
export async function resolveCompanyDomain(
  companyName: string,
  opts: {
    orgId?: string
    // deno-lint-ignore no-explicit-any
    supabase?: any
    firecrawlKey?: string
  } = {},
): Promise<ResolvedDomain> {
  const name = companyName.trim()
  if (!name) {
    throw new DomainResolutionError('no_results', 'companyName is empty')
  }
  const nameNorm = normalizeCompanyNameForMatching(name)
  if (!nameNorm) {
    throw new DomainResolutionError('no_results', `companyName "${name}" has no usable characters`)
  }

  // ── Step 1: cache hit in account_map_companies ──
  if (opts.orgId && opts.supabase) {
    try {
      const { data: cached } = await opts.supabase
        .from('account_map_companies')
        .select('website')
        .eq('org_id', opts.orgId)
        .ilike('company_name', name)
        .not('website', 'is', null)
        .limit(1)
        .maybeSingle()
      if (cached?.website) {
        const cachedDomain = normalizeDomain(cached.website)
        if (cachedDomain) {
          console.log(`[resolve-domain] cache hit: ${name} → ${cachedDomain}`)
          return {
            domain: cachedDomain,
            confidence: 'high',
            source: 'cache',
            evidence: null,
          }
        }
      }
    } catch (e) {
      // Don't fail on cache miss — fall through to Firecrawl
      console.log(`[resolve-domain] cache lookup failed: ${(e as Error).message}`)
    }
  }

  // ── Step 2: Firecrawl search ──
  const firecrawlKey = opts.firecrawlKey ?? Deno.env.get('FIRECRAWL_API_KEY')
  if (!firecrawlKey) {
    throw new DomainResolutionError(
      'no_firecrawl_key',
      'FIRECRAWL_API_KEY is not configured — cannot resolve domain from company name',
    )
  }

  const firecrawl = createFirecrawlClient()
  const query = `"${name}" official website`
  const searchResult = await firecrawl.search(query, { limit: 5, maxRetries: 1 })

  if (!searchResult.success || !searchResult.data || searchResult.data.length === 0) {
    throw new DomainResolutionError(
      'no_results',
      `Firecrawl search returned no results for "${name}"`,
    )
  }

  // ── Step 3 + 4: filter + score ──
  const candidates: ScoredCandidate[] = []
  searchResult.data.forEach((r, idx) => {
    let domain: string
    try {
      domain = normalizeDomain(new URL(r.url).hostname)
    } catch {
      return
    }
    if (!domain) return
    if (isNonCorporateHost(domain)) return

    const position = idx + 1
    const score = scoreCandidate(domain, position, r.title || '', nameNorm)
    candidates.push({
      domain,
      score,
      title: r.title || '',
      url: r.url,
      snippet: r.description || '',
    })
  })

  if (candidates.length === 0) {
    throw new DomainResolutionError(
      'all_filtered',
      `All ${searchResult.data.length} results were non-corporate hosts for "${name}"`,
      searchResult.data.slice(0, 3).map((r) => ({
        domain: (() => { try { return normalizeDomain(new URL(r.url).hostname) } catch { return r.url } })(),
        title: r.title || '',
        snippet: r.description || '',
      })),
    )
  }

  // Sort by score desc, then by position (preserved via array order)
  candidates.sort((a, b) => b.score - a.score)
  const winner = candidates[0]
  const runnerUp = candidates[1]
  const runnerUpScore = runnerUp?.score ?? 0
  const margin = winner.score - runnerUpScore

  // ── Step 5: confidence ──
  // Must have brand match (+3) to be high. Otherwise it's a guess.
  const hasBrandMatch = winner.score >= 3
  let confidence: DomainConfidence
  if (hasBrandMatch && margin > 2) confidence = 'high'
  else if (hasBrandMatch && margin >= 1) confidence = 'med'
  else if (hasBrandMatch) confidence = 'med'
  else confidence = 'low'

  console.log(
    `[resolve-domain] "${name}" → ${winner.domain} (score=${winner.score}, margin=${margin}, conf=${confidence})`,
  )

  if (confidence === 'low') {
    throw new DomainResolutionError(
      'ambiguous',
      `Could not confidently resolve "${name}" to a single domain (winner score ${winner.score}, margin ${margin})`,
      candidates.slice(0, 3).map((c) => ({ domain: c.domain, title: c.title, snippet: c.snippet })),
    )
  }

  return {
    domain: winner.domain,
    confidence,
    source: 'firecrawl',
    evidence: {
      query,
      candidates: candidates.slice(0, 5),
      winner_score: winner.score,
      runner_up_score: runnerUpScore,
      margin,
    },
  }
}
