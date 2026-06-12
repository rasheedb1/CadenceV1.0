// Edge Function: Send Email via Gmail API (direct Google integration)
// POST /functions/v1/send-email

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient, getAuthContext, logActivity, trackProspectedCompany } from '../_shared/supabase.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { scanFields, summarizeHits } from '../_shared/placeholder-guard.ts'

interface EmailAttachment {
  filename: string
  contentBase64: string  // raw base64 (NOT data: URL)
  contentType: string    // MIME type, e.g. "application/pdf"
}

interface SendEmailRequest {
  leadId: string
  cadenceId?: string
  cadenceStepId?: string
  scheduleId?: string
  instanceId?: string
  to: string          // email address
  cc?: string         // comma-separated CC addresses
  subject: string
  body: string        // HTML body
  bodyType?: 'text/html' | 'text/plain'
  replyToMessageId?: string  // gmail threadId for reply threading
  attachments?: EmailAttachment[]  // V14: explicit base64 attachments (multipart/mixed)
  /**
   * V14b: When set, send-email internally fetches the deck PDF from
   * bridge.yuno.tools/api/{sdr-bc|m}/<slug>/pdf (using the lead's
   * account_map_company_id to look up the slug) and attaches it.
   * Avoids the ~6MB request body limit that blocks passing big PDFs
   * via the explicit `attachments` field. Falls back silently if the
   * PDF can't be fetched.
   */
  attachDeck?: 'sdr_bc' | 'ss_deck'
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

// RFC 2822 headers must be ASCII. Non-ASCII subjects (emojis, accents) need
// RFC 2047 encoded-word syntax, otherwise Gmail's web UI renders them as mojibake.
function encodeHeaderValue(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach(b => { binary += String.fromCharCode(b) })
  return `=?UTF-8?B?${btoa(binary)}?=`
}

function buildRfc2822({ to, from, subject, html, replyToThreadId, cc, attachments }: {
  to: string
  from: string
  subject: string
  html: string
  replyToThreadId?: string | null
  cc?: string | null
  attachments?: EmailAttachment[] | null
}): string {
  const hasAttachments = attachments && attachments.length > 0

  const headers: string[] = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${encodeHeaderValue(subject)}`,
    'MIME-Version: 1.0',
  ]
  if (cc) headers.push(`Cc: ${cc}`)
  if (replyToThreadId) {
    headers.push(`In-Reply-To: <${replyToThreadId}>`)
    headers.push(`References: <${replyToThreadId}>`)
  }

  if (!hasAttachments) {
    // Simple single-part HTML message
    headers.push('Content-Type: text/html; charset=UTF-8')
    return [...headers, '', html].join('\r\n')
  }

  // V14: multipart/mixed for attachments
  // V17: chunk-based assembly avoids holding multiple full copies of big PDF
  // strings in memory (was causing WORKER_RESOURCE_LIMIT for 9MB+ PDFs).
  const boundary = `=_yuno_${crypto.randomUUID().replace(/-/g, '')}`
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)

  const chunks: string[] = []
  chunks.push(headers.join('\r\n'))
  chunks.push('\r\n\r\n')
  chunks.push(`--${boundary}\r\n`)
  chunks.push('Content-Type: text/html; charset=UTF-8\r\n')
  chunks.push('Content-Transfer-Encoding: 7bit\r\n\r\n')
  chunks.push(html)
  chunks.push('\r\n')

  for (const att of attachments!) {
    chunks.push(`--${boundary}\r\n`)
    chunks.push(`Content-Type: ${att.contentType}; name="${att.filename}"\r\n`)
    chunks.push(`Content-Disposition: attachment; filename="${att.filename}"\r\n`)
    chunks.push('Content-Transfer-Encoding: base64\r\n\r\n')
    // Skip 76-char line wrapping (Gmail accepts long base64 lines just fine,
    // and the regex `.match(/.{1,76}/g)` on a 12MB string was the CPU hog).
    chunks.push(att.contentBase64)
    chunks.push('\r\n')
  }
  chunks.push(`--${boundary}--\r\n`)
  return chunks.join('')
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
      to, cc, subject, body: emailBody, bodyType, replyToMessageId, attachments, attachDeck,
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

    // ── V14b: server-side deck PDF fetch (bypasses request body limit) ───
    // When attachDeck is set, fetch the PDF internally and add to attachments.
    // Mirrors process-queue's fetchDeckPdfForLead helper — see comment there.
    let finalAttachments = attachments ? [...attachments] : []
    if (attachDeck && leadId) {
      const fetched = await fetchDeckPdfInternal(supabase, leadId, attachDeck)
      if (fetched) {
        finalAttachments.push(fetched)
        console.log(`[send-email] internally fetched ${attachDeck} PDF (${fetched.filename})`)
      } else {
        console.log(`[send-email] attachDeck=${attachDeck} requested but PDF unavailable — sending without`)
      }
    }

    // ── PLACEHOLDER GUARD ─────────────────────────────────────────────────
    // Last line of defense: refuse to send if subject or body contain
    // unsubstituted template variables ({{first_name}}, {company}, [BC_URL], etc.)
    const phHits = scanFields({ subject, body: emailBody })
    if (phHits.length > 0) {
      const summary = summarizeHits(phHits)
      console.error(`[send-email] BLOCKED — placeholder leak: ${summary}`)
      await logActivity({
        ownerId: ctx.userId,
        orgId: ctx.orgId,
        leadId: leadId || null,
        action: 'send_email',
        status: 'failed',
        details: { error: 'placeholder_leak_blocked', placeholders: phHits.map(h => ({ field: h.field, pattern: h.pattern, match: h.match })) },
      })
      return errorResponse(`BLOCKED: unsubstituted placeholders detected — ${summary}`, 422)
    }

    // ── Append Gmail signature for NEW threads only (V14) ─────────────────
    // The user's Gmail signature (configured via Gmail web UI) is fetched
    // via Gmail API settings/sendAs and appended to the body. Replies
    // (replyToMessageId set) skip this — Gmail standard convention is signature
    // only on the first message of a thread.
    let bodyWithSig = emailBody
    const isReply = !!replyToMessageId
    if (!isReply) {
      const signature = await getGmailSignature(gmailAuth.token, gmailAuth.email)
      if (signature) {
        if (bodyType === 'text/plain') {
          const plainSig = signature.replace(/<[^>]*>/g, '').trim()
          bodyWithSig = `${emailBody}\n\n${plainSig}`
        } else {
          // wrap each newline-separated line so the signature renders correctly
          bodyWithSig = `${emailBody}<br><br>${signature}`
        }
        console.log(`[send-email] appended Gmail signature (${signature.length} chars) for new thread to ${recipientEmail}`)
      } else {
        console.log(`[send-email] no Gmail signature configured (or fetch failed) for ${gmailAuth.email}`)
      }
    } else {
      console.log(`[send-email] reply detected (threadId=${replyToMessageId}) — skipping signature append`)
    }

    // ── Inject tracking pixel ──
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const eventId = crypto.randomUUID()
    let trackedBody = bodyWithSig

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
      html_body_original: bodyWithSig,
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
      cc: cc || null,
      attachments: finalAttachments.length > 0 ? finalAttachments : null,
    })
    if (finalAttachments.length > 0) {
      console.log(`[send-email] attached ${finalAttachments.length} file(s): ${finalAttachments.map(a => a.filename).join(', ')}`)
    }

    // V18: for messages WITH attachments, use Gmail's uploadType=media
    // endpoint which accepts the raw RFC 2822 directly as the request body
    // (Content-Type: message/rfc822). This avoids the extra base64 layer +
    // JSON wrapping that the standard /messages/send requires (which would
    // double the in-memory size and trigger WORKER_RESOURCE_LIMIT for big
    // PDFs).
    // For threadId on replies, the upload endpoint accepts it as a URL param.
    console.log(`Sending email via Gmail API to: ${recipientEmail}, subject: ${subject}, event_id: ${eventId}`)

    const hasAttachments = finalAttachments.length > 0
    let sendResp: Response
    if (hasAttachments) {
      // Multipart/related upload: metadata (JSON) + raw message body
      const uploadBoundary = `=_upload_${crypto.randomUUID().replace(/-/g, '')}`
      const metadata: Record<string, unknown> = {}
      if (replyToMessageId) metadata.threadId = replyToMessageId
      const uploadBody =
        `--${uploadBoundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(metadata)}\r\n` +
        `--${uploadBoundary}\r\n` +
        `Content-Type: message/rfc822\r\n\r\n` +
        `${rawMessage}\r\n` +
        `--${uploadBoundary}--`

      sendResp = await fetch(
        'https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=multipart',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${gmailAuth.token}`,
            'Content-Type': `multipart/related; boundary=${uploadBoundary}`,
          },
          body: uploadBody,
        }
      )
    } else {
      // No attachments → standard /messages/send with JSON body (smaller payload)
      const gmailBody: Record<string, unknown> = {
        raw: toBase64Url(rawMessage),
      }
      if (replyToMessageId) gmailBody.threadId = replyToMessageId

      sendResp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${gmailAuth.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(gmailBody),
      })
    }

    if (!sendResp.ok) {
      const errText = await sendResp.text()
      console.error('Gmail API send error:', sendResp.status, errText)

      // ════════════════════════════════════════════════════════════════
      // BOUNCE DETECTION (migration 110): parse SMTP 550/553 → mark lead invalid
      // ════════════════════════════════════════════════════════════════
      // Gmail returns errors with patterns like:
      //   "550 5.1.1 The email account that you tried to reach does not exist"
      //   "553 5.1.1 The recipient address ... does not match"
      //   "550 5.7.1 ... bounced"
      // Match SMTP enhanced status codes 5.X.X (permanent errors)
      const isPermanentBounce = /\b(550|553|554)\b/.test(errText) ||
                                /\b5\.\d+\.\d+\b/.test(errText) ||
                                /does not exist|invalid recipient|recipient address rejected|user unknown|mailbox unavailable|no such user/i.test(errText)

      if (isPermanentBounce && leadId) {
        console.log(`[send-email] Permanent bounce detected for lead ${leadId} → marking email_invalid`)
        try {
          await supabase.rpc('mark_lead_email_invalid', {
            p_lead_id: leadId,
            p_bounce_reason: errText.slice(0, 500),
          })
        } catch (bounceErr) {
          console.error('Failed to mark lead email_invalid:', bounceErr)
        }
      }

      await supabase
        .from('email_messages')
        .update({ status: 'failed', last_error: errText })
        .eq('event_id', eventId)

      await logActivity({
        ownerId: ctx.userId, orgId: ctx.orgId, cadenceId, cadenceStepId, leadId,
        action: 'email', status: 'failed',
        details: { error: errText, to: recipientEmail, subject, permanent_bounce: isPermanentBounce },
      })

      if (scheduleId) {
        await supabase.from('schedules').update({
          status: isPermanentBounce ? 'skipped_due_to_state_change' : 'failed',
          last_error: errText,
          updated_at: new Date().toISOString(),
        }).eq('id', scheduleId)
      }
      if (instanceId) {
        await supabase.from('lead_step_instances').update({
          status: isPermanentBounce ? 'skipped' : 'failed',
          last_error: errText,
          updated_at: new Date().toISOString(),
        }).eq('id', instanceId)
      }

      const userMessage = sendResp.status === 401
        ? 'Tu conexión de Gmail expiró. Ve a Settings para reconectar tu cuenta de Google.'
        : isPermanentBounce
          ? `Email permanente rechazado (lead marcado como inválido): ${errText.slice(0, 200)}`
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

/**
 * V14b: Compute the bridge HMAC bypass token (sha256(slug, BC_PRINT_SECRET)[:16]).
 * Mirrors openclaw/bridge/server.js + process-queue/computePrintToken.
 */
async function computeBridgePrintToken(slug: string): Promise<string | null> {
  const secret = Deno.env.get('BC_PRINT_SECRET') || ''
  if (!secret) {
    console.warn('[fetchDeckPdfInternal] BC_PRINT_SECRET not set')
    return null
  }
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(slug))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
}

/**
 * V14b: Internally fetch the deck PDF for the lead's company (server-to-server,
 * bypasses request body size limits). Used when caller passes attachDeck flag.
 */
async function fetchDeckPdfInternal(
  supabase: ReturnType<typeof createSupabaseClient>,
  leadId: string,
  kind: 'sdr_bc' | 'ss_deck',
): Promise<{ filename: string; contentBase64: string; contentType: string } | null> {
  try {
    const { data: leadRow } = await supabase
      .from('leads')
      .select('account_map_company_id, company')
      .eq('id', leadId)
      .maybeSingle()
    const amcId = leadRow?.account_map_company_id
    if (!amcId) return null

    const slugCol = kind === 'sdr_bc' ? 'sdr_bc_slug' : 'ss_deck_slug'
    const b64Col = kind === 'sdr_bc' ? 'sdr_bc_pdf_b64' : 'ss_deck_pdf_b64'
    const filenamePrefix = kind === 'sdr_bc' ? 'yuno-bc' : 'yuno-overview'

    // V18: read pre-encoded PDF base64 from amc (cached by
    // chief-prepare-decks-for-company). Avoids the bridge fetch + encode at
    // send time which was burning CPU/wall-time on the edge function.
    const { data: amc } = await supabase
      .from('account_map_companies')
      .select(`${slugCol}, ${b64Col}, company_name`)
      .eq('id', amcId)
      .maybeSingle()
    const amcRow = amc as Record<string, unknown> | null
    if (!amcRow) return null

    const cachedB64 = amcRow[b64Col] as string | null
    const slug = amcRow[slugCol] as string | null
    if (!slug) {
      console.log(`[fetchDeckPdfInternal ${kind}] amc ${amcId} has no ${slugCol}`)
      return null
    }
    if (!cachedB64 || cachedB64.length === 0) {
      console.log(`[fetchDeckPdfInternal ${kind}] amc ${amcId} has no cached PDF b64 — run chief-prepare-decks-for-company to populate`)
      return null
    }

    const companyName = amcRow.company_name as string | undefined
    const companySlug = (companyName || leadRow?.company || 'deck')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)
    return {
      filename: `${filenamePrefix}-${companySlug}.pdf`,
      contentBase64: cachedB64,
      contentType: 'application/pdf',
    }
  } catch (err) {
    console.warn(`[fetchDeckPdfInternal ${kind}] error:`, (err as Error).message)
    return null
  }
}

/**
 * Fetch the user's Gmail signature via Gmail API settings/sendAs endpoint.
 * Returns HTML signature (as Gmail stores it) or null if:
 *   - No sendAs configured
 *   - API call fails (token issues, scope missing, etc.)
 *   - Signature field is empty
 *
 * Match strategy: prefer sendAsEmail matching `fromEmail`, then primary, then first.
 * Requires `gmail.settings.basic` scope (included in our unified Google OAuth).
 */
async function getGmailSignature(token: string, fromEmail?: string | null): Promise<string | null> {
  try {
    const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!resp.ok) {
      console.warn(`[getGmailSignature] sendAs fetch failed: ${resp.status} ${await resp.text().catch(() => '')}`.slice(0, 200))
      return null
    }
    const data = await resp.json() as { sendAs?: Array<{ sendAsEmail?: string; isPrimary?: boolean; signature?: string }> }
    const list = data.sendAs || []
    if (list.length === 0) return null
    const match = (fromEmail && list.find(s => s.sendAsEmail?.toLowerCase() === fromEmail.toLowerCase()))
      || list.find(s => s.isPrimary)
      || list[0]
    const sig = match?.signature?.trim()
    return sig && sig.length > 0 ? sig : null
  } catch (e) {
    console.warn('[getGmailSignature] error:', (e as Error).message)
    return null
  }
}
