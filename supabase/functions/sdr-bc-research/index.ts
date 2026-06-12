// sdr-bc-research
// =============================================================================
// Step 1 of the /sdr-bc UI wizard (NewSdrBcForm.tsx). Read-only research:
// resolves the client's primary domain, runs deep-research + SimilarWeb, and
// returns a structured payload the frontend renders as Step 2 override fields:
//   - suggested industry  → 37-category dropdown (catalog included)
//   - suggested avg ticket → number input (placeholder)
//   - per region: top-5 countries with ≥1% share floor
//   - per country: catalog APMs (multi-select), suggested existing APMs,
//                  suggested legal entity (Auto/Yes/No tri-state)
//
// All research calls are cache-hot in this endpoint: chief_deep_research_cache
// (30d) + similarweb_cache (30d) + company_domain_groups (30d). First call for
// a new company takes 60-90s; subsequent calls within 30d are ~5-10s.
//
// Auth: mirrors sdr-bc-generate (X-Agent-Token | service-role | user-jwt).
// The Step 2 submit goes back to sdr-bc-generate with the same clientName +
// website (cache hot) + the user-edited override fields.
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'
import {
  isoFromCountryName, regionOf, type RegionKey,
} from '../_shared/regions.ts'
import { listIndustries } from '../_shared/industries.ts'
import { APMS_BY_ISO } from '../_shared/apms-by-country.ts'
import { runResearch, buildPaymentStack } from '../_shared/sdr-bc-research-core.ts'

const COUNTRY_SHARE_FLOOR = 0.01
const MAX_COUNTRIES_PER_REGION = 5
const REGION_KEYS: RegionKey[] = ['us', 'lat', 'ema', 'apa']

// Region labels (English only — the form is in the Chief admin UI, locale
// independent of the deck render language).
const REGION_LABEL: Record<RegionKey, string> = {
  us: 'North America',
  lat: 'LATAM',
  ema: 'EMEA',
  apa: 'APAC',
}

// ── CORS (same allowlist as sdr-bc-generate) ──
const ALLOWED_ORIGINS = new Set([
  'https://chief.yuno.tools',
  'http://localhost:5173',
  'http://localhost:3000',
])
function corsHeaders(origin: string | null): HeadersInit {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://chief.yuno.tools'
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-agent-token, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  }
}
function ok(body: unknown, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  })
}
function err(msg: string, status: number, origin: string | null, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error: msg, ...extra }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  })
}

// Parse + validate the optional manual_traffic body field. Returns null when
// absent; throws an error string when present-but-malformed (caller decides
// whether to surface as 400). Mirrors the shape RunResearchInput expects.
function parseManualTraffic(raw: unknown, allowZeroVisits = false): { totalMonthlyVisits: number; topCountries: Array<{ iso: string; share: number; visits?: number }> } | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const total = typeof obj.total_monthly_visits === 'number' ? obj.total_monthly_visits : 0
  const rawCountries = Array.isArray(obj.top_countries) ? obj.top_countries : []
  const topCountries = rawCountries
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map(c => ({
      iso: typeof c.iso === 'string' ? c.iso.toUpperCase() : '',
      share: typeof c.share === 'number' ? c.share : 0,
      visits: typeof c.visits === 'number' ? c.visits : undefined,
    }))
    .filter(c => c.iso && c.share > 0)
  // app_traffic_mode (allowZeroVisits) derives TPV from revenue, so the visit
  // count is unused — manual country shares are valid without it.
  if (topCountries.length === 0 || (total <= 0 && !allowZeroVisits)) return null
  return { totalMonthlyVisits: total, topCountries }
}

function timingSafeStrEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

interface CountryNode {
  iso: string
  name: string
  share: number
  visits: number
  suggested_legal_entity: boolean | null            // null = no info (Auto defaults to No)
  suggested_legal_entity_source: 'research' | 'ema_propagation' | null
  suggested_existing_apms: string[]
  catalog_apms: string[]                            // APMS_BY_ISO[iso] — full list for multi-select
}

interface RegionNode {
  region: RegionKey
  label: string
  countries: CountryNode[]
}

// Per-ISO match into intel.existing_apms / intel.legal_entities, accepting both
// iso and country-name keys (same lookup pattern as sdr-bc-generate).
function suggestedExistingApms(
  intel: ReturnType<typeof Object>['toString'] extends never ? never : Record<string, unknown>,
  iso: string, countryName: string,
): string[] {
  const list = ((intel as { existing_apms?: Array<{ country?: string; iso?: string; apms?: string[] }> }).existing_apms) || []
  const match = list.find(e =>
    (e.iso && e.iso.toUpperCase() === iso) ||
    (e.country && e.country.toLowerCase() === countryName.toLowerCase()),
  )
  return Array.isArray(match?.apms) ? (match!.apms as string[]) : []
}

function suggestedLegalEntity(
  intel: Record<string, unknown>,
  iso: string, countryName: string,
): boolean | null {
  const list = ((intel as { legal_entities?: Array<{ country?: string; iso?: string; has_entity?: boolean | null; confidence?: string | null }> }).legal_entities) || []
  const match = list.find(e =>
    (e.iso && e.iso.toUpperCase() === iso) ||
    (e.country && e.country.toLowerCase() === countryName.toLowerCase()),
  )
  if (!match) return null
  // Match sdr-bc-generate's verifiedLocal() gate (confidence high|med required
  // for has_entity=true). Low/unknown confidence → expose as null (Auto).
  if (match.has_entity === true && (match.confidence === 'high' || match.confidence === 'med')) return true
  if (match.has_entity === false && (match.confidence === 'high' || match.confidence === 'med')) return false
  return null
}

// Mirror sdr-bc-generate's emaHasAnyVerifiedEntity so the Step-2 wizard
// previews EMA propagation before submitting. Returns the country name of
// the anchor (for the UI label) or null if no propagation applies.
function emaPropagationAnchor(intel: Record<string, unknown>): string | null {
  const list = ((intel as { legal_entities?: Array<{ country?: string; iso?: string; has_entity?: boolean | null; confidence?: string | null }> }).legal_entities) || []
  for (const e of list) {
    const iso = e.iso?.toUpperCase() || (e.country ? isoFromCountryName(e.country) : null)
    if (!iso) continue
    if (regionOf(iso) !== 'ema') continue
    if (e.has_entity === true && (e.confidence === 'high' || e.confidence === 'med')) {
      return e.country || iso
    }
  }
  return null
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }
  if (req.method !== 'POST') return err('Use POST', 405, origin)

  // ── Auth (mirrors sdr-bc-generate) ──
  const expectedToken = Deno.env.get('PRESENTATIONS_AGENT_TOKEN')
  const serviceRoleFull = Deno.env.get('SERVICE_ROLE_KEY_FULL') || ''
  const serviceRoleAuto = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const provided = req.headers.get('x-agent-token') || req.headers.get('X-Agent-Token') || ''
  const authHdr = req.headers.get('authorization') || req.headers.get('Authorization') || ''
  const bearer = authHdr.toLowerCase().startsWith('bearer ') ? authHdr.slice(7) : ''
  const tokenOk = !!expectedToken && timingSafeStrEqual(provided, expectedToken)
  const bearerOk = !!bearer && (
    (!!serviceRoleFull && timingSafeStrEqual(bearer, serviceRoleFull)) ||
    (!!serviceRoleAuto && timingSafeStrEqual(bearer, serviceRoleAuto))
  )
  let jwtUser: { id: string; email?: string } | null = null
  if (!tokenOk && !bearerOk && bearer) {
    try {
      const adminClient = createSupabaseClient()
      const { data: userData } = await adminClient.auth.getUser(bearer)
      if (userData?.user) jwtUser = { id: userData.user.id, email: userData.user.email || undefined }
    } catch { /* fall through */ }
  }
  if (!tokenOk && !bearerOk && !jwtUser) {
    return err('Invalid auth: provide X-Agent-Token, service-role Bearer, or user JWT', 401, origin)
  }

  // ── Parse body ──
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return err('Invalid JSON body', 400, origin) }

  const clientName = typeof body.clientName === 'string' ? body.clientName.trim() : ''
  const websiteRaw = typeof body.website === 'string' ? body.website.trim() : ''
  const createdByEmail = typeof body.createdByEmail === 'string' ? body.createdByEmail.trim() : ''
  const forceRefresh = body.force_refresh === true
  const acceptLowConfidence = body.accept_low_confidence === true
  // Emergency mode: AE provides traffic data manually (no SimilarWeb credit
  // burn) and optionally skips deep research too. Used when API credits are
  // exhausted. See plan-sdr-bc-optional-overrides.md (manual-mode extension).
  const skipDeepResearch = body.skip_deep_research === true
  const appTrafficMode = body.app_traffic_mode === true
  const manualTraffic = parseManualTraffic(body.manual_traffic, appTrafficMode)

  if (!clientName) return err('clientName is required', 400, origin)
  if (manualTraffic && !websiteRaw) {
    return err('website is required when manual_traffic is provided', 400, origin)
  }

  const supabase = createSupabaseClient()

  // ── Resolve AE → user_id + org_id (same model as sdr-bc-generate) ──
  let aeUserId: string | null = null
  let aeOrgId: string | null = null
  if (createdByEmail) {
    const { data: integration, error: intErr } = await supabase
      .from('ae_integrations')
      .select('user_id, org_id')
      .eq('provider', 'gmail')
      .ilike('config->>email', createdByEmail)
      .maybeSingle()
    if (intErr) return err('AE lookup failed', 500, origin)
    if (!integration) {
      return err(
        `No Gmail integration found for ${createdByEmail}. Connect Gmail in Chief (Settings or WhatsApp) before generating an SDR BC.`,
        400, origin,
      )
    }
    aeUserId = integration.user_id
    aeOrgId = integration.org_id
  }
  const orgId = aeOrgId || (typeof body.orgId === 'string' ? body.orgId : null)
  const ownerId = aeUserId || (jwtUser?.id ?? null)
  if (!orgId) return err('orgId is required (pass createdByEmail or orgId)', 400, origin)
  if (!ownerId) return err('ownerId could not be resolved', 400, origin)

  const supaUrl = Deno.env.get('SUPABASE_URL')!
  const downstreamAuth = `Bearer ${serviceRoleFull || serviceRoleAuto}`
  if (!serviceRoleFull && !serviceRoleAuto) {
    return err('Service role key not configured on this function', 500, origin)
  }

  // ── Run research (same pipeline as sdr-bc-generate, cache-hot on re-runs) ──
  const research = await runResearch(supabase, supaUrl, downstreamAuth, ownerId, {
    clientName, websiteRaw, orgId, forceRefresh, acceptLowConfidence,
    skipDeepResearch,
    appTrafficMode,
    ...(manualTraffic ? { manualTraffic } : {}),
  })
  if (!research.ok) {
    return err(research.error, research.status, origin, {
      ...(research.reason ? { reason: research.reason } : {}),
      ...(research.details || {}),
    })
  }
  const { domain, domainResolution, intel, sw, topCountries } = research

  // ── Bucket countries into regions, ≥1% floor, top-5/region ──
  const buckets: Record<RegionKey, Array<{ iso: string; name: string; share: number; visits: number }>> = {
    us: [], lat: [], ema: [], apa: [],
  }
  for (const c of topCountries) {
    if (!c.share || c.share < COUNTRY_SHARE_FLOOR) continue
    const iso = isoFromCountryName(c.name)
    if (!iso) continue
    const region = regionOf(iso)
    if (!region) continue
    buckets[region].push({ iso, name: c.name, share: c.share, visits: c.visits })
  }
  for (const r of REGION_KEYS) {
    buckets[r].sort((a, b) => b.share - a.share)
    buckets[r] = buckets[r].slice(0, MAX_COUNTRIES_PER_REGION)
  }

  const intelRecord = intel as unknown as Record<string, unknown>
  // Precompute EMA propagation anchor (country name) so per-country suggestions
  // can preview what sdr-bc-generate will do at submit time.
  const emaAnchorName = emaPropagationAnchor(intelRecord)
  const regions: RegionNode[] = REGION_KEYS
    .filter(r => buckets[r].length > 0)
    .map(r => ({
      region: r,
      label: REGION_LABEL[r],
      countries: buckets[r].map(c => {
        const fromResearch = suggestedLegalEntity(intelRecord, c.iso, c.name)
        let legal: boolean | null = fromResearch
        let source: 'research' | 'ema_propagation' | null = fromResearch !== null ? 'research' : null
        // EMA propagation kicks in only when research has no opinion AND we're
        // in the EMA bucket AND there's an anchor country with verified entity.
        if (fromResearch === null && r === 'ema' && emaAnchorName) {
          legal = true
          source = 'ema_propagation'
        }
        return {
          iso: c.iso,
          name: c.name,
          share: c.share,
          visits: c.visits,
          suggested_legal_entity: legal,
          suggested_legal_entity_source: source,
          suggested_existing_apms: suggestedExistingApms(intelRecord, c.iso, c.name),
          catalog_apms: APMS_BY_ISO[c.iso] || [],
        }
      }),
    }))

  if (regions.length === 0) {
    return err(
      `No region above the 1% share floor for ${domain} — nothing to render.`,
      422, origin, { reason: 'no_regions_above_floor', top_countries: topCountries.slice(0, 10) },
    )
  }

  // ── Suggested industry + ticket from deep-research ──
  // Both are nullable; the UI shows them as placeholders/preselects and lets
  // the AE override. The actual fallback ladder runs in sdr-bc-generate, so
  // this endpoint never falls back to industry default (would confuse the UI).
  const suggestedIndustry = typeof intel.industry_category === 'string' && intel.industry_category.trim()
    ? intel.industry_category.trim()
    : null
  const ticketConfidence = intel.avg_ticket_confidence || 'unknown'
  const suggestedAvgTicket = typeof intel.avg_ticket_usd === 'number' && Number.isFinite(intel.avg_ticket_usd)
    && (ticketConfidence === 'high' || ticketConfidence === 'med')
    ? intel.avg_ticket_usd
    : null

  // Slide-4 payment stack: same builder sdr-bc-generate uses, so Step 2 can
  // pre-fill the three editable columns with exactly what the deck would show.
  const paymentStack = buildPaymentStack(intel, topCountries)

  return ok({
    domain,
    domain_resolution: domainResolution
      ? { domain: domainResolution.domain, confidence: domainResolution.confidence, source: domainResolution.source }
      : null,
    suggested_payment_stack: {
      acquirers: paymentStack.acquirers,
      gateways: paymentStack.gateways,
      methods: paymentStack.methods,
      inferred_from_region: paymentStack.inferredFromRegion,
    },
    suggested_industry: suggestedIndustry,
    suggested_avg_ticket_usd: suggestedAvgTicket,
    suggested_avg_ticket_confidence: ticketConfidence,
    suggested_avg_ticket_source_url: intel.avg_ticket_source_url || null,
    industries_catalog: listIndustries(),
    regions,
    ema_propagation_anchor: emaAnchorName,
    similarweb_monthly_visits_avg: sw.monthly_visits?.avg ?? 0,
    // App-traffic mode: surface what deep-research found about annual revenue
    // so the Step-2 wizard can pre-fill the input + show source URLs for the
    // AE to double-check before submitting.
    suggested_annual_revenue_usd: intel.annual_revenue_usd ?? null,
    suggested_annual_revenue_confidence: intel.annual_revenue_confidence ?? null,
    suggested_annual_revenue_source_urls: intel.annual_revenue_source_urls ?? [],
    suggested_annual_revenue_evidence_quote: intel.annual_revenue_evidence_quote ?? null,
  }, origin)
})
