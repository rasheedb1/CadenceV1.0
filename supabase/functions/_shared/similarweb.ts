// SimilarWeb typed client + normalization helpers.
// Two endpoints:
//   1. /v1/website/{d}/total-traffic-and-engagement/visits  — monthly visit series
//   2. /v4/website/{d}/geo/total-traffic-by-country         — top countries by share
//
// SimilarWeb has ~10-day data lag. Date window: [today - 4mo, today - 2mo].
// API key in env: SIMILARWEB_API_KEY. Auth is query-param (?api_key=...).

const BASE = 'https://api.similarweb.com'

export interface SimilarWebVisitsResponse {
  meta: {
    last_updated: string
    status: string
    request: Record<string, unknown>
    device?: string
  }
  visits: Array<{ date: string; visits: number }>
}

export interface SimilarWebGeoRecord {
  country: number         // ISO 3166-1 numeric
  country_name: string
  share: number           // 0..1
  visits: number
  pages_per_visit: number
  average_time: number    // seconds
  bounce_rate: number     // 0..1
  rank: number
}

export interface SimilarWebGeoResponse {
  meta: {
    last_updated: string
    status: string
    request: Record<string, unknown>
    query: Record<string, unknown>
  }
  records: SimilarWebGeoRecord[]
}

export interface NormalizedTrafficPayload {
  domain: string
  fetched_at: string
  expires_at: string
  monthly_visits: {
    avg: number
    latest: number
    series: Array<{ month: string; visits: number }>
    window: { start: string; end: string }
    last_updated: string
  }
  top_countries: Array<{
    code_numeric: number
    name: string
    share: number
    visits: number
    rank_in_country: number
  }>
  engagement: {
    avg_visit_duration_sec: number | null
    pages_per_visit: number | null
    bounce_rate: number | null
  }
  source: 'similarweb_v1+v4'
  cache_status: 'hit' | 'miss' | 'silent_refresh'
}

const TTL_DAYS = 30

/** Compute SimilarWeb's safe data window relative to `now`. */
export function computeWindow(now: Date = new Date()): { start: string; end: string } {
  const fmt = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1))
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 4, 1))
  return { start: fmt(start), end: fmt(end) }
}

/** Strip protocol, www, path, trailing slash. */
export function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase()
  d = d.replace(/^https?:\/\//, '')
  d = d.replace(/^www\./, '')
  d = d.split('/')[0]
  d = d.split('?')[0]
  return d
}

async function fetchWithRetry(url: string, maxRetries = 2): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) })
      // 429 (rate limit) or 5xx → retry with backoff
      if ((r.status === 429 || r.status >= 500) && attempt < maxRetries) {
        const delay = 500 * Math.pow(2, attempt)
        console.log(`[similarweb] ${r.status}, retry in ${delay}ms (attempt ${attempt + 1})`)
        await new Promise(res => setTimeout(res, delay))
        continue
      }
      return r
    } catch (err) {
      if (attempt < maxRetries) {
        const delay = 500 * Math.pow(2, attempt)
        console.log(`[similarweb] fetch error ${(err as Error).message}, retry in ${delay}ms`)
        await new Promise(res => setTimeout(res, delay))
        continue
      }
      throw err
    }
  }
  throw new Error('Unreachable')
}

async function fetchVisits(domain: string, window: { start: string; end: string }, apiKey: string): Promise<SimilarWebVisitsResponse> {
  const url = `${BASE}/v1/website/${encodeURIComponent(domain)}/total-traffic-and-engagement/visits?api_key=${apiKey}&country=world&granularity=monthly&start_date=${window.start}&end_date=${window.end}&main_domain_only=false&format=json`
  const r = await fetchWithRetry(url)
  if (!r.ok) {
    const body = await r.text()
    throw new Error(`SimilarWeb visits HTTP ${r.status}: ${body.slice(0, 300)}`)
  }
  return await r.json()
}

async function fetchGeo(domain: string, window: { start: string; end: string }, apiKey: string): Promise<SimilarWebGeoResponse> {
  const url = `${BASE}/v4/website/${encodeURIComponent(domain)}/geo/total-traffic-by-country?api_key=${apiKey}&start_date=${window.start}&end_date=${window.end}&main_domain_only=false&format=json&limit=10&sort=share&asc=false`
  const r = await fetchWithRetry(url)
  if (!r.ok) {
    const body = await r.text()
    throw new Error(`SimilarWeb geo HTTP ${r.status}: ${body.slice(0, 300)}`)
  }
  return await r.json()
}

/** Fetch both endpoints in parallel and return normalized payload. */
export async function fetchSimilarWebTraffic(rawDomain: string): Promise<{
  normalized: Omit<NormalizedTrafficPayload, 'cache_status'>
  raw_visits: SimilarWebVisitsResponse
  raw_geo: SimilarWebGeoResponse
}> {
  const apiKey = Deno.env.get('SIMILARWEB_API_KEY')
  if (!apiKey) throw new Error('SIMILARWEB_API_KEY not set in environment')

  const domain = normalizeDomain(rawDomain)
  if (!domain || !domain.includes('.')) {
    throw new Error(`Invalid domain: "${rawDomain}"`)
  }

  const window = computeWindow()
  // allSettled so partial data (e.g. visits OK but geo failed) is still usable
  const [visitsSettled, geoSettled] = await Promise.allSettled([
    fetchVisits(domain, window, apiKey),
    fetchGeo(domain, window, apiKey),
  ])

  if (visitsSettled.status === 'rejected' && geoSettled.status === 'rejected') {
    throw new Error(`Both endpoints failed: ${(visitsSettled.reason as Error)?.message || ''} | ${(geoSettled.reason as Error)?.message || ''}`)
  }

  const visitsRes = visitsSettled.status === 'fulfilled' ? visitsSettled.value : { meta: { last_updated: '', status: 'partial', request: {} }, visits: [] } as SimilarWebVisitsResponse
  const geoRes = geoSettled.status === 'fulfilled' ? geoSettled.value : { meta: { last_updated: '', status: 'partial', request: {}, query: {} }, records: [] } as SimilarWebGeoResponse

  // Average across the window; latest = most recent month.
  const visits = visitsRes.visits || []
  const avg = visits.length
    ? Math.round(visits.reduce((s, v) => s + (v.visits || 0), 0) / visits.length)
    : 0
  const latest = visits.length
    ? Math.round(visits[visits.length - 1].visits || 0)
    : 0
  const series = visits.map(v => ({
    month: v.date.slice(0, 7),
    visits: Math.round(v.visits || 0),
  }))

  const top_countries = (geoRes.records || []).map(r => ({
    code_numeric: r.country,
    name: r.country_name,
    share: r.share,
    visits: Math.round(r.visits || 0),
    rank_in_country: r.rank,
  }))

  // Engagement: average across the top country records (geo endpoint is the
  // only one that returns these — visits endpoint doesn't break them out).
  const records = geoRes.records || []
  const eng = records.length ? {
    avg_visit_duration_sec: Math.round(records.reduce((s, r) => s + (r.average_time || 0), 0) / records.length),
    pages_per_visit: +(records.reduce((s, r) => s + (r.pages_per_visit || 0), 0) / records.length).toFixed(2),
    bounce_rate: +(records.reduce((s, r) => s + (r.bounce_rate || 0), 0) / records.length).toFixed(3),
  } : { avg_visit_duration_sec: null, pages_per_visit: null, bounce_rate: null }

  const now = new Date()
  const fetched_at = now.toISOString()
  const expires_at = new Date(now.getTime() + TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()

  return {
    normalized: {
      domain,
      fetched_at,
      expires_at,
      monthly_visits: {
        avg,
        latest,
        series,
        window,
        last_updated: visitsRes.meta?.last_updated || '',
      },
      top_countries,
      engagement: eng,
      source: 'similarweb_v1+v4',
    },
    raw_visits: visitsRes,
    raw_geo: geoRes,
  }
}

/**
 * Aggregate traffic across multiple domains using the user-specified formula:
 *   total_visits = SUM(domain_visits[d])
 *   country_visits[c] = SUM(domain_visits[d] × domain_share[d][c])
 *   final_share[c] = country_visits[c] / total_visits
 *
 * Returns a normalized payload that looks just like single-domain output but
 * with `domain_group` listing all sources.
 */
export function aggregateTrafficAcrossDomains(
  primaryDomain: string,
  perDomainResults: Array<{ domain: string; payload: Omit<NormalizedTrafficPayload, 'cache_status'> }>,
): Omit<NormalizedTrafficPayload, 'cache_status'> & { domain_group: string[] } {
  if (perDomainResults.length === 0) {
    throw new Error('Cannot aggregate empty domain list')
  }

  const totalVisitsAvg = perDomainResults.reduce((s, r) => s + (r.payload.monthly_visits.avg || 0), 0)
  const totalVisitsLatest = perDomainResults.reduce((s, r) => s + (r.payload.monthly_visits.latest || 0), 0)

  // Aggregate country visits across all domains. Each country's absolute visits
  // is domain_visits[d] * share[d][c]. We sum these across all domains, then
  // recompute share against the new total.
  const countryVisits = new Map<string, { name: string; visits: number; code_numeric?: number }>()
  for (const { payload } of perDomainResults) {
    const domainVisits = payload.monthly_visits.avg
    for (const c of payload.top_countries || []) {
      const key = c.name
      const visitsForThisCountry = domainVisits * c.share
      const existing = countryVisits.get(key)
      if (existing) {
        existing.visits += visitsForThisCountry
      } else {
        countryVisits.set(key, { name: c.name, visits: visitsForThisCountry, code_numeric: c.code_numeric })
      }
    }
  }

  const aggregatedCountries = Array.from(countryVisits.values())
    .map(c => ({
      code_numeric: c.code_numeric || 0,
      name: c.name,
      share: totalVisitsAvg > 0 ? c.visits / totalVisitsAvg : 0,
      visits: Math.round(c.visits),
      rank_in_country: 0,
    }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 15)

  // Engagement: weighted average across domains (weighted by visits)
  const totalWeight = perDomainResults.reduce((s, r) => s + (r.payload.monthly_visits.avg || 0), 0)
  let bounceSum = 0, ppvSum = 0, durSum = 0, validCount = 0
  for (const { payload } of perDomainResults) {
    const e = payload.engagement
    const w = payload.monthly_visits.avg || 0
    if (e.bounce_rate !== null && w > 0) {
      bounceSum += e.bounce_rate * w
      ppvSum += (e.pages_per_visit || 0) * w
      durSum += (e.avg_visit_duration_sec || 0) * w
      validCount++
    }
  }
  const engagement = validCount && totalWeight ? {
    bounce_rate: +(bounceSum / totalWeight).toFixed(3),
    pages_per_visit: +(ppvSum / totalWeight).toFixed(2),
    avg_visit_duration_sec: Math.round(durSum / totalWeight),
  } : { bounce_rate: null, pages_per_visit: null, avg_visit_duration_sec: null }

  // Build the time series by summing per-month visits across domains
  const seriesByMonth = new Map<string, number>()
  for (const { payload } of perDomainResults) {
    for (const point of payload.monthly_visits.series) {
      seriesByMonth.set(point.month, (seriesByMonth.get(point.month) || 0) + point.visits)
    }
  }
  const series = Array.from(seriesByMonth.entries())
    .map(([month, visits]) => ({ month, visits }))
    .sort((a, b) => a.month.localeCompare(b.month))

  const lastUpdatedDates = perDomainResults
    .map(r => r.payload.monthly_visits.last_updated)
    .filter(Boolean)
    .sort()
  const lastUpdated = lastUpdatedDates[lastUpdatedDates.length - 1] || ''

  const firstPayload = perDomainResults[0].payload
  return {
    domain: primaryDomain,
    fetched_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    monthly_visits: {
      avg: Math.round(totalVisitsAvg),
      latest: Math.round(totalVisitsLatest),
      series,
      window: firstPayload.monthly_visits.window,
      last_updated: lastUpdated,
    },
    top_countries: aggregatedCountries,
    engagement,
    source: 'similarweb_v1+v4',
    domain_group: perDomainResults.map(r => r.domain),
  }
}

/** Human-readable summary for prompt injection. */
export function summarizeForPrompt(p: Omit<NormalizedTrafficPayload, 'cache_status'>): string {
  const avgM = (p.monthly_visits.avg / 1_000_000).toFixed(2)
  const latestM = (p.monthly_visits.latest / 1_000_000).toFixed(2)
  const top = p.top_countries.slice(0, 8)
    .map(c => `${c.name} ${(c.share * 100).toFixed(1)}%`)
    .join(', ')
  const eng = p.engagement
  const engStr = eng.bounce_rate !== null
    ? `bounce ${(eng.bounce_rate * 100).toFixed(0)}%, ${eng.pages_per_visit} pages/visit, ${eng.avg_visit_duration_sec}s avg`
    : 'n/a'
  return [
    `Domain: ${p.domain}`,
    `Monthly web visits (avg ${p.monthly_visits.window.start}..${p.monthly_visits.window.end}): ${avgM}M (latest ${latestM}M)`,
    `Top countries by traffic share: ${top}`,
    `Engagement (web): ${engStr}`,
    `Source: SimilarWeb authoritative (data last updated ${p.monthly_visits.last_updated}).`,
  ].join('\n')
}
