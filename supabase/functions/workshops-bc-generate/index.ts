// workshops-bc-generate
// =============================================================================
// Workshop Business Case deck generator. Companion to ss-deck-generate but
// distinct: this skill takes EXPLICIT client inputs (monthly tx, AOV, MDR,
// antifraud cost, approval rate) and computes a deterministic business case.
//
// Pipeline:
//   1. Validate inputs (monthly_transactions + avg_ticket_usd + current_approval_rate required).
//   2. Compute business_case (pure function — see computeBusinessCase below).
//   3. Optional research enrichment (chief-deep-research-company) if requested.
//   4. Persist row in workshops_bc and return chief.yuno.tools/workshop/<slug>.
//
// Auth mirrors ss-deck-generate: X-Agent-Token | service-role Bearer | user JWT.
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'
import { computeBusinessCase, validateInputs } from '../_shared/workshops-bc-math.ts'
import { validateLang, validateCurrency } from '../_shared/i18n.ts'

const PUBLIC_BASE_URL = 'https://chief.yuno.tools'
const RESEARCH_TIMEOUT_MS = 45_000

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
    .slice(0, 40) || 'workshop'
}

function randomSuffix(len = 6): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  let s = ''
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  for (let i = 0; i < len; i++) s += chars[bytes[i] % chars.length]
  return s
}

// ── Optional research enrichment ──
async function callDeepResearch(
  supaUrl: string, authHeader: string, companyName: string, orgId: string, ownerId: string,
): Promise<unknown> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), RESEARCH_TIMEOUT_MS)
    const r = await fetch(`${supaUrl}/functions/v1/chief-deep-research-company`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
      body: JSON.stringify({ company_name: companyName, orgId, ownerId }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!r.ok) {
      console.warn(`[workshops-bc] deep-research failed ${r.status}`)
      return null
    }
    return await r.json()
  } catch (e) {
    console.warn(`[workshops-bc] deep-research threw: ${(e as Error).message}`)
    return null
  }
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

  const clientName = typeof body.client_name === 'string' ? body.client_name.trim() : ''
  const country = typeof body.country === 'string' ? body.country.trim().toUpperCase() : null
  // Language: accept es/en/pt. Fallback default = 'es' to preserve historical
  // skill behaviour for this deck (other systems default to 'en'; workshops
  // were Spanish-first since launch).
  const language = validateLang(body.language, 'es')
  // Currency: whitelist USD/MXN/BRL/COP/ARS/CLP/PEN/EUR/GBP. Default USD.
  const currency = validateCurrency(body.currency, 'USD')
  const workshopTitle = typeof body.workshop_title === 'string' ? body.workshop_title.trim() : null
  const workshopDate = typeof body.workshop_date === 'string' ? body.workshop_date.trim() : null
  const clientLogo = typeof body.client_logo === 'string' ? body.client_logo.trim() : null
  const attendees = Array.isArray(body.attendees) ? body.attendees : []
  const createdByEmail = typeof body.createdByEmail === 'string' ? body.createdByEmail.trim() : ''
  const wantResearch = body.research_enrich === true

  if (!clientName) return err('client_name is required', 400, origin)

  // Inputs payload is whatever the AE captured. Validate the math-critical fields.
  const inputsRaw = (typeof body.inputs === 'object' && body.inputs !== null) ? body.inputs as Record<string, unknown> : {}
  const v = validateInputs(inputsRaw)
  if (!v.ok) return err(v.error, 400, origin)
  const inputs = v.value
  const businessCase = computeBusinessCase(inputs)

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

  // ── Optional research enrichment ──
  let research: unknown = null
  let contentSource: 'inputs_only' | 'inputs_plus_research' = 'inputs_only'
  if (wantResearch) {
    const supaUrl = Deno.env.get('SUPABASE_URL')!
    const downstreamAuth = `Bearer ${serviceRoleFull || serviceRoleAuto}`
    const dr = await callDeepResearch(supaUrl, downstreamAuth, clientName, orgId, ownerId || orgId)
    if (dr) {
      research = dr
      contentSource = 'inputs_plus_research'
    }
  }

  // ── Insert ──
  const slug = `${slugify(clientName)}-${randomSuffix()}`
  const { data: inserted, error: insErr } = await supabase
    .from('workshops_bc')
    .insert({
      slug,
      org_id: orgId,
      created_by: ownerId,
      client_name: clientName,
      client_logo: clientLogo,
      country,
      language,
      currency,
      workshop_title: workshopTitle,
      workshop_date: workshopDate,
      attendees,
      inputs,
      business_case: businessCase,
      research,
      content_source: contentSource,
    })
    .select('id, slug, created_at')
    .single()

  if (insErr || !inserted) {
    return err(`Insert failed: ${insErr?.message || 'unknown'}`, 500, origin)
  }

  return ok({
    id: inserted.id,
    slug: inserted.slug,
    url: `${PUBLIC_BASE_URL}/workshop/${inserted.slug}`,
    pdf_url: `https://bridge.yuno.tools/api/workshop/${inserted.slug}/pdf`,
    client_name: clientName,
    language,
    currency,
    content_source: contentSource,
    business_case: businessCase,
    created_at: inserted.created_at,
  }, origin)
})
