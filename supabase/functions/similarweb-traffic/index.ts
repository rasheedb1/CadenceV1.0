// similarweb-traffic
// =============================================================================
// Wrapper around SimilarWeb visits + geo endpoints with 30-day cross-org cache.
//
// POST { domain: string, refresh?: boolean }
//
// Behavior:
//   1. Normalize domain (strip protocol/www/path)
//   2. Cache hit (and !refresh, and !expired) → return cached payload
//   3. Else fetch both endpoints in parallel, normalize, upsert cache
//   4. Silent auto-refresh when cached age > 25 days (returns cached value
//      immediately, kicks off refresh in background — keeps response fast).
//
// Caller auth: accepts a Supabase JWT (any authenticated user) OR the
// service-role key (cron / other edge functions). No org gating — traffic
// data is public.
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'
import {
  fetchSimilarWebTraffic,
  normalizeDomain,
  aggregateTrafficAcrossDomains,
  type NormalizedTrafficPayload,
} from '../_shared/similarweb.ts'

const SILENT_REFRESH_AT_DAYS = 25
const DAY_MS = 24 * 60 * 60 * 1000

interface Req {
  domain: string
  refresh?: boolean
  aggregate?: boolean         // if true, discover company's domain group + aggregate traffic across all
  domain_group?: string[]     // optional explicit list (skips discovery if provided)
}

interface CacheRow {
  domain: string
  monthly_visits: NormalizedTrafficPayload['monthly_visits']
  top_countries: NormalizedTrafficPayload['top_countries']
  engagement: NormalizedTrafficPayload['engagement']
  fetched_at: string
  expires_at: string
  error: string | null
}

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    // Auth: require *some* bearer token (user JWT or service role). We don't
    // verify the user identity beyond presence — cache is public-data.
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return errorResponse('Missing bearer token', 401)
    }

    const body = (await req.json()) as Req
    if (!body?.domain || typeof body.domain !== 'string') {
      return errorResponse('Missing or invalid "domain"', 400)
    }

    const domain = normalizeDomain(body.domain)
    if (!domain || !domain.includes('.')) {
      return errorResponse(`Invalid domain: "${body.domain}"`, 400)
    }

    const supabase = createSupabaseClient()
    const now = Date.now()

    // ── Aggregation mode (multi-domain) ──
    if (body.aggregate) {
      return await handleAggregate(supabase, domain, body.domain_group, body.refresh, authHeader)
    }

    // ── Cache lookup ──
    const { data: cached } = await supabase
      .from('similarweb_cache')
      .select('*')
      .eq('domain', domain)
      .maybeSingle<CacheRow>()

    const cacheUnexpired = cached && new Date(cached.expires_at).getTime() > now

    // Error cooldown: if previous fetch failed and we're still within the
    // cooldown window, return the cached error instead of hammering SimilarWeb.
    if (cacheUnexpired && cached!.error && !body.refresh) {
      return jsonResponse({
        success: false,
        cached_error: true,
        domain,
        error: cached!.error,
        cooldown_until: cached!.expires_at,
      }, 502)
    }

    const cacheValid = cacheUnexpired && !cached!.error

    if (cacheValid && !body.refresh) {
      const ageMs = now - new Date(cached!.fetched_at).getTime()
      const ageDays = ageMs / DAY_MS

      const payload = buildPayload(cached!, 'hit')

      // Silent background refresh if approaching expiry. Don't await — return
      // cached immediately, fire-and-forget refresh. Errors logged, not raised.
      if (ageDays > SILENT_REFRESH_AT_DAYS) {
        payload.cache_status = 'silent_refresh'
        refreshInBackground(domain).catch(err =>
          console.error(`[similarweb-traffic] silent refresh failed for ${domain}:`, err)
        )
      }

      return jsonResponse({ success: true, ...payload })
    }

    // ── Cache miss or forced refresh: fetch fresh ──
    const startMs = Date.now()
    let normalized
    let raw_visits
    let raw_geo
    try {
      const result = await fetchSimilarWebTraffic(domain)
      normalized = result.normalized
      raw_visits = result.raw_visits
      raw_geo = result.raw_geo
    } catch (fetchErr) {
      const errMsg = (fetchErr as Error).message

      // If we have stale cached data, return it with a warning rather than 502.
      if (cached && !cached.error) {
        console.warn(`[similarweb-traffic] fresh fetch failed for ${domain}, serving stale: ${errMsg}`)
        const stale = buildPayload(cached, 'hit')
        return jsonResponse({
          success: true,
          stale: true,
          stale_reason: errMsg,
          ...stale,
        })
      }

      // No cache fallback. Record the error so we don't hammer SimilarWeb on
      // every retry for the same broken domain.
      await supabase.from('similarweb_cache').upsert({
        domain,
        monthly_visits: {},
        top_countries: [],
        engagement: null,
        fetched_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1h cooldown
        error: errMsg,
      })
      return errorResponse(`SimilarWeb fetch failed: ${errMsg}`, 502)
    }

    // Persist
    const { error: upsertErr } = await supabase
      .from('similarweb_cache')
      .upsert({
        domain,
        monthly_visits: normalized.monthly_visits,
        top_countries: normalized.top_countries,
        engagement: normalized.engagement,
        fetched_at: normalized.fetched_at,
        expires_at: normalized.expires_at,
        raw_visits,
        raw_geo,
        error: null,
      })

    if (upsertErr) {
      console.error('[similarweb-traffic] cache upsert error:', upsertErr)
      // Don't fail the request — we have the data, just couldn't cache it.
    }

    return jsonResponse({
      success: true,
      ...normalized,
      cache_status: 'miss' as const,
      duration_ms: Date.now() - startMs,
    })
  } catch (err) {
    return errorResponse(`Internal error: ${(err as Error).message}`, 500)
  }
})

function buildPayload(row: CacheRow, cache_status: 'hit' | 'silent_refresh'): NormalizedTrafficPayload {
  return {
    domain: row.domain,
    fetched_at: row.fetched_at,
    expires_at: row.expires_at,
    monthly_visits: row.monthly_visits,
    top_countries: row.top_countries,
    engagement: row.engagement,
    source: 'similarweb_v1+v4',
    cache_status,
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Aggregation mode — fetch + merge traffic across all verified domains
// ═════════════════════════════════════════════════════════════════════════════

async function handleAggregate(
  supabase: ReturnType<typeof createSupabaseClient>,
  primaryDomain: string,
  explicitGroup: string[] | undefined,
  refresh: boolean | undefined,
  authHeader: string,
): Promise<Response> {
  const startMs = Date.now()
  let domainGroup: string[] = []

  if (explicitGroup && explicitGroup.length > 0) {
    domainGroup = explicitGroup.map(d => normalizeDomain(d))
  } else {
    // Look up discovered domain group from company_domain_groups (or trigger discovery)
    const { data: cached } = await supabase
      .from('company_domain_groups')
      .select('discovered_domains, expires_at')
      .eq('primary_domain', primaryDomain)
      .maybeSingle()

    const cacheValid = cached && new Date(cached.expires_at).getTime() > Date.now()
    if (cacheValid && !refresh) {
      domainGroup = ((cached.discovered_domains as Array<{ domain: string }>) || []).map(d => d.domain)
    } else {
      // Discovery cache miss — invoke discover-company-domains synchronously
      const supaUrl = Deno.env.get('SUPABASE_URL')!
      const r = await fetch(`${supaUrl}/functions/v1/discover-company-domains`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ primary_domain: primaryDomain, refresh }),
      })
      if (r.ok) {
        const result = await r.json() as { discovered_domains?: Array<{ domain: string }> }
        domainGroup = (result.discovered_domains || []).map(d => d.domain)
      }
    }
  }

  if (domainGroup.length === 0) {
    return errorResponse(`No verified domains found for ${primaryDomain}`, 404)
  }

  console.log(`[similarweb-traffic] aggregating across ${domainGroup.length} domains for ${primaryDomain}`)

  // Fetch traffic for each domain. SimilarWeb rate-limits aggressively when
  // hammered in parallel, so batch with concurrency 3 to be safe.
  const perDomainResults: Array<{ domain: string; payload: Omit<NormalizedTrafficPayload, 'cache_status'> }> = []
  const failures: Array<{ domain: string; reason: string }> = []
  const CONCURRENCY = 3

  const fetchOne = async (d: string) => {
    try {
      // Check single-domain cache first
      const { data: cached } = await supabase
        .from('similarweb_cache')
        .select('*')
        .eq('domain', d)
        .maybeSingle<{ domain: string; monthly_visits: NormalizedTrafficPayload['monthly_visits']; top_countries: NormalizedTrafficPayload['top_countries']; engagement: NormalizedTrafficPayload['engagement']; fetched_at: string; expires_at: string; error: string | null }>()

      if (cached && !cached.error && new Date(cached.expires_at).getTime() > Date.now() && !refresh) {
        perDomainResults.push({
          domain: d,
          payload: {
            domain: cached.domain,
            fetched_at: cached.fetched_at,
            expires_at: cached.expires_at,
            monthly_visits: cached.monthly_visits,
            top_countries: cached.top_countries,
            engagement: cached.engagement,
            source: 'similarweb_v1+v4',
          },
        })
        return
      }

      // Fetch fresh
      const { normalized, raw_visits, raw_geo } = await fetchSimilarWebTraffic(d)
      await supabase.from('similarweb_cache').upsert({
        domain: d,
        monthly_visits: normalized.monthly_visits,
        top_countries: normalized.top_countries,
        engagement: normalized.engagement,
        fetched_at: normalized.fetched_at,
        expires_at: normalized.expires_at,
        raw_visits,
        raw_geo,
        error: null,
      })
      perDomainResults.push({ domain: d, payload: normalized })
    } catch (err) {
      const msg = (err as Error).message
      console.warn(`[similarweb-traffic] fetch failed for ${d}: ${msg}`)
      failures.push({ domain: d, reason: msg })
    }
  }

  // Process in concurrency-limited batches
  for (let i = 0; i < domainGroup.length; i += CONCURRENCY) {
    const batch = domainGroup.slice(i, i + CONCURRENCY)
    await Promise.all(batch.map(fetchOne))
  }
  console.log(`[similarweb-traffic] aggregated ${perDomainResults.length}/${domainGroup.length} domains successfully (${failures.length} failed)`)

  if (perDomainResults.length === 0) {
    return errorResponse(`No SimilarWeb data for any domain in group of ${primaryDomain}`, 502)
  }

  const aggregated = aggregateTrafficAcrossDomains(primaryDomain, perDomainResults)

  return jsonResponse({
    success: true,
    aggregated: true,
    cache_status: 'miss',
    duration_ms: Date.now() - startMs,
    domains_aggregated: perDomainResults.length,
    domains_requested: domainGroup.length,
    failed_domains: failures,
    ...aggregated,
  })
}

async function refreshInBackground(domain: string): Promise<void> {
  const supabase = createSupabaseClient()
  const { normalized, raw_visits, raw_geo } = await fetchSimilarWebTraffic(domain)
  await supabase.from('similarweb_cache').upsert({
    domain,
    monthly_visits: normalized.monthly_visits,
    top_countries: normalized.top_countries,
    engagement: normalized.engagement,
    fetched_at: normalized.fetched_at,
    expires_at: normalized.expires_at,
    raw_visits,
    raw_geo,
    error: null,
  })
  console.log(`[similarweb-traffic] silent refresh complete for ${domain}`)
}
