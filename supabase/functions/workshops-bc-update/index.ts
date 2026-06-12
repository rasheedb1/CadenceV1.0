// workshops-bc-update
// =============================================================================
// Recompute + persist a workshops_bc row's business_case after the AE edits
// inputs through the Presentaciones UI. Same compute fn as workshops-bc-generate
// (shared via _shared/workshops-bc-math.ts) — keeps math identical across the
// create + edit flows.
//
// Pipeline:
//   1. Auth (X-Agent-Token | service-role Bearer | user JWT — same as generate)
//   2. Fetch the existing row by slug
//   3. If JWT user: verify they're a member of the row's org_id
//   4. Merge incoming inputs into existing.inputs (partial updates supported)
//   5. Validate + recompute business_case
//   6. UPDATE workshops_bc with the new inputs + business_case + updated_at
//   7. Return the recomputed BC
//
// The URL stays the same — anyone with the workshop link sees the new numbers
// on next page load. No regenerate flow needed.
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'
import { computeBusinessCase, validateInputs } from '../_shared/workshops-bc-math.ts'

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

serve(async (req) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }
  if (req.method !== 'POST') return err('Use POST', 405, origin)

  // ── Auth (mirrors workshops-bc-generate) ──
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

  const slug = typeof body.slug === 'string' ? body.slug.trim() : ''
  if (!slug) return err('slug is required', 400, origin)

  const incomingInputs = (typeof body.inputs === 'object' && body.inputs !== null)
    ? body.inputs as Record<string, unknown>
    : {}

  // Optional client_name / country / language updates (rest of the row).
  const updateRowFields: Record<string, unknown> = {}
  if (typeof body.client_name === 'string' && body.client_name.trim()) {
    updateRowFields.client_name = body.client_name.trim()
  }
  if (typeof body.country === 'string') {
    updateRowFields.country = body.country.trim().toUpperCase() || null
  }
  if (typeof body.language === 'string' && ['es', 'en'].includes(body.language)) {
    updateRowFields.language = body.language
  }
  if (typeof body.workshop_title === 'string') {
    updateRowFields.workshop_title = body.workshop_title.trim() || null
  }
  if (typeof body.workshop_date === 'string') {
    updateRowFields.workshop_date = body.workshop_date.trim() || null
  }
  if (typeof body.client_logo === 'string') {
    updateRowFields.client_logo = body.client_logo.trim() || null
  }
  if (Array.isArray(body.attendees)) {
    updateRowFields.attendees = body.attendees
  }

  const supabase = createSupabaseClient()

  // ── Fetch existing row ──
  const { data: existing, error: fetchErr } = await supabase
    .from('workshops_bc')
    .select('id, org_id, inputs')
    .eq('slug', slug)
    .maybeSingle()

  if (fetchErr) return err(`Lookup failed: ${fetchErr.message}`, 500, origin)
  if (!existing) return err('Workshop not found', 404, origin)

  // ── Authorization: JWT users must be members of the row's org ──
  // Token/service-role calls bypass this check (they're admin-level).
  if (!tokenOk && !bearerOk && jwtUser) {
    const { data: membership, error: memErr } = await supabase
      .from('organization_members')
      .select('user_id')
      .eq('org_id', existing.org_id)
      .eq('user_id', jwtUser.id)
      .maybeSingle()
    if (memErr) return err('Org membership lookup failed', 500, origin)
    if (!membership) {
      return err('Not authorized: caller is not a member of this workshop\'s org', 403, origin)
    }
  }

  // ── Merge inputs (partial update supported) ──
  const existingInputs = (typeof existing.inputs === 'object' && existing.inputs !== null)
    ? existing.inputs as Record<string, unknown>
    : {}
  const merged: Record<string, unknown> = { ...existingInputs, ...incomingInputs }

  // ── Validate + recompute ──
  const v = validateInputs(merged)
  if (!v.ok) return err(v.error, 400, origin)
  const inputs = v.value
  const businessCase = computeBusinessCase(inputs)

  // ── UPDATE ──
  const { error: updErr } = await supabase
    .from('workshops_bc')
    .update({
      ...updateRowFields,
      inputs,
      business_case: businessCase,
      updated_at: new Date().toISOString(),
    })
    .eq('slug', slug)

  if (updErr) return err(`Update failed: ${updErr.message}`, 500, origin)

  return ok({
    ok: true,
    slug,
    url: `https://chief.yuno.tools/workshop/${slug}`,
    pdf_url: `https://bridge.yuno.tools/api/workshop/${slug}/pdf`,
    business_case: businessCase,
    total_annual_value_usd: businessCase.total_annual_value_usd,
  }, origin)
})
