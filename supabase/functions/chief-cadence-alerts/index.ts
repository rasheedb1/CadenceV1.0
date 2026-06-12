// chief-cadence-alerts
// =============================================================================
// Daily health check for each org running Chief Outreach. Fetches
// get_cadence_health_metrics(org, 24) and emails the connected Gmail account
// when any threshold breaches. Anti-spam via claim_cadence_alert_slot RPC
// (one alert per kind per UTC date).
//
// Delivery: Gmail API directly using the org's connected ae_integrations
// (provider='gmail') refresh_token. Chosen over WhatsApp because Meta's 24h
// customer-service window + template approval process make WhatsApp the wrong
// channel for unattended system notifications.
//
// Trigger: pg_cron at 12:00 UTC (~8am ET) daily.
// Manual: POST with { orgId?: string, dry_run?: boolean }
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'

interface AlertCheck {
  kind: string
  triggered: boolean
  severity: 'warn' | 'crit'
  summary: string
}

interface HealthMetrics {
  outreach_enabled?: boolean
  emails_sent?: number
  emails_failed?: number
  emails_bounced?: number
  schedules_executed?: number
  schedules_failed?: number
  schedules_skipped?: number
  qa_reviews_total?: number
  qa_rejected?: number
  qa_auto_passed?: number
  queue_stuck_processing?: number
  queue_pending?: number
  amc_missing_ss_deck?: number
  amc_missing_sdr_bc?: number
  amc_missing_ss_pdf_b64?: number
  pre_approved_remaining?: number
  replies_received?: number
  daily_target_companies?: number
  window_hours?: number
  computed_at?: string
}

function evaluate(m: HealthMetrics): AlertCheck[] {
  const out: AlertCheck[] = []
  const sent = m.emails_sent ?? 0
  const failed = m.emails_failed ?? 0
  const bounced = m.emails_bounced ?? 0
  const totalAttempts = sent + failed + bounced

  if (totalAttempts >= 10) {
    const bounceRate = bounced / totalAttempts
    if (bounceRate > 0.05) {
      out.push({
        kind: 'high_bounce_rate',
        triggered: true,
        severity: 'crit',
        summary: `Bounce rate ${(bounceRate * 100).toFixed(1)}% (${bounced}/${totalAttempts} últimas 24h, umbral 5%). Revisa Apollo enrichment + email verification.`,
      })
    }
  }

  const qaTotal = m.qa_reviews_total ?? 0
  const qaReject = m.qa_rejected ?? 0
  if (qaTotal >= 5) {
    const qaRate = qaReject / qaTotal
    if (qaRate > 0.30) {
      out.push({
        kind: 'high_qa_reject_rate',
        triggered: true,
        severity: 'warn',
        summary: `QA rejection ${(qaRate * 100).toFixed(0)}% (${qaReject}/${qaTotal} últimas 24h, umbral 30%). Revisa prompts/value-props.`,
      })
    }
  }

  const target = m.daily_target_companies ?? 0
  if (m.outreach_enabled !== false && target > 0 && sent === 0 && totalAttempts === 0) {
    out.push({
      kind: 'zero_sends_with_target',
      triggered: true,
      severity: 'crit',
      summary: `0 emails enviados últimas 24h aunque daily target=${target}. Pipeline detenido. Revisa logs de chief-process-queue-batch + cron schedule.`,
    })
  }

  const stuck = m.queue_stuck_processing ?? 0
  if (stuck > 0) {
    out.push({
      kind: 'queue_stuck',
      triggered: true,
      severity: 'warn',
      summary: `${stuck} fila(s) trabadas en status=processing >1hr. Worker crash o timeout. Revisar queue_aging view.`,
    })
  }

  const missingSs = m.amc_missing_ss_pdf_b64 ?? 0
  if (missingSs > 0) {
    out.push({
      kind: 'decks_missing',
      triggered: true,
      severity: 'warn',
      summary: `${missingSs} empresa(s) con leads activos pero sin ss_deck_pdf_b64 cacheado. Adjuntos van a fallar. Trigger chief-prepare-decks-for-company manualmente.`,
    })
  }

  const remaining = m.pre_approved_remaining ?? 0
  if (target > 0 && remaining > 0 && remaining < target * 7) {
    out.push({
      kind: 'pre_approved_low',
      triggered: true,
      severity: 'warn',
      summary: `Pre-approved list: ${remaining} empresas restantes (<7 días de runway a ${target}/día). Pásame nueva lista.`,
    })
  }

  if (target > 0 && remaining === 0) {
    out.push({
      kind: 'pre_approved_empty',
      triggered: true,
      severity: 'crit',
      summary: `Pre-approved list AGOTADA. Pipeline se detendrá. Carga lista nueva o activa fallback LLM.`,
    })
  }

  return out
}

// ── Gmail send helpers ──────────────────────────────────────────────────────

async function refreshGoogleAccessToken(refreshToken: string): Promise<string | null> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) return null
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
  return data?.access_token || null
}

function buildAlertEmail(opts: {
  from: string
  to: string
  subject: string
  htmlBody: string
}): string {
  const boundary = `------=_Part_${crypto.randomUUID()}`
  const headers = [
    `From: Chief Outreach Monitor <${opts.from}>`,
    `To: ${opts.to}`,
    `Subject: ${encodeRfc2047(opts.subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
  ].join('\r\n')
  const body = [
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    opts.htmlBody,
    ``,
    `--${boundary}--`,
    ``,
  ].join('\r\n')
  return headers + '\r\n' + body
}

function encodeRfc2047(s: string): string {
  if (/^[\x20-\x7e]+$/.test(s)) return s
  return `=?UTF-8?B?${btoa(unescape(encodeURIComponent(s)))}?=`
}

function base64UrlEncode(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function renderHtml(orgId: string, alerts: AlertCheck[], metrics: HealthMetrics): string {
  const date = new Date().toISOString().slice(0, 10)
  const sev = (a: AlertCheck) => a.severity === 'crit'
    ? '<span style="display:inline-block;padding:2px 8px;background:#dc2626;color:#fff;border-radius:4px;font-size:11px;font-weight:600;text-transform:uppercase">crítico</span>'
    : '<span style="display:inline-block;padding:2px 8px;background:#d97706;color:#fff;border-radius:4px;font-size:11px;font-weight:600;text-transform:uppercase">aviso</span>'
  const alertsHtml = alerts.length > 0
    ? alerts.map(a => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;vertical-align:top">
          ${sev(a)}
          <div style="margin-top:6px;color:#111827;line-height:1.5">${escapeHtml(a.summary)}</div>
          <div style="margin-top:4px;color:#6b7280;font-size:12px;font-family:ui-monospace,monospace">${a.kind}</div>
        </td>
      </tr>`).join('')
    : `<tr><td style="padding:12px 0;color:#16a34a">Sin alertas — pipeline saludable en las últimas 24h.</td></tr>`

  const mRow = (label: string, value: number | string | boolean | undefined) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px">${label}</td><td style="padding:4px 0;color:#111827;font-size:13px;font-family:ui-monospace,monospace">${value ?? '—'}</td></tr>`

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
  <div style="padding:20px 24px;border-bottom:1px solid #e5e7eb;background:#111827;color:#f9fafb">
    <div style="font-weight:600;font-size:16px">Chief Outreach — alerta operacional</div>
    <div style="margin-top:4px;font-size:12px;color:#9ca3af">Snapshot ${date} · ventana últimas 24h</div>
  </div>
  <div style="padding:20px 24px">
    <table style="width:100%;border-collapse:collapse">${alertsHtml}</table>
  </div>
  <div style="padding:20px 24px;border-top:1px solid #e5e7eb;background:#f9fafb">
    <div style="font-weight:600;font-size:13px;color:#374151;margin-bottom:8px">Métricas del pipeline</div>
    <table style="width:100%;border-collapse:collapse">
      ${mRow('Emails enviados', metrics.emails_sent)}
      ${mRow('Emails fallidos', metrics.emails_failed)}
      ${mRow('Emails bounce', metrics.emails_bounced)}
      ${mRow('Schedules executed', metrics.schedules_executed)}
      ${mRow('Schedules failed', metrics.schedules_failed)}
      ${mRow('QA total', metrics.qa_reviews_total)}
      ${mRow('QA rejected', metrics.qa_rejected)}
      ${mRow('Queue pending', metrics.queue_pending)}
      ${mRow('Queue stuck >1hr', metrics.queue_stuck_processing)}
      ${mRow('AMC missing ss_deck', metrics.amc_missing_ss_deck)}
      ${mRow('AMC missing ss_pdf_b64', metrics.amc_missing_ss_pdf_b64)}
      ${mRow('Pre-approved remaining', metrics.pre_approved_remaining)}
      ${mRow('Daily target companies', metrics.daily_target_companies)}
      ${mRow('Outreach enabled', metrics.outreach_enabled)}
    </table>
  </div>
  <div style="padding:16px 24px;border-top:1px solid #e5e7eb;background:#fff;color:#9ca3af;font-size:11px">
    org_id: ${orgId} · Enviado por chief-cadence-alerts. Para silenciar, set <code>outreach_enabled=false</code> via <code>disable_outreach_for_org()</code>.
  </div>
</div>
</body></html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

async function sendEmailAlert(
  supabase: ReturnType<typeof createSupabaseClient>,
  orgId: string,
  alerts: AlertCheck[],
  metrics: HealthMetrics,
): Promise<{ ok: boolean; reason?: string; gmail_message_id?: string }> {
  // Resolve recipient from ae_integrations (provider=gmail)
  const { data: integration, error: intErr } = await supabase
    .from('ae_integrations')
    .select('user_id, refresh_token, config')
    .eq('org_id', orgId)
    .eq('provider', 'gmail')
    .maybeSingle()
  if (intErr) return { ok: false, reason: `ae_integrations_query_failed:${intErr.message}` }
  if (!integration) return { ok: false, reason: 'no_gmail_integration_for_org' }
  const refreshToken = (integration as { refresh_token?: string }).refresh_token
  const email = ((integration as { config?: { email?: string } }).config?.email) as string | undefined
  if (!refreshToken) return { ok: false, reason: 'no_refresh_token' }
  if (!email) return { ok: false, reason: 'no_email_in_integration_config' }

  const accessToken = await refreshGoogleAccessToken(refreshToken)
  if (!accessToken) return { ok: false, reason: 'refresh_token_exchange_failed' }

  const date = new Date().toISOString().slice(0, 10)
  const critCount = alerts.filter(a => a.severity === 'crit').length
  const warnCount = alerts.length - critCount
  const subject = alerts.length === 0
    ? `Chief Outreach — pipeline saludable (${date})`
    : `Chief Outreach — ${critCount} crítico${critCount === 1 ? '' : 's'} + ${warnCount} aviso${warnCount === 1 ? '' : 's'} (${date})`

  const rawMessage = buildAlertEmail({
    from: email,
    to: email,
    subject,
    htmlBody: renderHtml(orgId, alerts, metrics),
  })

  const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: base64UrlEncode(rawMessage) }),
  })
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '')
    return { ok: false, reason: `gmail_api_status_${resp.status}:${errText.slice(0, 200)}` }
  }
  const data = await resp.json() as { id?: string }
  return { ok: true, gmail_message_id: data.id }
}

serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const body = (await req.json().catch(() => ({}))) as {
      orgId?: string
      dry_run?: boolean
      force_send?: boolean // bypass alert threshold + claim_slot — useful for smoke tests
    }
    const supabase = createSupabaseClient()

    let orgRows: Array<{ org_id: string }> = []
    if (body.orgId) {
      orgRows = [{ org_id: body.orgId }]
    } else {
      const { data: orgs } = await supabase
        .from('org_chief_settings')
        .select('org_id, outreach_enabled')
        .eq('outreach_enabled', true)
      orgRows = (orgs || []).map(o => ({ org_id: o.org_id }))
    }

    const results: Array<{
      org_id: string
      metrics?: HealthMetrics
      alerts: AlertCheck[]
      email?: { sent: boolean; reason?: string; gmail_message_id?: string }
    }> = []

    for (const { org_id } of orgRows) {
      const { data: metricsRaw, error: metricsErr } = await supabase.rpc('get_cadence_health_metrics', {
        p_org_id: org_id,
        p_hours_back: 24,
      })
      if (metricsErr) {
        console.warn(`[chief-cadence-alerts] metrics RPC failed for ${org_id}: ${metricsErr.message}`)
        results.push({ org_id, alerts: [], email: { sent: false, reason: `metrics_rpc_failed:${metricsErr.message}` } })
        continue
      }
      const metrics = (metricsRaw || {}) as HealthMetrics
      const alerts = evaluate(metrics)

      if (alerts.length === 0 && !body.force_send) {
        results.push({ org_id, metrics, alerts, email: { sent: false, reason: 'no_thresholds_breached' } })
        continue
      }

      if (body.dry_run) {
        results.push({ org_id, metrics, alerts, email: { sent: false, reason: 'dry_run' } })
        continue
      }

      if (!body.force_send) {
        const { data: claimed, error: claimErr } = await supabase.rpc('claim_cadence_alert_slot', {
          p_org_id: org_id,
          p_alert_kind: 'daily_health_alert',
          p_metrics: metrics as unknown as Record<string, unknown>,
        })
        if (claimErr) {
          console.warn(`[chief-cadence-alerts] claim_cadence_alert_slot failed for ${org_id}: ${claimErr.message}`)
        }
        if (claimed === false) {
          results.push({ org_id, metrics, alerts, email: { sent: false, reason: 'already_alerted_today' } })
          continue
        }
      }

      const sendResult = await sendEmailAlert(supabase, org_id, alerts, metrics)
      results.push({
        org_id,
        metrics,
        alerts,
        email: sendResult,
      })
    }

    return jsonResponse({
      success: true,
      orgs_evaluated: orgRows.length,
      results,
    })
  } catch (err) {
    console.error('chief-cadence-alerts error:', err)
    return errorResponse(`Internal error: ${(err as Error).message}`, 500)
  }
})
