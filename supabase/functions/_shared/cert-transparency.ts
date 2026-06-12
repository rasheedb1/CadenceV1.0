// crt.sh Certificate Transparency client.
// FREE, no auth required. Returns SSL certs issued for a domain pattern.
// Each cert has a `name_value` field listing all SANs (Subject Alternative Names),
// which often reveal multiple domains owned by the same company.

const CRT_SH_BASE = 'https://crt.sh'

export interface CrtShCert {
  issuer_ca_id?: number
  issuer_name?: string
  common_name?: string
  name_value?: string   // newline-separated list of all SANs
  id?: number
  entry_timestamp?: string
  not_before?: string
  not_after?: string
  serial_number?: string
}

/**
 * Query crt.sh with a wildcard pattern. The %25 is the URL-encoded % which
 * crt.sh treats as SQL LIKE wildcard.
 *
 * For "rappi.com" pattern, returns ALL certs ever issued for *.rappi.com
 * (including the bare apex + every subdomain).
 */
export async function fetchCertsByDomain(domain: string, opts?: { excludeExpired?: boolean }): Promise<CrtShCert[]> {
  const exclude = opts?.excludeExpired ? '&exclude=expired' : ''
  const url = `${CRT_SH_BASE}/?q=%25.${encodeURIComponent(domain)}&output=json${exclude}`
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LaikyBot/1.0)' },
    })
    if (!r.ok) {
      console.warn(`[crt.sh] HTTP ${r.status} for ${domain}`)
      return []
    }
    const text = await r.text()
    // crt.sh sometimes returns HTML error pages
    if (!text.trim().startsWith('[')) {
      console.warn(`[crt.sh] non-JSON response for ${domain}: ${text.slice(0, 100)}`)
      return []
    }
    return JSON.parse(text) as CrtShCert[]
  } catch (err) {
    console.warn(`[crt.sh] fetch failed for ${domain}: ${(err as Error).message}`)
    return []
  }
}

/**
 * Query crt.sh by organization name (from WHOIS). Returns certs where the
 * organization field matches. Powerful for finding domains under a parent
 * company that don't share a domain stem.
 */
export async function fetchCertsByOrg(orgName: string): Promise<CrtShCert[]> {
  const url = `${CRT_SH_BASE}/?O=${encodeURIComponent(orgName)}&output=json&exclude=expired`
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LaikyBot/1.0)' },
    })
    if (!r.ok) return []
    const text = await r.text()
    if (!text.trim().startsWith('[')) return []
    return JSON.parse(text) as CrtShCert[]
  } catch {
    return []
  }
}

/**
 * Extract unique apex domains from a list of certs.
 *
 * Strips:
 * - leading "*." wildcards
 * - subdomain components (keeps only the apex: foo.bar.com → bar.com)
 *
 * NB: this is heuristic. For 3-part TLDs like `co.uk`, `com.mx`, we keep
 * the last 3 components. Otherwise last 2.
 */
const THREE_PART_TLDS = new Set([
  'co.uk', 'co.jp', 'co.kr', 'co.nz', 'co.za', 'co.in',
  'com.br', 'com.mx', 'com.co', 'com.ar', 'com.pe', 'com.cl',
  'com.au', 'com.tr', 'com.ph', 'com.sg', 'com.tw', 'com.hk',
  'com.uy', 'com.ve', 'com.do', 'com.gt', 'com.ec', 'com.bo',
  'com.pa', 'com.cr', 'com.sv', 'com.ni', 'com.hn',
])

export function extractApexDomain(host: string): string {
  let h = host.toLowerCase().trim().replace(/^\*\./, '').replace(/^www\./, '')
  if (!h || !h.includes('.')) return ''
  const parts = h.split('.')
  if (parts.length <= 2) return h
  const lastTwo = parts.slice(-2).join('.')
  const lastThree = parts.slice(-3).join('.')
  // Check if last two parts are a known 3-part TLD root
  if (THREE_PART_TLDS.has(lastTwo)) {
    return lastThree
  }
  return lastTwo
}

/** Aggregate certs → unique apex domains. */
export function uniqueApexDomainsFromCerts(certs: CrtShCert[]): string[] {
  const apexes = new Set<string>()
  for (const cert of certs) {
    const sans = (cert.name_value || '').split('\n')
    for (const san of sans) {
      const apex = extractApexDomain(san)
      if (apex && apex.includes('.')) apexes.add(apex)
    }
    if (cert.common_name) {
      const apex = extractApexDomain(cert.common_name)
      if (apex && apex.includes('.')) apexes.add(apex)
    }
  }
  return Array.from(apexes).sort()
}
