// Edge Function: Google OAuth keepalive
// Mirrors salesforce-keepalive: refreshes Google access_token daily so the
// refresh_token never expires from inactivity. On failure, marks integration
// inactive and sends WhatsApp alert via bridge.
//
// Reads from ae_integrations (single source of truth for Google per memory).
// Tokens live inside the `config` jsonb column (legacy schema) — this fn
// also syncs to top-level access_token/refresh_token columns + mirrors to
// agent_integrations so the bridge (which reads agent_integrations) sees
// fresh tokens without a bridge code change.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse, handleCors } from '../_shared/cors.ts'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const BRIDGE_URL = Deno.env.get('BRIDGE_URL') || 'https://bridge.yuno.tools'

interface AeRow {
  id: string
  org_id: string
  user_id: string
  provider: string
  access_token: string | null
  refresh_token: string | null
  token_expires_at: string | null
  config: Record<string, any> | null
  connected_at: string
}

function readToken(row: AeRow, key: 'access_token' | 'refresh_token'): string | null {
  // Prefer top-level column, fall back to config jsonb (legacy storage)
  return row[key] || row.config?.[key] || null
}

async function refreshGoogle(refreshToken: string): Promise<{ access_token: string; expires_in: number } | { error: string }> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) return { error: 'Missing GOOGLE_CLIENT_ID/SECRET' }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })
  const data = await res.json()
  if (!res.ok || !data.access_token) {
    return { error: `${data.error || 'unknown'}: ${data.error_description || JSON.stringify(data).substring(0, 200)}` }
  }
  return { access_token: data.access_token, expires_in: data.expires_in || 3600 }
}

async function notifyFailure(orgId: string, provider: string, error: string): Promise<void> {
  try {
    await fetch(`${BRIDGE_URL}/api/agent-callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_name: 'Paula',
        result: {
          text:
            `🚨 Google ${provider} token refresh failed\n\n` +
            'Auto-keepalive could not refresh your Google connection. ' +
            'Daily runs that need Gmail/Calendar/Drive will fail until you reconnect.\n\n' +
            `Error: ${error.substring(0, 200)}\n\n` +
            'Reconnect: https://chief.yuno.tools/settings (Integrations → Google)',
        },
        whatsapp_number: null,
        severity: 'error',
      }),
    })
  } catch (e) {
    console.error('Failed to send WhatsApp alert:', e)
  }
}

async function syncToAgentIntegrations(supabase: any, row: AeRow, newAccessToken: string, expiresAt: string): Promise<void> {
  // Mirror to agent_integrations (the table the bridge reads from).
  // Use provider='google' as canonical name (bridge's google refresh endpoint
  // expects this, not 'gmail'/'google_calendar' separately).
  const refreshToken = readToken(row, 'refresh_token')
  await supabase
    .from('agent_integrations')
    .upsert({
      org_id: row.org_id,
      provider: 'google',
      email: row.config?.email || null,
      access_token: newAccessToken,
      refresh_token: refreshToken,
      token_expires_at: expiresAt,
      connected_via: 'google_keepalive',
      connected_by_user_id: row.user_id,
      metadata: { synced_from: 'ae_integrations', original_provider: row.provider },
      connected_at: row.connected_at,
      last_refreshed_at: new Date().toISOString(),
      status: 'active',
    }, { onConflict: 'org_id,provider' })
}

async function refreshOne(supabase: any, row: AeRow): Promise<{ ok: boolean; error?: string; refreshed?: boolean }> {
  const refreshToken = readToken(row, 'refresh_token')
  if (!refreshToken) return { ok: false, error: 'no_refresh_token' }

  const result = await refreshGoogle(refreshToken)
  if ('error' in result) {
    return { ok: false, error: result.error }
  }

  const newAccessToken = result.access_token
  const expiresAt = new Date(Date.now() + result.expires_in * 1000).toISOString()

  // Update ae_integrations: write to BOTH top-level columns AND keep config in sync
  const newConfig = { ...(row.config || {}), access_token: newAccessToken, expires_at: expiresAt }
  await supabase
    .from('ae_integrations')
    .update({
      access_token: newAccessToken,
      refresh_token: refreshToken, // ensure top-level matches
      token_expires_at: expiresAt,
      config: newConfig,
    })
    .eq('id', row.id)

  // Mirror to agent_integrations so bridge sees fresh tokens
  await syncToAgentIntegrations(supabase, row, newAccessToken, expiresAt)

  return { ok: true, refreshed: true }
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const supabase = createSupabaseClient()

    let bodyOrgId: string | null = null
    try {
      const body = await req.json()
      bodyOrgId = body?.org_id || null
    } catch {}

    // Pull all Google rows. Both gmail + google_calendar share tokens (same
    // OAuth grant); we only need to refresh ONCE per (org, user). Group by
    // (org, user, refresh_token) to dedupe.
    let query = supabase
      .from('ae_integrations')
      .select('id, org_id, user_id, provider, access_token, refresh_token, token_expires_at, config, connected_at')
      .in('provider', ['gmail', 'google_calendar', 'google'])

    if (bodyOrgId) query = query.eq('org_id', bodyOrgId)

    const { data: rows, error } = await query
    if (error) return errorResponse(error.message, 500)

    // Dedupe by refresh_token: pick one row per unique token
    const seen = new Set<string>()
    const toRefresh: AeRow[] = []
    const allByToken = new Map<string, AeRow[]>()
    for (const r of (rows || []) as AeRow[]) {
      const tok = readToken(r, 'refresh_token')
      if (!tok) continue
      if (!allByToken.has(tok)) allByToken.set(tok, [])
      allByToken.get(tok)!.push(r)
      if (!seen.has(tok)) {
        seen.add(tok)
        toRefresh.push(r)
      }
    }

    const results: Array<{ org_id: string; user_id: string; ok: boolean; refreshed?: boolean; error?: string; alerted?: boolean }> = []

    for (const row of toRefresh) {
      const result = await refreshOne(supabase, row)
      if (!result.ok) {
        // Alert on failure
        let alerted = false
        await notifyFailure(row.org_id, row.provider, result.error || 'unknown')
        alerted = true

        results.push({ org_id: row.org_id, user_id: row.user_id, ok: false, error: result.error, alerted })
      } else {
        // Replicate the new access_token to all rows that share this refresh_token
        // (e.g. gmail + google_calendar entries for the same user)
        const tok = readToken(row, 'refresh_token')!
        const peers = allByToken.get(tok) || []
        for (const peer of peers) {
          if (peer.id === row.id) continue
          const peerNewConfig = { ...(peer.config || {}), access_token: row.access_token, expires_at: row.token_expires_at }
          await supabase
            .from('ae_integrations')
            .update({ access_token: row.access_token, token_expires_at: row.token_expires_at, config: peerNewConfig })
            .eq('id', peer.id)
        }
        results.push({ org_id: row.org_id, user_id: row.user_id, ok: true, refreshed: result.refreshed })
      }
    }

    return jsonResponse({
      checked: results.length,
      ok_count: results.filter(r => r.ok).length,
      failed_count: results.filter(r => !r.ok).length,
      results,
    })
  } catch (error) {
    console.error('google-keepalive error:', error)
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500)
  }
})
