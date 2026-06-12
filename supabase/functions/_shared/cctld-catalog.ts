// ccTLD catalog used by the brute-force domain probe scout.
//
// Each entry lists the ccTLD variants a global brand might use for a given
// market. The scout HEAD-pings every variant in parallel; any 200/301/302 with
// the brand name in the title becomes a verified candidate.
//
// Pattern coverage rationale:
//   - {brand}.{cctld}            → crocs.in, crocs.fr, crocs.de
//   - {brand}.co.{cctld}         → crocs.co.uk, crocs.co.jp, crocs.co.in
//   - {brand}.com.{cctld}        → crocs.com.au, crocs.com.br, crocs.com.mx
//
// Plus three generic non-ccTLD patterns per market for franchises operating
// under {brand}{country}.com — common in IN, BR, AE.
//
// This is the FIRST line of defense against the "Wikipedia missed market X"
// failure mode (see Crocs/India case 2026-05-13).

export interface MarketCcTld {
  /** ISO 3166-1 alpha-2 */
  market: string
  /** Human country name (English) */
  country: string
  /** ccTLD variants ordered from most-common to least-common */
  cctlds: string[]
}

/**
 * Top markets to probe by default. The list is intentionally broad — running
 * 40 HEAD pings in parallel costs ~$0 and takes <3s. Mirrors the markets
 * Yuno cares about commercially + the markets where franchise D2C is common.
 */
export const MARKET_CCTLDS: MarketCcTld[] = [
  // North America
  { market: 'US', country: 'United States', cctlds: ['us', 'com'] },
  { market: 'CA', country: 'Canada', cctlds: ['ca'] },
  { market: 'MX', country: 'Mexico', cctlds: ['mx', 'com.mx'] },
  // LATAM
  { market: 'BR', country: 'Brazil', cctlds: ['com.br', 'br'] },
  { market: 'AR', country: 'Argentina', cctlds: ['com.ar', 'ar'] },
  { market: 'CL', country: 'Chile', cctlds: ['cl', 'com.cl'] },
  { market: 'CO', country: 'Colombia', cctlds: ['com.co', 'co'] },
  { market: 'PE', country: 'Peru', cctlds: ['com.pe', 'pe'] },
  { market: 'UY', country: 'Uruguay', cctlds: ['com.uy', 'uy'] },
  { market: 'EC', country: 'Ecuador', cctlds: ['com.ec', 'ec'] },
  // Europe
  { market: 'GB', country: 'United Kingdom', cctlds: ['co.uk', 'uk'] },
  { market: 'DE', country: 'Germany', cctlds: ['de'] },
  { market: 'FR', country: 'France', cctlds: ['fr'] },
  { market: 'IT', country: 'Italy', cctlds: ['it'] },
  { market: 'ES', country: 'Spain', cctlds: ['es'] },
  { market: 'NL', country: 'Netherlands', cctlds: ['nl'] },
  { market: 'BE', country: 'Belgium', cctlds: ['be'] },
  { market: 'PT', country: 'Portugal', cctlds: ['pt'] },
  { market: 'PL', country: 'Poland', cctlds: ['pl'] },
  { market: 'SE', country: 'Sweden', cctlds: ['se'] },
  { market: 'NO', country: 'Norway', cctlds: ['no'] },
  { market: 'DK', country: 'Denmark', cctlds: ['dk'] },
  { market: 'FI', country: 'Finland', cctlds: ['fi'] },
  { market: 'CH', country: 'Switzerland', cctlds: ['ch'] },
  { market: 'AT', country: 'Austria', cctlds: ['at'] },
  { market: 'IE', country: 'Ireland', cctlds: ['ie'] },
  { market: 'GR', country: 'Greece', cctlds: ['gr'] },
  { market: 'CZ', country: 'Czech Republic', cctlds: ['cz'] },
  { market: 'RO', country: 'Romania', cctlds: ['ro'] },
  { market: 'TR', country: 'Turkey', cctlds: ['com.tr', 'tr'] },
  { market: 'RU', country: 'Russia', cctlds: ['ru'] },
  // MEA
  { market: 'AE', country: 'United Arab Emirates', cctlds: ['ae', 'com.ae'] },
  { market: 'SA', country: 'Saudi Arabia', cctlds: ['com.sa', 'sa'] },
  { market: 'IL', country: 'Israel', cctlds: ['co.il'] },
  { market: 'EG', country: 'Egypt', cctlds: ['com.eg', 'eg'] },
  { market: 'MA', country: 'Morocco', cctlds: ['ma'] },
  { market: 'ZA', country: 'South Africa', cctlds: ['co.za'] },
  // APAC
  { market: 'JP', country: 'Japan', cctlds: ['jp', 'co.jp'] },
  { market: 'KR', country: 'South Korea', cctlds: ['co.kr', 'kr'] },
  { market: 'CN', country: 'China', cctlds: ['cn', 'com.cn'] },
  { market: 'TW', country: 'Taiwan', cctlds: ['com.tw', 'tw'] },
  { market: 'HK', country: 'Hong Kong', cctlds: ['com.hk', 'hk'] },
  { market: 'SG', country: 'Singapore', cctlds: ['com.sg', 'sg'] },
  { market: 'IN', country: 'India', cctlds: ['in', 'co.in'] },
  { market: 'ID', country: 'Indonesia', cctlds: ['co.id', 'id'] },
  { market: 'TH', country: 'Thailand', cctlds: ['co.th', 'th'] },
  { market: 'VN', country: 'Vietnam', cctlds: ['vn', 'com.vn'] },
  { market: 'MY', country: 'Malaysia', cctlds: ['com.my', 'my'] },
  { market: 'PH', country: 'Philippines', cctlds: ['com.ph', 'ph'] },
  { market: 'AU', country: 'Australia', cctlds: ['com.au', 'au'] },
  { market: 'NZ', country: 'New Zealand', cctlds: ['co.nz', 'nz'] },
]

/**
 * Generate non-ccTLD branded-domain patterns for franchises that operate
 * under "{brand}{country}.com" or similar. Common in India, Brazil, UAE.
 * Returns lowercase candidate domains, no protocol.
 */
export function nonCcTldFranchisePatterns(brandStem: string, country: string): string[] {
  const c = country.toLowerCase().replace(/\s+/g, '')
  const cKebab = country.toLowerCase().replace(/\s+/g, '-')
  return [
    `${brandStem}${c}.com`,        // crocsindia.com
    `${brandStem}-${cKebab}.com`,   // crocs-india.com
    `${c}.${brandStem}.com`,        // india.crocs.com
    `${brandStem}.${c}`,            // crocs.india (rare, but happens with new TLDs)
  ]
}

/**
 * Build the full candidate domain list for a brand stem across all known markets.
 * Returns deduplicated lowercase domain strings paired with their target market.
 *
 * For a brand like "crocs" this produces ~150 candidates total (50 markets ×
 * ~3 patterns each). All are HEAD-pinged in parallel by the scout.
 */
export function buildCcTldProbeList(
  brandStem: string,
  options: { includeFranchisePatterns?: boolean } = {},
): Array<{ domain: string; market: string }> {
  const out: Array<{ domain: string; market: string }> = []
  const seen = new Set<string>()
  for (const m of MARKET_CCTLDS) {
    for (const tld of m.cctlds) {
      const d = `${brandStem}.${tld}`.toLowerCase()
      if (!seen.has(d)) {
        seen.add(d)
        out.push({ domain: d, market: m.market })
      }
    }
    if (options.includeFranchisePatterns) {
      for (const p of nonCcTldFranchisePatterns(brandStem, m.country)) {
        const d = p.toLowerCase()
        if (!seen.has(d)) {
          seen.add(d)
          out.push({ domain: d, market: m.market })
        }
      }
    }
  }
  return out
}
