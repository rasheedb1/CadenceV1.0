// Edge Function: Send LinkedIn Message
// POST /functions/v1/linkedin-send-message
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createUnipileClient } from '../_shared/unipile.ts'
import { createSupabaseClient, getAuthContext, logActivity, getUnipileAccountId, trackProspectedCompany } from '../_shared/supabase.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

interface SendMessageRequest {
  // Either leadId (for cadence) or chatId (for inbox) is required
  leadId?: string
  chatId?: string  // For sending directly to an existing chat from inbox
  message: string
  cadenceId?: string
  cadenceStepId?: string
  scheduleId?: string
  instanceId?: string
  // Force a specific channel (optional)
  channel?: 'linkedin' | 'sales_navigator'
  ownerId?: string // For service-role calls from process-queue
  orgId?: string   // For service-role calls from process-queue
}

interface UnipileAccount {
  id: string
  name: string
  type: string
  created_at: string
}

// Find LinkedIn account directly from Unipile API
async function findUnipileLinkedInAccount(userId: string): Promise<string | null> {
  const unipileDsn = Deno.env.get('UNIPILE_DSN')
  const unipileAccessToken = Deno.env.get('UNIPILE_ACCESS_TOKEN')

  if (!unipileDsn || !unipileAccessToken) {
    console.error('Missing Unipile credentials')
    return null
  }

  try {
    const baseUrl = `https://${unipileDsn}`
    const response = await fetch(`${baseUrl}/api/v1/accounts`, {
      headers: {
        'X-API-KEY': unipileAccessToken,
      },
    })

    if (!response.ok) {
      console.error('Unipile API error:', response.status)
      return null
    }

    const data = await response.json()
    const accounts: UnipileAccount[] = data.items || []

    console.log(`Found ${accounts.length} Unipile accounts, looking for user ${userId}`)

    // Strategy 1: Find account with name matching user ID
    let account = accounts.find(
      (acc) => acc.name === userId && acc.type?.toUpperCase() === 'LINKEDIN'
    )

    // Strategy 2: If only one LinkedIn account exists, use it
    if (!account) {
      const linkedinAccounts = accounts.filter(
        (acc) => acc.type?.toUpperCase() === 'LINKEDIN'
      )
      if (linkedinAccounts.length === 1) {
        console.log('Using single LinkedIn account found')
        account = linkedinAccounts[0]
      } else if (linkedinAccounts.length > 1) {
        // Use the most recent one
        console.log('Multiple LinkedIn accounts found, using most recent')
        account = linkedinAccounts.sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0]
      }
    }

    if (account) {
      console.log(`Found LinkedIn account: ${account.id}`)

      // Try to save to database for future use
      try {
        const supabase = createSupabaseClient()

        // Check if record exists
        const { data: existing } = await supabase
          .from('unipile_accounts')
          .select('id')
          .eq('user_id', userId)
          .eq('provider', 'LINKEDIN')
          .single()

        if (existing) {
          await supabase
            .from('unipile_accounts')
            .update({
              account_id: account.id,
              status: 'active',
              connected_at: account.created_at || new Date().toISOString(),
            })
            .eq('id', existing.id)
        } else {
          await supabase
            .from('unipile_accounts')
            .insert({
              user_id: userId,
              provider: 'LINKEDIN',
              account_id: account.id,
              status: 'active',
              connected_at: account.created_at || new Date().toISOString(),
            })
        }

        // Also update profile
        await supabase
          .from('profiles')
          .update({ unipile_account_id: account.id })
          .eq('user_id', userId)

        console.log('Saved account to database')
      } catch (dbError) {
        console.error('Failed to save account to database:', dbError)
        // Continue anyway - we found the account
      }

      return account.id
    }

    console.log('No LinkedIn account found in Unipile')
    return null
  } catch (error) {
    console.error('Error querying Unipile:', error)
    return null
  }
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
    const body: SendMessageRequest = await req.json()
    const { leadId, chatId, message, cadenceId, cadenceStepId, scheduleId, instanceId, channel, ownerId, orgId } = body

    const ctx = await getAuthContext(authHeader, { ownerId, orgId })
    if (!ctx) {
      return errorResponse('Unauthorized', 401)
    }

    if (!message) {
      return errorResponse('message is required')
    }

    if (!leadId && !chatId) {
      return errorResponse('Either leadId or chatId is required')
    }

    // Track which channel was used for the successful send
    let usedChannel: 'linkedin' | 'sales_navigator' = 'linkedin'

    // Get Unipile account ID for this user
    // First try database, then fallback to Unipile API directly
    let unipileAccountId = await getUnipileAccountId(ctx.userId)

    if (!unipileAccountId) {
      console.log('Account not found in database, querying Unipile directly...')
      unipileAccountId = await findUnipileLinkedInAccount(ctx.userId)
    }

    if (!unipileAccountId) {
      return errorResponse('No LinkedIn account found. Please connect your LinkedIn account in Settings and try again.')
    }

    console.log(`Using Unipile account: ${unipileAccountId}`)

    const supabase = createSupabaseClient()
    const unipile = createUnipileClient()

    // CASE 1: Direct chat message from inbox (chatId provided)
    if (chatId && !leadId) {
      console.log(`Sending message to existing chat: ${chatId}`)

      const result = await unipile.sendMessage({
        accountId: unipileAccountId,
        chatId: chatId,
        text: message,
      })

      if (!result.success) {
        return errorResponse(result.error || 'Failed to send message')
      }

      return jsonResponse({
        success: true,
        messageId: result.data?.message_id,
        chatId: chatId,
        channel: 'linkedin',
      })
    }

    // CASE 2: Send to lead (leadId provided) - original flow
    // Get lead details
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .eq('org_id', ctx.orgId)
      .single()

    if (leadError || !lead) {
      return errorResponse('Lead not found')
    }

    // Check if conversation exists
    let { data: conversation } = await supabase
      .from('linkedin_conversations')
      .select('id, linkedin_thread_id')
      .eq('lead_id', leadId)
      .eq('org_id', ctx.orgId)
      .single()

    // Send message via Unipile
    let result

    // Helper function to send message with optional InMail mode
    const sendMessageToRecipient = async (
      recipientId: string,
      inmailMode?: 'auto' | 'sales_navigator'
    ) => {
      return unipile.sendMessage({
        accountId: unipileAccountId,
        attendeeId: recipientId,
        text: message,
        inmailMode,
        inmailSubject: inmailMode ? `Message from ${lead.first_name || 'a connection'}` : undefined,
      })
    }

    if (conversation?.linkedin_thread_id) {
      // Send to existing chat
      result = await unipile.sendMessage({
        accountId: unipileAccountId,
        chatId: conversation.linkedin_thread_id,
        text: message,
      })
    } else {
      // Start new conversation - need LinkedIn URL from lead
      if (!lead.linkedin_url) {
        return errorResponse('Lead does not have a LinkedIn URL')
      }

      // Normalize the LinkedIn URL
      let linkedinUrl = lead.linkedin_url.trim()
      if (!linkedinUrl.startsWith('http')) {
        linkedinUrl = `https://www.linkedin.com/in/${linkedinUrl}`
      }
      // Remove trailing slashes
      linkedinUrl = linkedinUrl.replace(/\/+$/, '')

      // Extract username from URL for lookup
      const usernameMatch = linkedinUrl.match(/linkedin\.com\/in\/([^\/\?]+)/)
      const username = usernameMatch ? usernameMatch[1] : null

      console.log(`Sending message to LinkedIn URL: ${linkedinUrl}`)
      console.log(`Username extracted: ${username}`)
      console.log(`Lead: ${lead.first_name} ${lead.last_name}`)
      console.log(`Requested channel: ${channel || 'auto'}`)

      // Resolve provider_id (LinkedIn internal ID like "ACoAAA...")
      // Chain: lead cache → prospect source → Unipile profile lookup
      let recipientId: string | null = null

      // 1. Check if lead already has a cached provider_id
      if (lead.linkedin_provider_id) {
        recipientId = lead.linkedin_provider_id
        console.log(`Using stored linkedin_provider_id from lead: ${recipientId}`)
      }

      // 2. Check if the original prospect has it (from Sales Navigator search)
      if (!recipientId) {
        const { data: sourceProspect } = await supabase
          .from('prospects')
          .select('linkedin_provider_id')
          .eq('promoted_lead_id', leadId)
          .not('linkedin_provider_id', 'is', null)
          .limit(1)
          .single()
        if (sourceProspect?.linkedin_provider_id) {
          recipientId = sourceProspect.linkedin_provider_id
          console.log(`Found provider_id from source prospect: ${recipientId}`)
        }
      }

      // 3. Unipile profile lookup (username with retries)
      if (!recipientId && username) {
        const resolved = await unipile.resolveProviderId(unipileAccountId, username, linkedinUrl)
        recipientId = resolved.providerId
      }

      if (!recipientId) {
        return errorResponse(
          `Could not resolve LinkedIn ID for "${username}". Please check that the LinkedIn account is still connected in Settings.`
        )
      }

      // Cache the provider_id on the lead for next time
      if (!lead.linkedin_provider_id) {
        try {
          await supabase
            .from('leads')
            .update({ linkedin_provider_id: recipientId, updated_at: new Date().toISOString() })
            .eq('id', leadId)
            .eq('org_id', ctx.orgId)
          console.log(`Saved provider_id ${recipientId} to lead ${leadId}`)
        } catch (e) {
          console.warn('Could not cache provider_id on lead:', e)
        }
      }

      // Determine if we should use Sales Navigator directly
      const forceSalesNavigator = channel === 'sales_navigator'

      if (forceSalesNavigator) {
        // User explicitly requested Sales Navigator
        console.log('Sending via Sales Navigator (forced)')
        usedChannel = 'sales_navigator'
        result = await sendMessageToRecipient(recipientId, 'sales_navigator')
      } else {
        // Step 1: Try regular LinkedIn first
        console.log('Attempting to send via regular LinkedIn...')
        result = await sendMessageToRecipient(recipientId)

        console.log('Regular LinkedIn result:', JSON.stringify(result, null, 2))

        // If regular LinkedIn fails with "not connected" error, try InMail fallbacks
        const isNotConnected = unipile.isNotConnectedError(result.error)
        console.log(`Is "not connected" error: ${isNotConnected}`)
        console.log(`Error message: ${result.error}`)

        if (!result.success && isNotConnected) {
          // Step 2: Try InMail auto-detect (let Unipile pick the right API)
          console.log('=== FALLBACK: InMail auto-detect ===')
          usedChannel = 'sales_navigator'
          result = await sendMessageToRecipient(recipientId, 'auto')

          console.log('InMail auto-detect result:', JSON.stringify(result, null, 2))

          if (!result.success) {
            // Step 3: Try explicit Sales Navigator InMail
            console.log('=== FALLBACK: Explicit Sales Navigator ===')
            const autoError = result.error
            result = await sendMessageToRecipient(recipientId, 'sales_navigator')

            console.log('SN InMail result:', JSON.stringify(result, null, 2))

            if (result.success) {
              console.log('Successfully sent via explicit Sales Navigator InMail!')
            } else {
              // Both InMail attempts failed — provide user-friendly error
              console.log(`All InMail attempts failed. Auto: ${autoError}, SN: ${result.error}`)
              result = {
                ...result,
                error: `Cannot send message to ${lead.first_name || 'this person'} — they are not a 1st-degree LinkedIn connection. Please send a connection request first, or check that your Sales Navigator subscription supports InMail.`,
              }
            }
          } else {
            console.log('Successfully sent via InMail auto-detect!')
          }
        }
      }
    }

    if (!result.success) {
      // Log failure
      await logActivity({
        ownerId: ctx.userId,
        orgId: ctx.orgId,
        cadenceId,
        cadenceStepId,
        leadId,
        action: usedChannel === 'sales_navigator' ? 'sales_navigator_inmail' : 'linkedin_message',
        status: 'failed',
        details: { error: result.error, channel: usedChannel },
      })

      return errorResponse(result.error || 'Failed to send message')
    }

    // Create or update conversation record
    const threadId = result.data?.chat_id || result.data?.id
    if (!conversation) {
      const { data: newConv } = await supabase
        .from('linkedin_conversations')
        .insert({
          owner_id: ctx.userId,
          org_id: ctx.orgId,
          lead_id: leadId,
          linkedin_thread_id: threadId,
          status: 'messaged',
          last_activity_at: new Date().toISOString(),
        })
        .select()
        .single()
      conversation = newConv
    } else {
      await supabase
        .from('linkedin_conversations')
        .update({
          linkedin_thread_id: threadId,
          status: 'messaged',
          last_activity_at: new Date().toISOString(),
        })
        .eq('id', conversation.id)
    }

    // Store the message
    await supabase.from('linkedin_messages').insert({
      conversation_id: conversation?.id,
      owner_id: ctx.userId,
      org_id: ctx.orgId,
      body: message,
      direction: 'outbound',
      provider: usedChannel === 'sales_navigator' ? 'unipile_inmail' : 'unipile',
      provider_message_id: result.data?.message_id || null,
      delivery_status: 'sent',
      sent_at: new Date().toISOString(),
    })

    // Log success
    await logActivity({
      ownerId: ctx.userId,
      orgId: ctx.orgId,
      cadenceId,
      cadenceStepId,
      leadId,
      action: usedChannel === 'sales_navigator' ? 'sales_navigator_inmail' : 'linkedin_message',
      status: 'ok',
      details: { messageId: result.data?.message_id, channel: usedChannel },
    })

    // Track company as prospected in registry
    if (lead?.company) {
      trackProspectedCompany({
        ownerId: ctx.userId,
        orgId: ctx.orgId,
        companyName: lead.company,
        prospectedVia: 'linkedin_message',
      })
    }

    // Update schedule and instance if provided
    if (scheduleId) {
      await supabase
        .from('schedules')
        .update({ status: 'executed', updated_at: new Date().toISOString() })
        .eq('id', scheduleId)
    }

    if (instanceId) {
      await supabase
        .from('lead_step_instances')
        .update({
          status: 'sent',
          result_snapshot: result.data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', instanceId)
    }

    return jsonResponse({
      success: true,
      messageId: result.data?.message_id,
      conversationId: conversation?.id,
      channel: usedChannel,
    })
  } catch (error) {
    console.error('Error:', error)
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500)
  }
})

// Extract LinkedIn profile ID from URL
function extractLinkedInId(url: string | null): string | null {
  if (!url) return null

  // Match patterns like:
  // https://www.linkedin.com/in/username
  // https://linkedin.com/in/username/
  const match = url.match(/linkedin\.com\/in\/([^\/\?]+)/)
  return match ? match[1] : null
}
