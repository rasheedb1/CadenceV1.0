// Edge Function: Send Email via Gmail API (direct Google integration)
// POST /functions/v1/send-email

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient, getAuthContext, logActivity, trackProspectedCompany } from '../_shared/supabase.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

interface SendEmailRequest {
  leadId: string
  cadenceId?: string
  cadenceStepId?: string
  scheduleId?: string
  instanceId?: string
  to: string          // email address
  subject: string
  body: string        // HTML body
  bodyType?: 'text/html' | 'text/plain'
  replyToMessageId?: string  // gmail threadId for reply threading
  ownerId?: string
  orgId?: string
}

// ── Gmail token helpers ────────────────────────────────────────────────────

interface GmailTokenConfig {
  access_token: string
  refresh_token?: string | null
  expires_at: string
  email?: string | null
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_at: string } | null> {
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
  if (!data.access_token) return null
  return {
    access_token: data.access_token,
    expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
  }
}

async function getValidGmailToken(
  supabase: ReturnType<typeof createSupabaseClient>,
  userId: string,
  orgId: string,
): Promise<{ token: string; email: string | null } | null> {
  const { data: integration } = await supabase
    .from('ae_integrations')
    .select('config, token_expires_at')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .eq('provider', 'gmail')
    .single()

  if (!integration) return null

  const cfg = integration.config as GmailTokenConfig
  if (!cfg?.access_token) return null

  // Check expiry — refresh if within 2 minutes
  const expiresAt = new Date(cfg.expires_at).getTime()
  let accessToken = cfg.access_token

  if (Date.now() > expiresAt - 2 * 60 * 1000 && cfg.refresh_token) {
    const refreshed = await refreshAccessToken(cfg.refresh_token)
    if (refreshed) {
      accessToken = refreshed.access_token
      // Save refreshed token
      await supabase
        .from('ae_integrations')
        .update({
          config: { ...cfg, access_token: refreshed.access_token, expires_at: refreshed.expires_at },
          token_expires_at: refreshed.expires_at,
        })
        .eq('user_id', userId)
        .eq('org_id', orgId)
        .eq('provider', 'gmail')
    }
  }

  return { token: accessToken, email: cfg.email || null }
}

// ── RFC 2822 builder ──────────────────────────────────────────────────────

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  bytes.forEach(b => { binary += String.fromCharCode(b) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function buildRfc2822({ to, from, subject, html, replyToThreadId }: {
  to: string
  from: string
  subject: string
  html: string
  replyToThreadId?: string | null
}): string {
  const lines = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
  ]
  if (replyToThreadId) {
    lines.push(`In-Reply-To: <${replyToThreadId}>`)
    lines.push(`References: <${replyToThreadId}>`)
  }
  lines.push('', html)
  return lines.join('\r\n')
}

// ── Main handler ──────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Missing authorization header', 401)

    const requestBody: SendEmailRequest = await req.json()
    const {
      leadId, cadenceId, cadenceStepId, scheduleId, instanceId,
      to, subject, body: emailBody, bodyType, replyToMessageId,
      ownerId, orgId,
    } = requestBody

    const ctx = await getAuthContext(authHeader, { ownerId, orgId })
    if (!ctx) return errorResponse('Unauthorized', 401)

    const supabase = createSupabaseClient()

    // Get valid Gmail token
    const gmailAuth = await getValidGmailToken(supabase, ctx.userId, ctx.orgId)
    if (!gmailAuth) {
      return errorResponse('No Gmail account found. Please connect your Google account in Settings and try again.')
    }

    // Resolve recipient email and lead info
    let recipientEmail = to
    let leadName: string | null = null
    let leadCompany: string | null = null
    if (leadId) {
      const { data: lead } = await supabase
        .from('leads')
        .select('first_name, last_name, email, company')
        .eq('id', leadId)
        .eq('org_id', ctx.orgId)
        .single()
      if (lead) {
        leadName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || null
        leadCompany = lead.company || null
        if (!recipientEmail && lead.email) recipientEmail = lead.email
      }
    }

    if (!recipientEmail) return errorResponse('No email address found. Either provide "to" or ensure the lead has an email.')
    if (!subject) return errorResponse('subject is required')
    const strippedBody = emailBody?.replace(/<[^>]*>/g, '').trim()
    if (!emailBody || !strippedBody) return errorResponse('body is required (email body is empty)')

    // ── Inject tracking pixel ──
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const eventId = crypto.randomUUID()
    let trackedBody = emailBody

    if (bodyType !== 'text/plain') {
      const pixelUrl = `${supabaseUrl}/functions/v1/track-email-open?eid=${eventId}`
      const pixelTag = `<img src="${pixelUrl}" width="1" height="1" style="display:none" alt="" />`
      trackedBody = trackedBody.includes('</body>')
        ? trackedBody.replace('</body>', `${pixelTag}</body>`)
        : trackedBody + pixelTag
    }

    // Create email_messages record
    await supabase.from('email_messages').insert({
      id: crypto.randomUUID(),
      event_id: eventId,
      owner_user_id: ctx.userId,
      org_id: ctx.orgId,
      lead_id: leadId || null,
      cadence_id: cadenceId || null,
      cadence_step_id: cadenceStepId || null,
      to_email: recipientEmail,
      subject,
      html_body_original: emailBody,
      html_body_tracked: bodyType !== 'text/plain' ? trackedBody : null,
      status: 'queued',
    })

    // ── Build and send via Gmail API ──────────────────────────────────────
    const fromAddress = gmailAuth.email
      ? `${gmailAuth.email}`
      : 'me'

    const rawMessage = buildRfc2822({
      to: leadName ? `${leadName} <${recipientEmail}>` : recipientEmail,
      from: fromAddress,
      subject,
      html: bodyType === 'text/plain' ? emailBody : trackedBody,
      replyToThreadId: replyToMessageId || null,
    })

    const gmailBody: Record<string, unknown> = {
      raw: toBase64Url(rawMessage),
    }
    // If replying, attach to existing thread
    if (replyToMessageId) {
      gmailBody.threadId = replyToMessageId
    }

    console.log(`Sending email via Gmail API to: ${recipientEmail}, subject: ${subject}, event_id: ${eventId}`)

    const sendResp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${gmailAuth.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(gmailBody),
    })

    if (!sendResp.ok) {
      const errText = await sendResp.text()
      console.error('Gmail API send error:', sendResp.status, errText)

      await supabase
        .from('email_messages')
        .update({ status: 'failed', last_error: errText })
        .eq('event_id', eventId)

      await logActivity({
        ownerId: ctx.userId, orgId: ctx.orgId, cadenceId, cadenceStepId, leadId,
        action: 'email', status: 'failed',
        details: { error: errText, to: recipientEmail, subject },
      })

      if (scheduleId) {
        await supabase.from('schedules').update({ status: 'failed', last_error: errText, updated_at: new Date().toISOString() }).eq('id', scheduleId)
      }
      if (instanceId) {
        await supabase.from('lead_step_instances').update({ status: 'failed', last_error: errText, updated_at: new Date().toISOString() }).eq('id', instanceId)
      }

      const userMessage = sendResp.status === 401
        ? 'Tu conexión de Gmail expiró. Ve a Settings para reconectar tu cuenta de Google.'
        : `Error enviando email: ${sendResp.statusText}`
      return errorResponse(userMessage, sendResp.status)
    }

    const result = await sendResp.json()
    // Gmail API returns { id, threadId, labelIds }
    const messageId = result?.id || null
    const threadId = result?.threadId || null
    // Store threadId as gmail_message_id for reply threading in future messages
    const storedId = threadId || messageId

    console.log(`Gmail API success: messageId=${messageId}, threadId=${threadId}`)

    // Update email_messages
    await supabase
      .from('email_messages')
      .update({ status: 'sent', gmail_message_id: storedId, sent_at: new Date().toISOString() })
      .eq('event_id', eventId)

    await logActivity({
      ownerId: ctx.userId, orgId: ctx.orgId, cadenceId, cadenceStepId, leadId,
      action: 'email', status: 'ok',
      details: { messageId, threadId, to: recipientEmail, subject },
    })

    if (leadCompany) {
      trackProspectedCompany({
        ownerId: ctx.userId, orgId: ctx.orgId,
        companyName: leadCompany, prospectedVia: 'email',
      })
    }

    if (scheduleId) {
      await supabase.from('schedules').update({ status: 'executed', updated_at: new Date().toISOString() }).eq('id', scheduleId)
    }
    if (instanceId) {
      await supabase.from('lead_step_instances').update({
        status: 'sent', result_snapshot: result, updated_at: new Date().toISOString(),
      }).eq('id', instanceId)
    }

    return jsonResponse({ success: true, emailId: storedId })

  } catch (error) {
    console.error('Error sending email:', error)
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500)
  }
})
