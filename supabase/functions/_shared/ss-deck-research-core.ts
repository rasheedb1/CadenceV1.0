// ss-deck-research-core
// =============================================================================
// Shared research pipeline for the SS deck (yuno-sales-pitch-maker port).
// Used by:
//   1. ss-deck-research (Step 1 of the UI wizard: returns suggestions)
//   2. ss-deck-generate (full deck assembly: research → math → persist)
//
// Encapsulates: domain resolution → AMC upsert → chief-deep-research-company →
// region detection → acquirer extraction → regional fallback.
//
// Mirrors the same discriminated-union pattern used by sdr-bc-research-core
// so callers can map { ok:false, status, reason, details } straight to HTTP.
// =============================================================================

import { createSupabaseClient } from './supabase.ts'
import { resolveCompanyDomain, DomainResolutionError } from './resolve-company-domain.ts'
import { isoFromCountryName, regionOf, type RegionKey } from './regions.ts'
import { REGIONAL_STACK_CATALOG } from './regional-psps.ts'
import { isNonPsp } from './non-psp-patterns.ts'

const RESEARCH_TIMEOUT_MS = 45_000

export interface SsIntelShape {
  top_markets?: Array<{ country?: string; traffic_share_estimate?: string }>
  payment_stack?: {
    psps_detected?: Array<{ name?: string; evidence_type?: string; source_url?: string }>
    orchestrator_detected?: boolean
  }
}

export interface RunSsResearchInput {
  companyName: string
  websiteRaw: string
  orgId: string
  ownerId: string
}

export interface SsResearchSuccess {
  ok: true
  domain: string | null
  region: RegionKey | null
  acquirers: string[]                 // top up to 4 acquirers (research-detected, post-filter)
  content_source: 'research' | 'regional_fallback' | 'template'
  regional_catalog_acquirers: string[]
  regional_catalog_gateways: string[]
}

export interface SsResearchFailure {
  ok: false
  status: number
  error: string
  reason?: string
  details?: Record<string, unknown>
}

export type SsResearchResult = SsResearchSuccess | SsResearchFailure

// PSP names that are predominantly pure acquirers/processors.
// Kept here as the single source of truth for both endpoints.
export const PURE_ACQUIRER_TOKENS = [
  'worldpay', 'fis', 'fiserv', 'cybersource', 'vantiv', 'chase paymentech',
  'tsys', 'global payments', 'first data', 'cielo', 'rede', 'stone',
  'payu', 'kushki', 'conekta', 'openpay', 'culqi', 'niubiz',
  'transbank', 'webpay', 'multicaja', 'compropago',
  'barclaycard', 'elavon', 'paysafe',
  'gmo payment', 'worldline', 'nab merchant',
]

// Reduce a PSP name to its dominant brand token so "Worldpay (FIS)" and
// "Worldpay (FIS/Global Payments)" collide on dedup.
export function brandKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[/&,+\-]/g, ' ')
    .replace(/\b(inc|llc|ltd|corp|sa|nv|ag|gmbh|co)\b/g, ' ')
    .trim()
    .split(/\s+/)[0] || name.toLowerCase()
}

export function extractAcquirers(intel: SsIntelShape): string[] {
  const psps = intel.payment_stack?.psps_detected || []
  const out: string[] = []
  const seen = new Set<string>()
  for (const p of psps) {
    const name = (p.name || '').trim()
    if (!name) continue
    if (isNonPsp(name)) continue
    const key = brandKey(name)
    if (seen.has(key)) continue
    const isAcquirer = PURE_ACQUIRER_TOKENS.some(t => name.toLowerCase().includes(t))
    if (!isAcquirer) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

export function primaryRegionFromIntel(intel: SsIntelShape): RegionKey {
  for (const m of intel.top_markets || []) {
    const iso = isoFromCountryName(m.country || null)
    if (!iso) continue
    const region = regionOf(iso)
    if (region) return region
  }
  return 'us'
}

async function callDeepResearch(
  supaUrl: string, authHeader: string,
  company_id: string, orgId: string, ownerId: string,
): Promise<{ intelligence?: SsIntelShape } | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), RESEARCH_TIMEOUT_MS)
    const r = await fetch(`${supaUrl}/functions/v1/chief-deep-research-company`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
      body: JSON.stringify({ company_id, orgId, ownerId }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!r.ok) {
      console.warn(`[ss-deck-research-core] deep-research failed ${r.status}`)
      return null
    }
    return await r.json()
  } catch (e) {
    console.warn(`[ss-deck-research-core] deep-research threw: ${(e as Error).message}`)
    return null
  }
}

// Main entry — full research pipeline.
export async function runSsResearch(
  supabase: ReturnType<typeof createSupabaseClient>,
  supaUrl: string,
  downstreamAuth: string,
  input: RunSsResearchInput,
): Promise<SsResearchResult> {
  const { companyName, websiteRaw, orgId, ownerId } = input

  // 1. Resolve domain (caller can pre-provide via websiteRaw)
  let domain: string | null = null
  try {
    if (websiteRaw) {
      domain = websiteRaw.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase() || null
    } else {
      const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY')
      const resolved = await resolveCompanyDomain(companyName, { orgId, supabase, firecrawlKey })
      domain = resolved.domain
    }
  } catch (e) {
    if (e instanceof DomainResolutionError) {
      console.warn(`[ss-deck-research-core] domain resolution failed for ${companyName}: ${e.reason}`)
    } else {
      console.warn(`[ss-deck-research-core] domain resolution threw: ${(e as Error).message}`)
    }
  }

  let acquirers: string[] = []
  let contentSource: 'research' | 'regional_fallback' | 'template' = 'template'
  let region: RegionKey | null = null

  if (domain) {
    // 2. Upsert account_map_companies
    let companyId: string | null = null
    const { data: existing } = await supabase
      .from('account_map_companies')
      .select('id')
      .eq('org_id', orgId)
      .eq('website', domain)
      .maybeSingle()
    if (existing) companyId = existing.id
    if (!companyId) {
      const { data: created } = await supabase
        .from('account_map_companies')
        .insert({ org_id: orgId, company_name: companyName, website: domain })
        .select('id')
        .single()
      if (created) companyId = created.id
    }

    // 3. Deep research (cache-hot when re-run within 30d)
    if (companyId) {
      const dr = await callDeepResearch(supaUrl, downstreamAuth, companyId, orgId, ownerId || companyId)
      const intel = dr?.intelligence
      if (intel) {
        region = primaryRegionFromIntel(intel)
        acquirers = extractAcquirers(intel)
        if (acquirers.length >= 2) {
          contentSource = 'research'
        }
      }
    }
  }

  // 4. Regional fallback if research was weak/empty
  if (acquirers.length < 2) {
    const fallbackRegion = region || 'us'
    const stack = REGIONAL_STACK_CATALOG[fallbackRegion]
    if (stack) {
      const seen = new Set(acquirers.map(brandKey))
      for (const acq of stack.acquirers) {
        if (acquirers.length >= 4) break
        const key = brandKey(acq)
        if (seen.has(key)) continue
        if (isNonPsp(acq)) continue
        seen.add(key)
        acquirers.push(acq)
      }
      contentSource = acquirers.length > 0 ? 'regional_fallback' : 'template'
      region = fallbackRegion
    }
  }

  // 5. Build regional catalog for the wizard's multi-select.
  const effectiveRegion = region || 'us'
  const stack = REGIONAL_STACK_CATALOG[effectiveRegion]

  return {
    ok: true,
    domain,
    region,
    acquirers: acquirers.slice(0, 4),
    content_source: contentSource,
    regional_catalog_acquirers: stack?.acquirers || [],
    regional_catalog_gateways: stack?.gateways || [],
  }
}
