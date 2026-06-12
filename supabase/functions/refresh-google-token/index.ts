// refresh-google-token — Returns a fresh Google access_token for an org+user.
// Reads from ae_integrations, refreshes via Google's OAuth token endpoint when
// the cached access_token is within 2 min of expiry, persists the refresh, and
// returns { access_token, email, expires_at }.
//
// Auth: requires service role bearer (or any valid Supabase auth that grants
// read/update on ae_integrations). chief-agents calls this with the service
// role key so we don't have to ship GOOGLE_CLIENT_SECRET to Railway.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

const REFRESH_SKEW_MS = 2 * 60 * 1000

interface RequestBody {
  org_id?: string
  user_id?: string
}

interface AeRow {
  id: string
  user_id: string
  org_id: string
  config: {
    access_token?: string
    refresh_token?: string | null
    expires_at?: string
    email?: string | null
    scope?: string
  } | null
  token_expires_at: string | null
}

async function refreshGoogle(refreshToken: string): Promise<{ access_token: string; expires_at: string } | null> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    console.error('[refresh-google-token] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set')
    return null
  }
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  })
  const data = await resp.json()
  if (!resp.ok || !data.access_token) {
    console.warn('[refresh-google-token] refresh exchange failed:', data)
    return null
  }
  return {
    access_token: data.access_token,
    expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
  }
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return errorResponse('Missing authorization', 401)

  let body: RequestBody = {}
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }
  if (!body.org_id) return errorResponse('Missing org_id', 400)

  const supabase = createSupabaseClient()
  let query = supabase
    .from('ae_integrations')
    .select('id, user_id, org_id, config, token_expires_at')
    .eq('org_id', body.org_id)
    .eq('provider', 'google_calendar')
    .order('connected_at', { ascending: false })
    .limit(1)
  if (body.user_id) query = query.eq('user_id', body.user_id)

  const { data: rows, error } = await query
  if (error) {
    console.error('[refresh-google-token] DB read failed:', error)
    return errorResponse('Database error', 500)
  }
  if (!rows || rows.length === 0) {
    return jsonResponse({ error: 'not_connected' }, 404)
  }

  const row = rows[0] as AeRow
  const cfg = row.config || {}
  if (!cfg.access_token) {
    return jsonResponse({ error: 'no_access_token' }, 404)
  }

  const expiresAtMs = cfg.expires_at ? new Date(cfg.expires_at).getTime() : 0
  let accessToken = cfg.access_token
  let nextExpiresAt: string | null = cfg.expires_at || row.token_expires_at || null

  if (Date.now() > expiresAtMs - REFRESH_SKEW_MS) {
    if (!cfg.refresh_token) {
      return jsonResponse({ error: 'expired_no_refresh_token' }, 401)
    }
    const refreshed = await refreshGoogle(cfg.refresh_token)
    if (!refreshed) {
      return jsonResponse({ error: 'refresh_failed' }, 401)
    }
    accessToken = refreshed.access_token
    nextExpiresAt = refreshed.expires_at
    const newConfig = { ...cfg, access_token: refreshed.access_token, expires_at: refreshed.expires_at }
    const { error: upErr } = await supabase
      .from('ae_integrations')
      .update({ config: newConfig, token_expires_at: refreshed.expires_at })
      .eq('id', row.id)
    if (upErr) {
      console.warn('[refresh-google-token] persist refresh failed (returning new token anyway):', upErr.message)
    }
  }

  return jsonResponse({
    access_token: accessToken,
    email: cfg.email || null,
    expires_at: nextExpiresAt,
    user_id: row.user_id,
  })
})
