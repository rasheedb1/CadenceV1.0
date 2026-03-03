// Edge Function: Send Email via Unipile
// POST /functions/v1/send-email
// Sends an email through the user's connected Gmail account via Unipile API

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
  bodyType?: 'text/html' | 'text/plain'  // defaults to text/html
  replyToMessageId?: string  // gmail_message_id to reply to (for email threading)
  ownerId?: string // For service-role calls from process-queue
  orgId?: string   // For service-role calls from process-queue
}

serve(async (req: Request) => {
  // Handle CORS
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    // Authenticate user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('Missing authorization header', 401)
    }

    // Parse request body
    const requestBody: SendEmailRequest = await req.json()
    const {
      leadId,
      cadenceId,
      cadenceStepId,
      scheduleId,
      instanceId,
      to,
      subject,
      body: emailBody,
      bodyType,
      replyToMessageId,
      ownerId,
      orgId,
    } = requestBody

    const ctx = await getAuthContext(authHeader, { ownerId, orgId })
    if (!ctx) {
      return errorResponse('Unauthorized', 401)
    }

    // Get Unipile credentials
    const unipileDsn = Deno.env.get('UNIPILE_DSN')
    const unipileAccessToken = Deno.env.get('UNIPILE_ACCESS_TOKEN')

    if (!unipileDsn || !unipileAccessToken) {
      console.error('Missing Unipile credentials')
      return errorResponse('Unipile integration not configured', 500)
    }

    const baseUrl = `https://${unipileDsn}`
    const supabase = createSupabaseClient()

    // Get Gmail account ID from unipile_accounts
    const { data: gmailAccount, error: gmailError } = await supabase
      .from('unipile_accounts')
      .select('account_id')
      .eq('user_id', ctx.userId)
      .eq('provider', 'EMAIL')
      .eq('status', 'active')
      .single()

    if (gmailError || !gmailAccount?.account_id) {
      console.error('No active Gmail account found for user:', ctx.userId)
      return errorResponse('No Gmail account found. Please connect your Gmail account in Settings and try again.')
    }

    const gmailAccountId = gmailAccount.account_id
    console.log(`Using Gmail Unipile account: ${gmailAccountId}`)

    // Get lead info if leadId provided — also resolve email address
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
        // Use lead's email if 'to' was not provided
        if (!recipientEmail && lead.email) {
          recipientEmail = lead.email
        }
        console.log(`Sending email to lead: ${leadName} <${recipientEmail}>`)
      }
    }

    // Validate required fields
    if (!recipientEmail) {
      return errorResponse('No email address found. Either provide "to" or ensure the lead has an email.')
    }
    if (!subject) {
      return errorResponse('subject is required')
    }
    // Check for truly empty body (including HTML-wrapped empty content like "<p></p>")
    const strippedBody = emailBody?.replace(/<[^>]*>/g, '').trim()
    if (!emailBody || !strippedBody) {
      return errorResponse('body is required (email body is empty)')
    }

    // ── Email open tracking: inject pixel + create email_messages record ──
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const eventId = crypto.randomUUID()
    let trackedBody = emailBody

    // Only inject tracking pixel for HTML emails
    if (bodyType !== 'text/plain') {
      const pixelUrl = `${supabaseUrl}/functions/v1/track-email-open?eid=${eventId}`
      const pixelTag = `<img src="${pixelUrl}" width="1" height="1" style="display:none" alt="" />`

      if (trackedBody.includes('</body>')) {
        trackedBody = trackedBody.replace('</body>', `${pixelTag}</body>`)
      } else {
        trackedBody = trackedBody + pixelTag
      }
    }

    // Create email_messages record for tracking
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

    // Send email via Unipile API with retry for transient errors (502/503/504)
    console.log(`Sending email to: ${recipientEmail}, subject: ${subject}, event_id: ${eventId}`)

    const emailPayload: Record<string, unknown> = {
      account_id: gmailAccountId,
      to: [{ display_name: leadName || recipientEmail, identifier: recipientEmail }],
      subject: subject,
      body: trackedBody,
    }

    // Add body_type if explicitly set to text/plain (default is text/html)
    if (bodyType === 'text/plain') emailPayload.body_type = 'text/plain'

    // Add reply_to for email threading (follow-up in same thread)
    // Unipile expects the Unipile email `id` (e.g. "n_3LLSdEUqWX-InHajCaFA") — stored in email_messages.gmail_message_id
    if (replyToMessageId) {
      emailPayload.reply_to = replyToMessageId
      console.log(`Threading reply onto Unipile email ID: ${replyToMessageId}`)
    }

    const MAX_RETRIES = 2
    let response: Response | null = null
    let lastError = ''

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        console.log(`Retry attempt ${attempt + 1} after transient error...`)
        await new Promise(r => setTimeout(r, 2000 * attempt))
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 25000) // 25s timeout per attempt

      try {
        response = await fetch(`${baseUrl}/api/v1/emails`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': unipileAccessToken,
          },
          body: JSON.stringify(emailPayload),
          signal: controller.signal,
        })
        clearTimeout(timeout)

        // If success or non-retryable error, break out
        if (response.ok || ![502, 503, 504].includes(response.status)) {
          break
        }

        lastError = await response.text()
        console.warn(`Unipile returned ${response.status} on attempt ${attempt + 1}: ${lastError}`)
      } catch (fetchErr) {
        clearTimeout(timeout)
        if (fetchErr instanceof DOMException && fetchErr.name === 'AbortError') {
          lastError = 'Request timed out after 25 seconds'
          console.warn(`Unipile request timed out on attempt ${attempt + 1}`)
        } else {
          lastError = fetchErr instanceof Error ? fetchErr.message : 'Network error'
          console.warn(`Fetch error on attempt ${attempt + 1}: ${lastError}`)
        }
        response = null
      }
    }

    if (!response || !response.ok) {
      const errorText = response ? (lastError || await response.text()) : lastError
      const statusCode = response?.status || 504
      console.error('Unipile email API error after retries:', statusCode, errorText)

      // Friendly error message based on status
      const userMessage = statusCode === 504 || !response
        ? 'Gmail no respondio a tiempo. Tu conexion de Gmail puede haber expirado — ve a Settings para reconectar.'
        : `Error enviando email: ${response.statusText}`

      // Update email_messages status to failed
      await supabase
        .from('email_messages')
        .update({ status: 'failed', last_error: errorText })
        .eq('event_id', eventId)

      // Log failure
      await logActivity({
        ownerId: ctx.userId,
        orgId: ctx.orgId,
        cadenceId,
        cadenceStepId,
        leadId,
        action: 'email',
        status: 'failed',
        details: { error: errorText, to: recipientEmail, subject },
      })

      // Update schedule status if provided
      if (scheduleId) {
        await supabase
          .from('schedules')
          .update({
            status: 'failed',
            last_error: errorText,
            updated_at: new Date().toISOString(),
          })
          .eq('id', scheduleId)
      }

      // Update instance status if provided
      if (instanceId) {
        await supabase
          .from('lead_step_instances')
          .update({
            status: 'failed',
            last_error: errorText,
            updated_at: new Date().toISOString(),
          })
          .eq('id', instanceId)
      }

      return errorResponse(userMessage, statusCode)
    }

    const result = await response.json()
    console.log('Unipile email send response:', JSON.stringify(result))

    // Try to get email ID from POST response first
    let emailId: string | null = result?.id || result?.message_id || result?.email_id || result?.object_id || null

    // If POST didn't return an ID (Unipile sometimes returns just {}), fetch the sent email
    // from the listing API to get the Unipile email ID needed for reply threading
    if (!emailId) {
      console.log('No email ID in POST response — fetching sent email from Unipile listing...')
      try {
        // Small wait to allow Unipile to index the sent email
        await new Promise(r => setTimeout(r, 2000))
        const listRes = await fetch(
          `${baseUrl}/api/v1/emails?account_id=${gmailAccountId}&role=SENT&limit=5`,
          { headers: { 'X-API-KEY': unipileAccessToken } }
        )
        if (listRes.ok) {
          const listData = await listRes.json()
          const items: Array<Record<string, unknown>> = listData?.items || listData?.data || []
          // Find the email we just sent by matching recipient + subject
          const normalizeSubject = (s: string) => s.replace(/^re:\s*/i, '').trim().toLowerCase()
          const sent = items.find((e) => {
            const toIds = (e.to_attendees as Array<{identifier: string}> || []).map(a => a.identifier)
            const subjectMatch = normalizeSubject(e.subject as string || '') === normalizeSubject(subject)
            const recipientMatch = toIds.some(id => id.toLowerCase() === recipientEmail.toLowerCase())
            return subjectMatch && recipientMatch
          }) || items[0] // fallback to most recent
          if (sent?.id) {
            emailId = sent.id as string
            console.log(`Retrieved Unipile email ID from listing: ${emailId}`)
          }
        }
      } catch (err) {
        console.warn('Could not retrieve email ID from Unipile listing:', err)
      }
    }

    if (!emailId) {
      console.warn('WARNING: Could not obtain Unipile email ID. Reply threading will not work.')
    }

    // Update email_messages status to sent
    await supabase
      .from('email_messages')
      .update({ status: 'sent', gmail_message_id: emailId, sent_at: new Date().toISOString() })
      .eq('event_id', eventId)

    // Log success
    await logActivity({
      ownerId: ctx.userId,
      orgId: ctx.orgId,
      cadenceId,
      cadenceStepId,
      leadId,
      action: 'email',
      status: 'ok',
      details: { emailId, to: recipientEmail, subject },
    })

    // Track company as prospected in registry
    if (leadCompany) {
      trackProspectedCompany({
        ownerId: ctx.userId,
        orgId: ctx.orgId,
        companyName: leadCompany,
        prospectedVia: 'email',
      })
    }

    // Update schedule status if provided
    if (scheduleId) {
      await supabase
        .from('schedules')
        .update({ status: 'executed', updated_at: new Date().toISOString() })
        .eq('id', scheduleId)
    }

    // Update instance status if provided
    if (instanceId) {
      await supabase
        .from('lead_step_instances')
        .update({
          status: 'sent',
          result_snapshot: result,
          updated_at: new Date().toISOString(),
        })
        .eq('id', instanceId)
    }

    return jsonResponse({
      success: true,
      emailId,
    })
  } catch (error) {
    console.error('Error sending email:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500
    )
  }
})
