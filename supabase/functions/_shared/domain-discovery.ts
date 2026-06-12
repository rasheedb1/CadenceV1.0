// Types + helpers for the bulletproof domain discovery pipeline.

export type Confidence = 'high' | 'medium' | 'low'

export type ScoutSource =
  | 'crt-sh'
  | 'whois'
  | 'self-site'
  | 'wikipedia'
  | 'sec-edgar'
  | 'opencorporates'
  | 'search'
  | 'linkedin'
  | 'crunchbase'
  | 'cctld-probe'      // brute-force HEAD ping against brand + ccTLD variants
  | 'sw-spillover'     // domain inferred from primary's SimilarWeb top_countries
  | 'primary'
  | 'manual'

export interface DomainCandidate {
  domain: string
  market?: string            // ISO 3166-1 alpha-2 (e.g. "MX")
  confidence: Confidence
  sources: ScoutSource[]
  evidence?: string          // free text from scout
}

export interface VerifiedDomain extends DomainCandidate {
  similarweb_verified: boolean
  top_country?: string
  top_country_share?: number
  dns_ok?: boolean
  brand_in_title?: boolean
}

export interface CoverageGap {
  expected_market: string
  reason: string
}

export interface ExcludedCandidate {
  domain: string
  reason: string
  sources?: ScoutSource[]
}

export interface DiscoveryResult {
  primary_domain: string
  company_name: string
  discovered_domains: VerifiedDomain[]
  coverage_gaps: CoverageGap[]
  excluded_candidates: ExcludedCandidate[]
  expected_markets: string[]
  discovery_metadata: {
    scouts_run: string[]
    duration_ms: number
    cost_usd: number
    cost_credits: number
    cache_status: 'hit' | 'miss' | 'manual_override'
  }
}

/**
 * Merge candidates from multiple scouts, deduping by domain and combining sources.
 * Confidence is upgraded as more sources converge:
 *   1 source                 → keeps scout's confidence (cap at "medium")
 *   2+ sources               → "high"
 *   primary or manual source → always "high"
 */
export function mergeCandidates(...lists: DomainCandidate[][]): DomainCandidate[] {
  const byDomain = new Map<string, DomainCandidate>()
  for (const list of lists) {
    for (const cand of list) {
      const d = normalizeDomain(cand.domain)
      if (!d || !d.includes('.')) continue
      const existing = byDomain.get(d)
      if (!existing) {
        byDomain.set(d, { ...cand, domain: d })
      } else {
        const sources = Array.from(new Set([...existing.sources, ...cand.sources]))
        const market = existing.market || cand.market
        let confidence: Confidence = existing.confidence
        if (sources.length >= 2) confidence = 'high'
        if (sources.includes('primary') || sources.includes('manual')) confidence = 'high'
        byDomain.set(d, {
          domain: d,
          market,
          confidence,
          sources,
          evidence: [existing.evidence, cand.evidence].filter(Boolean).join(' | '),
        })
      }
    }
  }
  return Array.from(byDomain.values())
}

export function normalizeDomain(input: string): string {
  let d = (input || '').trim().toLowerCase()
  d = d.replace(/^https?:\/\//, '')
  d = d.replace(/^www\./, '')
  d = d.split('/')[0]
  d = d.split('?')[0]
  d = d.split('#')[0]
  d = d.replace(/\.$/, '') // trailing dot
  return d
}

/**
 * Extract a brand stem from a domain.
 *   "rappi.com"      → "rappi"
 *   "rappi.com.mx"   → "rappi"
 *   "open-english.com" → "open-english"
 *   "ll.bean.com"   → "ll" (best effort)
 */
export function brandStemFromDomain(domain: string): string {
  const apex = normalizeDomain(domain)
  return apex.split('.')[0] || ''
}

/** ISO 3166 alpha-2 ↔ name lookup (subset for LATAM + global). */
export const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  'united states': 'US', 'usa': 'US', 'u.s.': 'US',
  'mexico': 'MX', 'méxico': 'MX',
  'brazil': 'BR', 'brasil': 'BR',
  'argentina': 'AR',
  'chile': 'CL',
  'colombia': 'CO',
  'peru': 'PE', 'perú': 'PE',
  'uruguay': 'UY',
  'venezuela': 'VE',
  'dominican republic': 'DO', 'república dominicana': 'DO',
  'guatemala': 'GT',
  'ecuador': 'EC',
  'bolivia': 'BO',
  'panama': 'PA', 'panamá': 'PA',
  'costa rica': 'CR',
  'el salvador': 'SV',
  'nicaragua': 'NI',
  'honduras': 'HN',
  'paraguay': 'PY',
  'canada': 'CA',
  'united kingdom': 'GB', 'uk': 'GB',
  'germany': 'DE',
  'france': 'FR',
  'spain': 'ES', 'españa': 'ES',
  'italy': 'IT', 'italia': 'IT',
  'netherlands': 'NL',
  'portugal': 'PT',
  'poland': 'PL',
  'sweden': 'SE',
  'switzerland': 'CH',
  'belgium': 'BE',
  'china': 'CN',
  'japan': 'JP',
  'south korea': 'KR', 'korea': 'KR',
  'india': 'IN',
  'australia': 'AU',
  'south africa': 'ZA',
  'turkey': 'TR',
  'philippines': 'PH',
  'singapore': 'SG',
  'indonesia': 'ID',
  'thailand': 'TH',
  'vietnam': 'VN',
  'malaysia': 'MY',
}

/**
 * Strict ISO 3166-1 alpha-2 validation. LLMs love to invent codes like "GLOBAL",
 * "EU", "WORLD" — reject all of those. Only accept exactly 2 uppercase letters
 * matching a known country code.
 */
const VALID_ISO_CODES = new Set([
  'US','MX','BR','AR','CL','CO','PE','UY','VE','DO','GT','EC','BO','PA','CR','SV','NI','HN','PY',
  'CA','GB','DE','FR','ES','IT','NL','PT','PL','SE','CH','BE','IE','AT','DK','NO','FI','GR','CZ','RO',
  'CN','JP','KR','IN','AU','NZ','ZA','TR','PH','SG','ID','TH','VN','MY','HK','TW','AE','SA','IL','EG',
  'RU','UA','PK','BD','LK','MA','KE','NG',
])

export function sanitizeMarketCode(input: string | undefined | null): string | undefined {
  if (!input) return undefined
  const code = String(input).trim().toUpperCase()
  if (code.length !== 2) return undefined
  if (!VALID_ISO_CODES.has(code)) return undefined
  return code
}

/** ISO 3166 country NAME → alpha-2 code. */
export const COUNTRY_NAME_TO_CODE_FULL: Record<string, string> = {
  'united states': 'US', 'usa': 'US', 'u.s.': 'US', 'us': 'US',
  'mexico': 'MX', 'méxico': 'MX',
  'brazil': 'BR', 'brasil': 'BR',
  'argentina': 'AR',
  'chile': 'CL',
  'colombia': 'CO',
  'peru': 'PE', 'perú': 'PE',
  'uruguay': 'UY',
  'venezuela': 'VE',
  'dominican republic': 'DO', 'república dominicana': 'DO',
  'guatemala': 'GT',
  'ecuador': 'EC',
  'bolivia': 'BO',
  'panama': 'PA', 'panamá': 'PA',
  'costa rica': 'CR',
  'el salvador': 'SV',
  'nicaragua': 'NI',
  'honduras': 'HN',
  'paraguay': 'PY',
  'canada': 'CA',
  'united kingdom': 'GB', 'uk': 'GB', 'britain': 'GB',
  'germany': 'DE', 'alemania': 'DE',
  'france': 'FR', 'francia': 'FR',
  'spain': 'ES', 'españa': 'ES',
  'italy': 'IT', 'italia': 'IT',
  'netherlands': 'NL', 'holland': 'NL',
  'portugal': 'PT',
  'poland': 'PL',
  'sweden': 'SE',
  'switzerland': 'CH',
  'belgium': 'BE',
  'ireland': 'IE',
  'austria': 'AT',
  'china': 'CN',
  'japan': 'JP',
  'south korea': 'KR', 'korea': 'KR',
  'india': 'IN',
  'australia': 'AU',
  'new zealand': 'NZ',
  'south africa': 'ZA',
  'turkey': 'TR',
  'philippines': 'PH',
  'singapore': 'SG',
  'indonesia': 'ID',
  'thailand': 'TH',
  'vietnam': 'VN',
  'malaysia': 'MY',
  'hong kong': 'HK',
  'taiwan': 'TW',
}

export function countryNameToCode(name: string | undefined | null): string | undefined {
  if (!name) return undefined
  return COUNTRY_NAME_TO_CODE_FULL[String(name).toLowerCase().trim()] || undefined
}

export function inferCountryFromCcTld(domain: string): string | null {
  const tld = domain.split('.').pop() || ''
  const map: Record<string, string> = {
    'mx': 'MX', 'br': 'BR', 'ar': 'AR', 'cl': 'CL', 'co': 'CO',
    'pe': 'PE', 'uy': 'UY', 've': 'VE', 'do': 'DO', 'gt': 'GT',
    'ec': 'EC', 'bo': 'BO', 'pa': 'PA', 'cr': 'CR', 'py': 'PY',
    'sv': 'SV', 'ni': 'NI', 'hn': 'HN',
    'ca': 'CA', 'uk': 'GB', 'de': 'DE', 'fr': 'FR', 'es': 'ES',
    'it': 'IT', 'nl': 'NL', 'pt': 'PT', 'pl': 'PL', 'se': 'SE',
    'ch': 'CH', 'be': 'BE', 'cn': 'CN', 'jp': 'JP', 'kr': 'KR',
    'in': 'IN', 'au': 'AU', 'za': 'ZA', 'tr': 'TR', 'ph': 'PH',
    'sg': 'SG', 'id': 'ID', 'th': 'TH', 'vn': 'VN', 'my': 'MY',
  }
  // For 3-part TLDs like "com.mx", look at the 2nd-to-last
  const parts = domain.split('.')
  if (parts.length >= 3) {
    const candidate = parts[parts.length - 1]
    if (map[candidate]) return map[candidate]
  }
  return map[tld] || null
}

/** Cheap DNS resolution check via Deno's built-in resolver. */
export async function dnsResolves(domain: string): Promise<boolean> {
  try {
    const result = await Deno.resolveDns(domain, 'A')
    return Array.isArray(result) && result.length > 0
  } catch {
    // Try AAAA (IPv6) before declaring dead
    try {
      const v6 = await Deno.resolveDns(domain, 'AAAA')
      return Array.isArray(v6) && v6.length > 0
    } catch {
      return false
    }
  }
}

/** Fetch HTML title from a URL. Used to check if page contains brand keyword. */
export async function fetchPageTitle(domain: string): Promise<string | null> {
  try {
    const r = await fetch(`https://${domain}/`, {
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LaikyBot/1.0)' },
    })
    if (!r.ok) return null
    const html = await r.text()
    const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    return m ? m[1].trim() : null
  } catch {
    return null
  }
}

/** Build the prompt-injection-safe brand keyword set for title matching. */
export function brandKeywords(companyName: string, primaryDomain: string): string[] {
  const stem = brandStemFromDomain(primaryDomain)
  const words = companyName.toLowerCase().split(/[\s,.-]+/).filter(w => w.length >= 3)
  return Array.from(new Set([stem.toLowerCase(), ...words])).filter(Boolean)
}
