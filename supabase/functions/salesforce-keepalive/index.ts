// Edge Function: Salesforce token keepalive
// Called by pg_cron daily. Refreshes access_token for each active org's SF connection.
// On failure: marks connection inactive + sends WhatsApp alert via bridge.
//
// Plan: tasks/plan-paula-sf-pipeline-watcher.md (token-doesnt-expire requirement)
// Triggered by: pg_cron `sf_token_keepalive` (migration 109)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse, handleCors } from '../_shared/cors.ts'

const SF_LOGIN_URL = 'https://login.salesforce.com'
const BRIDGE_URL = Deno.env.get('BRIDGE_URL') || 'https://bridge.yuno.tools'

interface SfConnection {
  id: string
  org_id: string
  access_token: string
  refresh_token: string
  instance_url: string
  sf_user_id: string
  is_active: boolean
  last_sync_at: string | null
  last_error: string | null
}

async function refreshOne(conn: SfConnection): Promise<{ ok: boolean; error?: string; refreshed?: boolean }> {
  const clientId = Deno.env.get('SALESFORCE_CLIENT_ID')
  const clientSecret = Deno.env.get('SALESFORCE_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    return { ok: false, error: 'Missing SALESFORCE_CLIENT_ID/SECRET on edge fn' }
  }

  // Optimistic check: is current access_token still valid?
  try {
    const testRes = await fetch(`${conn.instance_url}/services/data/v59.0/limits`, {
      headers: { Authorization: `Bearer ${conn.access_token}` },
    })
    if (testRes.ok) {
      return { ok: true, refreshed: false }
    }
  } catch {
    // fall through to refresh
  }

  // Refresh against SF OAuth endpoint
  const tokenRes = await fetch(`${SF_LOGIN_URL}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: conn.refresh_token,
    }),
  })
  const data = await tokenRes.json()
  if (!tokenRes.ok || !data.access_token) {
    return { ok: false, error: `refresh_failed: ${JSON.stringify(data).substring(0, 250)}` }
  }

  // Persist refreshed token
  const supabase = createSupabaseClient()
  const newInstanceUrl = data.instance_url || conn.instance_url
  await supabase
    .from('salesforce_connections')
    .update({
      access_token: data.access_token,
      instance_url: newInstanceUrl,
      is_active: true,
      last_error: null,
      last_sync_at: new Date().toISOString(),
    })
    .eq('id', conn.id)

  return { ok: true, refreshed: true }
}

async function notifyFailure(orgId: string, error: string): Promise<void> {
  // Send WhatsApp via existing bridge callback. Bridge resolves number from org.
  try {
    await fetch(`${BRIDGE_URL}/api/agent-callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_name: 'Paula',
        result: {
          text:
            '🚨 Salesforce token refresh failed\n\n' +
            'Auto-keepalive could not refresh your SF connection. ' +
            'Daily runs will fail until you reconnect.\n\n' +
            `Error: ${error.substring(0, 200)}\n\n` +
            'Reconnect: https://chief.yuno.tools/settings (Integrations → Salesforce → Connect)',
        },
        whatsapp_number: null, // bridge resolves from org
        severity: 'error',
      }),
    })
  } catch (e) {
    console.error('Failed to send WhatsApp alert:', e)
  }
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const supabase = createSupabaseClient()

    // Optional: scope to a specific org (when called manually)
    let bodyOrgId: string | null = null
    try {
      const body = await req.json()
      bodyOrgId = body?.org_id || null
    } catch {
      // no body - run for all
    }

    // Read connections to refresh. Include is_active=false so we can detect
    // already-broken connections and not send duplicate alerts (we only alert
    // when transitioning from active → broken).
    let query = supabase
      .from('salesforce_connections')
      .select('id, org_id, access_token, refresh_token, instance_url, sf_user_id, is_active, last_sync_at, last_error')

    if (bodyOrgId) query = query.eq('org_id', bodyOrgId)

    const { data: connections, error } = await query
    if (error) return errorResponse(error.message, 500)

    const results: Array<{ org_id: string; ok: boolean; refreshed?: boolean; error?: string; alerted?: boolean }> = []

    for (const conn of (connections || []) as SfConnection[]) {
      const result = await refreshOne(conn)

      if (!result.ok) {
        // Mark connection inactive + persist error
        await supabase
          .from('salesforce_connections')
          .update({ is_active: false, last_error: result.error || 'unknown' })
          .eq('id', conn.id)

        // Only alert if THIS run is the one that broke it (transition active → broken)
        // — avoids spamming when admin already knows it's broken.
        let alerted = false
        if (conn.is_active) {
          await notifyFailure(conn.org_id, result.error || 'unknown')
          alerted = true
        }
        results.push({ org_id: conn.org_id, ok: false, error: result.error, alerted })
      } else {
        results.push({ org_id: conn.org_id, ok: true, refreshed: result.refreshed })
      }
    }

    return jsonResponse({
      checked: results.length,
      ok_count: results.filter(r => r.ok).length,
      failed_count: results.filter(r => !r.ok).length,
      results,
    })
  } catch (error) {
    console.error('salesforce-keepalive error:', error)
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500)
  }
})
