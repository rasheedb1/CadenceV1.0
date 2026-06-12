// ss-deck-research
// =============================================================================
// Step 1 of the /ss-deck UI wizard (NewSsDeckForm). Read-only research:
// resolves the client's primary domain, runs deep-research to detect the
// top region + acquirers, and returns a structured payload the frontend
// renders as Step 2 override fields:
//   - suggested PSPs  → multi-select from regional catalog + freetext extras
//   - default missing APMs → editable chips (UPI/Pix/iDEAL/...)
//   - vendor name + title  → cover + CTA slides ("Prepared by")
//
// Cache-hot on re-runs (chief_deep_research_cache 30d). First call for a new
// company takes 30-60s; subsequent calls within 30d are ~5-10s.
//
// Auth: mirrors ss-deck-generate (X-Agent-Token | service-role | user-jwt).
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'
import { type RegionKey } from '../_shared/regions.ts'
import { runSsResearch } from '../_shared/ss-deck-research-core.ts'

// ── CORS (same allowlist as ss-deck-generate) ──
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

// Default missing-methods chips per language. Mirror the catalogue used by
// ss-deck-generate so AE sees the same suggestions in the wizard preview.
const DEFAULT_MISSING_METHODS: Record<string, Array<{ method: string; market: string }>> = {
  en: [
    { method: 'UPI', market: 'India' },
    { method: 'Pix', market: 'Brazil' },
    { method: 'iDEAL', market: 'NL' },
    { method: 'GrabPay', market: 'SEA' },
    { method: 'Konbini', market: 'JP' },
    { method: 'OXXO', market: 'MX' },
  ],
  es: [
    { method: 'UPI', market: 'India' },
    { method: 'Pix', market: 'Brasil' },
    { method: 'iDEAL', market: 'NL' },
    { method: 'GrabPay', market: 'SEA' },
    { method: 'Konbini', market: 'JP' },
    { method: 'OXXO', market: 'MX' },
  ],
  pt: [
    { method: 'UPI', market: 'Índia' },
    { method: 'Pix', market: 'Brasil' },
    { method: 'iDEAL', market: 'NL' },
    { method: 'GrabPay', market: 'SEA' },
    { method: 'Konbini', market: 'JP' },
    { method: 'OXXO', market: 'MX' },
  ],
}

// Region labels for the wizard summary banner.
const REGION_LABEL: Record<RegionKey, string> = {
  us: 'North America',
  lat: 'LATAM',
  ema: 'EMEA',
  apa: 'APAC',
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }
  if (req.method !== 'POST') return err('Use POST', 405, origin)

  // ── Auth (mirrors ss-deck-generate) ──
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
  const websiteRaw = typeof body.website === 'string' ? body.website.trim() : ''
  const createdByEmail = typeof body.createdByEmail === 'string' ? body.createdByEmail.trim() : ''
  const language = (typeof body.language === 'string' && ['en', 'es', 'pt'].includes(body.language))
    ? body.language as 'en' | 'es' | 'pt'
    : 'en'

  if (!companyName) return err('company_name is required', 400, origin)

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
    if (integration) {
      aeUserId = integration.user_id
      aeOrgId = integration.org_id
    }
  }
  const orgId = aeOrgId || (typeof body.org_id === 'string' ? body.org_id : null)
  const ownerId = aeUserId || (jwtUser?.id ?? null)
  if (!orgId) return err('org_id is required (pass createdByEmail or org_id)', 400, origin)
  if (!ownerId) return err('ownerId could not be resolved', 400, origin)

  const supaUrl = Deno.env.get('SUPABASE_URL')!
  const downstreamAuth = `Bearer ${serviceRoleFull || serviceRoleAuto}`
  if (!serviceRoleFull && !serviceRoleAuto) {
    return err('Service role key not configured on this function', 500, origin)
  }

  // ── Run research ──
  const research = await runSsResearch(supabase, supaUrl, downstreamAuth, {
    companyName, websiteRaw, orgId, ownerId,
  })
  if (!research.ok) {
    return err(research.error, research.status, origin, {
      ...(research.reason ? { reason: research.reason } : {}),
      ...(research.details || {}),
    })
  }

  return ok({
    domain: research.domain,
    region: research.region,
    region_label: research.region ? REGION_LABEL[research.region] : null,
    content_source: research.content_source,
    suggested_psps: research.acquirers.map(name => ({ name, role: null })),
    regional_catalog_acquirers: research.regional_catalog_acquirers,
    regional_catalog_gateways: research.regional_catalog_gateways,
    suggested_missing_methods: DEFAULT_MISSING_METHODS[language] || DEFAULT_MISSING_METHODS.en,
  }, origin)
})
