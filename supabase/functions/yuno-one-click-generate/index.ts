// yuno-one-click-generate
// =============================================================================
// Generates the Yuno One-Click product deck data for a target merchant and
// persists it as a row in `presentations` with kind='yuno_one_click'. The deck
// is served at chief.yuno.tools/one-click/<slug> by yuno-one-click-render.
//
// Foco: deck dinámico per-merchant explicando Yuno One-Click (shared-token
// network), audiencia merchant prospect CXO, default español. NO compara con
// competidores (ver feedback_no_competitors_in_yuno_decks).
//
// Pipeline:
//   1. Auth (X-Agent-Token | service-role | user-jwt) — mismo modelo sdr-bc
//   2. Resolver AE via createdByEmail → user_id + org_id desde ae_integrations
//   3. runResearch (deep-research + SimilarWeb) → industry + ticket + country + visits
//   4. Resolver industry (override > research > FALLBACK)
//   5. Resolver ticket (override > research [high/med] > industry default)
//   6. Resolver país principal (override > SimilarWeb top-country)
//   7. Math: TPV merchant, NRR proyectado, uplift anual
//   8. Lookup friction (industry) + scenarios (country)
//   9. Persist en presentations, retorna { id, slug, url }
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'
import { isoFromCountryName } from '../_shared/regions.ts'
import { lookupIndustry, FALLBACK_INDUSTRY, INDUSTRIES, type IndustryEntry } from '../_shared/industries.ts'
import { lookupFriction } from '../_shared/yuno-one-click-friction.ts'
import { lookupScenarios } from '../_shared/yuno-one-click-scenarios.ts'
import { runResearch, type IntelligenceShape } from '../_shared/sdr-bc-research-core.ts'

const PUBLIC_BASE_URL = 'https://chief.yuno.tools'

// ── Math constants (Yuno One-Click — calculo aterrizado v2) ──
// Filosofía: usar supuestos defendibles y conservadores. Lo que se promete es
// pequeño pero certero.
//
// Pipeline:
//   1. annual_tx_estimated = monthly_visits × 12 × CONVERSION (proxy de tx anuales)
//   2. one_click_tx        = annual_tx_estimated × ONE_CLICK_SHARE_PCT (% que adopta one-click)
//   3. additional_approved = one_click_tx × APPROVAL_UPLIFT_PCT (auth uplift en esas tx)
//   4. annual_uplift_usd   = additional_approved × avg_ticket_usd
const CONVERSION = 0.07                  // baseline e-com mobile conversion (visitas → tx attempt)
const ONE_CLICK_SHARE_PCT = 10           // % del tráfico que pasa por one-click (conservador, año 1)
const APPROVAL_UPLIFT_PCT = 5            // +5 pp de approval rate en las tx que pasan por one-click
const ANCHOR_MERCHANTS_COUNT = 12        // candidatos anchor tier-1 LATAM (no afirmar uso actual)

// ── CORS ──
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

function timingSafeStrEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'merchant'
}
function randomSuffix(len = 6): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  let s = ''
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  for (let i = 0; i < len; i++) s += chars[bytes[i] % chars.length]
  return s
}

// Format USD-in-millions, web-traffic friendly (matches sdr-bc style).
function fmtMoneyM(usd_m: number): string {
  if (!Number.isFinite(usd_m) || usd_m <= 0) return '0'
  if (usd_m < 0.001) return '<0.001'
  const trimZeros = (s: string) => s.replace(/0+$/, '').replace(/\.$/, '')
  if (usd_m < 0.01) return trimZeros(usd_m.toFixed(3))
  if (usd_m < 1) return trimZeros(usd_m.toFixed(2))
  if (usd_m < 10) return usd_m.toFixed(1).replace(/\.0$/, '')
  return Math.round(usd_m).toLocaleString('en-US')
}

// Format big numbers with k/M suffix for human-friendly visit counts.
function fmtCount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return String(n)
}

// Resolve the merchant's primary country from SimilarWeb top-country.
// Returns ISO-2 (uppercase) or null if no usable signal.
function resolvePrimaryCountry(
  topCountries: Array<{ name: string; share: number }>,
  override: string | null,
): string | null {
  if (override && /^[A-Z]{2}$/.test(override)) return override
  if (!topCountries.length) return null
  const top = topCountries[0]
  if (!top.name) return null
  const iso = isoFromCountryName(top.name)
  return iso || null
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
  const avgTicketOverride = typeof body.avg_ticket_override_usd === 'number' ? body.avg_ticket_override_usd : null
  const forceRefresh = body.force_refresh === true
  const countryOverride = typeof body.country_override === 'string' ? body.country_override.trim().toUpperCase() : null

  const rawIndustryOverride = typeof body.industry_override === 'string' ? body.industry_override.trim() : ''
  let industryOverride: IndustryEntry | null = null
  if (rawIndustryOverride) {
    industryOverride = lookupIndustry(rawIndustryOverride)
    if (!industryOverride) {
      return err(
        `industry_override "${rawIndustryOverride}" not in INDUSTRIES catalog (37 valid categories)`,
        400, origin,
        { reason: 'invalid_industry_override', valid_categories: INDUSTRIES.map(i => i.category) },
      )
    }
  }

  if (!clientName) return err('clientName is required', 400, origin)
  if (!websiteRaw) return err('website is required', 400, origin)

  const supabase = createSupabaseClient()

  // ── Resolve AE → user_id + org_id ──
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
        `No Gmail integration found for ${createdByEmail}. Connect Gmail in Chief (Settings or WhatsApp) before generating a Yuno One-Click deck.`,
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

  // ── Vendor profile (for CTA slide) ──
  let vendorProfile: {
    name: string | null
    title: string | null
    email: string | null
    phone: string | null
    demo_calendar_url: string | null
    avatar_url: string | null
  } | null = null
  {
    const { data: vp } = await supabase
      .from('user_sales_profiles')
      .select('name, title, email, phone, demo_calendar_url, avatar_url')
      .eq('user_id', ownerId)
      .maybeSingle()
    if (vp) vendorProfile = vp as typeof vendorProfile
  }

  const supaUrl = Deno.env.get('SUPABASE_URL')!
  const downstreamAuth = `Bearer ${serviceRoleFull || serviceRoleAuto}`
  if (!serviceRoleFull && !serviceRoleAuto) {
    return err('Service role key not configured on this function', 500, origin)
  }

  // ── Research pipeline (shared with sdr-bc) ──
  const research = await runResearch(supabase, supaUrl, downstreamAuth, ownerId, {
    clientName, websiteRaw, orgId, forceRefresh,
    acceptLowConfidence: false,
    skipDeepResearch: false,
    appTrafficMode: false,
  })
  if (!research.ok) {
    return err(research.error, research.status, origin, {
      ...(research.reason ? { reason: research.reason } : {}),
      ...(research.details || {}),
    })
  }
  const { domain, intel, sw, topCountries } = research as {
    domain: string
    intel: IntelligenceShape
    sw: { domain: string; monthly_visits: { avg: number } }
    topCountries: Array<{ name: string; share: number; visits: number }>
  }

  const warnings: Record<string, boolean | string> = {}

  // ── Resolve industry (override > research > FALLBACK) ──
  let industry: IndustryEntry
  if (industryOverride) {
    industry = industryOverride
    warnings.industry_source = 'user_override'
  } else {
    industry = lookupIndustry(intel.industry_category) ?? FALLBACK_INDUSTRY
    if (industry === FALLBACK_INDUSTRY && intel.industry_category !== FALLBACK_INDUSTRY.category) {
      warnings.industry_fallback = true
    }
  }

  // ── Resolve ticket (override > research high/med > industry default) ──
  let avgTicketUsd: number | null = typeof intel.avg_ticket_usd === 'number' && Number.isFinite(intel.avg_ticket_usd)
    ? intel.avg_ticket_usd : null
  let confidence = intel.avg_ticket_confidence || 'unknown'
  if (avgTicketOverride !== null) {
    avgTicketUsd = avgTicketOverride
    confidence = 'high'
    warnings.ticket_source = 'user_override'
  } else if (!avgTicketUsd || confidence === 'unknown' || confidence === 'low') {
    if (avgTicketUsd && (confidence === 'low' || confidence === 'unknown')) {
      warnings.ticket_llm_value_discarded = String(avgTicketUsd)
    }
    avgTicketUsd = industry.default_ticket_usd
    confidence = 'low'
    warnings.ticket_industry_default = industry.category
  }

  // ── Resolve primary country (override > SimilarWeb top) ──
  const countryIso = resolvePrimaryCountry(topCountries, countryOverride)
  if (!countryIso) {
    return err(
      `Could not resolve a primary country for ${clientName} from SimilarWeb top countries. Pass country_override (ISO-2).`,
      422, origin,
      { reason: 'country_unresolved', top_countries: topCountries.slice(0, 5) },
    )
  }
  if (countryOverride) warnings.country_source = 'user_override'

  // ── Lookup workshops_bc: si el merchant ya tiene un workshop, usamos sus
  // números REALES (monthly_transactions + avg_ticket_usd capturados por el AE
  // en sesión con el cliente). Fallback: estimación SimilarWeb × conversión.
  let workshopMonthlyTx: number | null = null
  let workshopTicketUsd: number | null = null
  {
    const { data: ws } = await supabase
      .from('workshops_bc')
      .select('inputs, created_at')
      .ilike('client_name', clientName)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const inputs = (ws?.inputs ?? null) as Record<string, unknown> | null
    if (inputs) {
      const mt = typeof inputs.monthly_transactions === 'number' ? inputs.monthly_transactions : null
      const tkt = typeof inputs.avg_ticket_usd === 'number' ? inputs.avg_ticket_usd : null
      if (mt && mt > 0) {
        workshopMonthlyTx = mt
        if (tkt && tkt > 0) workshopTicketUsd = tkt
        warnings.tx_source = 'workshop'
        warnings.workshop_monthly_tx = String(mt)
        if (tkt) warnings.ticket_source = 'workshop'
      }
    }
  }

  // Si vino del workshop, usamos su ticket (override del industry-default).
  if (workshopTicketUsd) {
    avgTicketUsd = workshopTicketUsd
    confidence = 'high'
    // Borrar las warnings de industry-default ticket: ya no aplican.
    delete (warnings as Record<string, unknown>).ticket_industry_default
    delete (warnings as Record<string, unknown>).ticket_llm_value_discarded
  }

  // ── Math: per-merchant uplift v2 (calculo aterrizado) ──
  // Si hay workshop:        annual_tx = monthly_tx × 12 (números reales del cliente)
  // Fallback SimilarWeb:    annual_tx = monthly_visits × 12 × CONVERSION (estimación)
  // one_click_tx    = annual_tx × ONE_CLICK_SHARE_PCT% (% que adopta one-click)
  // additional_appr = one_click_tx × APPROVAL_UPLIFT_PCT% (auth uplift en esas tx)
  // annual_uplift   = additional_appr × avg_ticket_usd
  const monthlyVisits = sw.monthly_visits?.avg ?? 0
  const annualTx = workshopMonthlyTx
    ? workshopMonthlyTx * 12
    : monthlyVisits * 12 * CONVERSION
  if (!workshopMonthlyTx) warnings.tx_source = 'similarweb_estimate'
  const oneClickTx = annualTx * (ONE_CLICK_SHARE_PCT / 100)
  const additionalApprovedTx = oneClickTx * (APPROVAL_UPLIFT_PCT / 100)
  const annualUpliftUsd = additionalApprovedTx * avgTicketUsd
  const annualUpliftUsdM = annualUpliftUsd / 1_000_000
  const tpvAnnualUsd = annualTx * avgTicketUsd            // TPV total (referencia)
  const tpvAnnualUsdM = tpvAnnualUsd / 1_000_000
  const annualRevenueYunoUsdM = annualUpliftUsdM * (industry.take_rate_pct / 100)

  // ── Friction tax + cross-merchant scenarios (static lookups) ──
  const friction = lookupFriction(industry.category)
  const scenarios = lookupScenarios(countryIso)

  // ── Assemble deck defaults ──
  const now = new Date()
  const deckData: Record<string, unknown> = {
    clientName,
    domain,
    docType: 'Yuno One-Click',
    locale: 'es',
    language: 'es',
    currency: 'USD',
    date: String(now.getFullYear()),

    // Per-merchant context
    industry: industry.category,
    industry_take_rate_pct: industry.take_rate_pct,
    country_iso: countryIso,
    monthly_visits: monthlyVisits,
    monthly_visits_fmt: fmtCount(monthlyVisits),
    avg_ticket_usd: avgTicketUsd,
    avg_ticket_confidence: confidence,
    avg_ticket_source_url: warnings.ticket_industry_default ? null : (intel.avg_ticket_source_url || null),

    // Math hero values v2 (calculo aterrizado)
    tx_source: workshopMonthlyTx ? 'workshop' : 'similarweb_estimate',
    workshop_monthly_tx: workshopMonthlyTx,
    workshop_monthly_tx_fmt: workshopMonthlyTx ? fmtCount(workshopMonthlyTx) : null,
    annual_tx: Math.round(annualTx),
    annual_tx_fmt: fmtCount(annualTx),
    one_click_share_pct: ONE_CLICK_SHARE_PCT,
    one_click_tx: Math.round(oneClickTx),
    one_click_tx_fmt: fmtCount(oneClickTx),
    approval_uplift_pct: APPROVAL_UPLIFT_PCT,
    additional_approved_tx: Math.round(additionalApprovedTx),
    additional_approved_tx_fmt: fmtCount(additionalApprovedTx),
    tpv_annual_usd_m: tpvAnnualUsdM,
    tpv_annual_usd_m_fmt: fmtMoneyM(tpvAnnualUsdM),
    annual_uplift_usd_m: annualUpliftUsdM,
    annual_uplift_usd_m_fmt: fmtMoneyM(annualUpliftUsdM),
    annual_revenue_yuno_usd_m: annualRevenueYunoUsdM,
    annual_revenue_yuno_usd_m_fmt: fmtMoneyM(annualRevenueYunoUsdM),
    anchor_merchants_count: ANCHOR_MERCHANTS_COUNT,

    // Slide 04 — Friction tax
    friction_abandonment_pct: friction.abandonment_rate_pct,
    friction_form_fields: friction.avg_form_fields,
    friction_mobile_share_pct: friction.mobile_share_pct,

    // Slide 14 — Cross-merchant scenarios (3 vignettes for the country)
    cross_merchant_scenarios: scenarios,

    // Vendor / CTA slide
    preparedBy: vendorProfile?.name || 'Yuno Sales Strategy',
    contactName: vendorProfile?.name || 'Yuno Sales Team',
    contactTitle: vendorProfile?.title || 'Sales Strategy',
    contactEmail: vendorProfile?.email || 'sales@yuno.io',
    contactPhone: vendorProfile?.phone || '',
    vendor_name: vendorProfile?.name || 'Yuno Sales Team',
    vendor_title: vendorProfile?.title || 'Sales Strategy',
    vendor_email: vendorProfile?.email || 'sales@yuno.io',
    vendor_phone: vendorProfile?.phone || '',
    vendor_demo_url: vendorProfile?.demo_calendar_url || '',
    vendor_avatar_url: vendorProfile?.avatar_url || '',

    warnings,
  }

  // ── Persist ──
  const slug = `${slugify(clientName)}-${randomSuffix()}`
  const { data: inserted, error: insErr } = await supabase
    .from('presentations')
    .insert({
      org_id: orgId,
      created_by: ownerId,
      kind: 'yuno_one_click',
      client_name: clientName,
      slug,
      defaults: deckData,
      raw_research: {
        intelligence: intel,
        similarweb: { domain: sw.domain, monthly_visits: sw.monthly_visits, top_countries: topCountries },
      },
      expires_at: '2099-12-31T23:59:59Z',
    })
    .select('id, slug, expires_at')
    .single()
  if (insErr || !inserted) {
    return err(`Insert failed: ${insErr?.message || 'unknown'}`, 500, origin)
  }

  return ok({
    id: inserted.id,
    slug: inserted.slug,
    url: `${PUBLIC_BASE_URL}/one-click/${inserted.slug}`,
    expiresAt: inserted.expires_at,
    industry: industry.category,
    industry_take_rate_pct: industry.take_rate_pct,
    avg_ticket_usd: avgTicketUsd,
    avg_ticket_confidence: confidence,
    country_iso: countryIso,
    monthly_visits: monthlyVisits,
    annual_tx: Math.round(annualTx),
    one_click_share_pct: ONE_CLICK_SHARE_PCT,
    one_click_tx: Math.round(oneClickTx),
    approval_uplift_pct: APPROVAL_UPLIFT_PCT,
    additional_approved_tx: Math.round(additionalApprovedTx),
    annual_uplift_usd_m: annualUpliftUsdM,
    annual_revenue_yuno_usd_m: annualRevenueYunoUsdM,
    warnings,
    domain_used: domain,
  }, origin)
})
