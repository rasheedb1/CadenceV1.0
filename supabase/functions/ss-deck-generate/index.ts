// ss-deck-generate (v2 — top-4 acquirers research)
// =============================================================================
// Stripe Sessions style deck generator. Ports yuno-sales-pitch-maker upstream.
// Persists a row in `merchants_ss` and returns chief.yuno.tools/m/<slug>.
//
// v2 pipeline:
//   1. Resolve domain (resolveCompanyDomain helper, Firecrawl-backed).
//   2. Upsert account_map_companies row by (org_id, website).
//   3. Call chief-deep-research-company (30d cache) → intelligence.payment_stack.
//   4. Extract acquirers from psps_detected[]. If weak (<2 real PSPs after
//      isNonPsp filter) → derive top country via SimilarWeb → map to region
//      → fall back to REGIONAL_STACK_CATALOG[region].acquirers (4 curated).
//   5. Always slice to top 4, mark content_source: 'research' | 'regional_fallback' | 'template'.
//
// Auth mirrors sdr-bc-generate: X-Agent-Token | service-role Bearer | user JWT.
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'
import { type RegionKey } from '../_shared/regions.ts'
import { validateLang, validateCurrency, type Lang } from '../_shared/i18n.ts'
import { runSsResearch } from '../_shared/ss-deck-research-core.ts'

const PUBLIC_BASE_URL = 'https://chief.yuno.tools'
const RESEARCH_TIMEOUT_MS = 45_000 // hard cap: don't block the deck if deep-research stalls

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

// Default agnostic content, ported from upstream src/data/_default.json.
// pain titles + capabilities are template; psps is filled by research below.
// Localized per `lang` argument so the persisted row contains the correctly
// translated default copy. Math is unaffected — only strings change.
//
// Proper nouns (UPI, Pix, iDEAL, OXXO, Konbini, GrabPay, Smart Routing) stay
// in English in all three languages per the multilingual policy.
const DEFAULT_DECK_CONTENT: Record<Lang, {
  pain_titles: string[]
  capability_titles: string[]
  capability_desc_templates: string[]
}> = {
  en: {
    pain_titles: [
      'Single-processor dependency',
      'Cross-border inefficiency',
      'Limited APM coverage',
      'No smart routing',
      'High processing cost',
    ],
    capability_titles: [
      'Smart Routing',
      'Failover & Retries',
      'Local Payment Methods',
      'Unified Orchestration',
    ],
    capability_desc_templates: [
      "Per-transaction decisioning across every acquirer, lifting {company}'s auth rate on [key product flow] without a single engineering sprint.",
      'Automatic cascade across processors rescues declined transactions in real time, turning involuntary churn into recovered revenue.',
      "1,000+ payment methods, wallets and local rails — UPI, Pix, iDEAL, Konbini, GrabPay — live through one integration, unlocking {company}'s global conversion.",
      'One reconciliation, one analytics layer, one contract surface across every PSP and market, replacing a fragmented ops mesh with a single control plane.',
    ],
  },
  es: {
    pain_titles: [
      'Dependencia de un solo procesador',
      'Ineficiencia cross-border',
      'Cobertura limitada de APMs',
      'Sin smart routing',
      'Alto costo de procesamiento',
    ],
    capability_titles: [
      'Smart Routing',
      'Failover & Reintentos',
      'Métodos de Pago Locales',
      'Orquestación Unificada',
    ],
    capability_desc_templates: [
      'Decisión por transacción a través de cada adquirente, mejorando la auth rate de {company} en [flujo clave] sin un solo sprint de ingeniería.',
      'Cascada automática a través de procesadores rescata transacciones rechazadas en tiempo real, convirtiendo churn involuntario en ingresos recuperados.',
      '1.000+ métodos de pago, billeteras y rieles locales — UPI, Pix, iDEAL, Konbini, GrabPay — en vivo en una sola integración, desbloqueando la conversión global de {company}.',
      'Una sola reconciliación, una sola capa de analytics, una sola superficie de contrato en cada PSP y mercado, reemplazando una malla operativa fragmentada por un único plano de control.',
    ],
  },
  pt: {
    pain_titles: [
      'Dependência de um único processador',
      'Ineficiência cross-border',
      'Cobertura limitada de APMs',
      'Sem smart routing',
      'Alto custo de processamento',
    ],
    capability_titles: [
      'Smart Routing',
      'Failover & Retentativas',
      'Métodos de Pagamento Locais',
      'Orquestração Unificada',
    ],
    capability_desc_templates: [
      'Decisão por transação em cada adquirente, elevando a taxa de aprovação de {company} em [fluxo-chave do produto] sem um único sprint de engenharia.',
      'Cascata automática entre processadores resgata transações recusadas em tempo real, transformando churn involuntário em receita recuperada.',
      '1.000+ métodos de pagamento, carteiras e trilhos locais — UPI, Pix, iDEAL, Konbini, GrabPay — ao vivo em uma única integração, desbloqueando a conversão global de {company}.',
      'Uma reconciliação, uma camada de analytics, uma superfície de contrato em cada PSP e mercado, substituindo uma malha de ops fragmentada por um único plano de controle.',
    ],
  },
}

// Country/market labels for the missing-methods chip row. The market codes
// (NL, SEA, JP, MX) stay as-is across all languages — those are universally
// understood ISO/regional codes in a payments context.
const MISSING_METHODS_BY_LANG: Record<Lang, Array<{ method: string; market: string }>> = {
  en: [
    { method: 'UPI',     market: 'India' },
    { method: 'Pix',     market: 'Brazil' },
    { method: 'iDEAL',   market: 'NL' },
    { method: 'GrabPay', market: 'SEA' },
    { method: 'Konbini', market: 'JP' },
    { method: 'OXXO',    market: 'MX' },
  ],
  es: [
    { method: 'UPI',     market: 'India' },
    { method: 'Pix',     market: 'Brasil' },
    { method: 'iDEAL',   market: 'NL' },
    { method: 'GrabPay', market: 'SEA' },
    { method: 'Konbini', market: 'JP' },
    { method: 'OXXO',    market: 'MX' },
  ],
  pt: [
    { method: 'UPI',     market: 'Índia' },
    { method: 'Pix',     market: 'Brasil' },
    { method: 'iDEAL',   market: 'NL' },
    { method: 'GrabPay', market: 'SEA' },
    { method: 'Konbini', market: 'JP' },
    { method: 'OXXO',    market: 'MX' },
  ],
}

function defaultDeckContent(companyName: string, lang: Lang) {
  const block = DEFAULT_DECK_CONTENT[lang] ?? DEFAULT_DECK_CONTENT.en
  return {
    pain_titles: block.pain_titles,
    missing_methods: MISSING_METHODS_BY_LANG[lang] ?? MISSING_METHODS_BY_LANG.en,
    capability_titles: block.capability_titles,
    capability_descs: block.capability_desc_templates.map((t) =>
      t.replace(/\{company\}/g, companyName),
    ),
    capabilities_live: [],
  }
}

// Research helpers (PURE_ACQUIRER_TOKENS, brandKey, extractAcquirers,
// primaryRegionFromIntel, callDeepResearch) moved to
// _shared/ss-deck-research-core.ts so the new ss-deck-research endpoint
// can reuse them without duplication.

// Override shapes accepted from the UI wizard's Step 2. All fields optional;
// when present, replace the auto-resolved values from research.
interface PspOverride { name: string; role?: string | null }
interface MissingMethodOverride { method: string; market: string }

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

  const companyName = typeof body.company_name === 'string' ? body.company_name.trim() : ''
  const createdByEmail = typeof body.createdByEmail === 'string' ? body.createdByEmail.trim() : ''
  const mode = typeof body.mode === 'string' ? body.mode : 'merchant'
  const logo = typeof body.logo === 'string' ? body.logo : null
  const greeting = typeof body.greeting === 'string' ? body.greeting : null
  const websiteOverride = typeof body.website === 'string' ? body.website.trim() : ''
  const skipResearch = body.skip_research === true

  // ── UI overrides (Step 2 of /ss-deck wizard, all optional) ──
  // pspsOverride: replaces research-detected PSPs (slide 3 + 4 current stack)
  // missingMethodsOverride: replaces default APM chips (slide 3 missing methods)
  // vendor_name / vendor_title: cover slide "Prepared by" + CTA contact
  const pspsOverride: PspOverride[] | null = Array.isArray(body.psps_override)
    ? (body.psps_override as Array<Record<string, unknown>>)
        .filter(x => typeof x.name === 'string' && (x.name as string).trim().length > 0)
        .map(x => ({ name: (x.name as string).trim(), role: typeof x.role === 'string' ? x.role : null }))
    : null
  const missingMethodsOverride: MissingMethodOverride[] | null = Array.isArray(body.missing_methods_override)
    ? (body.missing_methods_override as Array<Record<string, unknown>>)
        .filter(x => typeof x.method === 'string' && typeof x.market === 'string')
        .map(x => ({ method: (x.method as string).trim(), market: (x.market as string).trim() }))
    : null
  const vendorName = typeof body.vendor_name === 'string' ? body.vendor_name.trim() : ''
  const vendorTitle = typeof body.vendor_title === 'string' ? body.vendor_title.trim() : ''

  // Multilingual inputs (Phase 3.A). Cadence callers don't pass these so the
  // defaults preserve the 2026-05-18 automatic-en/USD policy. Manual callers
  // (UI form, skill prompts) opt in explicitly. Validators whitelist values
  // and fall back to defaults on typos so cadence steps never crash here.
  const language: Lang = validateLang(body.language, 'en')
  const currency: string = validateCurrency(body.currency, 'USD')

  if (!companyName) return err('company_name is required', 400, origin)
  if (!['merchant', 'banking', 'partner'].includes(mode)) {
    return err(`mode must be merchant|banking|partner (got "${mode}")`, 400, origin)
  }

  const supabase = createSupabaseClient()

  // ── Resolve org_id + ownerId ──
  let resolvedUserId: string | null = null
  let resolvedOrgId: string | null = null
  if (createdByEmail) {
    const { data: integration, error: intErr } = await supabase
      .from('ae_integrations')
      .select('user_id, org_id')
      .eq('provider', 'gmail')
      .ilike('config->>email', createdByEmail)
      .maybeSingle()
    if (intErr) return err('AE lookup failed', 500, origin)
    if (integration) {
      resolvedUserId = integration.user_id
      resolvedOrgId = integration.org_id
    }
  }
  const orgId = resolvedOrgId || (typeof body.org_id === 'string' ? body.org_id : null)
  const ownerId = resolvedUserId || (jwtUser?.id ?? null)
  if (!orgId) return err('org_id is required (pass createdByEmail with linked Gmail integration, or org_id directly)', 400, origin)

  // ── Research phase (shared with ss-deck-research) ──
  let acquirers: string[] = []
  let contentSource: 'research' | 'regional_fallback' | 'template' = 'template'
  let region: RegionKey | null = null
  let domain: string | null = null

  if (!skipResearch) {
    const supaUrl = Deno.env.get('SUPABASE_URL')!
    const downstreamAuth = `Bearer ${serviceRoleFull || serviceRoleAuto}`
    const research = await runSsResearch(supabase, supaUrl, downstreamAuth, {
      companyName,
      websiteRaw: websiteOverride,
      orgId,
      ownerId: ownerId || '',
    })
    if (research.ok) {
      acquirers = research.acquirers
      contentSource = research.content_source
      region = research.region
      domain = research.domain
    }
  }

  // UI override wins over research-detected PSPs. Empty array IS treated as
  // "no PSPs" — caller has explicitly confirmed the stack is unknown.
  let psps: PspOverride[]
  if (pspsOverride) {
    psps = pspsOverride.slice(0, 8)
    // Mark source as 'research' to skip the regional fallback disclaimer
    // (the AE explicitly chose these so the disclaimer doesn't apply).
    contentSource = 'research'
  } else {
    psps = acquirers.slice(0, 4).map(name => ({ name, role: null }))
  }

  // ── Build content ──
  const content = defaultDeckContent(companyName, language)
  // AE-provided missing methods (Step 2 override) win over the default chips.
  const missingMethods = missingMethodsOverride && missingMethodsOverride.length > 0
    ? missingMethodsOverride
    : content.missing_methods
  const slug = `${slugify(companyName)}-${randomSuffix()}`

  // Localized regional-fallback disclaimer. EN preserves the legacy phrasing
  // so existing decks render identically; ES/PT mirror the same structure.
  let pspsDisclaimer: string | null = null
  if (contentSource === 'regional_fallback') {
    const regionUpper = region?.toUpperCase() ?? ''
    if (language === 'es') {
      pspsDisclaimer = `Top adquirentes en la región ${regionUpper} — stack verificado públicamente no disponible`
    } else if (language === 'pt') {
      pspsDisclaimer = `Top adquirentes na região ${regionUpper} — stack verificado publicamente não disponível`
    } else {
      pspsDisclaimer = `Top acquirers in ${regionUpper} region — publicly verified stack not available`
    }
  }

  // ── Insert ──
  const { data: inserted, error: insErr } = await supabase
    .from('merchants_ss')
    .insert({
      slug,
      org_id: orgId,
      created_by: ownerId,
      name: companyName,
      logo,
      logo_mono: null,
      greeting,
      mode,
      language,
      currency,
      show_psp_roles: false,
      pain_titles: content.pain_titles,
      psps,
      psps_disclaimer: pspsDisclaimer,
      missing_methods: missingMethods,
      capability_titles: content.capability_titles,
      capability_descs: content.capability_descs,
      capabilities_live: content.capabilities_live,
      content_source: contentSource,
      // Vendor (AE) shown on cover + CTA. Empty strings persist as null so the
      // slide falls back to the generic "Yuno Sales Team" / role line.
      vendor_name: vendorName || null,
      vendor_title: vendorTitle || null,
    })
    .select('id, slug, created_at')
    .single()

  if (insErr || !inserted) {
    return err(`Insert failed: ${insErr?.message || 'unknown'}`, 500, origin)
  }

  return ok({
    id: inserted.id,
    slug: inserted.slug,
    url: `${PUBLIC_BASE_URL}/m/${inserted.slug}`,
    company_name: companyName,
    mode,
    language,
    currency,
    content_source: contentSource,
    region: region || null,
    domain: domain || null,
    acquirers_count: psps.length,
    acquirers: psps.map(p => p.name),
    created_at: inserted.created_at,
  }, origin)
})
