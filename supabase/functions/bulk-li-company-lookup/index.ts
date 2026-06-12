// Bulk LinkedIn company name lookup via Unipile
// POST /functions/v1/bulk-li-company-lookup
// Body: { names: string[], concurrency?: number }
// Returns: { results: [{ input, title, id, found }] }
//
// Used to canonicalize a long prospect list with the actual LinkedIn names.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

interface LookupItem {
  object: string
  title: string
  id: string
  picture_url?: string
}

interface LookupResponse {
  object?: string
  items?: LookupItem[]
  paging?: { page_count: number }
}

interface ResultRow {
  input: string
  found: boolean
  title?: string
  id?: string
  alt_titles?: string[]
  error?: string
}

async function lookupOne(
  dsn: string,
  token: string,
  accountId: string,
  name: string,
): Promise<ResultRow> {
  const url = `https://${dsn}/api/v1/linkedin/search/parameters?account_id=${accountId}&type=COMPANY&keywords=${encodeURIComponent(name)}&limit=3`
  try {
    const r = await fetch(url, { headers: { 'X-API-KEY': token } })
    if (!r.ok) {
      const txt = await r.text()
      return { input: name, found: false, error: `HTTP ${r.status}: ${txt.slice(0, 120)}` }
    }
    const data = (await r.json()) as LookupResponse
    const items = data.items || []
    if (items.length === 0) {
      return { input: name, found: false }
    }
    const top = items[0]
    return {
      input: name,
      found: true,
      title: top.title,
      id: top.id,
      alt_titles: items.slice(1).map(i => i.title),
    }
  } catch (e) {
    return { input: name, found: false, error: String(e).slice(0, 120) }
  }
}

// Process an array with bounded concurrency
async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T, idx: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let i = 0
  const workers: Promise<void>[] = []
  for (let w = 0; w < concurrency; w++) {
    workers.push(
      (async () => {
        while (true) {
          const idx = i++
          if (idx >= items.length) return
          results[idx] = await fn(items[idx], idx)
        }
      })(),
    )
  }
  await Promise.all(workers)
  return results
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// Get LinkedIn company details with 429 retry+backoff and per-call jitter.
async function getCompanyDetails(
  dsn: string, token: string, accountId: string, identifier: string,
): Promise<Record<string, unknown>> {
  const url = `https://${dsn}/api/v1/linkedin/company/${encodeURIComponent(identifier)}?account_id=${accountId}`
  const maxRetries = 5
  let lastStatus = 0
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'X-API-KEY': token } })
      lastStatus = r.status
      if (r.status === 429) {
        // Backoff: 2s, 5s, 10s, 20s, 40s + jitter
        const wait = (Math.pow(2, attempt) * 1000 + 1000) + Math.floor(Math.random() * 500)
        await sleep(wait)
        continue
      }
      if (!r.ok) {
        return { id: identifier, ok: false, status: r.status }
      }
      const data = await r.json() as Record<string, unknown>
      const locations = (data.locations || []) as Array<Record<string, unknown>>
      const hq = locations.find(l => l.is_headquarter === true)
      const allCountries = Array.from(new Set(locations.map(l => l.country).filter(Boolean)))
      return {
        id: identifier,
        ok: true,
        name: data.name,
        public_identifier: data.public_identifier,
        profile_url: data.profile_url,
        followers_count: data.followers_count,
        hq_country: hq ? hq.country : null,
        hq_city: hq ? hq.city : null,
        all_countries: allCountries,
        first_country: locations[0]?.country || null,
      }
    } catch (e) {
      return { id: identifier, ok: false, error: String(e).slice(0, 100) }
    }
  }
  return { id: identifier, ok: false, status: lastStatus, error: 'rate limited after retries' }
}

serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const body = await req.json()
    const mode: string = body.mode || 'lookup' // 'lookup' or 'details' or 'probe'
    const names: string[] = body.names || []
    const concurrency: number = Math.min(Math.max(body.concurrency || 5, 1), 20)

    const dsn = Deno.env.get('UNIPILE_DSN')!
    const token = Deno.env.get('UNIPILE_ACCESS_TOKEN')!

    // Find a real LinkedIn account in Unipile
    const accResp = await fetch(`https://${dsn}/api/v1/accounts`, {
      headers: { 'X-API-KEY': token },
    })
    if (!accResp.ok) {
      return errorResponse(`Unipile accounts list failed: ${accResp.status}`, 500)
    }
    const accData = await accResp.json()
    const linkedinAccount = (accData.items || []).find(
      (a: Record<string, unknown>) => a.type === 'LINKEDIN',
    )
    if (!linkedinAccount) {
      return errorResponse('No LinkedIn account in Unipile', 500)
    }
    const accountId = linkedinAccount.id as string

    // PROBE mode: test what endpoints exist for company details
    if (mode === 'probe') {
      const id = body.id || '66719' // default = Agoda
      const slug = body.slug || 'agoda'
      const probes: Record<string, unknown> = {}
      const endpoints = [
        `/api/v1/linkedin/company/${encodeURIComponent(id)}?account_id=${accountId}`,
        `/api/v1/linkedin/company/${encodeURIComponent(slug)}?account_id=${accountId}`,
        `/api/v1/linkedin/companies/${encodeURIComponent(id)}?account_id=${accountId}`,
        `/api/v1/linkedin/companies/${encodeURIComponent(slug)}?account_id=${accountId}`,
        `/api/v1/companies/${encodeURIComponent(id)}?account_id=${accountId}`,
        `/api/v1/companies/${encodeURIComponent(slug)}?account_id=${accountId}`,
      ]
      for (const ep of endpoints) {
        try {
          const r = await fetch(`https://${dsn}${ep}`, { headers: { 'X-API-KEY': token } })
          const text = await r.text()
          probes[ep] = { status: r.status, body: text.slice(0, 500) }
        } catch (e) { probes[ep] = { error: String(e) } }
      }
      return jsonResponse({ probes })
    }

    // DETAILS mode: get HQ location for given identifiers
    if (mode === 'details') {
      const ids: string[] = body.ids || []
      if (!Array.isArray(ids) || ids.length === 0) {
        return errorResponse('Body must include non-empty `ids` array', 400)
      }
      const results = await mapWithConcurrency(
        ids,
        (id) => getCompanyDetails(dsn, token, accountId, id),
        concurrency,
      )
      return jsonResponse({ total: results.length, results })
    }

    // Default LOOKUP mode
    if (!Array.isArray(names) || names.length === 0) {
      return errorResponse('Body must include non-empty `names` array', 400)
    }

    const t0 = Date.now()
    const results = await mapWithConcurrency(
      names,
      (name) => lookupOne(dsn, token, accountId, name),
      concurrency,
    )
    const elapsed = Date.now() - t0

    const found = results.filter(r => r.found).length
    return jsonResponse({
      total: results.length,
      found,
      not_found: results.length - found,
      elapsed_ms: elapsed,
      results,
    })
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : 'Internal error', 500)
  }
})
