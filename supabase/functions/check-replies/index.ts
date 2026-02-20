// Edge Function: Check for Replies
// POST /functions/v1/check-replies
// Polls Unipile for inbound messages on active cadence leads.
// If a lead replied, auto-removes them from the cadence and creates a notification.
// Called via cron job every 5 minutes.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient, logActivity } from '../_shared/supabase.ts'
import { createUnipileClient } from '../_shared/unipile.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const supabase = createSupabaseClient()
    const unipile = createUnipileClient()

    // Find conversations that need reply checking:
    // - Have a linkedin_thread_id (we sent a message)
    // - Status is 'messaged' or 'awaiting_reply'
    const { data: conversations, error: convError } = await supabase
      .from('linkedin_conversations')
      .select('id, owner_id, org_id, lead_id, linkedin_thread_id, last_reply_checked_at, last_activity_at')
      .in('status', ['messaged', 'awaiting_reply'])
      .not('linkedin_thread_id', 'is', null)
      .limit(100)

    if (convError) {
      console.error('Error querying conversations:', convError)
      return errorResponse('Failed to query conversations', 500)
    }

    if (!conversations || conversations.length === 0) {
      return jsonResponse({ success: true, checked: 0, repliesFound: 0 })
    }

    // Filter to only conversations where the lead is in an active/scheduled cadence
    const leadIds = [...new Set(conversations.map(c => c.lead_id))]
    const { data: activeCadenceLeads } = await supabase
      .from('cadence_leads')
      .select('lead_id, cadence_id')
      .in('lead_id', leadIds)
      .in('status', ['active', 'scheduled'])

    const activeLeadCadences = new Map<string, string[]>()
    for (const cl of activeCadenceLeads || []) {
      const existing = activeLeadCadences.get(cl.lead_id) || []
      existing.push(cl.cadence_id)
      activeLeadCadences.set(cl.lead_id, existing)
    }

    const conversationsToCheck = conversations.filter(c => activeLeadCadences.has(c.lead_id))

    if (conversationsToCheck.length === 0) {
      return jsonResponse({ success: true, checked: 0, repliesFound: 0, message: 'No active cadence leads to check' })
    }

    console.log(`Checking ${conversationsToCheck.length} conversations for replies`)

    let repliesFound = 0

    for (const conv of conversationsToCheck) {
      try {
        // Fetch recent messages from this thread
        const result = await unipile.getMessages(conv.linkedin_thread_id!, 10)

        if (!result.success || !result.data) {
          console.warn(`Failed to get messages for chat ${conv.linkedin_thread_id}`)
          continue
        }

        const messagesData = result.data as { items?: Array<{ id?: string; is_sender?: boolean; timestamp?: string; text?: string; is_read?: boolean; seen?: boolean; read_at?: string; seen_at?: string; status?: string }> }
        const messages = messagesData?.items || []

        // Check for any inbound message (is_sender === false) newer than last check
        const checkAfter = conv.last_reply_checked_at || conv.last_activity_at || '1970-01-01T00:00:00Z'

        const inboundReplies = messages.filter(msg =>
          msg.is_sender === false &&
          msg.timestamp &&
          new Date(msg.timestamp) > new Date(checkAfter)
        )

        if (inboundReplies.length > 0) {
          repliesFound++
          const latestReply = inboundReplies[0] // Most recent

          console.log(`Reply detected from lead ${conv.lead_id} in chat ${conv.linkedin_thread_id}`)

          // 1. Update conversation status
          await supabase
            .from('linkedin_conversations')
            .update({
              status: 'replied',
              last_reply_checked_at: new Date().toISOString(),
              last_activity_at: latestReply.timestamp || new Date().toISOString(),
            })
            .eq('id', conv.id)

          // 2. Cancel all pending schedules and update cadence_leads for this lead
          const cadenceIds = activeLeadCadences.get(conv.lead_id) || []
          for (const cadenceId of cadenceIds) {
            await supabase
              .from('schedules')
              .update({
                status: 'canceled',
                last_error: 'Lead replied - cadence paused',
                updated_at: new Date().toISOString(),
              })
              .eq('lead_id', conv.lead_id)
              .eq('cadence_id', cadenceId)
              .eq('status', 'scheduled')

            await supabase
              .from('cadence_leads')
              .update({
                status: 'paused',
                updated_at: new Date().toISOString(),
              })
              .eq('lead_id', conv.lead_id)
              .eq('cadence_id', cadenceId)
          }

          // 3. Get lead name for notification
          const { data: lead } = await supabase
            .from('leads')
            .select('first_name, last_name, company')
            .eq('id', conv.lead_id)
            .single()

          const leadName = lead ? `${lead.first_name} ${lead.last_name}`.trim() : 'Lead desconocido'

          // 4. Create notification
          const replyPreview = (latestReply.text || '').substring(0, 200)
          await supabase.from('notifications').insert({
            owner_id: conv.owner_id,
            org_id: conv.org_id,
            lead_id: conv.lead_id,
            cadence_id: cadenceIds[0] || null,
            type: 'reply_detected',
            title: `${leadName} respondio!`,
            body: `${leadName}${lead?.company ? ` de ${lead.company}` : ''} respondio a tu mensaje por LinkedIn. La cadencia fue pausada automaticamente.`,
            channel: 'linkedin',
            metadata: {
              reply_preview: replyPreview,
              linkedin_thread_id: conv.linkedin_thread_id,
              cadence_ids: cadenceIds,
            },
          })

          // 5. Log activity
          await logActivity({
            ownerId: conv.owner_id,
            orgId: conv.org_id,
            cadenceId: cadenceIds[0],
            leadId: conv.lead_id,
            action: 'reply_detected',
            status: 'ok',
            details: {
              reply_preview: replyPreview,
              linkedin_thread_id: conv.linkedin_thread_id,
              channel: 'linkedin',
            },
          })

          // 6. Send email notification to user
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('user_id')
              .eq('user_id', conv.owner_id)
              .single()

            if (profile) {
              // Get user email from auth
              const { data: userData } = await supabase.auth.admin.getUserById(conv.owner_id)
              const userEmail = userData?.user?.email

              if (userEmail) {
                // Find Gmail account for sending notification email
                const { data: gmailAccount } = await supabase
                  .from('unipile_accounts')
                  .select('account_id')
                  .eq('user_id', conv.owner_id)
                  .eq('provider', 'EMAIL')
                  .eq('status', 'active')
                  .single()

                if (gmailAccount?.account_id) {
                  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
                  const serviceKey = Deno.env.get('SERVICE_ROLE_KEY_FULL') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

                  await fetch(`${supabaseUrl}/functions/v1/send-email`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${serviceKey}`,
                    },
                    body: JSON.stringify({
                      to: userEmail,
                      subject: `${leadName} respondio a tu mensaje en LinkedIn`,
                      body: `<p>Hola,</p><p><strong>${leadName}</strong>${lead?.company ? ` de ${lead.company}` : ''} respondio a tu mensaje en LinkedIn.</p>${replyPreview ? `<p><em>"${replyPreview}"</em></p>` : ''}<p>El lead fue pausado automaticamente en la cadencia. Revisa tus notificaciones para elegir que hacer.</p><p>— Chief</p>`,
                    }),
                  })
                  console.log(`Notification email sent to ${userEmail}`)
                }
              }
            }
          } catch (emailError) {
            console.error('Failed to send notification email:', emailError)
            // Non-fatal - notification was still created in DB
          }
        } else {
          // No reply found - update last check timestamp
          await supabase
            .from('linkedin_conversations')
            .update({
              last_reply_checked_at: new Date().toISOString(),
              status: 'awaiting_reply',
            })
            .eq('id', conv.id)
        }

        // ── LinkedIn Read Receipt Detection ──
        // Check if the most recent outbound message has been read
        const outboundMessages = messages.filter(msg => msg.is_sender === true)
        const readOutbound = outboundMessages.find(msg =>
          msg.is_read === true ||
          msg.seen === true ||
          msg.read_at != null ||
          msg.seen_at != null ||
          msg.status === 'read'
        )

        if (readOutbound?.id) {
          const { data: linkedinMsg } = await supabase
            .from('linkedin_messages')
            .select('id, read_at')
            .eq('provider_message_id', readOutbound.id)
            .single()

          if (linkedinMsg && !linkedinMsg.read_at) {
            // First read detection — record it
            await supabase
              .from('linkedin_messages')
              .update({ read_at: new Date().toISOString() })
              .eq('id', linkedinMsg.id)

            const { data: readLead } = await supabase
              .from('leads')
              .select('first_name, last_name')
              .eq('id', conv.lead_id)
              .single()

            const readLeadName = readLead
              ? `${readLead.first_name} ${readLead.last_name}`.trim()
              : 'Lead desconocido'

            const msgPreview = (readOutbound.text || '').substring(0, 200)
            const leadCadenceIds = activeLeadCadences.get(conv.lead_id) || []

            // Avoid duplicate notification for same thread
            const { data: existingReadNotif } = await supabase
              .from('notifications')
              .select('id')
              .eq('type', 'message_read')
              .eq('owner_id', conv.owner_id)
              .filter('metadata->>linkedin_thread_id', 'eq', conv.linkedin_thread_id!)
              .single()

            if (!existingReadNotif) {
              await supabase.from('notifications').insert({
                owner_id: conv.owner_id,
                org_id: conv.org_id,
                lead_id: conv.lead_id,
                cadence_id: leadCadenceIds[0] || null,
                type: 'message_read',
                title: `${readLeadName} leyo tu mensaje`,
                body: msgPreview || 'Mensaje de LinkedIn',
                channel: 'linkedin',
                metadata: {
                  message_preview: msgPreview,
                  linkedin_thread_id: conv.linkedin_thread_id,
                  provider_message_id: readOutbound.id,
                },
              })
              console.log(`Read receipt detected: lead=${conv.lead_id}, thread=${conv.linkedin_thread_id}`)
            }
          }
        }

        // Small delay between API calls to avoid rate limiting
        await new Promise(r => setTimeout(r, 500))
      } catch (error) {
        console.error(`Error checking replies for conversation ${conv.id}:`, error)
        // Continue checking other conversations
      }
    }

    console.log(`LinkedIn reply check complete: checked ${conversationsToCheck.length}, found ${repliesFound} replies`)

    // ── Email Reply Detection ──
    // Check for email replies via Unipile Gmail API
    let emailRepliesFound = 0
    try {
      // Get sent emails that haven't been replied to
      const { data: sentEmails, error: emailError } = await supabase
        .from('email_messages')
        .select('id, event_id, owner_user_id, org_id, lead_id, cadence_id, cadence_step_id, to_email, subject, gmail_message_id')
        .eq('status', 'sent')
        .not('gmail_message_id', 'is', null)
        .limit(50)

      if (!emailError && sentEmails && sentEmails.length > 0) {
        // Group by owner to check their Gmail accounts
        const ownerEmails = new Map<string, typeof sentEmails>()
        for (const email of sentEmails) {
          const existing = ownerEmails.get(email.owner_user_id) || []
          existing.push(email)
          ownerEmails.set(email.owner_user_id, existing)
        }

        for (const [ownerId, emails] of ownerEmails) {
          try {
            // Get Gmail account for this owner
            const { data: gmailAccount } = await supabase
              .from('unipile_accounts')
              .select('account_id')
              .eq('user_id', ownerId)
              .eq('provider', 'EMAIL')
              .eq('status', 'active')
              .single()

            if (!gmailAccount?.account_id) continue

            // Check each email for replies via Unipile
            for (const email of emails) {
              try {
                // Use Unipile API to check if there are replies to this email
                const unipileDsn = Deno.env.get('UNIPILE_DSN')!
                const unipileAccessToken = Deno.env.get('UNIPILE_ACCESS_TOKEN')!
                const baseUrl = `https://${unipileDsn}`

                // Get messages in the thread by searching for the original message
                const searchUrl = `${baseUrl}/api/v1/emails/${email.gmail_message_id}`
                const response = await fetch(searchUrl, {
                  headers: { 'X-API-KEY': unipileAccessToken },
                })

                if (!response.ok) continue

                const emailData = await response.json()

                // Check if the email has replies (thread_id different from message_id, or reply fields)
                const threadId = emailData.thread_id || emailData.id
                if (!threadId) continue

                // Fetch messages in the thread
                const threadUrl = `${baseUrl}/api/v1/emails?account_id=${gmailAccount.account_id}&thread_id=${threadId}&limit=5`
                const threadResponse = await fetch(threadUrl, {
                  headers: { 'X-API-KEY': unipileAccessToken },
                })

                if (!threadResponse.ok) continue

                const threadData = await threadResponse.json()
                const threadMessages = threadData.items || []

                // Check for inbound replies (messages NOT from us)
                const inboundReplies = threadMessages.filter((msg: { from_attendee?: { identifier?: string }; id?: string }) =>
                  msg.from_attendee?.identifier === email.to_email && msg.id !== email.gmail_message_id
                )

                if (inboundReplies.length > 0) {
                  emailRepliesFound++
                  const latestReply = inboundReplies[0]
                  const replyPreview = (latestReply.body || latestReply.subject || '').substring(0, 200)

                  console.log(`Email reply detected from ${email.to_email} for lead ${email.lead_id}`)

                  // Update email status to indicate replied
                  await supabase
                    .from('email_messages')
                    .update({ status: 'replied' })
                    .eq('id', email.id)

                  // If lead is in a cadence, pause them
                  if (email.lead_id && email.cadence_id) {
                    // Cancel pending schedules
                    await supabase
                      .from('schedules')
                      .update({
                        status: 'canceled',
                        last_error: 'Lead replied to email - cadence paused',
                        updated_at: new Date().toISOString(),
                      })
                      .eq('lead_id', email.lead_id)
                      .eq('cadence_id', email.cadence_id)
                      .eq('status', 'scheduled')

                    // Pause the lead
                    await supabase
                      .from('cadence_leads')
                      .update({
                        status: 'paused',
                        updated_at: new Date().toISOString(),
                      })
                      .eq('lead_id', email.lead_id)
                      .eq('cadence_id', email.cadence_id)
                  }

                  // Get lead name
                  const { data: lead } = await supabase
                    .from('leads')
                    .select('first_name, last_name, company')
                    .eq('id', email.lead_id!)
                    .single()

                  const leadName = lead ? `${lead.first_name} ${lead.last_name}`.trim() : email.to_email

                  // Create notification
                  await supabase.from('notifications').insert({
                    owner_id: ownerId,
                    org_id: email.org_id,
                    lead_id: email.lead_id,
                    cadence_id: email.cadence_id,
                    type: 'reply_detected',
                    title: `${leadName} respondio a tu correo!`,
                    body: `${leadName}${lead?.company ? ` de ${lead.company}` : ''} respondio a tu correo "${email.subject}". La cadencia fue pausada automaticamente.`,
                    channel: 'email',
                    metadata: {
                      reply_preview: replyPreview,
                      email_subject: email.subject,
                      to_email: email.to_email,
                      cadence_ids: email.cadence_id ? [email.cadence_id] : [],
                    },
                  })

                  // Log activity
                  await logActivity({
                    ownerId,
                    orgId: email.org_id,
                    cadenceId: email.cadence_id || undefined,
                    leadId: email.lead_id || undefined,
                    action: 'reply_detected',
                    status: 'ok',
                    details: {
                      reply_preview: replyPreview,
                      channel: 'email',
                      subject: email.subject,
                    },
                  })
                }

                await new Promise(r => setTimeout(r, 300))
              } catch (emailCheckErr) {
                console.error(`Error checking email reply for ${email.id}:`, emailCheckErr)
              }
            }
          } catch (ownerErr) {
            console.error(`Error checking email replies for owner ${ownerId}:`, ownerErr)
          }
        }
      }
    } catch (emailSectionErr) {
      console.error('Error in email reply detection:', emailSectionErr)
    }

    console.log(`Reply check complete: LinkedIn ${conversationsToCheck.length} checked/${repliesFound} found, Email ${emailRepliesFound} found`)

    return jsonResponse({
      success: true,
      checked: conversationsToCheck.length,
      repliesFound,
      emailRepliesFound,
    })
  } catch (error) {
    console.error('Error in check-replies:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500
    )
  }
})
